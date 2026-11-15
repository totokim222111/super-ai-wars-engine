/** Declarative weapon effects: independent of pack ids, persisted budgets, no forecast RNG. */
import type {BattleState,BattleEvent,Unit,Weapon,Command,StageUnit} from './types';
import {effectiveMech,effectivePilot,effectiveMorale} from './modifiers';
import {distance,unitById} from './terrain';
import {initializeUnit,nearestFree} from './system';
import {addAction,finishAction} from './actions';
export const supportWeapon=(w:Weapon):boolean=>w.special?.kind==='restore'||w.special?.kind==='status'&&w.special.target==='self';
const live=(u:Unit)=>u.alive&&!u.removed;
const statusId=(w:Weapon)=>'weapon:'+w.id;
export function specialTargets(s:BattleState,a:Unit,w:Weapon):Unit[]{const e=w.special;if(!e)return [];if(e.kind==='restore')return e.target==='self'?[a]:s.units.filter(v=>live(v)&&v.side===a.side&&v.id!==a.id&&distance(a,v)<=e.radius);return [a];}
function spawnCell(s:BattleState,a:Unit):{x:number;y:number}|undefined{try{const p=nearestFree(s,a);return distance(a,p)<=1?p:undefined;}catch{return;}}
export function specialProblem(s:BattleState,a:Unit,w:Weapon,d?:Unit):string|null{
 const e=w.special;if(!e)return null;const last=a.weaponUses?.[w.id];
 if(last&&s.round-last.round<(e.cooldown??0))return 'weapon cooling down';
 if(e.kind==='summon'&&((s.weaponLimits?.[w.id]??0)>=e.limit||!spawnCell(s,a)))return 'summon limit or no adjacent space';
 if(e.kind==='extraAction'&&(a.extraActionsUsed??0)>=(s.content.rules.actions?.extraMax??1))return 'extra action: round limit';
 if(e.kind==='status'&&e.target==='enemy'&&d?.effects.some(x=>x.id===statusId(w)))return 'target already affected';
 if(e.kind==='drain'&&d&&(!d.en||a.en>=effectiveMech(s,a).en))return 'no useful energy drain';
 return null;
}
export function supportProblem(s:BattleState,a:Unit,w:Weapon):string|null{
 if(!supportWeapon(w)||!live(a)||a.acted||a.side!==s.phase||!effectiveMech(s,a).weapons.includes(w.id))return 'support weapon unavailable';
 if(a.moved&&!w.postMove)return 'non-P weapon cannot fire after moving';
 if(effectiveMorale(s,a)<(w.moraleReq??0))return 'insufficient morale';
 if(a.en<(w.en??0)||w.ammo!==undefined&&!(a.ammo[w.id]>0))return 'insufficient resources';
 const problem=specialProblem(s,a,w);if(problem)return problem;const e=w.special!;
 if(e.kind==='status')return a.effects.some(x=>x.id===statusId(w))?'effect already active':null;
 if(e.kind==='restore'&&!specialTargets(s,a,w).some(v=>{const m=effectiveMech(s,v);return !!e.hpPct&&v.hp<m.hp||!!e.enFlat&&v.en<m.en||!!e.ammo&&Object.entries(v.ammo).some(([id,n])=>n<(s.content.weapons.find(w=>w.id===id)?.ammo??0));}))return 'no injured or depleted ally';
 return null;
}
export function stampWeapon(s:BattleState,a:Unit,w:Weapon):void{if(!w.special)return;const old=a.weaponUses?.[w.id];(a.weaponUses??={})[w.id]={round:s.round,uses:(old?.uses??0)+1};}
export function applyWeaponSpecial(s:BattleState,a:Unit,d:Unit|undefined,w:Weapon,hit:boolean,damage:number,events:BattleEvent[],counter=false):void{
 const e=w.special;if(!e)return;
 const notice=(target:Unit,amount?:number)=>events.push({type:'weapon-effect',unitId:a.id,targetId:target.id,weaponId:w.id,kind:e.kind,label:e.label,...(amount!==undefined?{amount}:{})});
 if(e.kind==='status'&&(e.target==='self'||hit&&d?.alive&&d.hp>0)){const t=e.target==='self'?a:d!;t.effects=t.effects.filter(x=>x.id!==statusId(w));t.effects.push({id:statusId(w),source:a.id,definitionId:w.id,duration:{unit:'round',remaining:e.rounds},atoms:structuredClone(e.atoms),hooks:{}});notice(t);}
 if(e.kind==='drain'&&hit&&d){const amount=Math.min(d.en,Math.floor(damage*e.ratio),e.max,Math.max(0,effectiveMech(s,a).en-a.en));if(amount){d.en-=amount;a.en+=amount;events.push({type:'recover',unitId:d.id,hp:0,en:-amount},{type:'recover',unitId:a.id,hp:0,en:amount});notice(d,amount);}}
 if(e.kind==='extraAction'&&!counter&&a.alive){if(s.content.rules.actions)addAction(s,a);else{a.actionsRemaining=(a.actionsRemaining??Number(!a.acted))+1;a.actionsSpent??=0;a.extraActionsUsed=(a.extraActionsUsed??0)+1;a.acted=false;}notice(a);}
 if(e.kind==='summon'&&!counter&&a.alive){const cell=spawnCell(s,a),count=s.weaponLimits?.[w.id]??0;if(!cell||count>=e.limit)return;
  const base:StageUnit={id:a.id+'-summon-'+(count+1),pilotId:a.pilotId,mechId:a.mechId,side:a.side,...cell,level:a.level,upgrades:structuredClone(a.upgrades),pilotOverrides:{stats:{...effectivePilot(s,a).stats},growth:{melee:0,shoot:0,hit:0,evade:0,skill:0,defense:0}},tags:['no-reward']};
  const child=initializeUnit(s,base);child.hp=Math.max(1,Math.floor(child.hp*e.hpPct/100));child.acted=true;child.actionsRemaining=0;child.actionsSpent=1;child.extraActionsUsed=0;child.summonedBy={unitId:a.id,weaponId:w.id,ordinal:count+1};s.units.push(child);(s.weaponLimits??={})[w.id]=count+1;
  events.push({type:'system',action:{kind:'spawn',units:[base]},ids:[child.id]});notice(a);
 }
 if(e.kind==='restore')for(const t of specialTargets(s,a,w)){const m=effectiveMech(s,t),hp=Math.min(m.hp-t.hp,Math.floor(m.hp*(e.hpPct??0)/100)),en=Math.min(m.en-t.en,e.enFlat??0);let ammo=0;t.hp+=hp;t.en+=en;
  if(e.ammo)for(const [id,n]of Object.entries(t.ammo)){const max=s.content.weapons.find(w=>w.id===id)?.ammo??n,add=Math.min(max-n,e.ammo);t.ammo[id]+=add;ammo+=add;}
  if(hp||en||ammo){events.push({type:'recover',unitId:t.id,hp,en});notice(t,hp||en||ammo);}
 }
}
export function supportWeaponActions(s:BattleState,id:string):Extract<Command,{type:'weaponSkill'}>[] {const a=unitById(s,id);return effectiveMech(s,a).weapons.flatMap(id=>{const w=s.content.weapons.find(w=>w.id===id)!;return supportProblem(s,a,w)?[]:[{type:'weaponSkill' as const,unitId:a.id,weaponId:id}];});}
export function useSupportWeapon(s:BattleState,id:string,weaponId:string,events:BattleEvent[]):void{const a=unitById(s,id),w=s.content.weapons.find(w=>w.id===weaponId);if(!w)throw Error('unknown support weapon');const p=supportProblem(s,a,w);if(p)throw Error(p);a.en-=w.en??0;if(w.ammo!==undefined)a.ammo[w.id]--;stampWeapon(s,a,w);applyWeaponSpecial(s,a,undefined,w,true,0,events);finishAction(s,a);}
/** Useful debuffs/summons/extra actions win a tie; never consume prediction RNG. */
export function specialUtility(s:BattleState,a:Unit,w:Weapon,d:Unit):number{const e=w.special;if(!e||specialProblem(s,a,w,d))return 0;if(e.kind==='status'&&e.target==='enemy')return .15;if(e.kind==='summon')return .2;if(e.kind==='extraAction')return .2;if(e.kind==='drain')return .1;return 0;}
