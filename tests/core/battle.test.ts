import { describe, expect, it } from 'vitest';
import { apply, availableActions, availableWeapons, chooseResponse, forecast, nextRandom, pendingForecast, responseOptions, restore, snapshot, unitAt } from '../../src/core';
import type { Command, Response } from '../../src/core';
import { arena, deepFreeze, fixedCombat } from './helpers';

describe('command flow and resources', () => {
  it('M3: round one preserves default/custom starting morale; round two increments it', () => {
    const s = arena(c => { c.pilots[0].startMorale = 112; });
    expect(s.units.map(u => u.morale)).toEqual([112, 100]);
    const round2 = apply(apply(s, { type: 'endPhase' }).state, { type: 'endPhase' }).state;
    expect(round2.units.map(u => u.morale)).toEqual([113, 101]);
  });
  it('move permits P attacks, rejects non-P, and undo restores the exact snapshot', () => {
    const s = arena(c => { c.mechs[0].weapons.push('cannon'); });
    const moved = apply(s, { type: 'move', unitId: 'p1', x: 0, y: 2 }).state;
    expect(() => apply(moved, { type: 'attack', unitId: 'p1', targetId: 'e1', weaponId: 'cannon' })).toThrow('non-P');
    expect(availableActions(moved, 'p1')).toContainEqual({ type: 'attack', unitId: 'p1', targetId: 'e1', weaponId: 'rifle' });
    expect(snapshot(apply(moved, { type: 'undoMove', unitId: 'p1' }).state)).toBe(snapshot(s));
    expect(apply(s, { type: 'attack', unitId: 'p1', targetId: 'e1', weaponId: 'rifle' }).state.units[0].acted).toBe(true);
  });
  it('wait and attack end the action and prevent further moves, attacks or undo', () => {
    for (const first of [{ type: 'wait', unitId: 'p1' }, { type: 'attack', unitId: 'p1', targetId: 'e1', weaponId: 'rifle' }] satisfies Command[]) {
      const s = apply(arena(), first).state;
      for (const cmd of [{ type: 'move', unitId: 'p1', x: 0, y: 2 }, { type: 'undoMove', unitId: 'p1' }, { type: 'attack', unitId: 'p1', targetId: 'e1', weaponId: 'rifle' }] satisfies Command[]) expect(() => apply(s, cmd)).toThrow('cannot act');
      expect(availableActions(s, 'p1')).toEqual([]);
    }
  });
  it('cannot undo into an origin occupied by another ally', () => {
    const s = arena((_c, stage) => { stage.units.push({ id: 'p2', pilotId: 'pilot-2', mechId: 'mech-b', side: 'player', x: 0, y: 1 }); });
    const a = apply(s, { type: 'move', unitId: 'p1', x: 2, y: 2 }).state;
    const b = apply(a, { type: 'move', unitId: 'p2', x: 1, y: 2 }).state;
    expect(() => apply(b, { type: 'undoMove', unitId: 'p1' })).toThrow('origin now occupied');
  });
  it('missed fire consumes both EN and ammo, while preview consumes neither', () => {
    const s = arena(c => { c.weapons[1].en = 12; c.weapons[1].hit = -1000; });
    const before = structuredClone(s); forecast(s, 'p1', 'e1', 'rifle'); expect(s).toEqual(before);
    const r = apply(s, { type: 'attack', unitId: 'p1', targetId: 'e1', weaponId: 'rifle' });
    expect(r.events.find(e => e.type === 'attack')).toMatchObject({ hit: false });
    expect(r.state.units[0].en).toBe(s.units[0].en - 12); expect(r.state.units[0].ammo.rifle).toBe(s.units[0].ammo.rifle - 1);
  });
  it.each(['range', 'EN', 'ammo', 'morale'] as const)('counter checks %s and rejects invalid choices before drawing', condition => {
    let s = arena(c => { c.mechs[0].weapons = ['rifle']; c.weapons[1].en = 15; c.weapons[1].moraleReq = 100; });
    if (condition === 'range') s.content.weapons[1].range = [3, 4];
    if (condition === 'EN') s.units[0].en = 0;
    if (condition === 'ammo') s.units[0].ammo.rifle = 0;
    if (condition === 'morale') s.units[0].morale = 50;
    s = apply(s, { type: 'endPhase' }).state;
    s = apply(s, { type: 'attack', unitId: 'e1', targetId: 'p1', weaponId: 'beam' }).state;
    expect(availableWeapons(s, 'p1', 'e1', true)).toEqual([]);
    const before = snapshot(s);
    expect(() => apply(s, { type: 'respond', response: { type: 'counter', weaponId: 'rifle' } })).toThrow('counter:');
    expect(snapshot(s)).toBe(before);
  });
  it('counter ignores postMove and action flags, but chooses greatest expected damage', () => {
    let s = arena(c => { c.mechs[0].weapons = ['cannon']; c.weapons[3].range = [2, 6]; });
    s = apply(s, { type: 'move', unitId: 'p1', x: 0, y: 2 }).state;
    s = apply(s, { type: 'endPhase' }).state;
    expect(chooseResponse(s, 'p1', 'e1')).toEqual({ type: 'counter', weaponId: 'cannon' });
    s = apply(s, { type: 'attack', unitId: 'e1', targetId: 'p1', weaponId: 'rifle' }).state;
    const r = apply(s, { type: 'respond', response: { type: 'counter', weaponId: 'cannon' } });
    expect(r.events.filter(e => e.type === 'attack')).toHaveLength(2);
    expect(r.state.units[0].ammo.cannon).toBe(s.units[0].ammo.cannon - 1);
  });
  it('defeat vacates the cell, cancels counter, and changes killer/allied morale', () => {
    const s = arena((c, stage) => {
      c.weapons[1].hit = 1000; stage.units.push({ id: 'p2', pilotId: 'pilot-2', mechId: 'mech-b', side: 'player', x: 0, y: 5 });
    });
    s.units[1].hp = 1;
    const r = apply(s, { type: 'attack', unitId: 'p1', targetId: 'e1', weaponId: 'rifle' });
    expect(r.state.units[1]).toMatchObject({ hp: 0, alive: false }); expect(unitAt(r.state, { x: 3, y: 2 })).toBeUndefined();
    expect(r.events).toContainEqual({ type: 'unit-defeated', unitId: 'e1', by: 'p1' });
    expect(r.state.units[0].morale).toBe(s.units[0].morale + 4); expect(r.state.units[2].morale).toBe(s.units[2].morale + 1);
    expect(r.events.filter(e => e.type === 'attack')).toHaveLength(1);
    expect(r.state.rng).toBe(nextRandom(nextRandom(nextRandom(s.rng).state).state).state); expect(r.state.outcome).toBe('victory');
  });
  it('round start applies morale, EN and recovery, caps resources, resets actions', () => {
    let s = arena((_c, stage) => { stage.map.tiles[2][1] = 'base'; });
    s.units[0].hp -= 2000; s.units[0].en = 0; s.units[0].morale = 149;
    s = apply(s, { type: 'endPhase' }).state; const r = apply(s, { type: 'endPhase' });
    expect(r.state).toMatchObject({ round: 2, phase: 'player' });
    expect(r.state.units[0]).toMatchObject({ hp: s.units[0].hp + 680, en: 23, morale: 150, acted: false, moved: false });
    expect(r.events[0]).toEqual({ type: 'round-start', round: 2 });
  });
  it('flying units receive round EN but no surface base recovery', () => {
    let s = arena((c, stage) => { c.mechs[0].moveType = ['air']; stage.map.tiles[2][1] = 'base'; });
    s.units[0].hp = 1000; s.units[0].en = 0;
    s = apply(apply(s, { type: 'endPhase' }).state, { type: 'endPhase' }).state;
    expect(s.units[0]).toMatchObject({ hp: 1000, en: 8 });
  });
});
describe('manual and automatic response boundaries', () => {
  it.each([{ type: 'counter', weaponId: 'rifle' }, { type: 'defend' }, { type: 'evade' }] satisfies Response[])('stops then resolves %j', response => {
    const s = apply(arena(), { type: 'endPhase' }).state, before = snapshot(s);
    const p = apply(s, { type: 'attack', unitId: 'e1', targetId: 'p1', weaponId: 'rifle' });
    expect(snapshot(s)).toBe(before); expect(p.state.rng).toBe(s.rng);
    expect(p.state.units).toEqual(s.units); expect(p.state.pending).toEqual({ type: 'response', attackerId: 'e1', targetId: 'p1', weaponId: 'rifle' });
    expect(responseOptions(p.state)).toContainEqual(response);
    expect(pendingForecast(deepFreeze(p.state), response).hitRate).toBeGreaterThanOrEqual(0);
    expect(() => apply(p.state, { type: 'endPhase' })).toThrow('pending response');
    expect(snapshot(restore(s.content, s.stage, snapshot(p.state)))).toBe(snapshot(p.state));
    const r = apply(p.state, { type: 'respond', response });
    expect(r.state.pending).toBeNull(); expect(r.state.units[1].acted).toBe(true);
    expect(r.events.filter(e => e.type === 'attack')).toHaveLength(response.type === 'counter' ? 2 : 1);
  });
  it('autoResponse produces the same result as the shared manual policy', () => {
    const manual = apply(arena(), { type: 'endPhase' }).state, auto = structuredClone(manual); auto.options.autoResponse = true;
    const cmd = { type: 'attack' as const, unitId: 'e1', targetId: 'p1', weaponId: 'rifle' };
    const p = apply(manual, cmd).state;
    const m = apply(p, { type: 'respond', response: chooseResponse(p, 'p1', 'e1') }), a = apply(auto, cmd);
    m.state.options.autoResponse = true;
    expect(a).toEqual(m); expect(a.state.pending).toBeNull();
  });
  it('low HP chooses defend without counter; high HP chooses evade', () => {
    const s = arena(c => { c.mechs[0].weapons = []; });
    expect(chooseResponse(s, 'p1', 'e1')).toEqual({ type: 'evade' });
    s.units[0].hp = 100; expect(chooseResponse(s, 'p1', 'e1')).toEqual({ type: 'defend' });
  });
});
describe('atomic immutable reducer', () => {
  it.each([
    { type: 'move', unitId: 'missing', x: 1, y: 1 }, { type: 'move', unitId: 'p1', x: 3, y: 2 },
    { type: 'move', unitId: 'p1', x: NaN, y: 0 }, { type: 'move', unitId: 'e1', x: 4, y: 2 },
    { type: 'attack', unitId: 'p1', targetId: 'e1', weaponId: 'blade' }, { type: 'undoMove', unitId: 'p1' },
    { type: 'respond', response: { type: 'defend' } },
  ] satisfies Command[])('failure %j leaves the input deeply unchanged', cmd => {
    const s = deepFreeze(arena()), before = structuredClone(s);
    expect(() => apply(s, cmd)).toThrow(); expect(s).toEqual(before);
  });
  it('successful apply accepts deep freeze and detaches all nested references', () => {
    const s = deepFreeze(fixedCombat()), before = structuredClone(s);
    const r = apply(s, { type: 'attack', unitId: 'p1', targetId: 'e1', weaponId: 'blade' });
    expect(s).toEqual(before); expect(r.state).not.toBe(s);
    r.state.content.weapons[0].hit = -50; expect(s.content.weapons[0].hit).toBe(10);
  });
});
