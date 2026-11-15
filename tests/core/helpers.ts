import rawPilots from '../fixtures/core/pilots.json';
import rawMechs from '../fixtures/core/mechs.json';
import rawWeapons from '../fixtures/core/weapons.json';
import rawTerrain from '../fixtures/core/terrain.json';
import rawStage from '../fixtures/core/stage.json';
import { createBattle, loadRules, validateContent, validateStage } from '../../src/core';
import type { BattleState, Content, Stage } from '../../src/core';

export function testContent(): Content {
  const content: unknown = { version: 'm2-test-1', rules: loadRules(), pilots: structuredClone(rawPilots), mechs: structuredClone(rawMechs), weapons: structuredClone(rawWeapons), terrain: structuredClone(rawTerrain) };
  validateContent(content); return content;
}
export function harbor(): { content: Content; stage: Stage } {
  const content = testContent(), stage: unknown = structuredClone(rawStage);
  validateStage(stage, content); return { content, stage };
}
export function arena(configure?: (c: Content, stage: Stage) => void, seed = 1): BattleState {
  const content = testContent();
  content.terrain.find(t => t.id === 'ground')!.hitMod = 0;
  content.terrain.find(t => t.id === 'ground')!.damageMod = 0;
  for (const m of content.mechs) { m.moveType = ['ground']; m.size = 'M'; m.adapt = { air: 'A', ground: 'A', sea: 'A', space: 'A' }; m.move = 4; }
  const stage: Stage = { id: 'arena', map: { w: 8, h: 6, tiles: Array.from({ length: 6 }, () => Array<string>(8).fill('ground')) }, units: [
    { id: 'p1', pilotId: 'pilot-1', mechId: 'mech-a', side: 'player', x: 1, y: 2 },
    { id: 'e1', pilotId: 'pilot-4', mechId: 'mech-d', side: 'enemy', x: 3, y: 2 },
  ] };
  configure?.(content, stage);
  return createBattle(content, stage, seed);
}
export function fixedCombat(): BattleState {
  const s = arena(c => {
    const a = c.pilots[0], d = c.pilots[3], dm = c.mechs.find(m => m.id === 'mech-d')!, w = c.weapons[0];
    a.stats = { melee: 150, shoot: 130, hit: 140, evade: 100, skill: 120, defense: 100 };
    d.stats = { melee: 100, shoot: 100, hit: 100, evade: 120, skill: 100, defense: 100 };
    dm.armor = 800; dm.mobility = 100;
    w.power = 2000; w.range = [1, 4]; w.hit = 10; w.crit = 5;
    for (const p of c.pilots) p.adapt = { air: 'A', ground: 'A', sea: 'A', space: 'A' };
  });
  s.units.forEach(u => { u.morale = 100; }); return s;
}
export function seaCombat(): BattleState {
  const s = fixedCombat();
  s.stage.map.tiles = s.stage.map.tiles.map(row => row.map(() => 'sea'));
  s.content.pilots[0].adapt.sea = 'B'; s.content.mechs[0].adapt.sea = 'S';
  s.content.pilots[3].stats.defense = 120; s.content.pilots[3].adapt.sea = 'B';
  const dm = s.content.mechs.find(m => m.id === 'mech-d')!;
  dm.armor = 1000; dm.mobility = 120; dm.size = 'L';
  s.content.weapons[0].adapt.sea = 'C';
  const t = s.content.terrain.find(t => t.id === 'sea')!; t.hitMod = -20; t.damageMod = -20;
  s.units[0].morale = 120; s.units[1].morale = 110; return s;
}
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value); for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}
