import { describe, expect, it, vi } from 'vitest';
import { Runner, type Step } from '../src/v2/flow';
import * as fx from '../src/v2/fx';
import { Stage } from '../src/v2/stage';
import { BattleScene } from '../src/v2/battle/scene';
import { makeContext } from '../src/v2/battle/template';
import { TEMPLATES } from '../src/v2/battle/templates';
import { playExchange } from '../src/v2/battle/play';
import type { Fighter, Outcome, Side, WeaponAnim } from '../src/v2/battle/types';
import { MOVES } from './presentation';
import { castSpirit } from '../src/v2/spirit';

const fighter = (side: Side): Fighter => ({ id: side, side, name: side, pilot: side, hp: 9000, hpMax: 9000, en: 500, enMax: 500,
  height: 400, faces: 'left', portrait: { faces: {}, crop: { x: 0, y: 0, w: 1, h: 1 } } });
const outcomes: Record<string, Outcome> = { hit: { hit: true, damage: 100 }, miss: { hit: false, damage: 0 },
  guard: { hit: true, damage: 50, guard: true }, critical: { hit: true, damage: 150, critical: true } };
const transform = (n: { x: number; y: number; rotation: number; scaleX: number; scaleY: number }) =>
  [n.x, n.y, n.rotation, n.scaleX, n.scaleY];

function exercise(anim: WeaponAnim, outcome: Outcome, side: Side, whole = false) {
  if(anim.template==='sequence'&&!anim.moves)anim={template:'sequence',moves:[{move:'ram',prop:'shield'}],element:'impact',closer:'none',tier:1};
  const show = { stage: new Stage(), runner: new Runner() }, other = side === 'ally' ? 'enemy' : 'ally';
  const weapon = { name: 'contract', cost: 0, anim }, exchange = { fighters: [fighter(side), fighter(other)],
    strikes: [{ attacker: side, target: other, weapon, outcome }] };
  const scene = new BattleScene(show, exchange), attacker = scene.actor(side), target = scene.actor(other);
  const original = transform(target.sprite), fxNodes = [...show.stage.fx.nodes], uiNodes = [...show.stage.ui.nodes];
  const land = vi.spyOn(scene, 'land'), contact=vi.spyOn(scene,'sequenceNotice'), context = makeContext(scene, attacker, target, weapon, outcome), template = TEMPLATES[anim.template];
  const trajectories: number[] = [];
  const record = (from: { x: number }, to: { x: number }) => { if (Math.abs(to.x - from.x) > 1) trajectories.push(Math.sign(to.x - from.x)); };
  // from이 움직이는 비트 노드여도 호출 순간의 궤적을 보관한다.
  const { tracer, missile, beam, shell } = fx;
  const spies = [
    vi.spyOn(fx, 'tracer').mockImplementation((show, from, to, ...rest) => { record(from, to); return tracer(show, from, to, ...rest); }),
    vi.spyOn(fx, 'missile').mockImplementation((show, from, via, to, ...rest) => { record(from, to); return missile(show, from, via, to, ...rest); }),
    vi.spyOn(fx, 'beam').mockImplementation((show, from, to, ...rest) => { record(from, to); return beam(show, from, to, ...rest); }),
    vi.spyOn(fx, 'shell').mockImplementation((show, from, to, ...rest) => { record(from, to); return shell(show, from, to, ...rest); }),
  ];
  let launching = false, launchX = 0;
  const positions = new Map<object, number>(), motions: number[] = [];
  const step = function* (): Step {
    yield* scene.enter(attacker);
    launching = true;
    yield* template.launch(context);
    launching = false;
    yield* scene.cut(other);
    yield* template.impact(context);
  };
  show.runner.run(whole ? playExchange(scene, exchange) : step());
  let frames = 0;
  while (show.runner.busy && frames < 900) {
    show.runner.update(1 / 60); frames++;
    if (launching) {
      const dx = attacker.sprite.x - context.attackerHome;
      if (Math.abs(dx) > Math.abs(launchX)) launchX = dx;
      for (const n of show.stage.fx.nodes) {
        if (!positions.has(n)) positions.set(n, n.x);
        const moved = n.x - positions.get(n)!;
        if (Math.abs(moved) > 1) motions.push(moved);
      }
    }
  }
  spies.forEach(spy => spy.mockRestore());
  expect(show.runner.busy, `${anim.template}: still running at 15s`).toBe(false);
  expect(frames).toBeLessThan(900);
  expect(anim.template==='sequence'?contact:land).toHaveBeenCalled(); land.mockRestore();contact.mockRestore();
  expect(show.stage.fx.nodes).toEqual(fxNodes);
  expect(show.stage.ui.nodes).toEqual(uiNodes);
  transform(target.sprite).forEach((n, i) => expect(n).toBeCloseTo(original[i], 6));
  return { trajectories, launchX, motions, seconds: frames / 60 };
}

describe('v2 template contract: real Stage/Runner/land, no DOM, art or sound', () => {
  for (const template of Object.keys(TEMPLATES)) {
    for (const [name, outcome] of Object.entries(outcomes)) for (const side of ['ally', 'enemy'] as const) {
      it(`${template} / ${name} / ${side}`, () => { exercise({ template }, outcome, side); });
    }
    it(`${template} reverses horizontal attacks for enemies`, () => {
      const ally = exercise({ template }, outcomes.hit, 'ally'), enemy = exercise({ template }, outcomes.hit, 'enemy');
      expect(enemy.trajectories).toEqual(ally.trajectories.map(n => -n));
      expect(enemy.launchX).toBeCloseTo(-ally.launchX, 5);
      expect(enemy.motions.map(Math.sign)).toEqual(ally.motions.map(n => -Math.sign(n)));
      expect(ally.trajectories.length + Math.abs(ally.launchX) + ally.motions.length).toBeGreaterThan(0);
    });
  }
  it.each(MOVES)('plays gallery parameters through the common skeleton: $kind', move => {
    const anim = move.strikes[0].weapon.anim;
    exercise(anim, outcomes.hit, 'ally', true);
    exercise(anim, outcomes.miss, 'enemy', true);
  });
  it('keeps the default finisher at 6–8 seconds including hit stops and effect cleanup', () => {
    const { seconds } = exercise({ template: 'finisher' }, outcomes.hit, 'ally');
    expect(seconds).toBeGreaterThanOrEqual(6); expect(seconds).toBeLessThanOrEqual(8);
  });
  it.each(['speed', 'luck'] as const)('cleans up the %s spirit', kind => {
    const show = { stage: new Stage(), runner: new Runner() };
    show.runner.run(castSpirit(show, { x: 400, y: 600, height: 400 }, { name: kind, kind }));
    for (let i = 0; i < 180 && show.runner.busy; i++) show.runner.update(1 / 60);
    expect(show.runner.busy).toBe(false); expect(show.stage.fx.nodes).toEqual([]); expect(show.stage.ui.nodes).toEqual([]);
  });
});
