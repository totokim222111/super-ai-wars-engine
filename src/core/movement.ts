import type { BattleState, Point, ReachableCell } from './types';
import { comparePoint, inBounds, mechOf, movementCost, unitAt, unitById } from './terrain';
import { hookValue } from './effects';

/** Dijkstra: settlement order (cost,y,x), first equal-cost parent wins. */
export function movementField(s: BattleState, unitId: string, budget = Infinity): ReachableCell[] {
  const u = unitById(s, unitId);
  if (!u.alive) return [];
  const key = (p: Point): string => `${p.x},${p.y}`;
  const start: ReachableCell = { x: u.x, y: u.y, cost: 0, path: [{ x: u.x, y: u.y }] };
  const best = new Map<string, ReachableCell>([[key(u), start]]), settled = new Set<string>(), queue = [start];
  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost || comparePoint(a, b));
    const cur = queue.shift()!;
    if (settled.has(key(cur))) continue;
    settled.add(key(cur));
    const neighbors = [{ x: cur.x, y: cur.y - 1 }, { x: cur.x - 1, y: cur.y }, { x: cur.x + 1, y: cur.y }, { x: cur.x, y: cur.y + 1 }];
    for (const p of neighbors) {
      if (!inBounds(s, p)) continue;
      const occupant = unitAt(s, p);
      if (occupant && occupant.side !== u.side) continue;
      const cost = movementCost(s, u, p);
      if (cost === null || cur.cost + cost > budget) continue;
      const total = cur.cost + cost, old = best.get(key(p));
      if (old && old.cost <= total) continue;
      const cell = { ...p, cost: total, path: [...cur.path, p] };
      best.set(key(p), cell); queue.push(cell);
    }
  }
  return [...best.values()].sort(comparePoint);
}
export function moveBudget(s: BattleState, unitId: string): number {
  const u = unitById(s, unitId);
  return Math.max(0, hookValue(s, 'onBeforeMove', mechOf(s, u).move, { ownerId: u.id }));
}
export function reachable(s: BattleState, unitId: string): ReachableCell[] {
  const u = unitById(s, unitId);
  if (!u.alive || u.acted || u.moved) return [];
  return movementField(s, unitId, moveBudget(s, unitId)).filter(p => { const at = unitAt(s, p); return !at || at.id === u.id; });
}
/** Includes the origin. Returns null for allied destinations, blocked or out-of-budget cells. */
export function pathTo(s: BattleState, unitId: string, destination: Point): Point[] | null {
  return reachable(s, unitId).find(p => p.x === destination.x && p.y === destination.y)?.path ?? null;
}
