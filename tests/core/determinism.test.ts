import { describe, expect, it } from 'vitest';
import { apply, autoplay, createBattle, restore, snapshot } from '../../src/core';
import { harbor } from './helpers';

describe('harbor deterministic golden', () => {
  it('seed1 repeat, full command replay and intermediate JSON restore are byte-identical', () => {
    const { content, stage } = harbor(), initial = createBattle(content, stage, 1, { autoResponse: true });
    const a = autoplay(initial), b = autoplay(createBattle(content, stage, 1, { autoResponse: true }));
    expect(snapshot(a.state)).toBe(snapshot(b.state)); expect(a.commands).toEqual(b.commands); expect(a.events).toEqual(b.events);
    let replay = initial; const events = [];
    for (const command of a.commands) {
      const r = apply(replay, command); events.push(...r.events); replay = restore(content, stage, snapshot(r.state));
    }
    expect(snapshot(replay)).toBe(snapshot(a.state)); expect(events).toEqual(a.events.slice(2));
    expect({ outcome: a.state.outcome, round: a.state.round, survivors: a.state.units.filter(u => u.alive).map(u => ({ id: u.id, hp: u.hp })) }).toMatchSnapshot();
    expect(a.state.round).toBeLessThanOrEqual(200);
  });
  it('all seeds1..20 finish inside200 rounds without pathological damage or accuracy', () => {
    const { content, stage } = harbor();
    for (let seed = 1; seed <= 20; seed++) {
      const r = autoplay(createBattle(content, stage, seed, { autoResponse: true }));
      expect(r.state.outcome).not.toBeNull(); expect(r.state.round).toBeLessThanOrEqual(200);
      expect(r.stats.meanHitRate).toBeGreaterThan(30); expect(r.stats.meanHitRate).toBeLessThan(95); expect(r.stats.oneShots).toBe(0);
    }
  }, 30000);
  it('manual pending-response autoplay replays exactly and matches automatic policy', () => {
    const { content, stage } = harbor();
    const initial = createBattle(content, stage, 3), manual = autoplay(initial);
    let replay = initial; for (const cmd of manual.commands) replay = apply(replay, cmd).state;
    expect(snapshot(replay)).toBe(snapshot(manual.state));
    const auto = autoplay(createBattle(content, stage, 3, { autoResponse: true }));
    manual.state.options.autoResponse = true;
    expect(snapshot(manual.state)).toBe(snapshot(auto.state)); expect(manual.commands.some(c => c.type === 'respond')).toBe(true);
  });
});
