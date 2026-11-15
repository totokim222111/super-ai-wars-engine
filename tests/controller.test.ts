import { describe, expect, it } from 'vitest';
import { apply, autoplay, createBattle, nextAICommand, snapshot, weaponRange } from '../src/core';
import type { Response } from '../src/core';
import { createGame, menuItems, reasonText, transition, weaponRows } from '../src/game/controller';
import type { Game, Input } from '../src/game/controller';
import { BANNER_DURATION } from '../src/game/controller';
import { arena, deepFreeze, harbor } from './core/helpers';

const act = (g: Game, id: string): Game => transition(g, { type: 'action', id });
const tap = (g: Game, x: number, y: number): Game => transition(g, { type: 'tap', cell: { x, y } });
function ready(): Game {
  const s = arena(c => { c.mechs[0].weapons = ['rifle', 'cannon']; });
  return transition(createGame(s.content, s.stage, 1, false), { type: 'tick', ms: BANNER_DURATION });
}
function selected(): Game { return tap(tap(ready(), 1, 2), 1, 2); }
function drain(g: Game): Game {
  for (let i = 0; i < 20 && ['moving', 'result', 'banner'].includes(g.mode); i++) g = transition(g, { type: 'tick', ms: 10000 });
  return g;
}
function pending(): Game {
  let g = ready();
  g = act(transition(g, { type: 'endTurn' }), 'yes');
  g = drain(g);
  const battle = apply(g.battle, { type: 'attack', unitId: 'e1', targetId: 'p1', weaponId: 'rifle' }).state;
  return { ...g, battle, mode: 'response' };
}
describe('M3 pure controller', () => {
  it('starts dialogue then waits for the 1080ms ally banner', () => {
    const s = arena(); let g = createGame(s.content, s.stage);
    expect(g.mode).toBe('intro'); g = transition(g, { type: 'introDone' });
    expect(g.mode).toBe('banner'); g = transition(g, { type: 'tick', ms: BANNER_DURATION-1 }); expect(g.mode).toBe('banner');
    expect(transition(g, { type: 'tick', ms: 1 }).mode).toBe('idle');
  });
  it('select → preview → move → weapons → target → forecast → confirm → results → action finished', () => {
    let g = ready(); g = tap(g, 1, 2); expect(g.selected).toBeNull();
    g = tap(g, 1, 2); expect(g.mode).toBe('selected');
    const rng = g.battle.rng; g = tap(g, 1, 1); expect(g.mode).toBe('preview'); expect(g.battle.units[0].y).toBe(2);
    expect(g.path).toEqual([{ x: 1, y: 2 }, { x: 1, y: 1 }]);
    g = tap(g, 1, 1); expect(g.mode).toBe('moving'); g = drain(g); expect(g.mode).toBe('selected');
    g = act(g, 'attack'); expect(g.mode).toBe('weapons');
    g = act(g, 'weapon:rifle'); expect(g.mode).toBe('target');
    g = tap(g, 3, 2); expect(g.mode).toBe('target'); g = tap(g, 3, 2); expect(g.mode).toBe('forecast');
    expect(g.battle.rng).toBe(rng); g = act(g, 'fire'); expect(g.mode).toBe('result');
    g = drain(g); expect(g.battle.units[0].acted).toBe(true); expect(['confirm', 'outcome']).toContain(g.mode);
  });
  it.each(['selected', 'preview', 'weapons', 'target', 'forecast'] as const)('cancels one level from %s', mode => {
    let g = selected();
    if (mode === 'preview') g = tap(g, 1, 1);
    else if (mode !== 'selected') {
      g = act(g, 'attack');
      if (mode !== 'weapons') { g = act(g, 'weapon:rifle'); if (mode === 'forecast') g = tap(tap(g, 3, 2), 3, 2); }
    }
    const before = snapshot(g.battle); g = act(g, 'cancel');
    expect(g.mode).toBe(({ selected: 'idle', preview: 'selected', weapons: 'selected', target: 'weapons', forecast: 'target' } as const)[mode]);
    expect(snapshot(g.battle)).toBe(before);
  });
  it('undoes a confirmed move and reports non-P disable reason through core', () => {
    let g = selected(), original = snapshot(g.battle);
    g = drain(tap(tap(g, 1, 1), 1, 1));
    expect(weaponRows(g).find(r => r.weapon.id === 'cannon')?.reason).toContain('non-P');
    expect(reasonText(weaponRows(g).find(r => r.weapon.id === 'cannon')!.reason)).toBe('이동 후 불가');
    g = act(g, 'attack'); expect(act(g, 'weapon:cannon').mode).toBe('weapons');
    g = act(act(g, 'cancel'), 'cancel'); expect(snapshot(g.battle)).toBe(original); expect(g.mode).toBe('selected');
  });
  it('empty re-tap opens map menu; end turn asks before running core', () => {
    let g = tap(tap(ready(), 0, 0), 0, 0); expect(g.mode).toBe('map');
    g = act(g, 'endTurn'); expect(g.mode).toBe('confirm'); expect(g.battle.phase).toBe('player');
    expect(act(g, 'cancel').mode).toBe('idle'); g = act(g, 'yes'); expect(g.mode).toBe('banner'); expect(g.battle.phase).toBe('enemy');
  });
  it('all allies acted opens end turn confirmation, no implicit phase change', () => {
    const g = act(selected(), 'wait'); expect(g.mode).toBe('confirm'); expect(g.battle.phase).toBe('player');
    expect(act(g, 'cancel').mode).toBe('idle');
  });
  it.each([{ type: 'counter', weaponId: 'rifle' }, { type: 'defend' }, { type: 'evade' }] satisfies Response[])('pending waits without RNG and accepts %j', response => {
    let g = pending(), rng = g.battle.rng;
    g = transition(g, { type: 'tick', ms: 10000 }); expect(g.mode).toBe('response'); expect(g.battle.rng).toBe(rng);
    if (response.type === 'counter') {
      g = act(g, 'counter'); expect(g.mode).toBe('counter');
      expect(menuItems(g).filter(i => i.id.startsWith('weapon:')).every(i => !i.disabled)).toBe(true);
      expect(act(g, 'cancel').mode).toBe('response'); g = act(g, `weapon:${response.weaponId}`);
    } else g = act(g, response.type);
    expect(g.mode).toBe('result'); expect(g.battle.pending).toBeNull(); expect(g.battle.rng).not.toBe(rng);
  });
  it('enemy AI reaches a manual response through normal tick events', () => {
    let g = drain(act(transition(ready(), { type: 'endTurn' }), 'yes'));
    for (let i = 0; i < 20 && g.mode !== 'response'; i++) g = transition(g, { type: 'tick', ms: 10000 });
    expect(g.mode).toBe('response'); expect(g.battle.pending).not.toBeNull();
  });
  it('map toggle uses core autoResponse and bypasses response waiting', () => {
    let g = act(act(tap(tap(ready(), 0, 0), 0, 0), 'settings'), 'auto'); expect(g.battle.options.autoResponse).toBe(true);
    g = act(g, 'cancel'); g = drain(act(act(g, 'endTurn'), 'yes'));
    for (let i = 0; i < 8; i++) { g = transition(g, { type: 'tick', ms: 10000 }); expect(g.battle.pending).toBeNull(); expect(g.mode).not.toBe('response'); }
  });
  it.each(['victory', 'defeat'] as const)('%s result retries same seed or changes seed', outcome => {
    const g: Game = { ...ready(), mode: 'outcome', battle: { ...ready().battle, outcome } };
    const retry = act(g, 'retry'); expect(retry.mode).toBe('banner'); expect(retry.seed).toBe(g.seed);
    expect(snapshot(retry.battle)).toBe(snapshot(createBattle(g.battle.content, g.battle.stage, g.seed)));
    expect(act(g, 'newSeed').seed).toBe(g.seed + 1);
  });
  it('long press and menu detail restore selection without changing core', () => {
    let g = selected(); const before = snapshot(g.battle);
    g = act(g, 'detail'); expect(g.mode).toBe('detail'); g = tap(g, 7, 5); expect(g.mode).toBe('selected');
    g = transition(g, { type: 'detail', cell: { x: 3, y: 2 } }); expect(g.mode).toBe('detail');
    g = transition(g, { type: 'cancel' }); expect(snapshot(g.battle)).toBe(before); expect(g.mode).toBe('selected');
  });
  it('result tap skips remaining exchange; held enemy animation advances at 2x', () => {
    let g = act({ ...pending(), animation: 'off' }, 'defend');
    const slow = transition(g, { type: 'tick', ms: 100 });
    const fast = transition(transition(g, { type: 'held', value: true }), { type: 'tick', ms: 100 });
    expect(fast.elapsed).toBe(slow.elapsed * 2); g = tap(g, 0, 0); expect(g.mode).toBe('enemy');
  });
  it('hover changes cursor but does not replace the last explicit tap target', () => {
    let g = tap(ready(), 1, 2); g = transition(g, { type: 'hover', cell: { x: 4, y: 3 } });
    expect(g.selected).toBeNull(); expect(tap(g, 1, 2).mode).toBe('selected');
  });
  it('accepts frozen inputs and all preview/cancel operations preserve core', () => {
    const g = deepFreeze(selected()), before = snapshot(g.battle);
    const events: Input[] = [{ type: 'tap', cell: { x: 1, y: 1 } }, { type: 'action', id: 'attack' }, { type: 'cancel' }, { type: 'key', key: 'e' }];
    for (const event of events) { transition(g, event); expect(snapshot(g.battle)).toBe(before); }
  });
  it('keyboard Space confirms, E asks, Escape cancels and arrows move the cursor', () => {
    let g = transition(ready(), { type: 'key', key: 'ArrowRight' }); expect(g.cursor.x).toBe(2);
    g = transition(g, { type: 'key', key: 'e' }); expect(g.mode).toBe('confirm');
    g = transition(g, { type: 'key', key: 'Escape' }); expect(g.mode).toBe('idle');
    g = { ...g, cursor: { x: 1, y: 2 }, lastTap: { x: 1, y: 2 } };
    expect(transition(g, { type: 'key', key: ' ' }).mode).toBe('selected');
  });
  it('keyboard moves in both axes after selecting, Tab returns to the command menu', () => {
    let g = transition(selected(), { type: 'key', key: 'ArrowLeft' });
    g = transition(g, { type: 'key', key: 'ArrowUp' }); expect(g.cursor).toEqual({ x: 0, y: 1 });
    g = transition(g, { type: 'key', key: 'Enter' }); expect(g.mode).toBe('preview');
    g = drain(transition(g, { type: 'key', key: ' ' })); expect(g.battle.units[0]).toMatchObject({ x: 0, y: 1, moved: true });
    g = transition(g, { type: 'key', key: 'Tab' }); expect(g.mapKeys).toBe(true);
    g = transition(g, { type: 'key', key: 'Tab' }); expect(g.mapKeys).toBe(false);
    g = transition(g, { type: 'key', key: 'Enter' }); expect(g.mode).toBe('weapons');
  });
  it('core range query includes boundaries, excludes minimum-range holes and is pure', () => {
    const s = deepFreeze(arena()), before = snapshot(s), cells = weaponRange(s, 'p1', 'cannon');
    expect(cells).not.toContainEqual({ x: 1, y: 2 }); expect(cells).not.toContainEqual({ x: 3, y: 2 });
    expect(cells).toContainEqual({ x: 4, y: 2 }); expect(snapshot(s)).toBe(before);
  });
  it('first round preserves start morale; second round adds exactly one', () => {
    const s = arena(c => { c.pilots[0].startMorale = 112; });
    expect(s.units.map(u => u.morale)).toEqual([112, 100]);
    const round2 = apply(apply(s, { type: 'endPhase' }).state, { type: 'endPhase' }).state;
    expect(round2.units.map(u => u.morale)).toEqual([113, 101]);
  });
  it('harbor completes entirely through controller events and matches core replay', () => {
    const { content, stage } = harbor(); let g = drain(createGame(content, stage, 1, false));
    for (let i = 0; i < 1000 && !g.battle.outcome; i++) {
      if (['banner', 'moving', 'result', 'enemy'].includes(g.mode)) { g = transition(g, { type: 'tick', ms: 10000 }); continue; }
      const cmd = nextAICommand(g.battle)!;
      if (cmd.type === 'endPhase') { g = transition(g, { type: 'endTurn' }); g = act(g, 'yes'); }
      else if (cmd.type === 'respond') {
        if (cmd.response.type === 'counter') g = act(act(g, 'counter'), `weapon:${cmd.response.weaponId}`);
        else g = act(g, cmd.response.type);
      } else {
        if (g.mode === 'idle') { const u = g.battle.units.find(u => u.id === cmd.unitId)!; g = tap(tap(g, u.x, u.y), u.x, u.y); }
        if (cmd.type === 'move') g = tap(tap(g, cmd.x, cmd.y), cmd.x, cmd.y);
        else if (cmd.type === 'wait') g = act(g, 'wait');
        else if (cmd.type === 'attack') {
          g = act(act(g, 'attack'), `weapon:${cmd.weaponId}`);
          const d = g.battle.units.find(u => u.id === cmd.targetId)!; g = act(tap(tap(g, d.x, d.y), d.x, d.y), 'fire');
        }
      }
    }
    const expected = autoplay(createBattle(content, stage, 1));
    expect(g.battle.outcome).toBe('victory'); expect(snapshot(g.battle)).toBe(snapshot(expected.state));
    expect(g.commands).toEqual(expected.commands);
  });
});
