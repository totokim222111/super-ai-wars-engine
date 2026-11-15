import type { BattleEvent, BattleState, Effect, EffectHook, Unit } from './types';
import { compareId, unitById, mechOf, pilotOf } from './terrain';
import {sumAtom} from './modifiers';
import { validateEffect } from './validate';

export interface HookContext { ownerId?: string; attackerId?: string; defenderId?: string }
function matches(ownerId: string, role: 'owner' | 'attacker' | 'defender', ctx: HookContext): boolean {
  return ownerId === (role === 'owner' ? ctx.ownerId : role === 'attacker' ? ctx.attackerId : ctx.defenderId);
}
/** Stable owner-id/effect-array order. Queries only read declarative hook data. */
export function hookValue(s: BattleState, hook: EffectHook, initial: number, ctx: HookContext): number {
  let value = initial;
  for (const owner of [...s.units].sort((a, b) => compareId(a.id, b.id))) {
    for (const effect of owner.effects) {
      const h = effect.hooks[hook];
      if (!h || !matches(owner.id, h.role, ctx)) continue;
      value = h.op === 'set' ? h.value : h.op === 'add' ? value + h.value : value * h.value;
    }
  }
  return value;
}
/** Internal mutation of the transaction copy. One use per matching operation, not per hook. */
export function consumeEffects(s: BattleState, hooks: EffectHook[], ctx: HookContext, events: BattleEvent[]): void {
  for (const owner of s.units) {
    owner.effects = owner.effects.filter(effect => {
      if ((typeof effect.duration === 'object' && effect.duration.unit) !== 'use' || !hooks.some(hook => {
        const h = effect.hooks[hook]; return h && matches(owner.id, h.role, ctx);
      })) return true;
      if (typeof effect.duration === 'string') return true;
      effect.duration.remaining--;
      if (effect.duration.remaining > 0) return true;
      events.push({ type: 'effect-expired', unitId: owner.id, effectId: effect.id }); return false;
    });
    clampEffectResources(s,owner);
  }
}
export function expireRoundEffects(s: BattleState, events: BattleEvent[]): void {
  for (const u of s.units) { u.effects = u.effects.filter(e => {
    if (e.lifetime || e.duration.unit !== 'round' || --e.duration.remaining > 0) return true;
    events.push({ type: 'effect-expired', unitId: u.id, effectId: e.id }); return false;
  });clampEffectResources(s,u);}
}
export function sureHitEffect(s: BattleState, duration: Effect['duration'] = { unit: 'use', remaining: 1 }): Effect {
  return { id: 'dummy-sure-hit', source: 'm2-test', duration: { ...duration }, hooks: { modifyHit: { op: 'set', value: s.content.rules.effects.sureHit, role: 'attacker' } } };
}
export function quarterDamageEffect(s: BattleState, duration: Effect['duration'] = { unit: 'use', remaining: 1 }): Effect {
  return { id: 'dummy-quarter-damage', source: 'm2-test', duration: { ...duration }, hooks: { modifyDamage: { op: 'multiply', value: s.content.rules.effects.quarterDamage, role: 'defender' } } };
}
/** Setup/M6 integration helper, not a battle command; attach before recording a replay. */
export function withEffect(s: BattleState, unitId: string, effect: Effect): BattleState {
  validateEffect(effect);
  const next = structuredClone(s), u = unitById(next, unitId);
  if (u.effects.some(e => e.id === effect.id)) throw new Error(`effect.id: duplicate '${effect.id}'`);
  u.effects.push(structuredClone(effect)); return next;
}

/** Consume a complete declarative definition once, including misses for nextAttack. */
export function expireDuration(s: BattleState, unitId: string, duration: import('./types').EffectDuration, events: BattleEvent[], evasionOnly = false, keepCredit = false): void {
  const u = unitById(s,unitId);
  u.effects = u.effects.filter(e => {
    if (e.lifetime !== duration || (keepCredit && e.atoms?.every(a=>a.type==='creditMul')) || (evasionOnly && !e.atoms?.some(a => a.type === 'evadeAll'))) return true;
    events.push({type:'effect-expired',unitId,effectId:e.id}); return false;
  });
  clampEffectResources(s,u);
}

/** Dropping a maximum-stat effect must leave a saveable unit at the new caps. */
export function clampEffectResources(s:BattleState,u:Unit): void {
  const m=mechOf(s,u);u.hp=Math.min(u.hp,m.hp);u.en=Math.min(u.en,m.en);u.sp=Math.min(u.sp,pilotOf(s,u).sp);
  u.morale=Math.min(u.morale,s.content.rules.morale.max+sumAtom(s,u,'moraleCapAdd'));
}
