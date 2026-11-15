import type { BattleState, Point } from './types';
import { movementField, moveBudget } from './movement';
import { availableWeapons, weaponRange } from './combat';
import { comparePoint, unitAt, unitById } from './terrain';

/** Potential coverage this phase, independent of acted flags. Uses core costs, occupancy,
 * resources, morale, P restrictions and geometric ranges. Never advances RNG or state. */
export function threatRange(s: BattleState, unitId: string): Point[] {
  const u = unitById(s, unitId); if (!u.alive || u.side === 'neutral') return [];
  const cells = new Map<string, Point>();
  for (const p of movementField(s, unitId, moveBudget(s, unitId))) {
    const at = unitAt(s, p); if (at && at.id !== unitId) continue;
    const moved = p.x !== u.x || p.y !== u.y;
    const unit = { ...u, x:p.x, y:p.y, moved, acted:false };
    const view = { ...s, units:s.units.map(v=>v.id===u.id?unit:v) };
    for (const w of availableWeapons(view, unitId)) for (const cell of weaponRange(view,unitId,w.id)) cells.set(`${cell.x},${cell.y}`,cell);
  }
  return [...cells.values()].sort(comparePoint);
}
export function enemyThreatRange(s: BattleState, only?: string): Point[] {
  const cells=new Map<string,Point>();
  for(const u of s.units)if(u.alive&&u.side==='enemy'&&(!only||u.id===only))for(const p of threatRange(s,u.id))cells.set(`${p.x},${p.y}`,p);
  return [...cells.values()].sort(comparePoint);
}
