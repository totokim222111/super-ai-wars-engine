import {auraAtoms} from './gimmicks';
import type { BattleState, EffectAtom, Mech, Pilot, Unit, Weapon } from './types';

/** Shared data projection. No mutation, RNG, or terrain dependency. */
export function atomsOf(s: BattleState, u: Unit): EffectAtom[] {
  const p = s.content.pilots.find(p => p.id === u.pilotId)!;
  return [
    ...auraAtoms(s,u),
    ...u.effects.flatMap(e => e.atoms ?? []),
    ...(p.skills ?? []).flatMap(ref => { const skill = s.content.skills?.find(x => x.id === ref.id); return skill?.levels?.[String(ref.level ?? 1)] ?? skill?.effects ?? []; }),
    ...(u.parts ?? []).flatMap(id => { const part = s.content.parts?.find(x => x.id === id); return part?.kind === 'passive' ? part.effects : []; }),
    ...(s.content.fullUpgradeBonuses?.find(b => b.id === u.fullUpgradeBonus)?.effects ?? []),
  ];
}
export function sumAtom(s: BattleState, u: Unit, type: EffectAtom['type']): number {
  return atomsOf(s, u).reduce((n, a) => n + (a.type === type && typeof ('value' in a && a.value) === 'number' ? (a as {value: number}).value : 0), 0);
}
export function mulAtom(s: BattleState, u: Unit, type: EffectAtom['type']): number {
  return atomsOf(s, u).reduce((n, a) => n * (a.type === type && 'value' in a && typeof a.value === 'number' ? a.value : 1), 1);
}
export function setAtom(s: BattleState, u: Unit, type: EffectAtom['type'], smallest = false): number | undefined {
  const values = atomsOf(s, u).filter(a => a.type === type).map(a => 'value' in a && typeof a.value === 'number' ? a.value : 0);
  return values.length ? (smallest ? Math.min(...values) : Math.max(...values)) : undefined;
}
export function statAdd(s: BattleState, u: Unit, key: string): number {
  return atomsOf(s, u).reduce((n, a) => n + (a.type === 'statAdd' ? (a.value as Record<string, number>)[key] ?? 0 : 0), 0);
}
export function effectiveMech(s: BattleState, u: Unit): Mech {
  const raw = s.content.mechs.find(m => m.id === u.mechId)!,base=u.side==='player'&&u.recruited?{...raw,...raw.allyStats}:raw;
  const form = base.forms?.find(f => f.id === (u.formId ?? base.forms?.[0]?.id));
  const m = {...base, ...form?.overrides, adapt: {...base.adapt, ...form?.overrides.adapt}};
  for (const key of ['hp','en','armor','mobility','move'] as const) m[key] += statAdd(s,u,key) + (key === 'move' ? sumAtom(s,u,'moveAdd') : (u.upgrades?.[key] ?? 0) * s.content.rules.upgradeStep[key]);
  const order = ['D','C','B','A','S'];
  for (const a of atomsOf(s,u)) if (a.type === 'adaptSet') for (const [env,g] of Object.entries(a.value)) {
    const key = env as keyof Mech['adapt']; if (order.indexOf(g) > order.indexOf(m.adapt[key])) m.adapt[key] = g;
  }
  return m;
}
export function effectivePilot(s: BattleState, u: Unit): Pilot {
  const base=s.content.pilots.find(p=>p.id===u.pilotId)!,raw=s.content.mechs.find(m=>m.id===u.mechId)?.pilotOverrides,mo=raw?.pilotId&&raw.pilotId!==u.pilotId?undefined:raw,o=u.pilotOverrides,p={...base,...mo,...o,stats:{...base.stats,...mo?.stats,...o?.stats},growth:{...base.growth,...mo?.growth,...o?.growth}},stats={...p.stats};
  for (const key of Object.keys(stats) as (keyof Pilot['stats'])[]) stats[key] += (p.growth?.[key] ?? 0) * ((u.level ?? 1) - 1);
  for(const [key,curve]of Object.entries(p.statCurves??{})){
    if(!curve?.length)continue;const level=u.level??1,lo=[...curve].reverse().find(v=>v.level<=level)??curve[0],hi=curve.find(v=>v.level>=level)??curve.at(-1)!;
    stats[key as keyof Pilot['stats']]=Math.floor(lo.value+(hi.value-lo.value)*(hi.level===lo.level?0:(level-lo.level)/(hi.level-lo.level)));
  }
  const scaling=s.stage?.enemyPilotScaling,target=scaling?.units[u.id];if(u.side==='enemy'&&target)for(const key of Object.keys(stats)as (keyof Pilot['stats'])[])stats[key]=Math.round(scaling!.baseline.stats[key]*target.ratio);
  for(const atom of atomsOf(s,u))if(atom.type==='pilotStatSet')Object.assign(stats,atom.value);
  return {...p, stats, sp: p.sp + (p.spGrowth ?? 0) * ((u.level ?? 1) - 1) + statAdd(s,u,'sp')};
}
export function effectiveWeapon(s: BattleState, u: Unit, w: Weapon): Weapon {
  const power=u.recruited?s.content.mechs.find(m=>m.id===u.mechId)?.allyStats?.weaponPower?.[w.id]:undefined;if(power!==undefined)w={...w,power};
  return {...w, hit:w.hit+(w.kind==='melee'?(s.content.rules.meleeHitBonus??0):0),power: w.fixedPower?w.power:(s.content.rules.weaponUpgrade?.mode==='percent'?Math.round(w.power*(1+(u.upgrades?.weapons??0)*s.content.rules.weaponUpgrade.rate)):w.power+(u.upgrades?.weapons??0)*s.content.rules.upgradeStep.weapons) + statAdd(s,u,'weapons'), range: [w.range[0], w.range[1] + (w.map ? 0 : sumAtom(s,u,'rangeAdd'))]};
}

/** Temporary morale offsets leave earned base morale intact and expire with their effect. */
export function effectiveMorale(s:BattleState,u:Unit):number{return Math.max(s.content.rules.morale.min,Math.min(s.content.rules.morale.max+sumAtom(s,u,'moraleCapAdd'),u.morale+sumAtom(s,u,'moraleOffset')));}
