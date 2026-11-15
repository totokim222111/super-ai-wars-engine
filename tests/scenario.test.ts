import { describe, expect, it } from 'vitest';
import { compile } from '../src/scenario/compile';
import { lex } from '../src/scenario/lexer';
import { parse } from '../src/scenario/parser';
import { createRunner, enqueue, evaluate, resume, run, talkTargets } from '../src/scenario/runner';
import type { CompileContext, ScenarioEvent } from '../src/scenario/types';
import { newCampaign } from '../src/campaign/state';
import { apply, restore, snapshot } from '../src/core';
import type { BattleState, Command } from '../src/core';
import { arena, deepFreeze } from './core/helpers';
import { createScenarioGame, transition } from '../src/game/controller';

function fixture() {
  const b = arena((_c, s) => {
    s.scenario = true; s.units[1].tags = ['patrol']; s.units[1].x = 2;
    s.areas = { cache: [0, 0, 2, 3] }; s.waves = { north: [{ id: 'n1', pilotId: 'pilot-5', mechId: 'mech-e', side: 'enemy', x: 4, y: 1 }] };
    s.definitions = [{ id: 's1', pilotId: 'pilot-6', mechId: 'mech-d', side: 'player', x: 4, y: 2 }];
  });
  const context: CompileContext = { stage: b.stage, characters: [{ id: 'gem', name: '클로드', side: 'player', expressions: ['normal'] }], effects: ['dummy-sure-hit', 'dummy-quarter-damage'], parts: ['repair-kit'] };
  return { b, context };
}
function setup(source: string) {
  const { b, context } = fixture(), program = compile(source, context, 'trial/events.sai'), runner = createRunner(), campaign = newCampaign(), log: Command[] = [];
  return { b, program, runner, campaign, log };
}
function drain(f: ReturnType<typeof setup>): BattleState {
  for (let i = 0; i < 80; i++) {
    f.b = run(f.runner, f.program, f.b, f.campaign, f.log);
    if (f.runner.waiting) resume(f.runner); else return f.b;
  }
  throw new Error('runner did not stop');
}
describe('SAI compiler', () => {
  it('lexes comments outside escaped strings and preserves source positions', () => {
    const lines = lex('on start # 주석\n  narrate "a # \\"b\\""\n', 'a.sai');
    expect(lines[1].tokens[1]).toMatchObject({ value: 'a # "b"', column: 11, line: 2, quoted: true });
  });
  it.each([
    ['odd indentation', 'on start\n   win'], ['tab indentation', 'on start\n\twin'],
    ['unclosed string', 'on start\n  narrate "열림'], ['missing end', 'on start\n  if flag x\n    win'],
    ['unknown command', 'on start\n  explode'], ['unquoted dialogue', 'on start\n  narrate hello'],
    ['extra arguments', 'on start\n  win now'], ['bad trigger', 'on round zero\n  win'],
    ['over-indented block', 'on start\n    win'], ['bare else', 'on start\n  else'],
  ])('snapshots syntax diagnostics: %s', (_name, source) => {
    const { context } = fixture(); expect(() => compile(source, context, 'bad.sai')).toThrowErrorMatchingSnapshot();
  });
  it.each([
    ['unit', 'retreat unit:missing'], ['character', 'talk missing normal "x"'], ['expression', 'talk gem angry "x"'],
    ['area', 'on enter side:player area absent\n  win'], ['wave', 'reinforce absent'], ['effect', 'effect unit:p1 missing'],
    ['tag', 'retreat tag:missing'], ['part', 'give part missing'], ['condition', 'if alive unit:missing\n    win\n  end'],
  ])('snapshots reference diagnostics: %s', (_name, command) => {
    const { context } = fixture(), source = command.startsWith('on ') ? command : `on start\n  ${command}`;
    expect(() => compile(source, context, 'refs.sai')).toThrowErrorMatchingSnapshot();
  });
  it('honors and precedence over or and numeric comparisons', () => {
    const { b } = fixture(), c = newCampaign(); c.flags.a = true;
    const ast = parse('on start\n  if flag a or flag b and credits >= 500\n    win\n  end')[0].body[0];
    expect('condition' in ast && evaluate(ast.condition, b, c)).toBe(true);
    for (const [op, value] of [['>', false], ['>=', true], ['<', false], ['<=', true], ['==', true]] as const) expect(evaluate({ kind: 'round', op, value: 1 }, b, c)).toBe(value);
  });
  it('compiles nested indented branches to deterministic jump targets', () => {
    const f = setup('on start\n  if not flag a\n    if credits >= 0\n      set flag nested\n    else\n      lose\n    end\n  else\n    win\n  end');
    enqueue(f.runner, f.program, [{ type: 'start' }], f.b); drain(f); expect(f.campaign.flags.nested).toBe(true); expect(f.b.outcome).toBeNull();
  });
  it('injects only missing default defeat/victory blocks', () => {
    const f = setup('on all-defeated side:enemy\n  narrate "끝"'); expect(f.program.events).toHaveLength(2);
    expect(f.program.events[1].code[0].op).toBe('lose');
  });
});
describe('scenario event queue', () => {
  it.each([
    ['start', { type: 'start' }], ['round 1 player', { type: 'phase-start', phase: 'player', round: 1 }],
    ['round 1', { type: 'phase-start', phase: 'player', round: 1 }], ['phase enemy repeat', { type: 'phase-start', phase: 'enemy', round: 1 }],
    ['defeated tag:patrol', { type: 'unit-defeated', unitId: 'e1', by: 'p1' }],
    ['enter side:player area cache', { type: 'move', unitId: 'p1', path: [{ x: 1, y: 2 }], cost: 0 }],
    ['hp-below unit:e1 100%', { type: 'attack', targetId: 'e1', hit: true }],
    ['talk unit:p1 unit:e1', { type: 'persuade', unitId: 'p1', targetId: 'e1' }],
  ])('fires %s', (trigger, event) => {
    const f = setup(`on ${trigger}\n  set flag fired`); enqueue(f.runner, f.program, [event as ScenarioEvent], f.b); drain(f); expect(f.campaign.flags.fired).toBe(true);
  });
  it('fires all-defeated on the authoritative living roster', () => {
    const f = setup('on all-defeated tag:patrol\n  set flag done'); f.b.units[1].alive = false; f.b.units[1].hp = 0;
    enqueue(f.runner, f.program, [{ type: 'unit-defeated', unitId: 'e1', by: 'p1' }], f.b); drain(f); expect(f.campaign.flags.done).toBe(true);
  });
  it('rearms repeat extinction only after matching units return, without recursive effect triggers', () => {
    const f = setup('on all-defeated side:enemy repeat\n  effect unit:p1 dummy-sure-hit\n  give credits 1');
    enqueue(f.runner, f.program, [{ type: 'start' }], f.b); drain(f);
    f.b.units[1].alive = false; f.b.units[1].hp = 0;
    enqueue(f.runner, f.program, [{ type: 'unit-defeated', unitId: 'e1', by: 'p1' }], f.b); drain(f); expect(f.campaign.credits).toBe(1);
    const result = apply(f.b, { type: 'system', unitId: '', action: { kind: 'reinforce', units: f.b.stage.waves!.north } }); f.b = result.state;
    enqueue(f.runner, f.program, result.events, f.b); drain(f);
    const copy = structuredClone(f.runner); f.runner = copy;
    f.b.units[2].alive = false; f.b.units[2].hp = 0;
    enqueue(f.runner, f.program, [{ type: 'unit-defeated', unitId: 'n1', by: 'p1' }], f.b); drain(f); expect(f.campaign.credits).toBe(2);
  });
  it('fires defeated once per unit, other triggers once, repeat on every match', () => {
    const f = setup('on phase player\n  give credits 1\non phase player repeat\n  give credits 10\non defeated side:enemy\n  give credits 100');
    const e: ScenarioEvent = { type: 'phase-start', phase: 'player', round: 1 };
    enqueue(f.runner, f.program, [e, e, { type: 'unit-defeated', unitId: 'e1', by: 'p1' }, { type: 'unit-defeated', unitId: 'e1', by: 'p1' }], f.b); drain(f); expect(f.campaign.credits).toBe(121);
  });
  it('preserves file order and reserves queued one-shot blocks across screen waits', () => {
    const f = setup('on start\n  narrate "첫째"\n  give credits 1\non start\n  narrate "둘째"\n  give credits 10');
    enqueue(f.runner, f.program, [{ type: 'start' }], f.b); f.b = run(f.runner, f.program, f.b, f.campaign, f.log);
    expect(f.campaign.credits).toBe(0); expect(f.runner.waiting!.command.args[0]).toBe('첫째');
    enqueue(f.runner, f.program, [{ type: 'start' }], f.b); expect(f.runner.queue).toHaveLength(2);
    resume(f.runner); f.b = run(f.runner, f.program, f.b, f.campaign, f.log);
    expect(f.campaign.credits).toBe(1); expect(f.runner.waiting!.command.args[0]).toBe('둘째'); drain(f); expect(f.campaign.credits).toBe(11);
  });
  it('restores a waiting pointer, queued events, fired keys and core snapshot identically', () => {
    const f = setup('on start\n  reinforce north\n  talk gem normal "기다림"\n  move unit:n1 to 5,1\n  give credits 5\n  win');
    enqueue(f.runner, f.program, [{ type: 'start' }], f.b); f.b = run(f.runner, f.program, f.b, f.campaign, f.log);
    const copy = JSON.parse(JSON.stringify({ ...f, b: undefined })) as typeof f; copy.b = restore(f.b.content, f.b.stage, snapshot(f.b));
    drain(f); drain(copy); expect(snapshot(copy.b)).toBe(snapshot(f.b)); expect(copy.runner).toEqual(f.runner); expect(copy.log).toEqual(f.log); expect(copy.campaign).toEqual(f.campaign);
  });
  it('offers persuasion only for an adjacent eligible trigger and consumes the acting unit', () => {
    const f = setup('on talk unit:p1 unit:e1\n  join unit:e1'); expect(talkTargets(f.runner, f.program, f.b, 'p1').map(u => u.id)).toEqual(['e1']);
    const result = apply(f.b, { type: 'persuade', unitId: 'p1', targetId: 'e1' }); f.b = result.state;
    enqueue(f.runner, f.program, result.events, f.b); drain(f); expect(f.b.units[0].acted).toBe(true); expect(f.b.units[1].side).toBe('player'); expect(f.campaign.roster[0].id).toBe('e1');
    expect(talkTargets(f.runner, f.program, f.b, 'p1')).toEqual([]);
  });
  it('does not fire hp-below for a miss or a defeated unit', () => {
    const f = setup('on hp-below unit:e1 100%\n  set flag no');
    enqueue(f.runner, f.program, [{ type: 'attack', targetId: 'e1', hit: false } as ScenarioEvent], f.b); drain(f); expect(f.campaign.flags.no).toBeUndefined();
  });
  it('does not mutate frozen source battle while executing system instructions', () => {
    const f = setup('on start\n  set-ai unit:e1 hold'); const b = deepFreeze(f.b), before = snapshot(b);
    enqueue(f.runner, f.program, [{ type: 'start' }], b); drain(f); expect(snapshot(b)).toBe(before);
  });
  it('keeps script camera focus after its wait finishes and the next dialogue opens', () => {
    const f = setup('on start\n  camera 6,4\n  narrate "여기를 봐"');
    let g = createScenarioGame(f.b.content, f.b.stage, f.program, f.campaign);
    expect(g.cursor).toEqual({ x: 6, y: 4 }); g = transition(g, { type: 'tick', ms: 120 });
    expect(g.scenario!.runner.waiting!.command.op).toBe('narrate'); expect(g.cursor).toEqual({ x: 6, y: 4 });
  });
  it('freezes AI and ordinary input during a timed wait, then resumes exactly once', () => {
    const f = setup('on start\n  wait 100\n  give credits 5');
    let g = createScenarioGame(f.b.content, f.b.stage, f.program, f.campaign);
    const before = snapshot(g.battle); g = transition(g, { type: 'endTurn' }); g = transition(g, { type: 'action', id: 'wait' });
    g = transition(g, { type: 'tick', ms: 99 }); expect(snapshot(g.battle)).toBe(before); expect(g.scenario!.campaign.credits).toBe(0);
    g = transition(g, { type: 'tick', ms: 1 }); expect(g.mode).toBe('banner');
    g = transition(g, {type:'tick',ms:1080}); expect(g.mode).toBe('idle'); expect(g.scenario!.campaign.credits).toBe(5);
    g = transition(g, { type: 'tick', ms: 100 }); expect(g.scenario!.campaign.credits).toBe(5);
  });
});
