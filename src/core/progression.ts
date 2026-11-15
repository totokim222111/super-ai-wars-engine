import type {BattleEvent, BattleState, Unit} from './types';
import {mechOf, pilotOf, clamp} from './terrain';
import {mulAtom} from './modifiers';

export function experienceFor(s: BattleState, attacker: Unit, target: Unit, killed: boolean): number {
  const r = s.content.rules, base = mechOf(s,target).exp ?? 0;
  if (!base) return 0;
  const factor = clamp(1 + ((target.level ?? 1) - (attacker.level ?? 1)) * r.expLevelFactor, r.expFactorMin, r.expFactorMax);
  return Math.max(1, Math.floor(base * factor * (killed ? 1 : r.damageExpRatio) * mulAtom(s,attacker,'expMul')));
}
export function gainExperience(s: BattleState, u: Unit, amount: number, events: BattleEvent[]): void {
  if (u.side !== 'player' || amount <= 0) return;
  const r = s.content.rules, p = s.content.pilots.find(p => p.id === u.pilotId)!, from = u.level ?? 1;
  const speaker=s.units.find(v=>v.id===u.id)?.pilotId!==u.pilotId?{pilotId:u.pilotId}:{};
  u.level = from; u.exp = (u.exp ?? 0) + Math.floor(amount);
  events.push({type:'exp-gained',unitId:u.id,amount:Math.floor(amount),...speaker});
  while (u.exp >= r.expPerLevel && u.level < r.levelMax) { u.exp -= r.expPerLevel; u.level++; }
  if (u.level === r.levelMax) u.exp = Math.min(u.exp,r.expPerLevel - 1);
  if (u.level > from) {
    const statDiff = Object.fromEntries(Object.entries(p.growth ?? {}).map(([k,v]) => [k,v * (u.level! - from)]));
    if(p.statCurves)for(const key of Object.keys(p.statCurves)as (keyof typeof p.stats)[])statDiff[key]=pilotOf(s,u).stats[key]-pilotOf(s,{...u,level:from}).stats[key];
    const newSpirits = (p.spirits ?? []).filter(x => x.level > from && x.level <= u.level!).map(x => x.id);
    u.sp = Math.min(pilotOf(s,u).sp, u.sp + (p.spGrowth ?? 0) * (u.level - from));
    events.push({type:'level-up',unitId:u.id,from,to:u.level,statDiff,newSpirits,...speaker});
    for(const sub of u.subPilots??[]){const p=s.content.pilots.find(p=>p.id===sub.pilotId)!;if(p.hostProgress){sub.sp+=Math.max(0,u.level-sub.level)*(p.spGrowth??0);sub.level=u.level;sub.exp=u.exp;}}
  }
}
export function gainCredits(s: BattleState, u: Unit, target: Unit, events: BattleEvent[]): void {
  if (u.side !== 'player') return;
  const amount = Math.floor((mechOf(s,target).credits ?? 0) * mulAtom(s,u,'creditMul'));
  if (!amount) return;
  s.credits = (s.credits ?? 0) + amount; events.push({type:'credits-gained',unitId:u.id,amount});
}
