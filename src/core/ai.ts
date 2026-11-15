import {supportWeaponActions,specialUtility} from './weapon-effects';
import {patternMode,guardCenter,objectivePoint,objectiveDistance} from './ai-patterns';
import type { BattleState, Command, Point, ReachableCell, Unit } from './types';
import {conditionMatches,aiSpiritCommand} from './abilities';
import { availableWeapons, chooseResponse, forecast, hostileTarget, aiSupportDefender, mapAttackCommands, mapForecast } from './combat';
import { movementField, reachable } from './movement';
import { compareId, comparePoint, distance, mechOf, unitAt } from './terrain';
import {resourceScore,selectResourceCandidate} from './resource-ai';
import {abilityActions} from './abilities';

interface Candidate { cell: Point; weaponId: string; target: Unit; score: number; damage:number }
function compareCandidate(a: Candidate, b: Candidate): number {
  return b.score - a.score || a.target.hp - b.target.hp || comparePoint(a.cell, b.cell)
    || comparePoint(a.target, b.target) || compareId(a.target.id, b.target.id) || compareId(a.weaponId, b.weaponId);
}
function relocated(s: BattleState, u: Unit, p: Point): BattleState {
  return { ...s, units: s.units.map(v => v.id === u.id ? { ...v, x: p.x, y: p.y, moved: u.moved || p.x !== u.x || p.y !== u.y } : v) };
}
const isOrigin = (p: Point, u: Point): boolean => p.x === u.x && p.y === u.y;
function moveCommand(u: Unit, p: Point): Command { return { type: 'move', unitId: u.id, x: p.x, y: p.y }; }

/** One serializable command at a time, including response/phase boundaries. No hidden AI state. */
export function nextAICommand(s: BattleState): Command | null {
  if (s.outcome) return null;
  if (s.pending) {const p=s.pending;return { type: 'respond', response: chooseResponse(s,p.targetId,p.attackerId),...(aiSupportDefender(s,p.attackerId,p.targetId,p.weaponId)?{supportDefenderId:aiSupportDefender(s,p.attackerId,p.targetId,p.weaponId)}:{})};}
  const u = [...s.units].filter(u => u.alive && !u.acted && u.side === s.phase).sort((a, b) => (s.content.rules.ai.resources?.roundRobin?(a.actionsSpent??0)-(b.actionsSpent??0):0)||compareId(a.id, b.id))[0];
  if (!u) return { type: 'endPhase' };
  return chooseAICommand(s, u.id);
}
export function chooseAICommand(s: BattleState, unitId: string): Command {
  const u = s.units.find(u => u.id === unitId);
  if (!u?.alive || u.acted || u.side !== s.phase || s.pending || s.outcome) throw new Error('AI: unit cannot act now');
  const behavior=patternMode(s,u);if(behavior?.pattern==='ambush')return {type:'wait',unitId};
  if(u.side==='enemy' && !u.moved) {
    const spirit=aiSpiritCommand(s,u);if(spirit)return spirit;
    const form=mechOf(s,u).aiForm?.find(x=>x.formId!==(u.formId??mechOf(s,u).forms?.[0]?.id) && u.transformedRound!==s.round && conditionMatches(s,u,x.when));
    if(form) return {type:'transform',unitId,formId:form.formId};
  }
  const utility=supportWeaponActions(s,unitId).filter(c=>{const w=s.content.weapons.find(w=>w.id===c.weaponId)!;return w.special?.kind!=='status'||u.hp/mechOf(s,u).hp<.75;})[0];if(utility)return utility;
  const targets = s.units.filter(d => hostileTarget(s, u, d));
  const support=(mechOf(s,u).devices?.length?abilityActions(s,unitId):[]).filter((c):c is Extract<Command,{type:'device'}>=>c.type==='device').sort((a,b)=>{const need=(id:string)=>{const v=s.units.find(u=>u.id===id)!;return 1-v.hp/mechOf(s,v).hp+1-v.en/mechOf(s,v).en;};return need(b.targetId)-need(a.targetId);})[0];
  if(support)return support;
  if(u.side==='player'&&(s.content.rules.ai.resources?.supportPilots?.includes(u.pilotId)||s.content.rules.ai.resources?.supportUnits?.includes(u.id))){if(!mechOf(s,u).devices?.length)return {type:'wait',unitId};const allies=s.units.filter(v=>v.alive&&v.side===u.side&&v.id!==u.id).sort((a,b)=>a.hp/mechOf(s,a).hp-b.hp/mechOf(s,b).hp);if(!u.moved&&allies[0]){const cells=reachable(s,u.id).filter(p=>!isOrigin(p,u)).sort((a,b)=>distance(a,allies[0])-distance(b,allies[0])||a.cost-b.cost);if(cells[0]&&distance(cells[0],allies[0])<distance(u,allies[0]))return moveCommand(u,cells[0]);}return {type:'wait',unitId};}
  if (!targets.length && patternMode(s,u)?.pattern!=='objective') return { type: 'wait', unitId };
  const origin: ReachableCell = { x: u.x, y: u.y, cost: 0, path: [{ x: u.x, y: u.y }] };
  const stationary=behavior?['hold','ambush','boss'].includes(behavior.pattern):u.ai==='hold';
  let cells = u.moved || stationary ? [origin] : reachable(s, unitId);
  if(behavior?.pattern==='guard'){const center=guardCenter(s,u,behavior),radius=behavior.radius??3;cells=cells.filter(c=>c.path.every(p=>distance(p,center)<=radius));}
  if(behavior?.pattern==='objective'&&objectivePoint(s,behavior)&&!u.moved){
    const goals=movementField(s,unitId).filter(p=>!unitAt(s,p)||isOrigin(p,u)).sort((a,b)=>objectiveDistance(s,behavior,a)-objectiveDistance(s,behavior,b)||a.cost-b.cost||comparePoint(a,b));
    const affordable=new Set(cells.map(p=>`${p.x},${p.y}`));const next=goals[0]?.path.slice().reverse().find(p=>affordable.has(`${p.x},${p.y}`));
    if(next&&!isOrigin(next,u)&&objectiveDistance(s,behavior,next)<objectiveDistance(s,behavior,u))return moveCommand(u,next);
  }
  if ((behavior?.pattern==='retreat'||!behavior&&u.ai === 'defensive') && u.hp / mechOf(s, u).hp <= s.content.rules.ai.defensiveHp) {
    const threatDistance = (p: Point): number => Math.min(...targets.map(t => distance(p, t)));
    const retreat = [...cells].sort((a, b) => threatDistance(b) - threatDistance(a) || a.cost - b.cost || comparePoint(a, b))[0];
    return retreat && !isOrigin(retreat, u) ? moveCommand(u, retreat) : { type: 'wait', unitId };
  }
  const candidates: Candidate[] = [];
  for (const cell of cells) {
    const at = relocated(s, u, cell);
    for (const target of targets) for (const weapon of availableWeapons(at, unitId, target.id)) {
      const f = forecast(at, unitId, target.id, weapon.id);
      if(s.content.rules.ai.resources&&f.expectedDamage<=0)continue;
      // Lethal normal maximum must have a nonzero hit chance; critical-only kills get no bonus.
      const kill = f.hitRate > 0 && f.damage.max >= target.hp ? s.content.rules.ai.killBonus : 0;
      const counter = (f.counter?.expectedDamage ?? 0) * s.content.rules.ai.counterWeight;
      candidates.push({ cell, target, weaponId: weapon.id, damage:f.expectedDamage, score: resourceScore(at,at.units.find(v=>v.id===u.id)!,weapon,f.expectedDamage,target.hp,{hitRate:f.hitRate,counter:f.counter?.expectedDamage,kill:kill>0,target}) + (s.content.rules.ai.resources?.utility?0:kill-counter) });
    }
  }
  if(s.content.rules.ai.resources?.positionPlan&&!u.moved){for(const c of candidates){c.score-=(cells.find(p=>p.x===c.cell.x&&p.y===c.cell.y)?.cost??0)*.01;const cheap=availableWeapons(relocated(s,u,c.cell),u.id,c.target.id).some(w=>!w.en);if(cheap)c.score+=Math.max(1,Math.abs(c.score))*.03;}}
  candidates.sort(compareCandidate);
  const best = selectResourceCandidate(s,u,candidates,'score','weaponId');
  const special=candidates.filter(c=>specialUtility(s,u,s.content.weapons.find(w=>w.id===c.weaponId)!,c.target)>0).sort((a,b)=>Number(!isOrigin(a.cell,u))-Number(!isOrigin(b.cell,u))||compareCandidate(a,b))[0];
  if(special&&(!best||best.damage<best.target.hp))return isOrigin(special.cell,u)?{type:'attack',unitId,targetId:special.target.id,weaponId:special.weaponId}:moveCommand(u,special.cell);
  const maps=mapAttackCommands(s,unitId).map(command=>({command,preview:mapForecast(s,unitId,command.weaponId,command.point,command.direction)})).map(({command,preview})=>({command,score:preview.targets.reduce((n,t)=>n+t.expectedDamage*(t.friendly?-1:1),0),enemies:preview.targets.filter(t=>!t.friendly).length})).filter(c=>c.enemies>0&&(!s.content.rules.ai.resources?.utility||!c.command||!mapForecast(s,unitId,c.command.weaponId,c.command.point,c.command.direction).friendlyFire)).sort((a,b)=>b.score-a.score);
  if(maps[0]&&maps[0].score>0&&(!best||maps[0].score>best.score))return maps[0].command;
  if (best) return isOrigin(best.cell, u) ? { type: 'attack', unitId, targetId: best.target.id, weaponId: best.weaponId } : moveCommand(u, best.cell);
  if (u.moved || stationary) return { type: 'wait', unitId };
  // Find the nearest legal firing position by full weighted path cost. Walk its affordable prefix.
  const field = movementField(s, unitId), goals: { cell: ReachableCell; target: Unit }[] = [];
  const weapons = availableWeapons(s, unitId, undefined, true);
  for (const cell of field) {
    if(behavior?.pattern==='guard'&&cell.path.some(p=>distance(p,guardCenter(s,u,behavior))>(behavior.radius??3)))continue;
    const at = unitAt(s, cell);
    if (at && at.id !== u.id) continue;
    for (const target of targets) if (weapons.some(w => distance(cell, target) >= w.range[0] && distance(cell, target) <= w.range[1])) goals.push({ cell, target });
  }
  const approach=(g:typeof goals[number])=>{if(!s.content.rules.ai.resources?.positionPlan)return g.cell.cost;const cheap=weapons.filter(w=>!w.en&&distance(g.cell,g.target)>=w.range[0]&&distance(g.cell,g.target)<=w.range[1]);const risk=targets.filter(t=>distance(g.cell,t)<=2).length;return g.cell.cost+(cheap.length?0:2)+risk*.2;};
  goals.sort((a, b) => approach(a) - approach(b) || a.target.hp - b.target.hp || comparePoint(a.cell, b.cell) || compareId(a.target.id, b.target.id));
  if (goals.length) {
    const affordable = new Map(cells.map(c => [`${c.x},${c.y}`, c]));
    const prefix = [...goals[0].cell.path].reverse().find(p => affordable.has(`${p.x},${p.y}`));
    if (prefix && !isOrigin(prefix, u)) return moveCommand(u, prefix);
  }
  if(behavior?.pattern==='guard'&&!u.moved){const gap=(p:Point)=>Math.min(...targets.map(t=>distance(p,t))),near=[...cells].sort((a,b)=>gap(a)-gap(b)||a.cost-b.cost||comparePoint(a,b))[0];if(near&&gap(near)<gap(u))return moveCommand(u,near);}
  return { type: 'wait', unitId };
}
