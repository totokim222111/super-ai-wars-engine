import {effectiveMech,effectivePilot,sumAtom,effectiveMorale} from './modifiers';
import type { BattleState, Content, Effect, Rules, Snapshot, Stage } from './types';

type Obj = Record<string, unknown>;
const environments = ['air', 'ground', 'sea', 'space'] as const;
const grades = ['S', 'A', 'B', 'C', 'D'] as const;
const sizes = ['SS', 'S', 'M', 'L', 'LL'] as const;
const sides = ['player', 'enemy', 'neutral'] as const;
const aiTypes = ['aggressive', 'hold', 'defensive'] as const;
function fail(path: string, message: string): never { throw new Error(`${path}: ${message}`); }
function obj(value: unknown, path: string): Obj {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(path, 'expected object');
  return value as Obj;
}
function known(o: Obj, keys: readonly string[], path: string): void {
  for (const key of Object.keys(o)) if (!keys.includes(key)) fail(`${path}.${key}`, 'unknown field');
}
function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, 'expected array');
  return value;
}
function str(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(path, 'expected nonempty string');
  return value;
}
function num(value: unknown, path: string, min = -Infinity, max = Infinity, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) {
    fail(path, `expected ${integer ? 'integer' : 'finite number'} in [${min}, ${max}]`);
  }
  return value;
}
function bool(value: unknown, path: string): void { if (typeof value !== 'boolean') fail(path, 'expected boolean'); }
function choice(value: unknown, values: readonly string[], path: string): void {
  if (typeof value !== 'string' || !values.includes(value)) fail(path, `expected ${values.join('|')}`);
}
function optional(o: Obj, key: string, check: (v: unknown, p: string) => void, path: string): void {
  if (o[key] !== undefined) check(o[key], `${path}.${key}`);
}
function numbers(value: unknown, keys: readonly string[], path: string, min = -Infinity, max = Infinity): Obj {
  const o = obj(value, path);
  for (const key of keys) num(o[key], `${path}.${key}`, min, max);
  return o;
}
function adapt(value: unknown, path: string): void {
  const o = obj(value, path);
  for (const env of environments) choice(o[env], grades, `${path}.${env}`);
}
function identity(o: Obj, path: string): void { str(o.id, `${path}.id`); str(o.name, `${path}.name`); }
function refs(value: unknown, ids: Set<string>, path: string): void {
  const id = str(value, path);
  if (!ids.has(id)) fail(path, `unknown id '${id}'`);
}
function idSet(value: unknown[], path: string): Set<string> {
  const ids = new Set<string>();
  value.forEach((v, i) => {
    const id = str(obj(v, `${path}[${i}]`).id, `${path}[${i}].id`);
    if (ids.has(id)) fail(`${path}[${i}].id`, `duplicate id '${id}'`);
    ids.add(id);
  });
  return ids;
}

export function validateRules(value: unknown, path = 'rules'): asserts value is Rules {
  const o = obj(value, path);
  for(const key of ['expPerLevel','levelMax','upgradeMax','fullUpgradeThreshold']) num(o[key],`${path}.${key}`,1,Infinity,true);
  for(const key of ['expLevelFactor','expFactorMin','expFactorMax','damageExpRatio','supportDefenseExp','supportDefenseHp']) num(o[key],`${path}.${key}`,0);
  if((o.expFactorMax as number)<(o.expFactorMin as number)) fail(path,'invalid experience factor range');
  num(o.supportDefenseHp,`${path}.supportDefenseHp`,0,1);
  num(o.fullUpgradeThreshold,`${path}.fullUpgradeThreshold`,1,o.upgradeMax as number,true);
  optional(o,'meleeHitBonus',(v,p)=>num(v,p,0,100,true),path);
  optional(o,'weaponUpgrade',(v,p)=>{const d=obj(v,p);known(d,['mode','rate'],p);choice(d.mode,['percent'],p+'.mode');num(d.rate,p+'.rate',0,1);},path);
  numbers(o.upgradeStep,['hp','en','armor','mobility','weapons'],`${path}.upgradeStep`,0);
  if(o.deploymentUpgradeMax!==undefined)num(o.deploymentUpgradeMax,path+'.deploymentUpgradeMax',1,Number.MAX_SAFE_INTEGER,true);
  const costs=array(o.upgradeCost,`${path}.upgradeCost`);if(costs.length!==(o.upgradeMax as number)) fail(path,'upgrade cost length mismatch');
  costs.forEach((v,i)=>num(v,`${path}.upgradeCost[${i}]`,0,Infinity,true));
  str(o.version, `${path}.version`);
  const k = numbers(o.k, ['hitBase', 'hitPilot', 'evadePilot', 'evadeMobility', 'mobilityBase', 'statDivisor', 'critMul', 'defendResponse', 'evadeResponse', 'minDamage', 'spread', 'critSkill'], `${path}.k`, 0);
  num(k.statDivisor, `${path}.k.statDivisor`, Number.MIN_VALUE);
  num(k.spread, `${path}.k.spread`, 0, 1);
  num(k.minDamage, `${path}.k.minDamage`, 0, Infinity, true);
  for (const key of ['defendResponse', 'evadeResponse']) num(k[key], `${path}.k.${key}`, 0, 1);
  numbers(o.adaptHit, grades, `${path}.adaptHit`);
  numbers(o.adaptDmg, grades, `${path}.adaptDmg`, 0);
  numbers(o.sizeHit, sizes, `${path}.sizeHit`);
  numbers(o.sizeDmg, sizes, `${path}.sizeDmg`, 0);
  const m = numbers(o.morale, ['start', 'min', 'max', 'round', 'hit', 'damaged', 'evade', 'kill', 'allyKill'], `${path}.morale`, 0);
  num(m.max, `${path}.morale.max`, m.min as number);
  num(m.start, `${path}.morale.start`, m.min as number, m.max as number);
  num(o.enRegenPerRound, `${path}.enRegenPerRound`, 0);
  num(o.airMoveCost, `${path}.airMoveCost`, Number.MIN_VALUE);
  const ai = numbers(o.ai, ['killBonus', 'counterWeight', 'defensiveHp', 'defendHp'], `${path}.ai`, 0);
  for (const key of ['defensiveHp', 'defendHp']) num(ai[key], `${path}.ai.${key}`, 0, 1);
  if(ai.resources!==undefined){const r=obj(ai.resources,`${path}.ai.resources`);optional(r,'nearOptimal',(v,p)=>num(v,p,0,1),path+'.ai.resources');optional(r,'positionPlan',bool,path+'.ai.resources');if(r.enemyResponse!==undefined){const q=obj(r.enemyResponse,path+'.ai.resources.enemyResponse');choice(q.mode,['counter-first'],path+'.ai.resources.enemyResponse.mode');num(q.defendHp,path+'.ai.resources.enemyResponse.defendHp',0,1);num(q.evadeHp,path+'.ai.resources.enemyResponse.evadeHp',0,q.defendHp as number);}if(r.burst!==undefined){const q=obj(r.burst,path+'.ai.resources.burst');for(const k of ['base','crowded','eliteCount'])num(q[k],path+'.ai.resources.burst.'+k,1,Infinity,true);array(q.eliteMechs,path+'.ai.resources.burst.eliteMechs').forEach(v=>str(v,path+'.ai.resources.burst.eliteMechs'));}}
  const effects = numbers(o.effects, ['sureHit', 'quarterDamage'], `${path}.effects`, 0);
  num(effects.sureHit, `${path}.effects.sureHit`, 0, 100);
  num(effects.quarterDamage, `${path}.effects.quarterDamage`, 0, 1);
}

export function validateContent(value: unknown): asserts value is Content {
  const o = obj(value, 'content');
  if(o.options!==undefined){const options=obj(o.options,'content.options');known(options,['spiritAfterAction'],'content.options');optional(options,'spiritAfterAction',bool,'content.options');}
  str(o.version, 'content.version'); validateRules(o.rules, 'content.rules');
  if(o.terms!==undefined)for(const [key,value]of Object.entries(obj(o.terms,'content.terms')))str(value,'content.terms.'+key);
  if(o.tagEffects!==undefined)array(o.tagEffects,'content.tagEffects').forEach((value,i)=>{
    const p=`content.tagEffects[${i}]`,e=obj(value,p);choice(e.kind,['aura','heal','summon','drain','regeneration','weapon-roll'],p+'.kind');
    if(['aura','heal','summon','drain'].includes(String(e.kind)))str(e.tag,p+'.tag');
    if(e.kind==='aura'){num(e.range,p+'.range',0,Infinity,true);validateAtoms(e.atoms,p+'.atoms');optional(e,'en',(v,p)=>num(v,p,0),p);}
    if(e.kind==='heal'){num(e.range,p+'.range',0,Infinity,true);num(e.hpPct,p+'.hpPct',0,100);}
    if(e.kind==='summon'){str(e.templateTag,p+'.templateTag');str(e.suffix,p+'.suffix');num(e.limit,p+'.limit',0,Infinity,true);}
    if(e.kind==='drain')num(e.amount,p+'.amount',0);
    if(e.kind==='regeneration'){str(e.pilot,p+'.pilot');num(e.en,p+'.en',0);}
    if(e.kind==='weapon-roll'){optional(e,'stage',str,p);array(e.prefixes,p+'.prefixes').forEach((v,i)=>str(v,p+'.prefixes['+i+']'));num(e.min,p+'.min',0);num(e.max,p+'.max',e.min as number);}
  });
  const pilots = array(o.pilots, 'content.pilots'), mechs = array(o.mechs, 'content.mechs');
  const weapons = array(o.weapons, 'content.weapons'), terrain = array(o.terrain, 'content.terrain');
  idSet(pilots, 'content.pilots'); idSet(mechs, 'content.mechs');
  const weaponIds = idSet(weapons, 'content.weapons'); idSet(terrain, 'content.terrain');
  pilots.forEach((v, i) => {
    const p = `content.pilots[${i}]`, u = obj(v, p); identity(u, p); adapt(u.adapt, `${p}.adapt`);
    const stats=numbers(u.stats, ['melee', 'shoot', 'hit', 'evade', 'skill', 'defense'], `${p}.stats`, 0);for(const [key,v]of Object.entries(stats))num(v,`${p}.stats.${key}`,0);
    num(u.sp, `${p}.sp`, 0, Infinity, true);
    optional(u, 'startMorale', (v, p) => num(v, p, (o.rules as Rules).morale.min, (o.rules as Rules).morale.max), p);
    optional(u, 'faces', (v, p) => Object.entries(obj(v, p)).forEach(([key, val]) => str(val, `${p}.${key}`)), p);
  });
  weapons.forEach((v, i) => {
    const p = `content.weapons[${i}]`, w = obj(v, p); identity(w, p); adapt(w.adapt, `${p}.adapt`);
    optional(w, 'icon', (v, p) => choice(v, ['melee','shoot','beam','missile','map'], p), p);
    optional(w, 'anim', str, p);
    choice(w.kind, ['melee', 'shoot', 'beam', 'missile', 'map'], `${p}.kind`); num(w.power, `${p}.power`, 0);
    num(w.hit, `${p}.hit`); num(w.crit, `${p}.crit`); bool(w.postMove, `${p}.postMove`);
    const range = array(w.range, `${p}.range`);
    if (range.length !== 2) fail(`${p}.range`, 'expected [min,max]');
    const min = num(range[0], `${p}.range[0]`, 1, Infinity, true);
    num(range[1], `${p}.range[1]`, min, Infinity, true);
    for (const key of ['en', 'ammo']) optional(w, key, (v, p) => num(v, p, 0, Infinity, true), p);
    optional(w,'special',validateWeaponSpecial,p);
    optional(w, 'moraleReq', (v, p) => num(v, p, 0), p);
  });
  mechs.forEach((v, i) => {
    const p = `content.mechs[${i}]`, m = obj(v, p); identity(m, p); adapt(m.adapt, `${p}.adapt`);
    num(m.hp, `${p}.hp`, 1, Infinity, true);
    for (const key of ['en', 'armor', 'mobility', 'move']) num(m[key], `${p}.${key}`, 0, Infinity, true);
    choice(m.size, sizes, `${p}.size`);
    const types = array(m.moveType, `${p}.moveType`);
    if (!types.length || new Set(types).size !== types.length) fail(`${p}.moveType`, 'expected nonempty unique move types');
    types.forEach((v, j) => choice(v, environments, `${p}.moveType[${j}]`));
    const ws = array(m.weapons, `${p}.weapons`);
    if (new Set(ws).size !== ws.length) fail(`${p}.weapons`, 'duplicate weapon');
    ws.forEach((v, j) => refs(v, weaponIds, `${p}.weapons[${j}]`));
  });
  validateExtensions(value as Content);validateBalance(value as Content);
  terrain.forEach((v, i) => {
    const p = `content.terrain[${i}]`, t = obj(v, p); identity(t, p);
    choice(t.env, environments, `${p}.env`);
    num(t.hitMod, `${p}.hitMod`, -100); num(t.damageMod, `${p}.damageMod`, -100);
    const costs = obj(t.moveCost, `${p}.moveCost`);
    for (const env of environments) if (costs[env] !== null) num(costs[env], `${p}.moveCost.${env}`, Number.MIN_VALUE);
    optional(t, 'recover', (v, p) => { numbers(v, ['hp', 'en'], p, 0, 100); }, p);
  });
}

export function validateStage(value: unknown, content: Content): asserts value is Stage {
  const s = obj(value, 'stage'); str(s.id, 'stage.id');
  optional(s,'enemyUpgradeLevel',(v,p)=>num(v,p,0,Number.MAX_SAFE_INTEGER,true),'stage');
  if(s.enemyPilotScaling!==undefined){const scale=obj(s.enemyPilotScaling,'stage.enemyPilotScaling'),baseline=obj(scale.baseline,'enemy baseline');num(baseline.level,'enemy baseline level',1,content.rules.levelMax);numbers(baseline.stats,['melee','shoot','hit','evade','skill','defense'],'enemy baseline stats',0);const units=obj(scale.units,'enemy units');for(const [id,value]of Object.entries(units)){const row=obj(value,'enemy '+id);num(row.ratio,'enemy ratio',0,5);optional(row,'actionCap',(v,p)=>num(v,p,1,3,true),'enemy '+id);}if(scale.newGamePlusReference!==undefined)choice(scale.newGamePlusReference,['allied-mean'],'enemy reference');if(scale.referencePilots!==undefined)for(const id of array(scale.referencePilots,'reference pilots'))refs(id,new Set(content.pilots.map(p=>p.id)),'reference pilot');}
  const map = obj(s.map, 'stage.map');
  const w = num(map.w, 'stage.map.w', 1, Infinity, true), h = num(map.h, 'stage.map.h', 1, Infinity, true);
  const tiles = array(map.tiles, 'stage.map.tiles');
  if (tiles.length !== h) fail('stage.map.tiles', `expected ${h} rows`);
  const terrains = new Set(content.terrain.map(t => t.id));
  tiles.forEach((v, y) => {
    const row = array(v, `stage.map.tiles[${y}]`);
    if (row.length !== w) fail(`stage.map.tiles[${y}]`, `expected ${w} columns`);
    row.forEach((v, x) => refs(v, terrains, `stage.map.tiles[${y}][${x}]`));
  });
  const units = array(s.units, 'stage.units'); idSet(units, 'stage.units');
  if(s.aiPatterns!==undefined)validatePatterns(s.aiPatterns,s as unknown as Stage);
  const pilots = new Set(content.pilots.map(p => p.id)), mechs = new Set(content.mechs.map(m => m.id));
  const occupied = new Set<string>();
  units.forEach((v, i) => {
    const p = `stage.units[${i}]`, u = obj(v, p);
    refs(u.pilotId, pilots, `${p}.pilotId`); refs(u.mechId, mechs, `${p}.mechId`);
    choice(u.side, sides, `${p}.side`); optional(u, 'ai', (v, p) => choice(v, aiTypes, p), p);
    validateLoadout(u,p,content);
    point(u, p, w, h);
    const key = `${u.x},${u.y}`;
    if (occupied.has(key)) fail(p, 'occupied deployment cell'); occupied.add(key);
    const mech = effectiveMech({content} as BattleState,{...u,effects:[]} as unknown as import('./types').Unit);
    const tile = content.terrain.find(t => t.id === (tiles[u.y as number] as string[])[u.x as number])!;
    if (!mech.moveType.includes('air') && !mech.moveType.some(type => tile.moveCost[type] !== null)) fail(p, 'impassable deployment cell');
  });
  const crew=new Set<string>();for(const value of units){const u=value as import('./types').StageUnit,m=content.mechs.find(m=>m.id===u.mechId)!;for(const id of m.subPilots??[]){if(crew.has(id)||units.some(v=>(v as Obj).pilotId===id))fail('stage.units','sub pilot is deployed twice');crew.add(id);}}
}
function point(o: Obj, p: string, w: number, h: number): void {
  num(o.x, `${p}.x`, 0, w - 1, true); num(o.y, `${p}.y`, 0, h - 1, true);
}
function validatePatterns(value:unknown,stage:Stage):void {
  const p='stage.aiPatterns',o=obj(value,p);known(o,['default','groups','units'],p);
  const behavior=(value:unknown,path:string)=>{
    const b=obj(value,path);known(b,['pattern','anchor','anchorUnit','radius','target','area','when'],path);
    choice(b.pattern,['aggressive','hold','guard','ambush','boss','objective','retreat'],path+'.pattern');
    for(const k of ['anchor','target'])if(b[k]!==undefined)point(obj(b[k],path+'.'+k),path+'.'+k,stage.map.w,stage.map.h);
    if(b.radius!==undefined)num(b.radius,path+'.radius',0,Infinity,true);
    if(b.anchorUnit!==undefined)str(b.anchorUnit,path+'.anchorUnit');
    if(b.area!==undefined)refs(b.area,new Set(Object.keys(stage.areas??{})),path+'.area');
    if(b.pattern==='objective'&&b.target===undefined&&b.area===undefined)fail(path,'objective requires target or area');
    if(b.when!==undefined)array(b.when,path+'.when').forEach((v,i)=>{const q=obj(v,path+'.when.'+i);known(q,['turn','hpBelow','area','variable'],path);if(!Object.keys(q).length)fail(path,'empty trigger');if(q.turn!==undefined)num(q.turn,path+'.turn',1,Infinity,true);if(q.hpBelow!==undefined)num(q.hpBelow,path+'.hpBelow',0,1);if(q.area!==undefined)refs(q.area,new Set(Object.keys(stage.areas??{})),path+'.area');if(q.variable!==undefined){const a=obj(q.variable,path+'.variable');known(a,['name','equals'],path);str(a.name,path);if(!['string','number','boolean'].includes(typeof a.equals))fail(path,'invalid variable value');}});
  };
  if(o.default!==undefined)behavior(o.default,p+'.default');
  if(o.units!==undefined)for(const [id,b]of Object.entries(obj(o.units,p+'.units')))behavior(b,p+'.units.'+id);
  if(o.groups!==undefined)array(o.groups,p+'.groups').forEach((v,i)=>{const g=obj(v,p+'.groups.'+i);known(g,['id','ids','tags','behavior'],p);str(g.id,p);if(!g.ids&&!g.tags)fail(p,'group requires ids or tags');for(const k of ['ids','tags'])if(g[k]!==undefined)array(g[k],p).forEach(v=>str(v,p));behavior(g.behavior,p+'.groups.'+i+'.behavior');});
}
export function validateEffect(value: unknown, p = 'effect'): asserts value is Effect {
  const e = obj(value, p); str(e.id, `${p}.id`); str(e.source, `${p}.source`);
  known(e, ['id', 'source', 'duration', 'hooks', 'atoms', 'lifetime', 'definitionId'], p);
  if(e.definitionId!==undefined)str(e.definitionId,`${p}.definitionId`);
  if(e.atoms !== undefined) validateAtoms(e.atoms,`${p}.atoms`);
  if(e.lifetime!==undefined) choice(e.lifetime,['instant','nextAttack','nextHitTaken','turn','passive'],`${p}.lifetime`);
  {
  const d = obj(e.duration, `${p}.duration`); choice(d.unit, ['round', 'use'], `${p}.duration.unit`);
  known(d, ['unit', 'remaining'], `${p}.duration`);
  num(d.remaining, `${p}.duration.remaining`, 1, Infinity, true);
  }
  const hooks = obj(e.hooks, `${p}.hooks`);
  for (const [key, value] of Object.entries(hooks)) {
    choice(key, ['onRoundStart', 'onBeforeMove', 'modifyHit', 'modifyDamage', 'modifyCrit', 'onAfterAttack', 'onDefeated'], `${p}.hooks.${key}`);
    const h = obj(value, `${p}.hooks.${key}`);
    known(h, ['op', 'value', 'role'], `${p}.hooks.${key}`);
    choice(h.op, ['set', 'add', 'multiply'], `${p}.hooks.${key}.op`);
    choice(h.role, ['owner', 'attacker', 'defender'], `${p}.hooks.${key}.role`);
    num(h.value, `${p}.hooks.${key}.value`);
  }
}

/** Validate structure and local invariants, never replay commands to judge provenance. */
export function validateSnapshot(value: unknown, content: Content, stage: Stage): asserts value is Snapshot {
  const o = obj(value, 'snapshot');
  known(o, ['version', 'contentVersion', 'stageId', 'battle'], 'snapshot');
  if (o.version !== 'm2-save-2') fail('snapshot.version', 'expected m2-save-2');
  if (o.contentVersion !== content.version) fail('snapshot.contentVersion', `expected ${content.version}`);
  if (o.stageId !== stage.id) fail('snapshot.stageId', `expected ${stage.id}`);
  const b = obj(o.battle, 'snapshot.battle');
  known(b, ['round', 'rng', 'phase', 'outcome', 'options', 'units', 'pending', 'credits','weaponLimits'], 'snapshot.battle');
  optional(b,'weaponLimits',(v,p)=>{for(const n of Object.values(obj(v,p)))num(n,p,0,Infinity,true);},'snapshot.battle');
  optional(b,'credits',(v,p)=>num(v,p,0,Infinity,true),'snapshot.battle');
  num(b.round, 'snapshot.battle.round', 1, Infinity, true);
  num(b.rng, 'snapshot.battle.rng', 0, 0xffffffff, true);
  choice(b.phase, ['player', 'enemy'], 'snapshot.battle.phase');
  if (b.outcome !== null) choice(b.outcome, ['victory', 'defeat'], 'snapshot.battle.outcome');
  const options = obj(b.options, 'snapshot.battle.options');
  known(options, ['autoResponse'], 'snapshot.battle.options');
  bool(options.autoResponse, 'snapshot.battle.options.autoResponse');
  const units = array(b.units, 'snapshot.battle.units'); idSet(units, 'snapshot.battle.units');
  if (!stage.scenario && units.filter(v=>!(v as Obj).summonedBy).length !== stage.units.length) fail('snapshot.battle.units', 'unit roster length mismatch');
  const occupied = new Set<string>();
  units.forEach((v, i) => {
    const p = `snapshot.battle.units[${i}]`, u = obj(v, p), initial = stage.units[i];
    known(u, ['id', 'pilotId', 'mechId', 'side', 'x', 'y', 'ai', 'tags', 'removed', 'hp', 'en', 'ammo', 'morale', 'sp', 'moved', 'acted', 'alive', 'moveOrigin', 'moveCommitted', 'effects', 'level', 'exp', 'upgrades', 'parts', 'fullUpgradeBonus', 'supportAttackUsed', 'supportDefenseUsed', 'usedItems', 'aiSpiritsUsed', 'transformedRound', 'formId', 'combined', 'revealed','actionsRemaining','actionsSpent','extraActionsUsed','deviceUses','subPilots','subPilotProgress','pilotOverrides','supportExperience','supportBonusUsed','aiFinisherUses','aiAlerted','weaponUses','summonedBy','recruited'], p); optional(u,'aiAlerted',bool,p);optional(u,'recruited',bool,p);if(u.recruited&&(u.side!=='player'||!content.mechs.find(m=>m.id===u.mechId)?.allyStats))fail(p,'invalid allied recruitment');
    if(u.summonedBy){validateSummoned(u,b,stage,content,p);}
    else if (!stage.scenario) {
      for (const key of ['id', 'pilotId', 'mechId', 'side', 'ai'] as const) if (!(key==='mechId' && u.combined) && !(key==='side'&&u.recruited&&u.side==='player'&&initial.side!=='player') && u[key] !== initial[key]) fail(`${p}.${key}`, 'stage roster mismatch');
    } else {
      const definition = [...stage.units, ...(stage.definitions ?? []), ...Object.values(stage.waves ?? {}).flat()].find(d => d.id === u.id);
      if (!definition || definition.pilotId !== u.pilotId || definition.mechId !== u.mechId && !u.combined) fail(p, 'unknown scenario unit');
      choice(u.side, sides, `${p}.side`); optional(u, 'ai', (v, p) => choice(v, aiTypes, p), p);
      optional(u, 'removed', bool, p);
    }
    validateLoadout(u,p,content);
    if(!content.mechs.some(m=>m.id===u.mechId) || !content.pilots.some(a=>a.id===u.pilotId)) fail(p,'unknown unit entity');
    const projection={...b,content,stage} as unknown as BattleState;
    const typed=u as unknown as import('./types').Unit;
    array(u.effects,`${p}.effects`).forEach((e,j)=>validateEffect(e,`${p}.effects[${j}]`));
    const mech=effectiveMech(projection,typed),pilot=effectivePilot(projection,typed);
    if(u.formId!==undefined && !content.mechs.find(m=>m.id===u.mechId)!.forms?.some(f=>f.id===u.formId)) fail(p,'unknown form');
    optional(u,'weaponUses',(v,p)=>{for(const row of Object.values(obj(v,p))){const r=obj(row,p);known(r,['round','uses'],p);num(r.round,p,1,b.round as number,true);num(r.uses,p,1,Infinity,true);}},p);
    for(const key of ['supportAttackUsed','supportDefenseUsed','transformedRound','aiFinisherUses']) optional(u,key,(v,p)=>num(v,p,0,Infinity,true),p);
    if(u.usedItems!==undefined) {const slots=array(u.usedItems,`${p}.usedItems`);if(new Set(slots).size!==slots.length)fail(p,'duplicate used item');slots.forEach(v=>{num(v,p,0,(u.parts as unknown[]).length-1,true);const part=content.parts?.find(a=>a.id===(u.parts as string[])[v as number]);if(part?.kind!=='consumable')fail(p,'invalid used item');});}
    if(u.aiSpiritsUsed!==undefined) array(u.aiSpiritsUsed,`${p}.aiSpiritsUsed`).forEach(v=>refs(v,new Set(content.spirits?.map(x=>x.id)),p));
    if(u.combined!==undefined) {
      const combined=obj(u.combined,`${p}.combined`),def=content.combinations?.find(c=>c.id===combined.combinationId);
      const members=array(combined.members,`${p}.combined.members`) as import('./types').Unit[];
      if(!def || def.result!==u.mechId || members.length!==def.parts.length || !members.some(m=>m.id===u.id) || new Set(members.map(m=>m.id)).size!==members.length || members.some(m=>m.combined || !units.some(v=>(v as Obj).id===m.id)) || [...members.map(m=>m.mechId)].sort().join(',')!==[...def.parts].sort().join(',')) fail(p,'invalid combination');
      for(const m of members) {validateLoadout(m as unknown as Obj,p,content);if(!content.pilots.some(a=>a.id===m.pilotId))fail(p,'invalid member pilot');const max=effectiveMech(projection,m);num(m.hp,p,1,max.hp,true);num(m.en,p,0,max.en,true);array(m.effects,p).forEach(e=>validateEffect(e,p));}
    }
    validateUnitBalance(typed,projection,p);
    num(u.hp, `${p}.hp`, 0, mech.hp, true); num(u.en, `${p}.en`, 0, mech.en, true);
    num(u.sp, `${p}.sp`, 0, pilot.sp, true); num(u.morale, `${p}.morale`, content.rules.morale.min, content.rules.morale.max + sumAtom(projection,typed,'moraleCapAdd'));
    optional(u,'revealed',bool,p);
    for (const key of ['moved', 'acted', 'alive']) bool(u[key], `${p}.${key}`);
    if (u.alive !== ((u.hp as number) > 0 && !u.removed)) fail(`${p}.alive`, 'must equal hp > 0 and present');
    point(u, p, stage.map.w, stage.map.h);
    if (u.alive) {
      const key = `${u.x},${u.y}`;
      if (occupied.has(key)) fail(p, 'living units overlap'); occupied.add(key);
      const tile = content.terrain.find(t => t.id === stage.map.tiles[u.y as number][u.x as number])!;
      if (!mech.moveType.includes('air') && !mech.moveType.some(type => tile.moveCost[type] !== null)) fail(p, 'unit on impassable terrain');
    }
    optional(u,'moveCommitted',bool,p);
    if(u.moveCommitted && (!u.moved || u.moveOrigin))fail(p,'invalid committed move');
    if (u.moveOrigin !== null) {
      const origin = obj(u.moveOrigin, `${p}.moveOrigin`);
      known(origin, ['x', 'y'], `${p}.moveOrigin`);
      point(origin, `${p}.moveOrigin`, stage.map.w, stage.map.h);
      if (origin.x === u.x && origin.y === u.y) fail(`${p}.moveOrigin`, 'origin equals destination');
      if (!u.moved || u.acted) fail(`${p}.moveOrigin`, 'requires moved and not acted');
    } else if (u.moved && !u.acted && u.alive && !u.moveCommitted) fail(`${p}.moveOrigin`, 'missing undo origin');
    const ammo = obj(u.ammo, `${p}.ammo`);
    const original=content.mechs.find(m=>m.id===u.mechId)!;
    const ammoIds = [...new Set([...original.weapons,...(original.forms??[]).flatMap(f=>f.overrides.weapons??[])])].filter(id => content.weapons.find(w => w.id === id)!.ammo !== undefined);
    if (Object.keys(ammo).length !== ammoIds.length) fail(`${p}.ammo`, 'ammo weapon keys mismatch');
    ammoIds.forEach(id => num(ammo[id], `${p}.ammo.${id}`, 0, content.weapons.find(w => w.id === id)!.ammo!, true));
    const effects = array(u.effects, `${p}.effects`); idSet(effects, `${p}.effects`);
    effects.forEach((e, j) => validateEffect(e, `${p}.effects[${j}]`));
  });
  const typedUnits = units as BattleState['units'];
  const crewIds=new Set<string>();for(const u of typedUnits.filter(u=>u.alive))for(const sub of u.subPilots??[]){if(crewIds.has(sub.pilotId)||typedUnits.some(v=>v.alive&&v.pilotId===sub.pilotId))fail('snapshot.battle.units','sub pilot is deployed twice');crewIds.add(sub.pilotId);}
  const expected = !typedUnits.some(u => u.alive && u.side === 'player') ? 'defeat' : !typedUnits.some(u => u.alive && u.side === 'enemy') ? 'victory' : null;
  if (!stage.scenario && b.outcome !== expected) fail('snapshot.battle.outcome', 'inconsistent with surviving units');
  if (b.pending !== null) {
    const p = 'snapshot.battle.pending', pending = obj(b.pending, p);
    known(pending, ['type', 'attackerId', 'targetId', 'weaponId', 'supportAttackerId'], p);
    if (pending.type !== 'response') fail(`${p}.type`, 'expected response');
    const a = typedUnits.find(u => u.id === pending.attackerId), d = typedUnits.find(u => u.id === pending.targetId);
    if (!a?.alive || a.side !== 'enemy' || a.acted || b.phase !== 'enemy' || !d?.alive || d.side !== 'player' || b.outcome !== null) fail(p, 'invalid response participants or phase');
    const projection={...b,content,stage} as unknown as BattleState, mech=effectiveMech(projection,a);
    refs(pending.weaponId, new Set(mech.weapons), `${p}.weaponId`);
    if(pending.supportAttackerId!==undefined) {
      const helper=typedUnits.find(u=>u.id===pending.supportAttackerId);
      if(!helper?.alive||helper.id===a.id||helper.side!==a.side||Math.abs(helper.x-a.x)+Math.abs(helper.y-a.y)!==1||(helper.supportAttackUsed??0)>=sumAtom(projection,helper,'supportAttack'))fail(p,'invalid pending support');
      const m=effectiveMech(projection,helper);
      if(!m.weapons.some(id=>{const w=content.weapons.find(w=>w.id===id)!,dist=Math.abs(helper.x-d.x)+Math.abs(helper.y-d.y);return !w.map&&dist>=w.range[0]&&dist<=w.range[1]+sumAtom(projection,helper,'rangeAdd')&&helper.en>=(w.en??0)&&(w.ammo===undefined||helper.ammo[id]>0)&&effectiveMorale(projection,helper)>=(w.moraleReq??0);}))fail(p,'unusable pending support');
    }
    const w = content.weapons.find(w => w.id === pending.weaponId)!;
    const dist = Math.abs(a.x - d.x) + Math.abs(a.y - d.y);
    if (dist < w.range[0] || dist > w.range[1]+sumAtom(projection,a,'rangeAdd') || a.en < (w.en ?? 0) || (w.ammo !== undefined && a.ammo[w.id] < 1) || effectiveMorale(projection,a) < (w.moraleReq ?? 0) || (a.moved && !w.postMove)) fail(p, 'unusable pending weapon');
  }
}

const durations=['instant','nextAttack','nextHitTaken','turn','passive'];
const atomTypes=['hitAdd','evadeAdd','hitSet','evadeAll','damageMul','takenMul','takenSet','critSet','moraleAdd','moraleOffset','moraleGainAdd','moraleCapAdd','hpRestore','enRestore','spRestore','moveAdd','rangeAdd','extraAction','scan','resupply','ammoRestore','hpRegen','enRegen','pilotStatSet','expMul','creditMul','statAdd','adaptSet','supportAttack','supportDefense','spRegen'];
export function validateAtoms(value: unknown,p='effects'): void {
  array(value,p).forEach((v,i)=>{
    const a=obj(v,`${p}[${i}]`);known(a,['type','value'],p);choice(a.type,atomTypes,`${p}[${i}].type`);
    if(a.type==='evadeAll'||a.type==='extraAction'||a.type==='scan'||a.type==='resupply'||a.type==='ammoRestore') return;
    if(a.type==='pilotStatSet'){const v=obj(a.value,p);known(v,['melee','shoot','hit','evade','skill','defense'],p);for(const n of Object.values(v))num(n,p,0);}
    else if(a.type==='statAdd') {const v=obj(a.value,p);known(v,['hp','en','armor','mobility','move','sp','weapons'],p);for(const n of Object.values(v))num(n,p);}
    else if(a.type==='adaptSet') {const v=obj(a.value,p);known(v,environments,p);for(const n of Object.values(v))choice(n,grades,p);}
    else if(a.type==='hpRestore'||a.type==='enRestore'||a.type==='hpRegen'||a.type==='enRegen') {const v=obj(a.value,p);known(v,['pct','flat'],p);if(!Object.keys(v).length)fail(p,'restore amount required');for(const n of Object.values(v))num(n,p,0);}
    else {num(a.value,p);if(['damageMul','takenMul','expMul','creditMul','takenSet','supportAttack','supportDefense','spRegen'].includes(a.type as string))num(a.value,p,0);if(['hitSet','critSet'].includes(a.type as string))num(a.value,p,0,100);}
  });
}
export function validateLoadout(u: Obj,p: string,c: Content): void {
  optional(u,'level',(v,p)=>num(v,p,1,c.rules.levelMax,true),p);optional(u,'exp',(v,p)=>num(v,p,0,c.rules.expPerLevel-1,true),p);
  if(u.upgrades!==undefined) {const v=obj(u.upgrades,p);known(v,['hp','en','armor','mobility','weapons'],p);for(const k of ['hp','en','armor','mobility','weapons'])num(v[k],`${p}.upgrades.${k}`,0,Math.max(c.rules.deploymentUpgradeMax??0,c.rules.upgradeMax,c.rules.upgradeLimits?.[k as keyof import('./types').Upgrades]?.newGamePlusMax??0,c.rules.upgradeLimits?.[k as keyof import('./types').Upgrades]?.max??0),true);}
  if(u.subPilotProgress!==undefined)for(const v of array(u.subPilotProgress,p+'.subPilotProgress')){const sub=obj(v,p);refs(sub.pilotId,new Set(c.pilots.map(p=>p.id)),p);num(sub.level,p,1,c.rules.levelMax,true);num(sub.exp,p,0,c.rules.expPerLevel-1,true);}
  if(u.parts!==undefined) {const parts=array(u.parts,p),max=c.mechs.find(m=>m.id===u.mechId)?.partSlots??0;if(parts.length>max)fail(p,'part slots exceeded');parts.forEach(v=>{if(v!==null)refs(v,new Set(c.parts?.map(x=>x.id)),p);});}
  if(u.fullUpgradeBonus!==undefined) {refs(u.fullUpgradeBonus,new Set(c.fullUpgradeBonuses?.map(x=>x.id)),p);if(!u.upgrades || Object.values(u.upgrades as Obj).some(n=>(n as number)<c.rules.fullUpgradeThreshold))fail(p,'bonus requires full upgrade');}
}
function validateExtensions(c: Content): void {
  for(const key of ['spirits','skills','parts','fullUpgradeBonuses'] as const) if(c[key]) {
    idSet(c[key]!,`content.${key}`);
    c[key]!.forEach((def,i)=>{const p=`content.${key}[${i}]`;identity(def as unknown as Obj,p);str(def.desc,`${p}.desc`);validateAtoms(def.effects,`${p}.effects`);
      if(key==='spirits') {const d=def as import('./types').Spirit;num(d.sp,p,0,Infinity,true);choice(d.duration,durations,p);choice(d.target,['self','ally','allAllies','enemy'],p);}
      if(key==='parts') {const d=def as import('./types').Part;choice(d.kind,['passive','consumable'],p);if(d.duration)choice(d.duration,durations,p);}
      if(key==='skills') for(const [level,atoms] of Object.entries((def as import('./types').Skill).levels??{})) {if(!/^[1-9]\d*$/.test(level))fail(p,'invalid skill level');validateAtoms(atoms,p);}
    });
  }
  for(const p of c.pilots) {
    if(p.growth) for(const [key,n] of Object.entries(p.growth)) {choice(key,Object.keys(p.stats),'pilot.growth');num(n,'pilot.growth',0);}
    if(p.spGrowth!==undefined)num(p.spGrowth,'pilot.spGrowth',0,Infinity,true);
    for(const x of p.spirits??[]) {refs(x.id,new Set(c.spirits?.map(d=>d.id)),'pilot.spirits');num(x.level,'pilot.spirits.level',1,c.rules.levelMax,true);}
    for(const x of p.skills??[]) {const d=c.skills?.find(d=>d.id===x.id);if(!d || d.levels && !d.levels[String(x.level??1)])fail('pilot.skills','unknown skill or level');}
    for(const x of p.aiSpirits??[]) {if(!p.spirits?.some(d=>d.id===x.id))fail('pilot.aiSpirits','spirit not learned');if(!/^(start|morale>=\d+|hp<\d+%)$/.test(x.when))fail('pilot.aiSpirits','invalid condition');}
  }
  for(const m of c.mechs) {
    if(m.allyStats){const o=m.allyStats;known(o,['hp','en','armor','mobility','move','weapons','forms','weaponPower'],'mech.allyStats');for(const key of ['hp','en','armor','mobility','move'] as const)if(o[key]!==undefined)num(o[key],'mech.allyStats.'+key,key==='hp'?1:0,Infinity,true);o.weapons?.forEach(id=>refs(id,new Set(c.weapons.map(w=>w.id)),'mech.allyStats.weapons'));for(const [id,power]of Object.entries(o.weaponPower??{})){refs(id,new Set(c.weapons.map(w=>w.id)),'mech.allyStats.weaponPower');num(power,'mech.allyStats.weaponPower',0,Infinity,true);}}
    if(m.partSlots!==undefined)num(m.partSlots,'mech.partSlots',1,4,true);
    if(m.costClass!==undefined)num(m.costClass,'mech.costClass',1,3,true);
    for(const key of ['exp','credits'] as const)if(m[key]!==undefined)num(m[key],`mech.${key}`,0,Infinity,true);
    for(const forms of [m.forms,m.allyStats?.forms])if(forms) {idSet(forms,'mech.forms');for(const f of forms) {str(f.name,'form.name');const o=f.overrides;known(o,['hp','en','move','moveType','adapt','mobility','armor','weapons','size','enRecovery'],'form.overrides');for(const key of ['hp','en','move','mobility','armor'] as const)if(o[key]!==undefined)num(o[key],'form.stat',key==='hp'?1:0,Infinity,true);if(o.adapt)adapt(o.adapt,'form.adapt');if(o.size)choice(o.size,sizes,'form.size');if(o.moveType){if(!o.moveType.length)fail('form.moveType','empty types');o.moveType.forEach(v=>choice(v,environments,'form.moveType'));}o.weapons?.forEach(id=>refs(id,new Set(c.weapons.map(w=>w.id)),'form.weapons'));}}
    for(const f of m.aiForm??[]) {if(!m.forms?.some(d=>d.id===f.formId)||!/^(start|morale>=\d+|hp<\d+%)$/.test(f.when))fail('mech.aiForm','invalid form or condition');}
  }
  for(const w of c.weapons) if(w.map){choice(w.map.shape,['burst','line','area'],'weapon.map.shape');num(w.map.size,'weapon.map.size',1,Infinity,true);bool(w.map.friendlyFire,'weapon.map.friendlyFire');}
  if(c.combinations)idSet(c.combinations,'combinations');
  for(const d of c.combinations??[]){if(d.parts.length<2)fail('combination','needs at least two members');for(const id of [...d.parts,d.result])refs(id,new Set(c.mechs.map(m=>m.id)),'combination');}
}

function validateBalance(c:Content):void {
  const r=c.rules,p='rules';
  if(r.combatMoraleCap!==undefined)num(r.combatMoraleCap,p+'.combatMoraleCap',0);
  if(r.supportExperience){const x=r.supportExperience;for(const k of ['levelGapBonus','maxPerAction','minMissingEnPct','minMissingHpPct','maxPerStage','levelCeiling']as const)num(x[k],p+'.supportExperience.'+k,0);for(const v of Object.values(x.firstBonus))num(v,p+'.supportExperience.firstBonus',0,Infinity,true);x.regularPilots.forEach(id=>refs(id,new Set(c.pilots.map(p=>p.id)),p));}
  if(r.recoveryTiming!==undefined)choice(r.recoveryTiming,['round','phase'],p+'.recoveryTiming');
  if(r.consumablePolicy!==undefined)choice(r.consumablePolicy,['stage','consume'],p+'.consumablePolicy');
  if(r.actions){const a=r.actions;num(a.count,p+'.actions.count',1,3,true);if(a.stat!==undefined){choice(a.stat,['skill','melee','shoot','hit','evade','defense'],p+'.actions.stat');num(a.threshold,p+'.actions.threshold',0);}if(a.level!==undefined)num(a.level,p+'.actions.level',1,r.levelMax,true);if(!a.stat&&a.level===undefined)fail(p+'.actions','requires stat or level');if(a.extraMax!==undefined)num(a.extraMax,p+'.actions.extraMax',0,3,true);}
  for(const [key,v]of Object.entries({critical:r.critical,skillActivation:r.skillActivation}))if(v){choice(v.stat,['skill','melee','shoot','hit','evade','defense'],p+'.'+key);num(v.coefficient,p,0);num(v.min,p,0,100);num(v.max,p,v.min,100);}
  for(const [key,v]of Object.entries(r.upgradeLimits??{})){choice(key,['hp','en','armor','mobility','weapons'],p+'.upgradeLimits');num(v.max,p,1,99,true);if(v.newGamePlusMax!==undefined)num(v.newGamePlusMax,p,v.max,99,true);if(v.costs.length<(v.newGamePlusMax??v.max))fail(p,'upgradeLimits costs do not cover cap');v.costs.forEach(n=>num(n,p,0,Infinity,true));}
  if(r.retryOnDefeat){const keep=array(r.retryOnDefeat.keep,p+'.retryOnDefeat.keep');if(new Set(keep).size!==keep.length)fail(p,'duplicate retry keep');keep.forEach(v=>choice(v,['exp','credits'],p));}
    if(r.enemyUpgrades){for(const cap of [r.enemyUpgrades.armorCap,r.enemyUpgrades.mobilityCap])if(cap!==undefined)num(cap,p,0,Number.MAX_SAFE_INTEGER,true);for(const divisor of [r.enemyUpgrades.armorDivisor,r.enemyUpgrades.mobilityDivisor])if(divisor!==undefined)num(divisor,p,1,Number.MAX_SAFE_INTEGER,true);num(r.enemyUpgrades.weaponDivisor,p,1,Number.MAX_SAFE_INTEGER,true);}
    if(r.newGamePlus?.enemyUpgradeOffsetPerCycle!==undefined)num(r.newGamePlus.enemyUpgradeOffsetPerCycle,p,0,Number.MAX_SAFE_INTEGER,true);
    if(r.newGamePlus){const carry=array(r.newGamePlus.carry,p+'.newGamePlus.carry');if(new Set(carry).size!==carry.length)fail(p,'duplicate carry');carry.forEach(v=>choice(v,['upgrades','credits','parts','levels','training'],p));}
  if(r.ai.resources){num(r.ai.resources.ammoBonus,p,0);num(r.ai.resources.reservePenalty,p,0,1);bool(r.ai.resources.reserveFinisher,p);if(r.ai.resources.finisherMorale!==undefined)num(r.ai.resources.finisherMorale,p,0);}
  const pilots=new Set(c.pilots.map(p=>p.id));
  for(const pilot of c.pilots)for(const [key,curve]of Object.entries(pilot.statCurves??{})){
    choice(key,Object.keys(pilot.stats),'pilot.statCurves');if(!Array.isArray(curve)||!curve.length)fail('pilot.statCurves','nonempty curve required');let previous=0;for(const pt of curve){num(pt.level,'curve.level',previous+1,r.levelMax,true);num(pt.value,'curve.value',0);previous=pt.level;}
  }
  for(const m of c.mechs){
    if(m.hpRecovery)validateAtoms([{type:'hpRegen',value:m.hpRecovery}],'mech.hpRecovery');
  if(m.enRecovery)validateAtoms([{type:'enRegen',value:m.enRecovery}],'mech.enRecovery');
    if(m.subPilots){if(new Set(m.subPilots).size!==m.subPilots.length)fail('mech.subPilots','duplicate pilot');m.subPilots.forEach(id=>refs(id,pilots,'mech.subPilots'));}
    if(m.devices){idSet(m.devices,'mech.devices');for(const d of m.devices){identity(d as unknown as Obj,'device');choice(d.kind,['resupply','repair'],'device.kind');d.uses!==null&&num(d.uses,'device.uses',1,Infinity,true);if(d.en!==undefined)num(d.en,'device.en',0,Infinity,true);bool(d.postMove,'device.postMove');num(d.experience,'device.experience',0,Infinity,true);if(d.morale!==undefined)num(d.morale,'device.morale');if(d.kind==='repair'){if(!d.amount)fail('device.amount','repair amount required');validateAtoms([{type:'hpRestore',value:d.amount}],'device.amount');}}}
  }
  for(const spirit of c.spirits??[]){if(spirit.spPct!==undefined)num(spirit.spPct,'spirit.spPct',0,100);if(spirit.experience!==undefined)num(spirit.experience,'spirit.experience',0,Infinity,true);}
  for(const skill of c.skills??[])if(skill.activation){const a=skill.activation;choice(a.hook,['attack','defense','counter'],'skill.activation.hook');num(a.base,'skill.activation.base');for(const key of ['coefficient','baseline','min','max','level','morale'] as const)if(a[key]!==undefined)num(a[key],'skill.activation.'+key,0);if((a.min??0)>(a.max??100)||(a.max??100)>100)fail('skill.activation','invalid bounds');validateAtoms(a.effects,'skill.activation.effects');if(a.effects.some(a=>!['hitAdd','evadeAdd','hitSet','evadeAll','damageMul','takenMul','takenSet','critSet'].includes(a.type)))fail('skill.activation','only strike modifiers are supported');}
}
function validateUnitBalance(u:import('./types').Unit,s:BattleState,p:string):void {
  if(u.supportExperience!==undefined)num(u.supportExperience,p+'.supportExperience',0,s.content.rules.supportExperience?.maxPerStage??Infinity,true);if(u.supportBonusUsed!==undefined)bool(u.supportBonusUsed,p+'.supportBonusUsed');
  if(u.pilotOverrides){const o=u.pilotOverrides;known(o as unknown as Obj,['stats','growth','startMorale','clearOnJoin'],p+'.pilotOverrides');for(const r of [o.stats,o.growth])if(r)for(const [k,v]of Object.entries(r)){choice(k,['skill','melee','shoot','hit','evade','defense'],p+'.pilotOverrides');num(v,p+'.pilotOverrides',0);}if(o.startMorale!==undefined)num(o.startMorale,p,0,150);if(o.clearOnJoin!==undefined)bool(o.clearOnJoin,p);
}
  const max=s.content.rules.actions;
  if(max||u.actionsRemaining!==undefined){num(u.actionsRemaining,p+'.actionsRemaining',0,(max?.count??1)+(max?.extraMax??1),true);num(u.actionsSpent,p+'.actionsSpent',0,Infinity,true);num(u.extraActionsUsed,p+'.extraActionsUsed',0,max?.extraMax??1,true);if(u.acted!==(u.actionsRemaining===0))fail(p,'acted does not match actionsRemaining');}
  const m=s.content.mechs.find(m=>m.id===u.mechId)!;
  if(m.devices?.length||u.deviceUses!==undefined){const uses=obj(u.deviceUses,p+'.deviceUses');known(uses,m.devices?.map(d=>d.id)??Object.keys(uses),p);for(const d of m.devices??[])d.uses!==null&&num(uses[d.id],p+'.deviceUses.'+d.id,0,d.uses,true);}
  if(u.subPilots!==undefined||m.subPilots?.length){const subs=array(u.subPilots,p+'.subPilots') as import('./types').SubPilot[],ids=subs.map(v=>v.pilotId);if(new Set(ids).size!==ids.length||ids.includes(u.pilotId))fail(p,'duplicate crew');if(!u.combined&&[...ids].sort().join(',')!==[...(m.subPilots??[])].sort().join(','))fail(p,'crew roster mismatch');for(const sub of subs){const pilot=s.content.pilots.find(p=>p.id===sub.pilotId);if(!pilot)fail(p,'unknown crew');num(sub.level,p,1,s.content.rules.levelMax,true);num(sub.exp,p,0,s.content.rules.expPerLevel-1,true);num(sub.sp,p,0,effectivePilot(s,{...u,pilotId:sub.pilotId,level:sub.level}).sp,true);}}
}

function validateWeaponSpecial(value:unknown,p:string):void {
 const e=obj(value,p);str(e.label,p+'.label');choice(e.kind,['status','drain','critical','summon','extraAction','restore'],p+'.kind');if(e.cooldown!==undefined)num(e.cooldown,p+'.cooldown',0,Infinity,true);
 const fields={status:['target','rounds','atoms'],drain:['ratio','max'],critical:[],summon:['limit','hpPct'],extraAction:[],restore:['target','radius','hpPct','enFlat','ammo']};known(e,['kind','label','cooldown',...fields[e.kind as keyof typeof fields]],p);
 if(e.kind==='status'){choice(e.target,['self','enemy'],p+'.target');num(e.rounds,p+'.rounds',1,Infinity,true);validateAtoms(e.atoms,p+'.atoms');}
 if(e.kind==='drain'){num(e.ratio,p+'.ratio',0,1);num(e.max,p+'.max',0,Infinity,true);}
 if(e.kind==='summon'){num(e.limit,p+'.limit',1,Infinity,true);num(e.hpPct,p+'.hpPct',1,100);}
 if(e.kind==='restore'){choice(e.target,['self','allies'],p+'.target');num(e.radius,p+'.radius',0,Infinity,true);for(const k of ['hpPct','enFlat','ammo'])if(e[k]!==undefined)num(e[k],p+'.'+k,0,k==='hpPct'?100:Infinity,true);}
}

function validateSummoned(u:Obj,b:Obj,stage:Stage,content:Content,p:string):void {
 const from=obj(u.summonedBy,p+'.summonedBy');known(from,['unitId','weaponId','ordinal'],p);const units=b.units as Obj[],parent=units.find(v=>v.id===from.unitId),w=content.weapons.find(w=>w.id===from.weaponId),e=w?.special;
 if(!parent||e?.kind!=='summon'||parent.id===u.id)fail(p,'invalid summon source');num(from.ordinal,p+'.ordinal',1,e.limit,true);
 if(u.id!==parent.id+'-summon-'+from.ordinal||u.mechId!==parent.mechId||u.pilotId!==parent.pilotId||u.side!==parent.side||!(u.tags as string[])?.includes('no-reward')||(b.weaponLimits as Record<string,number>)?.[w!.id]<(from.ordinal as number))fail(p,'invalid summon provenance/budget');
 num((b.weaponLimits as Record<string,number>)?.[w!.id],p+'.summonBudget',from.ordinal as number,e.limit,true);
 const seen=new Set<unknown>([u.id]);let ancestor:Obj|undefined=parent;while(ancestor?.summonedBy){if(seen.has(ancestor.id))fail(p,'cyclic summon');seen.add(ancestor.id);ancestor=units.find(v=>v.id===(ancestor!.summonedBy as Obj).unitId);}
 if(!ancestor||![...stage.units,...stage.definitions??[],...Object.values(stage.waves??{}).flat()].some(v=>v.id===ancestor!.id))fail(p,'unknown summon ancestor');
}
