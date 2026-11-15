import { describe, expect, it } from 'vitest';
import { apply, attackForecast, chooseAICommand, distance, forecast, nextAICommand, quarterDamageEffect, reachable, resolve, snapshot, sureHitEffect, withEffect } from '../../src/core';
import { arena, deepFreeze, fixedCombat } from './helpers';

describe('serializable effect hooks', () => {
  it('sure-hit and quarter-damage modify previews and actual fire, then expire after one use', () => {
    let s = fixedCombat(); s.content.weapons[0].crit = -100;
    s = withEffect(s, 'p1', sureHitEffect(s)); s = withEffect(s, 'e1', quarterDamageEffect(s));
    const f = forecast(s, 'p1', 'e1', 'blade', { type: 'defend' });
    expect(f.hitRate).toBe(100); expect(f.damage).toEqual({ min: 191, max: 233 });
    expect(s.units.map(u => u.effects.length)).toEqual([1, 1]);
    const r = resolve(s, 'p1', 'e1', 'blade', { type: 'defend' });
    expect(r.events.find(e => e.type === 'attack')).toMatchObject({ hit: true, critical: false });
    const shot = r.events.find(e => e.type === 'attack'); if (shot?.type !== 'attack') throw new Error('missing shot');
    expect(shot.damage).toBeGreaterThanOrEqual(191); expect(shot.damage).toBeLessThanOrEqual(233);
    expect(r.state.units.map(u => u.effects.length)).toEqual([0, 0]);
    expect(r.events.filter(e => e.type === 'effect-expired')).toHaveLength(2);
  });
  it('protection is retained on a miss, and multiple-use effects decrement once per shot', () => {
    let s = fixedCombat(); s.content.weapons[0].hit = -1000;
    s = withEffect(s, 'e1', quarterDamageEffect(s));
    expect(resolve(s, 'p1', 'e1', 'blade', { type: 'defend' }).state.units[1].effects[0].duration.remaining).toBe(1);
    s = withEffect(s, 'p1', sureHitEffect(s, { unit: 'use', remaining: 2 }));
    const r = resolve(s, 'p1', 'e1', 'blade', { type: 'defend' });
    expect(r.state.units[0].effects[0].duration.remaining).toBe(1);
    expect(r.state.units[1].effects).toEqual([]);
  });
  it('round effects stay active through both phases and disappear at next round boundary', () => {
    let s = withEffect(arena(), 'p1', sureHitEffect(arena(), { unit: 'round', remaining: 1 }));
    s = apply(s, { type: 'endPhase' }).state; expect(s.units[0].effects).toHaveLength(1);
    const r = apply(s, { type: 'endPhase' }); expect(r.state.units[0].effects).toEqual([]);
    expect(r.events).toContainEqual({ type: 'effect-expired', unitId: 'p1', effectId: 'dummy-sure-hit' });
  });
  it('tentative movement keeps one-use movement hooks until committed and undo restores them', () => {
    const s = withEffect(arena(), 'p1', { id: 'extra-move', source: 'test', duration: { unit: 'use', remaining: 1 }, hooks: { onBeforeMove: { role: 'owner', op: 'add', value: 1 } } });
    const moved = apply(s, { type: 'move', unitId: 'p1', x: 0, y: 2 }).state;
    expect(moved.units[0].effects).toHaveLength(1);
    expect(snapshot(apply(moved, { type: 'undoMove', unitId: 'p1' }).state)).toBe(snapshot(s));
    const committed = apply(moved, { type: 'wait', unitId: 'p1' });
    expect(committed.state.units[0].effects).toEqual([]);
    expect(committed.events.filter(e => e.type === 'effect-expired')).toHaveLength(1);
  });
  it('round, movement, crit, after-attack and defeat lifecycle hooks are wired', () => {
    let s = fixedCombat();
    s = withEffect(s, 'p1', { id: 'lifecycle', source: 'test', duration: { unit: 'round', remaining: 3 }, hooks: {
      onRoundStart: { op: 'add', value: 2, role: 'owner' }, onBeforeMove: { op: 'add', value: 2, role: 'owner' },
      modifyCrit: { op: 'set', value: 100, role: 'attacker' }, onAfterAttack: { op: 'add', value: 2, role: 'attacker' }, onDefeated: { op: 'multiply', value: 2, role: 'attacker' },
    } });
    expect(reachable(s, 'p1').some(p => p.cost === 6)).toBe(true);
    s = apply(apply(s, { type: 'endPhase' }).state, { type: 'endPhase' }).state;
    expect(s.units[0].morale).toBe(103);
    expect(attackForecast(s, 'p1', 'e1', 'blade').critRate).toBe(100);
    s.units[1].hp = 1; s = withEffect(s, 'p1', sureHitEffect(s));
    const r = apply(s, { type: 'attack', unitId: 'p1', targetId: 'e1', weaponId: 'blade' });
    expect(r.state.units[0].morale).toBe(112); // 103 + (hit1+hook2) + kill3*2
  });
});
describe('deterministic AI', () => {
  it('same frozen situation returns identical command, with lowest unit id first', () => {
    const s = deepFreeze(arena((_c, stage) => { stage.units.push({ id: 'p0', pilotId: 'pilot-2', mechId: 'mech-b', side: 'player', x: 0, y: 5 }); }));
    const before = structuredClone(s), command = nextAICommand(s);
    for (let i = 0; i < 10; i++) expect(nextAICommand(s)).toEqual(command);
    expect(command).toHaveProperty('unitId', 'p0'); expect(s).toEqual(before);
  });
  it('hold waits without moving when out of range, and fires in range', () => {
    let s = arena((c, stage) => { c.mechs[0].weapons = ['blade']; stage.units[0].ai = 'hold'; });
    expect(chooseAICommand(s, 'p1')).toEqual({ type: 'wait', unitId: 'p1' });
    s = arena((_c, stage) => { stage.units[0].ai = 'hold'; });
    expect(chooseAICommand(s, 'p1')).toMatchObject({ type: 'attack', unitId: 'p1', targetId: 'e1' });
  });
  it('defensive retreats at 30% HP and waits after retreating', () => {
    let s = arena((_c, stage) => { stage.units[0].ai = 'defensive'; }); s.units[0].hp = 2040;
    const command = chooseAICommand(s, 'p1'); expect(command.type).toBe('move');
    if (command.type !== 'move') throw new Error('expected retreat');
    expect(distance(command, s.units[1])).toBeGreaterThan(distance(s.units[0], s.units[1]));
    s = apply(s, command).state; expect(chooseAICommand(s, 'p1')).toEqual({ type: 'wait', unitId: 'p1' });
  });
  it('approaches by terrain path cost and does not try to fire non-P after moving', () => {
    let s = arena((c, stage) => { c.mechs[0].weapons = ['cannon']; c.weapons[3].range = [1, 2]; stage.units[1].x = 7; stage.map.tiles[2][2] = 'wall'; });
    const command = chooseAICommand(s, 'p1'); expect(command.type).toBe('move');
    s = apply(s, command).state; expect(chooseAICommand(s, 'p1')).toEqual({ type: 'wait', unitId: 'p1' });
  });
});
