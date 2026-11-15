import type { BattleState, Environment, Grade, Mech, Pilot, Point, Terrain, Unit, Weapon } from './types';

import { effectiveMech, effectivePilot, atomsOf } from './modifiers';

const gradeOrder: Grade[] = ['S', 'A', 'B', 'C', 'D'];
export const compareId = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
export const comparePoint = (a: Point, b: Point): number => a.y - b.y || a.x - b.x;
export const distance = (a: Point, b: Point): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));
export function unitById(state: BattleState, id: string): Unit {
  const u = state.units.find(u => u.id === id);
  if (!u) throw new Error(`unitId: unknown unit '${id}'`);
  return u;
}
export const mechOf = (s: BattleState, u: Unit): Mech => effectiveMech(s, u);
export const pilotOf = (s: BattleState, u: Unit): Pilot => effectivePilot(s, u);
export function weaponById(s: BattleState, id: string): Weapon {
  const w = s.content.weapons.find(w => w.id === id);
  if (!w) throw new Error(`weaponId: unknown weapon '${id}'`);
  return w;
}
export function inBounds(s: BattleState, p: Point): boolean {
  return Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.y >= 0 && p.x < s.stage.map.w && p.y < s.stage.map.h;
}
export function terrainAt(s: BattleState, p: Point): Terrain {
  if (!inBounds(s, p)) throw new Error(`position: (${p.x},${p.y}) outside map`);
  return s.content.terrain.find(t => t.id === s.stage.map.tiles[p.y][p.x])!;
}
export const unitAt = (s: BattleState, p: Point): Unit | undefined => s.units.find(u => u.alive && u.x === p.x && u.y === p.y);
export const environmentOf = (s: BattleState, u: Unit): Environment => mechOf(s, u).moveType.includes('air') ? 'air' : terrainAt(s, u).env;
export function worstGrade(...grades: Grade[]): Grade { return gradeOrder[Math.max(...grades.map(g => gradeOrder.indexOf(g)))]; }
export function effectiveAdaptation(s: BattleState, u: Unit, env = environmentOf(s, u)): Grade {
  let grade=worstGrade(mechOf(s, u).adapt[env], pilotOf(s, u).adapt[env]);
  for(const a of atomsOf(s,u))if(a.type==='adaptSet'&&a.value[env]&&gradeOrder.indexOf(a.value[env])<gradeOrder.indexOf(grade))grade=a.value[env];
  return grade;
}
export function attackAdaptation(s: BattleState, u: Unit, w: Weapon, target: Unit): Grade {
  return worstGrade(effectiveAdaptation(s, u), w.adapt[environmentOf(s, target)]);
}
/** Air units always fly; ground terrain bonuses and recovery do not apply to them. */
export function terrainModifiers(s: BattleState, u: Unit): { hitMod: number; damageMod: number } {
  return environmentOf(s, u) === 'air' && terrainAt(s, u).env !== 'air' ? { hitMod: 0, damageMod: 0 } : terrainAt(s, u);
}
export function movementCost(s: BattleState, u: Unit, p: Point): number | null {
  const m = mechOf(s, u), tile = terrainAt(s, p);
  if (m.moveType.includes('air')) return s.content.rules.airMoveCost;
  const costs = m.moveType.map(t => tile.moveCost[t]).filter((n): n is number => n !== null);
  return costs.length ? Math.min(...costs) : null;
}
