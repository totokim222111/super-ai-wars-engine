import { describe, expect, it } from 'vitest';
import { all, ease, Runner, tween, wait, type Step } from '../src/v2/flow';

describe('v2 logical flow', () => {
  it('tweens multiple numeric fields, clamps overshoot and preserves other properties', () => {
    const target = { x: 10, y: -10, alpha: 1 }, step = tween(target, { x: 30, y: 10 }, 1, ease.linear);
    expect(step.next().done).toBe(false); step.next(0.25);
    expect(target).toEqual({ x: 15, y: -5, alpha: 1 });
    expect(step.next(2).done).toBe(true); expect(target).toEqual({ x: 30, y: 10, alpha: 1 });
  });
  it('finishes zero-duration tween immediately', () => {
    const target = { x: 3 }; expect(tween(target, { x: 7 }, 0).next().done).toBe(true); expect(target.x).toBe(7);
  });
  it('all starts together and waits for the longest child; empty all finishes', () => {
    const a = { x: 0 }, b = { x: 0 }, r = new Runner();
    r.run(all(tween(a, { x: 1 }, 0.5, ease.linear), tween(b, { x: 2 }, 1, ease.linear)));
    r.update(0.5); expect(a.x).toBe(1); expect(b.x).toBe(1); expect(r.busy).toBe(true);
    r.update(0.5); expect(b.x).toBe(2); expect(r.busy).toBe(false); expect(all().next().done).toBe(true);
  });
  it('uses the longest hold and freezes all tasks, then resumes', () => {
    const a = { x: 0 }, b = { x: 0 }, r = new Runner();
    r.run(all(tween(a, { x: 10 }, 1, ease.linear), tween(b, { x: 20 }, 1, ease.linear)));
    r.update(0.25); r.hold(0.5); r.hold(0.1);
    r.update(0.25); r.update(0.25); expect([a.x, b.x]).toEqual([2.5, 5]);
    r.update(0.25); expect([a.x, b.x]).toEqual([5, 10]);
  });
  it('scales both waits and hit stops with speed and supports speed zero', () => {
    const r = new Runner(), a = { x: 0 }; let done = false;
    r.run((function* (): Step { yield* wait(1); done = true; })());
    r.run(tween(a, { x: 10 }, 1, ease.linear)); r.speed = 0; r.update(10); expect(a.x).toBe(0);
    r.speed = 2; r.hold(0.5); r.update(0.25); expect(a.x).toBe(0);
    r.update(0.25); expect(a.x).toBe(5); expect(done).toBe(false);
    r.update(0.25); expect(a.x).toBe(10); expect(done).toBe(true); expect(r.busy).toBe(false);
  });
  it('retains tasks spawned from another task during update', () => {
    const r = new Runner(), a = { x: 0 };
    r.run((function* (): Step { yield* wait(0.1); r.run(tween(a, { x: 1 }, 0.1)); })());
    r.update(0.1); expect(r.busy).toBe(true); r.update(0.1); expect(a.x).toBe(1); expect(r.busy).toBe(false);
  });
  it('clear cancels tasks and remaining hit stop', () => {
    const r = new Runner(); r.run(wait(5)); r.hold(5); r.clear(); expect(r.busy).toBe(false);
    const a = { x: 0 }; r.run(tween(a, { x: 1 }, 0.1)); r.update(0.1); expect(a.x).toBe(1);
  });
});
