import { describe, expect, it } from 'vitest';
import { createBattle, effectiveAdaptation, environmentOf, forecast, movementCost, pathTo, reachable } from '../../src/core';
import { arena, deepFreeze, harbor } from './helpers';

describe('weighted deterministic movement', () => {
  it('uses terrain costs and cannot enter impassable cells', () => {
    const s = arena((c, stage) => { c.mechs[0].move = 2; stage.map.tiles[2][2] = 'sea'; stage.map.tiles[1][1] = 'wall'; });
    expect(reachable(s, 'p1').find(p => p.x === 2 && p.y === 2)?.cost).toBe(2);
    expect(pathTo(s, 'p1', { x: 1, y: 1 })).toBeNull();
    expect(pathTo(s, 'p1', { x: 3, y: 1 })).toBeNull();
  });
  it('cannot pass enemies, can pass allies, cannot stop on allies', () => {
    const s = arena((_c, stage) => {
      stage.map = { w: 6, h: 1, tiles: [Array<string>(6).fill('ground')] };
      Object.assign(stage.units[0], { x: 0, y: 0 }); Object.assign(stage.units[1], { x: 4, y: 0 });
      stage.units.push({ id: 'p2', pilotId: 'pilot-2', mechId: 'mech-b', side: 'player', x: 1, y: 0 });
    });
    expect(pathTo(s, 'p1', { x: 3, y: 0 })).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }]);
    expect(pathTo(s, 'p1', { x: 1, y: 0 })).toBeNull();
    expect(pathTo(s, 'p1', { x: 4, y: 0 })).toBeNull();
    expect(pathTo(s, 'p1', { x: 5, y: 0 })).toBeNull();
  });
  it('flies over walls and sea for cost one, but cannot pass enemies', () => {
    const s = arena((c, stage) => { c.mechs[0].moveType = ['air']; stage.map.tiles[2][2] = 'wall'; stage.map.tiles[1][1] = 'sea'; });
    expect(movementCost(s, s.units[0], { x: 2, y: 2 })).toBe(1);
    expect(movementCost(s, s.units[0], { x: 1, y: 1 })).toBe(1);
    expect(pathTo(s, 'p1', { x: 3, y: 2 })).toBeNull();
    expect(environmentOf(s, s.units[0])).toBe('air');
  });
  it('takes minimum cost over supported movement types', () => {
    const s = arena((c, stage) => { c.mechs[0].moveType = ['ground', 'sea']; stage.map.tiles[2][2] = 'sea'; });
    expect(movementCost(s, s.units[0], { x: 2, y: 2 })).toBe(1);
  });
  it('breaks equal-cost paths by y then x without changing frozen state', () => {
    const s = deepFreeze(arena()), before = structuredClone(s);
    const expected = [{ x: 1, y: 2 }, { x: 1, y: 1 }, { x: 2, y: 1 }];
    for (let i = 0; i < 10; i++) expect(pathTo(s, 'p1', { x: 2, y: 1 })).toEqual(expected);
    expect(s).toEqual(before);
  });
  it('harbor contains low-sea ground and flying units with different effective environments', () => {
    const { content, stage } = harbor();
    const b = content.mechs.find(m => m.id === 'mech-b')!;
    expect(b.adapt.sea).toBe('C'); expect(stage.map.w).toBe(18); expect(stage.map.h).toBe(12);
    const s = arena(); s.units[0].x = 2; s.stage.map.tiles[2][2] = 'sea';
    s.content.pilots[0].adapt.sea = 'D'; s.content.mechs[0].adapt.sea = 'S';
    expect(effectiveAdaptation(s, s.units[0])).toBe('D');
  });
  it('harbor ground unit sea adaptation changes real weapon hit and damage forecasts', () => {
    const { content, stage } = harbor(), s = createBattle(content, stage, 1);
    const poor = s.units.find(u => u.id === 'p-2')!, target = s.units.find(u => u.id === 'e-3')!;
    // Bring the target into the test unit's rifle range without changing either environment.
    target.x = 5; target.y = 7;
    expect(effectiveAdaptation(s, poor)).toBe('C');
    const sea = forecast(s, poor.id, target.id, 'rifle', { type: 'evade' });
    const ground = structuredClone(s); ground.units.find(u => u.id === poor.id)!.x = 1;
    const land = forecast(ground, poor.id, target.id, 'rifle', { type: 'evade' });
    expect(land.hitRate).toBeGreaterThan(sea.hitRate); expect(land.damage.max).toBeGreaterThan(sea.damage.max);
  });
});
