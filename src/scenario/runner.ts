import {personaOf} from '../campaign/player';
import {persistBattle} from '../campaign/progress';
import { apply, quarterDamageEffect, sureHitEffect } from '../core';
import type { BattleEvent, BattleState, Command, SystemAction, Unit } from '../core';
import type { CampaignState } from '../campaign/state';
import { definitions } from './compile';
import { selector } from './parser';
import type { Condition, Program, RunnerState, ScenarioEvent, ScriptCommand, Selector, Trigger } from './types';

export const createRunner = (): RunnerState => ({ queue: [], fired: [], allCounts: {}, waiting: null, objectives: { win: [], lose: [] }, bgm: null, fade: 7 });
export function matches(u: Unit, s: Selector): boolean { return s.kind === 'unit' ? u.id === s.id : s.kind === 'side' ? u.side === s.id : !!u.tags?.includes(s.id); }
export function evaluate(c: Condition, b: BattleState, campaign: CampaignState): boolean {
  if ('left' in c) return c.kind === 'and' ? evaluate(c.left, b, campaign) && evaluate(c.right, b, campaign) : evaluate(c.left, b, campaign) || evaluate(c.right, b, campaign);
  if(c.kind==='persona')return (personaOf(campaign)===c.value)!==c.not;
  if (c.kind === 'flag') return !!campaign.flags[c.id] !== c.not;
  if ('selector' in c) { const alive = b.units.some(u => u.alive && matches(u, c.selector)); return c.kind === 'alive' ? alive : !alive; }
  const v = c.kind === 'round' ? b.round : campaign.credits;
  return c.op === '>' ? v > c.value : c.op === '>=' ? v >= c.value : c.op === '<' ? v < c.value : c.op === '<=' ? v <= c.value : v === c.value;
}
function hit(t: Trigger, e: ScenarioEvent, b: BattleState): string | null {
  const unit = 'unitId' in e ? b.units.find(u => u.id === e.unitId) : undefined;
  switch (t.kind) {
    case 'start': return e.type === 'start' ? '' : null;
    case 'round': return e.type === 'phase-start' && e.round === t.round && e.phase === t.phase ? '' : null;
    case 'phase': return e.type === 'phase-start' && e.phase === t.phase ? '' : null;
    case 'defeated': return e.type === 'unit-defeated' && unit && matches(unit, t.selector!) ? unit.id : null;
    case 'all-defeated': return !b.units.some(u => u.alive && matches(u, t.selector!)) ? '' : null;
    case 'enter': {
      if (e.type !== 'move' || !unit || !matches(unit, t.selector!)) return null;
      const a = b.stage.areas![t.area!]!, p = e.path.at(-1)!;
      return p.x >= a[0] && p.y >= a[1] && p.x <= a[2] && p.y <= a[3] ? '' : null;
    }
    case 'hp-below': {
      const u = e.type === 'attack' ? b.units.find(u => u.id === e.targetId) : undefined;
      return u?.alive && e.type === 'attack' && e.hit && matches(u, t.selector!) && u.hp * 100 <= b.content.mechs.find(m => m.id === u.mechId)!.hp * t.percent! ? '' : null;
    }
    case 'talk': return e.type === 'persuade' && unit && matches(unit, t.selector!) && matches(b.units.find(u => u.id === e.targetId)!, t.target!) ? '' : null;
    default: return null;
  }
}
/** Reserve one-shot keys when enqueuing, so waiting never queues the same event twice. */
export function enqueue(r: RunnerState, p: Program, events: ScenarioEvent[], b: BattleState): void {
  for (const e of events) p.events.forEach((block, i) => {
    if (block.trigger.kind === 'all-defeated') {
      if (!['start', 'unit-defeated', 'system'].includes(e.type)) return;
      if (e.type === 'system' && (!e.ids.length || !['reinforce', 'spawn', 'join', 'retreat', 'leave'].includes(e.action.kind))) return;
      const count = b.units.filter(u => u.alive && matches(u, block.trigger.selector!)).length, previous = r.allCounts[i];
      r.allCounts[i] = count;
      // A repeat extinction trigger rearms when matching units return, not on its own effects.
      if (count !== 0 || previous === 0) return;
    }
    const suffix = hit(block.trigger, e, b); if (suffix === null) return;
    const key = `${i}:${suffix}`;
    if (!block.trigger.repeat && r.fired.includes(key)) return;
    if (!block.trigger.repeat) r.fired.push(key);
    r.queue.push({ event: i, pc: 0 });
  });
}
export function talkTargets(r: RunnerState, p: Program, b: BattleState, id: string): Unit[] {
  const u = b.units.find(u => u.id === id);
  if (!u?.alive || u.acted || u.side !== 'player' || b.phase !== 'player') return [];
  return b.units.filter(d => d.alive && d.id !== id && Math.abs(d.x - u.x) + Math.abs(d.y - u.y) === 1 && p.events.some((block, i) => block.trigger.kind === 'talk' && (block.trigger.repeat || !r.fired.includes(`${i}:`)) && matches(u, block.trigger.selector!) && matches(d, block.trigger.target!)));
}
export function resume(r: RunnerState): void { if (r.waiting?.command.op === 'fade') r.fade = r.waiting.command.args[0] === 'in' ? 7 : 0; r.waiting = null; }
export function run(r: RunnerState, p: Program, initial: BattleState, campaign: CampaignState, log: Command[], emitted?: BattleEvent[]): BattleState {
  let b = initial, budget = 10000;
  Object.assign(campaign,persistBattle(campaign,b));
  while (!r.waiting && r.queue.length && !b.outcome) {
    if (--budget === 0) throw new Error('시나리오가 한 번에 너무 많은 명령을 실행했습니다');
    const task = r.queue[0], inst = p.events[task.event].code[task.pc++];
    if (!inst) { r.queue.shift(); continue; }
    if ('condition' in inst) { if (!evaluate(inst.condition, b, campaign)) task.pc = inst.to; continue; }
    if ('to' in inst) { task.pc = inst.to; continue; }
    const c: ScriptCommand = inst, a = c.args;
    const selected = (): Unit[] => b.units.filter(u => u.alive && matches(u, selector(a[0], c.loc)));
    let system: SystemAction | null = null, duration = 0, wait = false, ids: string[] = [];
    const before = b.units.filter(u => u.alive).map(u => ({ id: u.id, x: u.x, y: u.y, side: u.side, mechId: u.mechId }));
    switch (c.op) {
      case 'choice': case 'talk': case 'narrate': wait = true; break;
      case 'fade': duration = 320; wait = true; break;
      case 'wait': duration = Number(a[0]); wait = true; break;
      case 'camera': duration = 120; wait = true; break;
      case 'affection': campaign.affection??={}; campaign.affection[a[0]]=(campaign.affection[a[0]]??0)+Number(a[1]); break;
      case 'bgm': r.bgm = a[0]; break;
      case 'objective': { const list = r.objectives[a[0] as 'win' | 'lose']; if (!list.includes(a[1])) list.push(a[1]); break; }
      case 'set': campaign.flags[a[1]] = true; break;
      case 'clear': delete campaign.flags[a[1]]; break;
      case 'give': if(a[0]==='exp') system={kind:'experience',ids:b.units.filter(u=>u.alive&&u.side==='player').map(u=>u.id),amount:Number(a[1])}; else if (a[0] === 'credits') campaign.credits += Number(a[1]); else campaign.parts.push(a[1]); break;
      case 'reinforce': system = { kind: 'reinforce', units: b.stage.waves![a[0]] }; duration = 300; wait = true; break;
      case 'spawn': { const [x, y] = a[2].split(',').map(Number); system = { kind: 'spawn', units: [{ ...definitions(b.stage).find(u => u.id === a[0])!, x, y }] }; duration = 300; wait = true; break; }
      case 'move': { const [x, y] = a[2].split(',').map(Number); ids = selected().map(u => u.id); system = { kind: 'move', ids, x, y }; duration = 300; wait = true; break; }
      case 'retreat': case 'leave': ids = selected().map(u => u.id); system = { kind: c.op, ids }; duration = 300; wait = true; break;
      case 'join': ids = selected().map(u => u.id); system = { kind: 'join', ids }; break;
      case 'set-ai': system = { kind: 'set-ai', ids: selected().map(u => u.id), ai: a[1] as 'hold' | 'aggressive' | 'defensive' }; break;
      case 'effect': system = { kind: 'effect', ids: selected().map(u => u.id), effect: a[1] === 'dummy-sure-hit' ? sureHitEffect(b) : quarterDamageEffect(b) }; break;
      case 'win': case 'lose': system = { kind: c.op }; break;
    }
    if (system) {
      const cmd: Command = { type: 'system', unitId: '', action: structuredClone(system) }, result = apply(b, cmd); log.push(cmd); b = result.state;
      const event = result.events.find(e => e.type === 'system'); if (event?.type === 'system') ids = event.ids;
      if (c.op === 'join') for (const u of b.units.filter(u => ids.includes(u.id))) if (!campaign.roster.some(v => v.id === u.id)) campaign.roster.push({ id: u.id, pilotId: u.pilotId, mechId: u.mechId, side: 'player', x: u.x, y: u.y, ai: u.ai, tags: u.tags });
      if (c.op === 'leave') campaign.roster = campaign.roster.filter(u => !ids.includes(u.id));
      emitted?.push(...result.events);
      enqueue(r, p, result.events, b);
    }
    if (wait) r.waiting = { command: c, remaining: duration, visible: 0, ids, before };
  }
  return b;
}
