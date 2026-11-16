import {enemyLoadout} from './stage-content';
import {gainExperience} from './progression';
import type { BattleEvent, BattleState, StageUnit, SystemAction, Unit } from './types';
import { distance, mechOf, pilotOf, unitById } from './terrain';
import { validateEffect, validateStage } from './validate';
import {resetActions,finishAction} from './actions';

export function initializeUnit(s: BattleState, initial: StageUnit): Unit {
  initial=enemyLoadout(initial,s.stage,s.content.rules);
  const m = s.content.mechs.find(m => m.id === initial.mechId)!, p = s.content.pilots.find(p => p.id === initial.pilotId)!;
  const u: Unit = { ...structuredClone(initial), hp: m.hp, en: m.en, ammo: Object.fromEntries([...new Set([...m.weapons,...(m.forms??[]).flatMap(f=>f.overrides.weapons??[])])].flatMap(id => {
    const w = s.content.weapons.find(w => w.id === id)!; return w.ammo === undefined ? [] : [[id, w.ammo]];
  })), morale: Math.max(s.content.rules.morale.min, Math.min(s.content.rules.morale.max, initial.pilotOverrides?.startMorale??p.startMorale ?? s.content.rules.morale.start)), sp: p.sp,
  moved: false, acted: false, alive: true, moveOrigin: null, effects: [] };
  if(p.growth || p.spirits || initial.level !== undefined) {u.level=initial.level??1;u.exp=initial.exp??0;}
  delete u.requiresFlag;
  u.hp=mechOf(s,u).hp;u.en=mechOf(s,u).en;u.sp=pilotOf(s,u).sp;
  if(m.devices?.length)u.deviceUses=Object.fromEntries(m.devices.filter(d=>d.uses!==null).map(d=>[d.id,d.uses!]));
  if(m.subPilots?.length)u.subPilots=m.subPilots.map(pilotId=>{const progress=initial.subPilotProgress?.find(p=>p.pilotId===pilotId),pilot=s.content.pilots.find(p=>p.id===pilotId)!,level=progress?.level??u.level??1;return {pilotId,level,exp:progress?.exp??0,sp:pilot.sp+(pilot.spGrowth??0)*(level-1)};});
  for(const sub of u.subPilots??[]){if(s.units?.some(v=>v.alive&&v.id!==u.id&&(v.pilotId===sub.pilotId||v.subPilots?.some(p=>p.pilotId===sub.pilotId))))throw Error('crew: pilot is already deployed');}
  for(const sub of u.subPilots??[])sub.sp=pilotOf(s,{...u,pilotId:sub.pilotId,level:sub.level}).sp;
  resetActions(s,u);
  return u;
}
/** Manhattan distance, then row/column; terrain and occupancy are both authoritative. */
export function nearestFree(s: BattleState, definition: StageUnit, desired = definition): { x: number; y: number } {
  if (!s.content.mechs.some(m => m.id === definition.mechId)) throw new Error('system: unknown mech');
  if (!s.content.pilots.some(p => p.id === definition.pilotId)) throw new Error('system: unknown pilot');
  const m = mechOf(s,initializeUnit(s,definition));
  const cells = s.stage.map.tiles.flatMap((row, y) => row.flatMap((id, x) => {
    const t = s.content.terrain.find(t => t.id === id)!;
    return !s.units.some(u => u.alive && u.x === x && u.y === y) && (m.moveType.includes('air') || m.moveType.some(e => t.moveCost[e] !== null)) ? [{ x, y }] : [];
  })).sort((a, b) => distance(a, desired) - distance(b, desired) || a.y - b.y || a.x - b.x);
  if (!cells.length) throw new Error('system: no free deployment cell');
  return cells[0];
}
export function applySystem(s: BattleState, a: SystemAction, events: BattleEvent[]): void {
  const ids: string[] = [];
  if (a.kind === 'win' || a.kind === 'lose') {
    s.outcome = a.kind === 'win' ? 'victory' : 'defeat'; s.pending = null;
    events.push({ type: 'outcome', outcome: s.outcome });
  } else if (a.kind === 'spawn' || a.kind === 'reinforce') {
    for (const definition of a.units) {
      if (s.units.some(u => u.id === definition.id)) throw new Error(`system: duplicate unit '${definition.id}'`);
      const p = nearestFree(s, definition), deployed = { ...definition, ...p };
      validateStage({ ...s.stage, units: [deployed] }, s.content);
      s.units.push(initializeUnit(s, deployed)); ids.push(deployed.id);
    }
  } else {
    if (!('ids' in a)) throw new Error('system: invalid action');
    for (const id of a.ids) {
      const u = unitById(s, id); ids.push(id);
      switch (a.kind) {
        case 'experience': if(!Number.isSafeInteger(a.amount)||a.amount<0)throw new Error('system: invalid experience');gainExperience(s,u,a.amount,events);break;
        case 'move': {
          if (!u.alive) throw new Error('system: cannot move absent unit');
          const from = { x: u.x, y: u.y }, occupied = s.units.filter(v => v.id !== id);
          const p = nearestFree({ ...s, units: occupied }, u, { ...u, x: a.x, y: a.y });
          u.x = p.x; u.y = p.y; u.moveOrigin = null; u.moved = false; delete u.moveCommitted;
          const path = [from]; let x = from.x, y = from.y;
          while (x !== p.x || y !== p.y) { if (x !== p.x) x += Math.sign(p.x - x); else y += Math.sign(p.y - y); path.push({ x, y }); }
          events.push({ type: 'move', unitId: id, path, cost: 0 }); break;
        }
        case 'retreat': case 'leave': finishAction(s,u,true);u.alive = false; u.removed = true; if (a.kind === 'leave') u.side = 'neutral'; break;
        case 'join': {
          if (!u.alive) throw new Error('system: cannot join absent unit');
          const previous=mechOf(s,u),hpRatio=u.hp/previous.hp,enRatio=u.en/previous.en,normalize=u.side!=='player'&&!!previous.allyStats;
          // Cycle scaling belongs to the enemy faction, not a subsequently recruited ally.
          if(u.side==='enemy'&&s.stage.enemyUpgradeLevel!==undefined&&s.content.rules.enemyUpgrades){
            const original=[...s.stage.units,...s.stage.definitions??[],...Object.values(s.stage.waves??{}).flat()].find(v=>v.id===u.id);
            u.upgrades=structuredClone(original?.upgrades??{hp:0,en:0,armor:0,mobility:0,weapons:0});
          }
          if(normalize){u.recruited=true;u.upgrades={hp:0,en:0,armor:0,mobility:0,weapons:0};}
          u.side = 'player';if(u.pilotOverrides?.clearOnJoin){delete u.pilotOverrides;u.level=Math.max(u.level??1,s.stage.minimumLevel??1);}
          const m=mechOf(s,u);u.hp=normalize?Math.max(1,Math.round(m.hp*hpRatio)):Math.min(u.hp,m.hp);u.en=normalize?Math.round(m.en*enRatio):Math.min(u.en,m.en);break;
        }
        case 'set-ai': if (!['aggressive', 'hold', 'defensive'].includes(a.ai)) throw new Error('system: invalid AI'); u.ai = a.ai; break;
        case 'effect': validateEffect(a.effect); u.effects = [...u.effects.filter(e => e.id !== a.effect.id), structuredClone(a.effect)]; break;
      }
    }
  }
  events.push({ type: 'system', action: structuredClone(a), ids });
}
