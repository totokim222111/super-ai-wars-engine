import type {BattleState,Unit,BattleEvent,SubPilot} from './types';
import {mechOf,pilotOf,distance,unitById,clamp} from './terrain';
import {effectivePilot,atomsOf} from './modifiers';
import {gainExperience} from './progression';
import {finishAction} from './actions';

export function refillAmmo(s:BattleState,u:Unit):void {
  const m=s.content.mechs.find(m=>m.id===u.mechId)!;
  for(const id of new Set([...m.weapons,...(m.forms??[]).flatMap(f=>f.overrides.weapons??[])])){
    const w=s.content.weapons.find(w=>w.id===id)!;if(w.ammo!==undefined)u.ammo[id]=w.ammo;
  }
}
export function resupply(s:BattleState,u:Unit,events:BattleEvent[]):void {
  const before=u.en;u.en=mechOf(s,u).en;refillAmmo(s,u);
  events.push({type:'recover',unitId:u.id,hp:0,en:u.en-before});
}
export function resourceRecovery(s:BattleState,u:Unit):{hp:number;en:number} {
  const m=mechOf(s,u),out={hp:0,en:0};
  const add=(key:'hp'|'en',value:{pct?:number;flat?:number})=>{out[key]+=Math.floor(m[key]*(value.pct??0)/100+(value.flat??0));};
  if(m.enRecovery)add('en',m.enRecovery);
  if(m.hpRecovery)add('hp',m.hpRecovery);
  for(const a of atomsOf(s,u))if(a.type==='enRegen'||a.type==='hpRegen')add(a.type==='enRegen'?'en':'hp',a.value);
  return out;
}
export function deviceProblem(s:BattleState,unitId:string,deviceId:string,targetId:string):string|null {
  const u=unitById(s,unitId),v=s.units.find(v=>v.id===targetId),d=mechOf(s,u).devices?.find(d=>d.id===deviceId);
  if(!u.alive||u.acted||u.side!==s.phase||s.pending||s.outcome)return 'device: cannot act';
  if(!d)return 'device: not equipped';
  if(d.uses!==null&&(u.deviceUses?.[d.id]??0)<=0)return 'device: no uses remaining';
  if(u.en<(d.en??0))return 'device: insufficient EN';
  if(u.moved&&!d.postMove)return 'device: cannot use after moving';
  if(!v?.alive||v.removed||v.id===u.id||v.side!==u.side||distance(u,v)!==1)return 'device: requires adjacent ally';
  if(d.kind==='repair'?v.hp>=mechOf(s,v).hp:v.en>=mechOf(s,v).en&&Object.entries(v.ammo).every(([id,n])=>n>=s.content.weapons.find(w=>w.id===id)!.ammo!))return 'device: target is full';
  return null;
}
export function useDevice(s:BattleState,unitId:string,deviceId:string,targetId:string,events:BattleEvent[]):void {
  const problem=deviceProblem(s,unitId,deviceId,targetId);if(problem)throw Error(problem);
  const u=unitById(s,unitId),v=unitById(s,targetId),d=mechOf(s,u).devices!.find(d=>d.id===deviceId)!;
  awardSupport(s,u,v,d.kind,d.experience,events);u.en-=d.en??0;
  if(d.kind==='resupply')resupply(s,v,events);
  else {const before=v.hp,m=mechOf(s,v);v.hp=Math.min(m.hp,v.hp+Math.floor(m.hp*(d.amount?.pct??0)/100+(d.amount?.flat??0)));events.push({type:'recover',unitId:v.id,hp:v.hp-before,en:0});}
  if(d.morale)v.morale=clamp(v.morale+d.morale,s.content.rules.morale.min,s.content.rules.morale.max);
  if(d.uses!==null)u.deviceUses![d.id]--;finishAction(s,u);
  events.push({type:'device',unitId,targetId,deviceId,kind:d.kind,remaining:d.uses===null?null:u.deviceUses![d.id]});
}
export function crewPilot(s:BattleState,u:Unit,pilotId?:string):{pilot:ReturnType<typeof pilotOf>;pool:Unit|SubPilot;level:number} {
  if(!pilotId||pilotId===u.pilotId)return {pilot:pilotOf(s,u),pool:u,level:u.level??1};
  const sub=u.subPilots?.find(p=>p.pilotId===pilotId);if(!sub)throw Error('spirit: pilot is not aboard');
  const level=s.content.pilots.find(p=>p.id===sub.pilotId)?.hostProgress?u.level??1:sub.level,projected={...u,pilotId:sub.pilotId,level};
  return {pilot:effectivePilot(s,projected),pool:sub,level};
}

/** Support awards are based on the pre-recovery deficit, never on an empty action. */
export function awardSupport(s:BattleState,u:Unit,target:Unit,kind:'repair'|'resupply',base:number,events:BattleEvent[],pilotId?:string):void {
  const rule=s.content.rules.supportExperience;
  if(!rule){if(!pilotId||s.content.pilots.find(p=>p.id===pilotId)?.hostProgress)gainExperience(s,u,base,events);return;}
  const m=mechOf(s,target),ammoMissing=Math.max(0,...Object.entries(target.ammo).map(([id,n])=>{const max=s.content.weapons.find(w=>w.id===id)?.ammo??0;return max?(1-n/max)*100:0;}));
  if(kind==='repair'?(1-target.hp/m.hp)*100<rule.minMissingHpPct:Math.max((1-target.en/m.en)*100,ammoMissing)<rule.minMissingEnPct)return;
  const crew=crewPilot(s,u,pilotId),receiver=crew.pilot.hostProgress?u:pilotId?{...u,pilotId:crew.pilot.id,level:crew.level,exp:crew.pool.exp??0,sp:crew.pool.sp}:u;
  const mains=s.units.filter(v=>v.alive&&v.side===u.side&&rule.regularPilots.includes(v.pilotId)),ceiling=Math.floor(mains.reduce((n,v)=>n+(v.level??1),0)/Math.max(1,mains.length))+rule.levelCeiling;
  const remaining=Math.max(0,(ceiling-(receiver.level??1))*s.content.rules.expPerLevel-(receiver.exp??0));
  const bonus=u.supportBonusUsed?0:rule.firstBonus[u.pilotId]??0;
  const amount=Math.max(0,Math.min(remaining,rule.maxPerStage-(u.supportExperience??0),Math.min(rule.maxPerAction,base+Math.max(0,(target.level??1)-(receiver.level??1))*rule.levelGapBonus)+bonus));
  if(!amount)return;gainExperience(s,receiver,amount,events);u.supportExperience=(u.supportExperience??0)+amount;u.supportBonusUsed=true;
  if(receiver!==u)Object.assign(crew.pool,{level:receiver.level,exp:receiver.exp,sp:receiver.sp});
}
export function spiritCost(s:BattleState,u:Unit,spiritId:string,pilotId?:string):number {
  const d=s.content.spirits!.find(d=>d.id===spiritId)!,crew=crewPilot(s,u,pilotId);
  return d.spPct===undefined?d.sp:Math.ceil(crew.pilot.sp*d.spPct/100);
}
