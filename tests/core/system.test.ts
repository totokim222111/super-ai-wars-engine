import { describe, expect, it } from 'vitest';
import { apply, chooseAICommand, quarterDamageEffect, restore, snapshot, sureHitEffect, weaponProblem } from '../../src/core';
import type { Command, StageUnit, SystemAction } from '../../src/core';
import { arena, deepFreeze } from './helpers';

const definition: StageUnit = { id: 'new', pilotId: 'pilot-5', mechId: 'mech-e', side: 'enemy', x: 1, y: 2 };
function initial() { return arena((_c, s) => { s.scenario = true; s.definitions = [definition]; }); }
function cmd(action: SystemAction): Command { return { type: 'system', unitId: '', action }; }
describe('core system commands', () => {
  it.each(['reinforce', 'spawn'] as const)('%s chooses nearest empty passable cell with row/column ties', kind => {
    const s = deepFreeze(initial()), result = apply(s, cmd({ kind, units: [definition] }));
    expect(result.state.units[2]).toMatchObject({ id: 'new', x: 1, y: 1, alive: true }); expect(s.units).toHaveLength(2);
    expect(result.events.at(-1)).toMatchObject({ type: 'system', ids: ['new'] });
    expect(snapshot(restore(s.content, s.stage, snapshot(result.state)))).toBe(snapshot(result.state));
  });
  it('scripted move uses nearest empty cell without spending normal movement', () => {
    const result = apply(initial(), cmd({ kind: 'move', ids: ['p1'], x: 3, y: 2 }));
    expect(result.state.units[0]).toMatchObject({ x: 3, y: 1, moved: false, acted: false }); expect(result.events[0].type).toBe('move');
  });
  it.each(['retreat', 'leave'] as const)('%s removes without emitting defeated or losing HP', kind => {
    const s = initial(), r = apply(s, cmd({ kind, ids: ['p1'] }));
    expect(r.state.units[0]).toMatchObject({ alive: false, removed: true, hp: s.units[0].hp }); expect(r.events.some(e => e.type === 'unit-defeated')).toBe(false);
    expect(r.state.units[0].side).toBe(kind === 'leave' ? 'neutral' : 'player'); restore(s.content, s.stage, snapshot(r.state));
  });
  it('join and set-ai change roster attributes and survive snapshot validation', () => {
    let s = initial(); s = apply(s, cmd({ kind: 'join', ids: ['e1'] })).state;
    s = apply(s, cmd({ kind: 'set-ai', ids: ['e1'], ai: 'defensive' })).state;
    expect(s.units[1]).toMatchObject({ side: 'player', ai: 'defensive' }); expect(restore(s.content, s.stage, snapshot(s))).toEqual(s);
  });
  it('effect replaces same id and applies the existing M2 hooks', () => {
    let s = initial(); const command = cmd({ kind: 'effect', ids: ['p1'], effect: quarterDamageEffect(s) });
    s = apply(apply(s, command).state, command).state; expect(s.units[0].effects).toHaveLength(1); expect(s.units[0].effects[0].hooks.modifyDamage?.value).toBe(.25);
  });
  it.each(['win', 'lose'] as const)('%s ends while opposing units still live', kind => {
    const s = apply(initial(), cmd({ kind })).state; expect(s.outcome).toBe(kind === 'win' ? 'victory' : 'defeat'); expect(restore(s.content, s.stage, snapshot(s))).toEqual(s);
  });
  it('persuade rejects non-adjacent targets and a spent unit', () => {
    const s = initial(); expect(() => apply(s, { type: 'persuade', unitId: 'p1', targetId: 'e1' })).toThrow('adjacent');
    s.units[1].x = 2; const r = apply(s, { type: 'persuade', unitId: 'p1', targetId: 'e1' });
    expect(r.events[0]).toEqual({ type: 'persuade', unitId: 'p1', targetId: 'e1' }); expect(() => apply(r.state, { type: 'persuade', unitId: 'p1', targetId: 'e1' })).toThrow('cannot act');
  });
  it('replays every system command with intermediate snapshot restoration byte-identically', () => {
    const s = initial(), commands = [cmd({ kind: 'reinforce', units: [definition] }), cmd({ kind: 'move', ids: ['new'], x: 5, y: 1 }), cmd({ kind: 'set-ai', ids: ['new'], ai: 'hold' }), cmd({ kind: 'effect', ids: ['new'], effect: quarterDamageEffect(s) }), cmd({ kind: 'join', ids: ['new'] }), cmd({ kind: 'leave', ids: ['new'] }), cmd({ kind: 'retreat', ids: ['e1'] }), cmd({ kind: 'win' })];
    let a = s, b = s; for (const command of commands) { a = apply(a, command).state; b = restore(s.content, s.stage, snapshot(apply(b, command).state)); }
    expect(snapshot(a)).toBe(snapshot(b)); expect(a.outcome).toBe('victory');
  });
  it('throws transactionally when no deployment cell exists or id is duplicated', () => {
    const s = initial(); expect(() => apply(s, cmd({ kind: 'spawn', units: [{ ...definition, id: 'p1' }] }))).toThrow('duplicate');
    const b = arena((_c, s) => { s.map = { w: 2, h: 1, tiles: [['ground', 'ground']] }; s.units[0].x = 0; s.units[0].y = 0; s.units[1].x = 1; s.units[1].y = 0; s.scenario = true; });
    expect(() => apply(b, cmd({ kind: 'spawn', units: [definition] }))).toThrow('no free');
  });
  it('scenario enemies can attack neutral escorts; player and legacy neutral targeting stay protected', () => {
    let s = arena((_c, stage) => { stage.scenario = true; stage.units[1].ai = 'hold'; stage.units.push({ id: 'supply', pilotId: 'pilot-2', mechId: 'mech-b', side: 'neutral', x: 2, y: 2 }); });
    const supply = s.units[2], enemy = s.units[1], player = s.units[0], rifle = s.content.weapons.find(w => w.id === 'rifle')!;
    expect(weaponProblem(s, enemy, rifle, supply)).toBeNull(); expect(weaponProblem(s, player, rifle, supply)).toContain('invalid target');
    expect(weaponProblem({ ...s, stage: { ...s.stage, scenario: false } }, enemy, rifle, supply)).toContain('invalid target');
    supply.hp = 1; s = apply(s, cmd({ kind: 'effect', ids: ['e1'], effect: sureHitEffect(s) })).state;
    s = apply(s, { type: 'endPhase' }).state; expect(chooseAICommand(s, 'e1')).toMatchObject({ type: 'attack', targetId: 'supply' });
    const r = apply(s, { type: 'attack', unitId: 'e1', targetId: 'supply', weaponId: 'rifle' });
    expect(r.events.some(e => e.type === 'unit-defeated' && e.unitId === 'supply')).toBe(true); expect(r.state.units[2].side).toBe('neutral');
  });
});
