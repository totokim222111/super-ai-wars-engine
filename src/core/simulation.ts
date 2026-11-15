import type { BattleEvent, BattleState, Command } from './types';
import { apply } from './battle';
import { nextAICommand } from './ai';

export interface SimulationResult {
  state: BattleState; commands: Command[]; events: BattleEvent[];
  stats: { shots: number; hits: number; meanHitRate: number; meanDamageHpRatio: number; oneShots: number };
}
/** AI controls both sides; maxRounds is a failure guard, never a victory condition. */
export function autoplay(initial: BattleState, maxRounds = 200): SimulationResult {
  let state = initial;
  const commands: Command[] = [], events: BattleEvent[] = [{ type: 'round-start', round: state.round }, { type: 'phase-start', round: state.round, phase: state.phase }];
  while (!state.outcome) {
    if (state.round > maxRounds || commands.length > maxRounds * (initial.units.length * 3 + 2)) throw new Error(`simulation: no outcome within ${maxRounds} rounds`);
    const command = nextAICommand(state);
    if (!command) throw new Error('simulation: AI stopped without outcome');
    const result = apply(state, command); state = result.state;
    commands.push(command); events.push(...result.events);
  }
  const attacks = events.filter((e): e is Extract<BattleEvent, { type: 'attack' }> => e.type === 'attack');
  const hits = attacks.filter(e => e.hit), sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);
  return { state, commands, events, stats: {
    shots: attacks.length, hits: hits.length, meanHitRate: attacks.length ? sum(attacks.map(e => e.hitRate)) / attacks.length : 0,
    meanDamageHpRatio: hits.length ? sum(hits.map(e => e.damage / e.targetMaxHp)) / hits.length : 0,
    oneShots: hits.filter(e => e.damage >= e.targetMaxHp).length,
  } };
}
