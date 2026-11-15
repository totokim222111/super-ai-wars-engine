import {effectiveMorale} from './modifiers';
import type {BattleEvent, BattleState, Command, EffectAtom, EffectDuration, EffectTarget, Unit} from './types';
import {clamp, distance, mechOf, pilotOf, unitById, movementCost, inBounds} from './terrain';
import {expireDuration,clampEffectResources} from './effects';
import {sumAtom} from './modifiers';
import {changeMorale} from './combat';
import {initializeUnit} from './system';
import {hasActed,addAction,resetActions,finishAction} from './actions';
import {resupply,refillAmmo,crewPilot,spiritCost,deviceProblem,resourceRecovery,awardSupport} from './resources';
import {energyRegen} from './gimmicks';
import {terrainAt,environmentOf} from './terrain';
import {gainExperience} from './progression';

export function conditionMatches(s: BattleState, u: Unit, condition: string): boolean {
  if (condition === 'start') return true;
  const m = /^morale>=(\d+)$/.exec(condition); if (m) return effectiveMorale(s,u) >= Number(m[1]);
  const hp = /^hp<(\d+)%$/.exec(condition); return !!hp && u.hp / mechOf(s,u).hp < Number(hp[1]) / 100;
}
function abilityUnit(s: BattleState, id: string, afterAction=true): Unit {
  const u = unitById(s,id);
  if (!u.alive || u.removed || u.side !== s.phase || (s.content.rules.actions?hasActed(u):u.acted)&&!afterAction) throw new Error('ability: unit cannot act in this phase');
  return u;
}
export function effectTargets(s: BattleState, u: Unit, target: EffectTarget, targetId?: string): Unit[] {
  if (target === 'self') { if (targetId && targetId !== u.id) throw new Error('target: requires self'); return [u]; }
  if (target === 'allAllies') return s.units.filter(v => v.alive && v.side === u.side);
  const v = targetId && s.units.find(v => v.id === targetId);
  if (!v || !v.alive || (target === 'ally' ? v.side !== u.side : v.side === u.side || v.side === 'neutral')) throw new Error('target: invalid target');
  return [v];
}
function spiritTargets(s:BattleState,u:Unit,def:import('./types').Spirit,targetId?:string):Unit[]{
  if(!def.effects.some(a=>a.type==='scan'))return effectTargets(s,u,def.target,targetId);
  const v=s.units.find(v=>v.id===targetId);if(def.target!=='enemy'||!v?.alive||v.removed||v.side===u.side)throw Error('scan: requires one living non-ally');return [v];
}
const immediate = new Set(['moraleAdd','hpRestore','enRestore','spRestore','extraAction','scan','resupply','ammoRestore']);
export function applyAtoms(s: BattleState, u: Unit, atoms: EffectAtom[], duration: EffectDuration, id: string, source: string, events: BattleEvent[], definitionId?: string): void {
  for (const a of atoms) {
    if (a.type === 'scan') u.revealed = true;
    if (a.type === 'moraleAdd') changeMorale(s,u,a.value,'effect',events);
    if (a.type === 'hpRestore' || a.type === 'enRestore') {
      const key = a.type === 'hpRestore' ? 'hp' : 'en', max = mechOf(s,u)[key], before = u[key];
      u[key] = clamp(before + Math.floor(max * (a.value.pct ?? 0) / 100 + (a.value.flat ?? 0)),0,max);
      events.push({type:'recover',unitId:u.id,hp:key === 'hp' ? u.hp-before : 0,en:key === 'en' ? u.en-before : 0});
    }
    if (a.type === 'spRestore') u.sp = clamp(u.sp+a.value,0,pilotOf(s,u).sp);
    if (a.type === 'extraAction') addAction(s,u);
    if(a.type==='resupply')resupply(s,u,events);
    if(a.type==='ammoRestore')refillAmmo(s,u);
  }
  const lasting = atoms.filter(a => !immediate.has(a.type));
  if (lasting.length && duration !== 'instant') u.effects.push({id,source,duration:{unit:'use',remaining:1},lifetime:duration,...(definitionId?{definitionId}:{}),atoms:structuredClone(lasting),hooks:{}});
}
export function spiritProblem(s: BattleState, unitId: string, spiritId: string, targetId?: string,pilotId?:string): string | null {
  try {
    const u = abilityUnit(s,unitId,s.content.options?.spiritAfterAction??false), def = s.content.spirits?.find(x => x.id === spiritId), crew = crewPilot(s,u,pilotId),p=crew.pilot;
    if (!def || !(p.spirits ?? []).some(x => x.id === spiritId && x.level <= crew.level)) return 'spirit is locked';
    if (crew.pool.sp < spiritCost(s,u,spiritId,pilotId)) return 'insufficient SP';
    if(def.effects.some(a=>a.type==='extraAction')&&s.content.rules.actions&&(u.extraActionsUsed??0)>=(s.content.rules.actions.extraMax??1))return 'extra action: round limit';
    const targets=spiritTargets(s,u,def,targetId);
    if(def.effects.some(a=>a.type==='resupply')&&targets.every(v=>v.en>=mechOf(s,v).en&&Object.entries(v.ammo).every(([id,n])=>n>=(s.content.weapons.find(w=>w.id===id)?.ammo??0))))return 'target resources are full';
    if (targets.some(v => v.effects.some(e => e.definitionId === spiritId))) return 'spirit already active'; return null;
  } catch(e) { return (e as Error).message; }
}
export function useSpirit(s: BattleState, unitId: string, spiritId: string, targetId: string | undefined, events: BattleEvent[],pilotId?:string): void {
  const problem = spiritProblem(s,unitId,spiritId,targetId,pilotId); if (problem) throw new Error(`spirit: ${problem}`);
  const u = unitById(s,unitId), def = s.content.spirits!.find(x => x.id === spiritId)!, targets = spiritTargets(s,u,def,targetId);
  const crew=crewPilot(s,u,pilotId),cost=spiritCost(s,u,spiritId,pilotId);crew.pool.sp -= cost;
  if(def.experience&&s.content.rules.supportExperience)for(const target of targets)awardSupport(s,u,target,def.effects.some(a=>a.type==='resupply')?'resupply':'repair',def.experience,events,pilotId);
  for (const target of targets) applyAtoms(s,target,def.effects,def.duration,`spirit:${u.id}:${spiritId}`,`spirit:${u.id}:${spiritId}`,events,spiritId);
  if (u.side === 'enemy') u.aiSpiritsUsed = [...(u.aiSpiritsUsed ?? []),spiritId];
  if(def.experience&&!s.content.rules.supportExperience){if(crew.pool===u)gainExperience(s,u,def.experience,events);else {const proxy={...u,pilotId:crew.pilot.id,level:crew.level,exp:('exp'in crew.pool?crew.pool.exp:0)??0,sp:crew.pool.sp};gainExperience(s,proxy,def.experience,events);Object.assign(crew.pool,{level:proxy.level,exp:proxy.exp,sp:proxy.sp});}}
  events.push({type:'spirit',unitId,spiritId,targetIds:targets.map(v => v.id),sp:cost,...(pilotId?{pilotId}:{})});
}
export function useItem(s: BattleState, unitId: string, slot: number, events: BattleEvent[]): void {
  const u = abilityUnit(s,unitId), part = s.content.parts?.find(p => p.id === u.parts?.[slot]);
  if (!Number.isSafeInteger(slot) || slot < 0 || !part || part.kind !== 'consumable' || u.usedItems?.includes(slot)) throw new Error('item: unavailable slot');
  applyAtoms(s,u,part.effects,part.duration ?? 'instant',`item:${u.id}:${slot}`,`item:${u.id}:${slot}`,events);
  u.usedItems = [...(u.usedItems ?? []),slot]; events.push({type:'item-used',unitId,partId:part.id,slot});
}
export function startAbilities(s: BattleState, events: BattleEvent[], initial = false): void {
  for (const u of s.units) if (u.alive && u.side === s.phase) {
    if(s.phase==='enemy'){
      if(s.content.rules.actions)resetActions(s,u);
      if(s.content.rules.recoveryTiming==='phase'){
        const m=mechOf(s,u),t=terrainAt(s,u),terrain=environmentOf(s,u)===t.env?t.recover:undefined,extra=resourceRecovery(s,u),hp=Math.min(m.hp-u.hp,extra.hp+Math.floor(m.hp*(terrain?.hp??0)/100)),en=Math.min(m.en-u.en,extra.en+Math.floor(energyRegen(s,u)+m.en*(terrain?.en??0)/100));u.hp+=hp;u.en+=en;if(hp||en)events.push({type:'recover',unitId:u.id,hp,en});
      }
    }
    if (!initial) expireDuration(s,u.id,'turn',events);
    if (s.phase === 'player' && !initial) u.sp = Math.min(pilotOf(s,u).sp,u.sp + sumAtom(s,u,'spRegen'));
    if(!initial)for(const sub of u.subPilots??[])sub.sp=Math.min(crewPilot(s,u,sub.pilotId).pilot.sp,sub.sp+sumAtom(s,u,'spRegen'));
  }
  if (s.phase === 'player') for (const u of s.units) { if (u.supportAttackUsed !== undefined) u.supportAttackUsed = 0; if (u.supportDefenseUsed !== undefined) u.supportDefenseUsed = 0; }
}
export function transform(s: BattleState, unitId: string, formId: string, events: BattleEvent[]): void {
  const u = abilityUnit(s,unitId), base = s.content.mechs.find(m => m.id === u.mechId)!;
  const from = u.formId ?? base.forms?.[0]?.id;
  if (!base.forms?.some(f => f.id === formId) || from === formId || u.transformedRound === s.round) throw new Error('transform: unavailable form or already transformed');
  u.formId = formId; u.transformedRound = s.round;
  if (movementCost(s,u,u) === null) throw new Error('transform: impassable current cell');
  u.hp = Math.min(u.hp,mechOf(s,u).hp); u.en = Math.min(u.en,mechOf(s,u).en);
  for (const id of mechOf(s,u).weapons) { const w = s.content.weapons.find(w => w.id === id)!; if (w.ammo !== undefined && u.ammo[id] === undefined) u.ammo[id] = w.ammo; }
  // A change of movement form commits any move already made.
  if (u.moved) {u.moveOrigin = null;u.moveCommitted=true;}
  events.push({type:'transform',unitId,from:from!,to:formId});
}
export function combine(s: BattleState, cmd: Extract<Command,{type:'combine'}>, events: BattleEvent[]): void {
  const lead = abilityUnit(s,cmd.unitId), def = s.content.combinations?.find(c => c.id === cmd.combinationId);
  if (!def || lead.acted || lead.combined) throw new Error('combine: unavailable');
  const selected: Unit[] = [];
  for (const mechId of def.parts) {
    const member = s.units.filter(u => u.alive && u.side === lead.side && u.mechId === mechId && !u.acted && !u.combined && !selected.includes(u) && (!cmd.memberIds || cmd.memberIds.includes(u.id))).sort((a,b) => a===lead?-1:b===lead?1:a.id<b.id?-1:a.id>b.id?1:0)[0];
    if (!member) throw new Error('combine: missing member'); selected.push(member);
  }
  if (!selected.includes(lead) || selected.some(u => u !== lead && distance(lead,u) !== 1)) throw new Error('combine: members must be adjacent to representative');
  selected.sort((a,b)=>a===lead?-1:b===lead?1:a.id<b.id?-1:a.id>b.id?1:0);
  const hp = selected.reduce((n,u) => n+u.hp/mechOf(s,u).hp,0)/selected.length, en = selected.reduce((n,u) => n+u.en/mechOf(s,u).en,0)/selected.length;
  const members = structuredClone(selected), result = initializeUnit(s,{id:lead.id,pilotId:lead.pilotId,mechId:def.result,side:lead.side,x:lead.x,y:lead.y,level:lead.level,exp:lead.exp});
  result.effects=structuredClone(lead.effects);
  if(lead.supportAttackUsed!==undefined)result.supportAttackUsed=lead.supportAttackUsed;
  if(lead.supportDefenseUsed!==undefined)result.supportDefenseUsed=lead.supportDefenseUsed;
  if(lead.transformedRound!==undefined)result.transformedRound=lead.transformedRound;
  result.hp = Math.max(1,Math.floor(mechOf(s,result).hp*hp)); result.en = Math.floor(mechOf(s,result).en*en); result.sp = lead.sp; result.morale = lead.morale;clampEffectResources(s,result); result.acted = true; result.moved = true; result.combined = {combinationId:def.id,members};
  result.subPilots=structuredClone(lead.subPilots);result.deviceUses=structuredClone(lead.deviceUses);if(lead.actionsRemaining!==undefined){result.actionsRemaining=lead.actionsRemaining;result.actionsSpent=lead.actionsSpent;result.extraActionsUsed=lead.extraActionsUsed;}finishAction(s,result,true);
  for (const u of selected) { const index = s.units.indexOf(u); if (u === lead) s.units[index] = result; else {u.alive = false; u.removed = true;finishAction(s,u,true);} }
  events.push({type:'combine',unitId:lead.id,combinationId:def.id,memberIds:members.map(u=>u.id)});
}
export function split(s: BattleState, unitId: string, events: BattleEvent[]): void {
  const u = abilityUnit(s,unitId); if (!u.combined || u.acted) throw new Error('split: unavailable');
  const {members,combinationId} = structuredClone(u.combined), hp = u.hp/mechOf(s,u).hp, en = u.en/mechOf(s,u).en;
  const occupied = s.units.filter(v=>v.alive && v.id!==u.id).map(v=>({x:v.x,y:v.y}));
  for (let i=0;i<members.length;i++) {
    const m=members[i];
    const cells = i===0 ? [{x:u.x,y:u.y}] : [{x:u.x,y:u.y-1},{x:u.x-1,y:u.y},{x:u.x+1,y:u.y},{x:u.x,y:u.y+1}];
    const p = cells.find(p=>inBounds(s,p) && !occupied.some(v=>v.x===p.x && v.y===p.y) && movementCost(s,m,p)!==null);
    if (!p) throw new Error('split: no adjacent free cell'); occupied.push(p); Object.assign(m,p);
    m.hp=Math.max(1,Math.floor(mechOf(s,m).hp*hp));m.en=Math.floor(mechOf(s,m).en*en);m.alive=true;delete m.removed;m.acted=true;m.moved=true;m.moveOrigin=null;
    if(m.id===u.id) {m.level=u.level;m.exp=u.exp;m.sp=u.sp;m.morale=u.morale;m.effects=structuredClone(u.effects);m.supportAttackUsed=u.supportAttackUsed;m.supportDefenseUsed=u.supportDefenseUsed;m.transformedRound=u.transformedRound;m.subPilots=structuredClone(u.subPilots);m.deviceUses=structuredClone(u.deviceUses);}
    finishAction(s,m,true);
    clampEffectResources(s,m);
    s.units[s.units.findIndex(v=>v.id===m.id)] = m;
  }
  events.push({type:'split',unitId,combinationId,memberIds:members.map(m=>m.id)});
}

export function abilityActions(s:BattleState,unitId:string): Command[] {
  const u=unitById(s,unitId),result:Command[]=[];
  if(!u.alive||u.side!==s.phase||s.outcome||s.pending)return result;
  for(const pilotId of [undefined,...(u.subPilots??[]).map(p=>p.pilotId)])for(const def of s.content.spirits??[]) {
    const targets=def.target==='self'||def.target==='allAllies'?[undefined]:s.units.map(v=>v.id);
    for(const targetId of targets)if(!spiritProblem(s,unitId,def.id,targetId,pilotId))result.push({type:'spirit',unitId,spiritId:def.id,...(targetId?{targetId}:{}),...(pilotId?{pilotId}:{})});
  }
  for(const device of mechOf(s,u).devices??[])for(const target of s.units)if(!deviceProblem(s,unitId,device.id,target.id))result.push({type:'device',unitId,deviceId:device.id,targetId:target.id});
  for(let slot=0;slot<(u.parts?.length??0);slot++)if(!u.usedItems?.includes(slot)&&s.content.parts?.some(p=>p.id===u.parts![slot]&&p.kind==='consumable'))result.push({type:'useItem',unitId,slot});
  const base=s.content.mechs.find(m=>m.id===u.mechId)!;
  if(u.transformedRound!==s.round)for(const form of base.forms??[])if(form.id!==(u.formId??base.forms?.[0]?.id)){
    try{transform(structuredClone(s),unitId,form.id,[]);result.push({type:'transform',unitId,formId:form.id});}catch{/* unavailable terrain */}
  }
  if(!u.acted) {
    if(u.combined) {try{split(structuredClone(s),unitId,[]);result.push({type:'split',unitId});}catch{/* no room */}}
    else for(const def of s.content.combinations??[]){try{const cmd={type:'combine' as const,unitId,combinationId:def.id};combine(structuredClone(s),cmd,[]);result.push(cmd);}catch{/* missing/blocked members */}}
  }
  return result;
}

export function aiSpiritCommand(s:BattleState,u:Unit): Extract<Command,{type:'spirit'}>|undefined {
  for(const ref of pilotOf(s,u).aiSpirits??[]) {
    if(u.aiSpiritsUsed?.includes(ref.id)||!conditionMatches(s,u,ref.when))continue;
    const def=s.content.spirits?.find(d=>d.id===ref.id);if(!def)continue;
    const targets=def.target==='self'||def.target==='allAllies'?[undefined]:[...s.units].sort((a,b)=>a.hp/mechOf(s,a).hp-b.hp/mechOf(s,b).hp||(a.id<b.id?-1:a.id>b.id?1:0)).map(v=>v.id);
    for(const targetId of targets)if(!spiritProblem(s,u.id,ref.id,targetId))return {type:'spirit',unitId:u.id,spiritId:ref.id,...(targetId?{targetId}:{})};
  }
  return undefined;
}
