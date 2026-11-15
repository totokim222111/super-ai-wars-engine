import { describe, expect, it, vi } from 'vitest';
import { apply, effectiveMech, resolve, snapshot } from '../src/core';
import type { BattleEvent } from '../src/core';
import { battleExchange, type BattleLookup } from '../src/v2/adapter/battle';
import { m6, attach } from './core/m6-helpers';
import { deepFreeze } from './core/helpers';

const lookup: BattleLookup = {
  mech: () => ({ height: 400, faces: 'left' }),
  pilot: () => ({ portrait: { faces: {}, crop: { x: 0, y: 0, w: 1, h: 1 } } }),
  weapon: w => ({ anim: { template: w.kind === 'melee' ? 'punch-rush' : 'heavy-shot', color: '#fff' } }),
  lines: () => ({ before: '테스트' }),
};
const arena = () => m6(c => {
  c.pilots[1].skills = [{ id: 'support-fire', level: 2 }, { id: 'support-guard', level: 2 }];
  c.weapons.forEach(w => { w.power = 600; });
});

describe('core → v2 battle adapter with seeded core combat', () => {
  it('preserves the actual order: main, counter, support; uses caller metadata and initial stats', () => {
    const before = arena(), spy = vi.fn(lookup.weapon);
    before.rng = 17; const original = snapshot(before);
    const result = apply(before, { type: 'attack', unitId: 'p1', targetId: 'e1', weaponId: 'blade', supportAttackerId: 'p2' });
    const exchange = battleExchange(deepFreeze(before), deepFreeze(result.events), { ...lookup, weapon: spy });
    expect(exchange.strikes.map(s => s.attacker)).toEqual(['p1', 'e1', 'p2']);
    expect(exchange.strikes.map(s => s.banner)).toEqual([undefined, '반격', '원호 공격']);
    expect(exchange.strikes.every(s => !s.outcome.guard)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(3);
    const attacks = result.events.filter(e => e.type === 'attack');
    exchange.strikes.forEach((s, i) => {
      expect(s.target).toBe(attacks[i].targetId); expect(s.outcome).toMatchObject({ hit: attacks[i].hit, damage: attacks[i].hpDamage, critical: attacks[i].critical });
      expect(s.lines).toEqual({ before: '테스트' });
      expect(s.weapon.name).toBe(before.content.weapons.find(w => w.id === attacks[i].weaponId)!.name);
    });
    const p1 = exchange.fighters.find(f => f.id === 'p1')!, mech = effectiveMech(before, before.units[0]);
    expect(p1).toMatchObject({ side: 'ally', hp: before.units[0].hp, en: before.units[0].en, hpMax: mech.hp, enMax: mech.en, height: 400 });
    expect(exchange.fighters.find(f => f.id === 'e1')!.side).toBe('enemy');
    expect(snapshot(before)).toBe(original);
    expect(battleExchange(before, result.events, lookup)).toEqual(exchange);
  });
  it.each(['defend', 'evade', 'counter'] as const)('maps the chosen %s response from apply events', response => {
    let before = arena(); before.rng = 43;
    before = apply(before, { type: 'endPhase' }).state;
    before = apply(before, { type: 'attack', unitId: 'e1', targetId: 'p1', weaponId: 'rifle' }).state;
    const selected = response === 'counter' ? { type: response, weaponId: 'blade' } : { type: response };
    const result = apply(before, { type: 'respond', response: selected });
    const ex = battleExchange(before, result.events, lookup);
    expect(ex.strikes[0].outcome.guard).toBe(response === 'defend');
    expect(ex.strikes[0].attacker).toBe('e1');
    expect(ex.strikes.slice(1).every(s => s.banner === '반격' && !s.outcome.guard)).toBe(true);
  });
  it('restores the intended target for support defense and marks the guardian as guarding', () => {
    let before = arena(); before.rng = 101;
    before = apply(before, { type: 'endPhase' }).state;
    before = apply(before, { type: 'attack', unitId: 'e1', targetId: 'p1', weaponId: 'rifle' }).state;
    const result = apply(before, { type: 'respond', response: { type: 'counter', weaponId: 'blade' }, supportDefenderId: 'p2' });
    const ex = battleExchange(before, result.events, lookup);
    expect(ex.strikes).toHaveLength(1);
    expect(ex.strikes[0]).toMatchObject({ attacker: 'e1', target: 'p1', cover: 'p2', outcome: { guard: true } });
    expect(ex.fighters.map(f => f.id)).toEqual(['e1', 'p1', 'p2']);
    expect(result.state.units[0].hp).toBe(before.units[0].hp);
    expect(ex.strikes[0].outcome.damage).toBe(before.units[2].hp - result.state.units[2].hp);
  });
  it.each([false, true])('maps an actual forced miss/critical (%s) without re-rolling', critical => {
    const before = arena(); before.rng = 73;
    attach(before, 0, [{ type: 'hitSet', value: critical ? 100 : 0 }, { type: 'critSet', value: 100 }]);
    const result = resolve(before, 'p1', 'e1', 'blade', { type: 'defend' });
    const ex = battleExchange(before, result.events, lookup, { response: { unitId: 'e1', response: { type: 'defend' } } });
    expect(ex.strikes[0].outcome).toMatchObject({ hit: critical, critical, guard: true });
    expect(ex.strikes[0].outcome.damage).toBe(critical ? before.units[1].hp - result.state.units[1].hp : 0);
  });
  it('uses capped HP damage for overkill and preserves caller background', () => {
    const before = arena(); before.units[1].hp = 1; before.rng = 59;
    attach(before, 0, [{ type: 'hitSet', value: 100 }]);
    const result = resolve(before, 'p1', 'e1', 'blade', { type: 'defend' });
    const background = {} as HTMLImageElement;
    const ex = battleExchange(before, result.events, lookup, { background });
    expect(ex.background).toBe(background); expect(ex.strikes[0].outcome.damage).toBe(1);
    expect(result.events.some(e => e.type === 'unit-defeated')).toBe(true);
  });
  it('accepts empty noncombat events, and requires a caller policy for neutral participants', () => {
    const before = arena(); expect(battleExchange(before, [], lookup).strikes).toEqual([]);
    const result = apply(before, { type: 'attack', unitId: 'p1', targetId: 'e1', weaponId: 'blade' });
    before.units[0].side = 'neutral';
    expect(() => battleExchange(before, result.events, lookup)).toThrow('neutral');
    expect(battleExchange(before, result.events, { ...lookup, side: u => u.side === 'enemy' ? 'enemy' : 'ally' }).fighters[0].side).toBe('ally');
  });
  it('ignores unrelated progress events between a support marker and its attack', () => {
    const before = arena(), result = apply(before, { type: 'attack', unitId: 'p1', targetId: 'e1', weaponId: 'blade', supportAttackerId: 'p2' });
    const events: BattleEvent[] = result.events.flatMap(e => e.type === 'support' ? [e, { type: 'response', unitId: 'p2', response: { type: 'defend' } } as BattleEvent] : [e]);
    const last = battleExchange(before, events, lookup).strikes.at(-1)!;
    expect(last).toMatchObject({ attacker: 'p2', banner: '원호 공격', outcome: { guard: false } });
  });
});
