import {useSupportWeapon,supportWeaponActions} from './weapon-effects';
import {validCommandShape} from './command-contract';
import {updatePatternAlerts} from './ai-patterns';
import { phaseGimmicks,energyRegen } from './gimmicks';
import type { ApplyResult, BattleEvent, BattleOptions, BattleState, Command, Content, Response, Snapshot, Stage, Unit } from './types';
import { validateContent, validateSnapshot, validateStage } from './validate';
import { environmentOf, mechOf, terrainAt, unitAt, unitById, weaponById } from './terrain';
import { availableWeapons, changeMorale, chooseResponse, forecast, resolve, weaponProblem, resolveMap, supportAttackCandidates, aiSupportDefender, mapAttackCommands } from './combat';
import { reachable } from './movement';
import { consumeEffects, expireRoundEffects, hookValue } from './effects';
import { normalizeSeed } from './rng';
import {useSpirit,useItem,transform,combine,split,startAbilities,abilityActions} from './abilities';
import { applySystem, initializeUnit } from './system';
import {stageContent} from './stage-content';
import {resetActions,finishAction} from './actions';
import {resourceRecovery,useDevice} from './resources';

function checkOutcome(s: BattleState, events: BattleEvent[]): void {
  if(s.units.some(u=>!u.alive&&!u.removed&&u.tags?.includes('essential'))) { if(s.outcome!=='defeat'){s.outcome='defeat';events.push({type:'outcome',outcome:'defeat'});} return; }
  if (s.stage.scenario) return;
  const outcome = !s.units.some(u => u.alive && u.side === 'player') ? 'defeat' : !s.units.some(u => u.alive && u.side === 'enemy') ? 'victory' : null;
  if (outcome && outcome !== s.outcome) { s.outcome = outcome; events.push({ type: 'outcome', outcome }); }
}
function startRound(s: BattleState, events: BattleEvent[], initial = false): void {
  if (!initial) expireRoundEffects(s, events);
  startAbilities(s,events,initial);
  events.push({ type: 'round-start', round: s.round });
  for (const u of s.units) {
    if (!u.alive) continue;
    if(!s.content.rules.actions||s.phase===u.side||initial)resetActions(s,u);
    changeMorale(s, u, hookValue(s, 'onRoundStart', initial ? 0 : s.content.rules.morale.round, { ownerId: u.id }), 'round', events);
    consumeEffects(s, ['onRoundStart'], { ownerId: u.id }, events);
    const mech = mechOf(s, u), terrain = terrainAt(s, u);
    if(s.content.rules.recoveryTiming==='phase'&&u.side!==s.phase)continue;
    const recover = environmentOf(s, u) === terrain.env ? terrain.recover : undefined;
    const extra=initial?{hp:0,en:0}:resourceRecovery(s,u);
    const hp = Math.min(mech.hp - u.hp, extra.hp+Math.floor(mech.hp * (recover?.hp ?? 0) / 100));
    const en = Math.min(mech.en - u.en, extra.en+Math.floor(energyRegen(s,u) + mech.en * (recover?.en ?? 0) / 100));
    u.hp += hp; u.en += en;
    if (hp || en) events.push({ type: 'recover', unitId: u.id, hp, en });
  }
  if(!initial)phaseGimmicks(s,events);
  events.push({ type: 'phase-start', phase: s.phase, round: s.round });
}
export function createBattle(content: Content, stage: Stage, seed: number, options: BattleOptions = {}): BattleState {
  content=stageContent(content,stage);validateContent(content); validateStage(stage, content);
  if (options.autoResponse !== undefined && typeof options.autoResponse !== 'boolean') throw new Error('options.autoResponse: expected boolean');
  const s: BattleState = {
    content: structuredClone(content), stage: structuredClone(stage), round: 1, phase: 'player', rng: normalizeSeed(seed),
    options: { autoResponse: options.autoResponse ?? false }, pending: null, outcome: null,
    units: [],
  };
  s.units = stage.units.map(initial=>initializeUnit(s,initial));
  startRound(s, [], true); checkOutcome(s, []); return s;
}
function actingUnit(s: BattleState, id: string): Unit {
  const u = unitById(s, id);
  if (!u.alive || u.acted || u.side !== s.phase) throw new Error(`unit '${id}': cannot act in ${s.phase} phase`);
  return u;
}
function finishExchange(s: BattleState, unitId: string, targetId: string, weaponId: string, response: Response, events: BattleEvent[], supportAttackerId?: string, supportDefenderId?: string): BattleState {
  events.push({ type: 'response', unitId: targetId, response: structuredClone(response) });
  const result = resolve(s, unitId, targetId, weaponId, response, supportAttackerId, supportDefenderId);
  events.push(...result.events);
  const next = result.state, a = unitById(next, unitId);
  if (unitById(s, unitId).moveOrigin) consumeEffects(next, ['onBeforeMove'], { ownerId: unitId }, events);
  finishAction(next,a); next.pending = null;
  checkOutcome(next, events); return next;
}
/** Transaction reducer. All mutation occurs after cloning; exceptions discard the copy. */
export function apply(input: BattleState, cmd: Command): ApplyResult {
  if(!validCommandShape(cmd))throw new Error('battle: invalid command shape');
  if (input.outcome) throw new Error('battle: already ended');
  if (input.pending && cmd.type !== 'respond' && cmd.type !== 'system') throw new Error('battle: pending response; respond first');
  let s = structuredClone(input);
  const events: BattleEvent[] = [];
  switch (cmd.type) {
    case 'weaponSkill': {const u=actingUnit(s,cmd.unitId);if(u.moveOrigin)consumeEffects(s,['onBeforeMove'],{ownerId:u.id},events);useSupportWeapon(s,cmd.unitId,cmd.weaponId,events);break;}
    case 'spirit': useSpirit(s,cmd.unitId,cmd.spiritId,cmd.targetId,events,cmd.pilotId); break;
    case 'device': {const u=unitById(s,cmd.unitId);if(u.moveOrigin)consumeEffects(s,['onBeforeMove'],{ownerId:u.id},events);useDevice(s,cmd.unitId,cmd.deviceId,cmd.targetId,events);break;}
    case 'useItem': useItem(s,cmd.unitId,cmd.slot,events); break;
    case 'transform': transform(s,cmd.unitId,cmd.formId,events); break;
    case 'combine': combine(s,cmd,events); break;
    case 'split': split(s,cmd.unitId,events); break;
    case 'mapAttack': {actingUnit(s,cmd.unitId);resolveMap(s,cmd.unitId,cmd.weaponId,cmd.point,cmd.direction,events);checkOutcome(s,events);break;}
    case 'system': applySystem(s, cmd.action, events); checkOutcome(s, events); break;
    case 'persuade': {
      const u = actingUnit(s, cmd.unitId), target = unitById(s, cmd.targetId);
      if (u.side !== 'player' || !target.alive || u.id === target.id || Math.abs(u.x - target.x) + Math.abs(u.y - target.y) !== 1) throw new Error('persuade: requires adjacent living target');
      finishAction(s,u);
      events.push({ type: 'persuade', unitId: u.id, targetId: target.id }); break;
    }
    case 'move': {
      const u = actingUnit(s, cmd.unitId);
      if (u.moved) throw new Error('move: already moved');
      const cell = reachable(s, u.id).find(p => p.x === cmd.x && p.y === cmd.y);
      if (!cell || cell.cost === 0) throw new Error('move: destination unreachable or unchanged');
      u.moveOrigin = { x: u.x, y: u.y }; u.x = cell.x; u.y = cell.y; u.moved = true;
      events.push({ type: 'move', unitId: u.id, cost: cell.cost, path: cell.path });break;
    }
    case 'undoMove': {
      const u = actingUnit(s, cmd.unitId), origin = u.moveOrigin;
      if (!u.moved || !origin) throw new Error('undoMove: no pending move');
      if (unitAt(s, origin)) throw new Error('undoMove: origin now occupied');
      u.x = origin.x; u.y = origin.y; u.moved = false; u.moveOrigin = null;
      events.push({ type: 'undo-move', unitId: u.id, to: origin }); break;
    }
    case 'attack': {
      const a = actingUnit(s, cmd.unitId), d = unitById(s, cmd.targetId), w = weaponById(s, cmd.weaponId);
      const problem = weaponProblem(s, a, w, d);
      if (problem) throw new Error(`attack: ${problem}`);
      const supportAttackerId = cmd.supportAttackerId ?? (a.side === 'enemy' ? supportAttackCandidates(s,a.id,d.id)[0]?.unitId : undefined);
      if (cmd.supportAttackerId && !supportAttackCandidates(s,a.id,d.id).some(c=>c.unitId===cmd.supportAttackerId)) throw new Error('support: invalid candidate');
      if (a.side === 'enemy' && d.side === 'player' && !s.options.autoResponse) {
        s.pending = { type: 'response', attackerId: a.id, targetId: d.id, weaponId: w.id, ...(supportAttackerId ? {supportAttackerId} : {}) };
        events.push({ ...s.pending, type: 'pending-response' });
      } else s = finishExchange(s, a.id, d.id, w.id, chooseResponse(s, d.id, a.id), events, supportAttackerId, d.side === 'enemy' ? aiSupportDefender(s,a.id,d.id,w.id) : s.options.autoResponse ? aiSupportDefender(s,a.id,d.id,w.id) : undefined);
      break;
    }
    case 'respond': {
      const p = s.pending;
      if (!p) throw new Error('respond: no pending response');
      if (!cmd.response || !['counter', 'defend', 'evade'].includes(cmd.response.type)) throw new Error('respond: invalid response type');
      s = finishExchange(s, p.attackerId, p.targetId, p.weaponId, cmd.response, events, p.supportAttackerId, cmd.supportDefenderId); break;
    }
    case 'wait': {
      const u = actingUnit(s, cmd.unitId);
      if (u.moveOrigin) consumeEffects(s, ['onBeforeMove'], { ownerId: u.id }, events);
      finishAction(s,u);
      events.push({ type: 'wait', unitId: u.id }); break;
    }
    case 'endPhase': {
      for (const u of s.units) if (u.alive && u.side === s.phase) {
        if (u.moveOrigin) consumeEffects(s, ['onBeforeMove'], { ownerId: u.id }, events);
        finishAction(s,u,true);
      }
      if (s.phase === 'player') { s.phase = 'enemy'; startAbilities(s,events); phaseGimmicks(s,events); events.push({ type: 'phase-start', phase: s.phase, round: s.round }); }
      else { s.round++; s.phase = 'player'; startRound(s, events); }
      break;
    }
    default: throw new Error(`command.type: unknown '${(cmd as { type: string }).type}'`);
  }
  revealCombat(s,events);updatePatternAlerts(s,events);
  checkOutcome(s,events);
  return { state: s, events };
}
/** Reveal only resolved exchanges involving an ally; callers may supply the original faction. */
export function revealCombat(s:BattleState,events:readonly BattleEvent[],ally:(u:Unit)=>boolean=u=>u.side==='player'):void {
  for(const e of events)if(e.type==='attack'){const a=s.units.find(u=>u.id===e.attackerId),b=s.units.find(u=>u.id===e.targetId);if(a&&b&&ally(a)!==ally(b))(ally(a)?b:a).revealed=true;}
}
/** Legal commands for an active unit, including attacks after a tentative move. */
export function availableActions(s: BattleState, unitId: string): Command[] {
  const u = unitById(s, unitId);
  if (s.outcome || s.pending || !u.alive || u.side !== s.phase) return [];
  const abilities=[...abilityActions(s,unitId),...supportWeaponActions(s,unitId)];
  if(u.acted)return abilities;
  const result: Command[] = reachable(s, unitId).filter(p => p.cost > 0).map(p => ({ type: 'move', unitId, x: p.x, y: p.y }));
  if (u.moveOrigin && !unitAt(s, u.moveOrigin)) result.push({ type: 'undoMove', unitId });
  for (const d of s.units) for (const w of availableWeapons(s, unitId, d.id)) result.push({ type: 'attack', unitId, targetId: d.id, weaponId: w.id });
  result.push(...abilities,...mapAttackCommands(s,unitId),{ type: 'wait', unitId }); return result;
}
export function responseOptions(s: BattleState): Response[] {
  if (!s.pending) return [];
  return [...availableWeapons(s, s.pending.targetId, s.pending.attackerId, true).map(w => ({ type: 'counter' as const, weaponId: w.id })), { type: 'defend' }, { type: 'evade' }];
}
export function pendingForecast(s: BattleState, response: Response, supportDefenderId?: string) {
  if (!s.pending) throw new Error('forecast: no pending response');
  return forecast(s, s.pending.attackerId, s.pending.targetId, s.pending.weaponId, response, {supportDefenderId});
}
export function snapshot(s: BattleState): string {
  const { content, stage, ...battle } = s;
  const save: Snapshot = { version: 'm2-save-2', contentVersion: content.version, stageId: stage.id, battle };
  return JSON.stringify(save);
}
export function restore(content: Content, stage: Stage, json: string): BattleState {
  content=stageContent(content,stage);validateContent(content); validateStage(stage, content);
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new Error('snapshot: invalid JSON'); }
  // Only the immediately preceding core format has an explicit, conservative migration.
  const old=value as {version?:string;battle?:{units?:Unit[]}};
  if(old?.version==='m2-save-1'&&Array.isArray(old.battle?.units)){
    old.version='m2-save-2';for(const u of old.battle.units){
      if(content.rules.actions){u.actionsRemaining=Number(!u.acted);u.actionsSpent=Number(u.acted);u.extraActionsUsed=0;}
      const def=content.mechs.find(m=>m.id===u.mechId);if(def?.devices?.length||def?.subPilots?.length)throw Error('snapshot: old save has no device/crew state; restart stage');
    }
  }
  validateSnapshot(value, content, stage);
  return { content: structuredClone(content), stage: structuredClone(stage), ...structuredClone(value.battle) };
}
