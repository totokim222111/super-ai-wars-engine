import {supportWeapon,specialProblem,stampWeapon,applyWeaponSpecial} from './weapon-effects';
import { drainEnergy,weaponBounds,weaponFactor } from './gimmicks';
import type { AttackForecast, BattleEvent, BattleState, Forecast, Point, Response, Unit, Weapon, SupportCandidate, MapForecast, Direction } from './types';
import { attackAdaptation, clamp, compareId, distance, effectiveAdaptation, mechOf, pilotOf, terrainModifiers, unitById, weaponById } from './terrain';
import { consumeEffects, expireDuration, hookValue } from './effects';
import { atomsOf, sumAtom, mulAtom, setAtom, effectiveWeapon, effectiveMorale } from './modifiers';
import {experienceFor, gainExperience, gainCredits} from './progression';
import { inBounds } from './terrain';
import { nextRandom } from './rng';
import {finishAction} from './actions';
import {chanceVariants,rollSkills} from './chance';
import {policySide,selectResourceCandidate,resourceScore} from './resource-ai';
export function hostileTarget(s: BattleState, a: Unit, d: Unit): boolean {
  return d.alive && a.side !== 'neutral' && a.side !== d.side && (d.side !== 'neutral' || !!s.stage.scenario && a.side === 'enemy');
}

export function weaponProblem(s: BattleState, a: Unit, w: Weapon, d?: Unit, counter = false): string | null {
  w = effectiveWeapon(s,a,w);
  if(counter&&(w.special?.kind==='summon'||w.special?.kind==='extraAction'))return 'utility weapon cannot counter';
  if(supportWeapon(w))return 'support weapon requires weaponSkill';
  const special=specialProblem(s,a,w,d);if(special)return special;
  if (w.map && d) return 'MAP weapon requires mapAttack';
  if (!a.alive) return 'attacker is defeated';
  if (!mechOf(s, a).weapons.includes(w.id)) return 'weapon is not equipped';
  if (!counter && a.moved && !w.postMove) return 'non-P weapon cannot fire after moving';
  if (a.en < (w.en ?? 0)) return 'insufficient EN';
  if (w.ammo !== undefined && !(a.ammo[w.id] >= 1)) return 'insufficient ammo';
  if (effectiveMorale(s,a) < (w.moraleReq ?? 0)) return 'insufficient morale';
  if (d) {
    if (!hostileTarget(s, a, d)) return 'invalid target side or defeated target';
    const dist = distance(a, d);
    if (dist < w.range[0] || dist > w.range[1]) return 'target outside weapon range';
  }
  return null;
}
export function availableWeapons(s: BattleState, unitId: string, targetId?: string, counter = false): Weapon[] {
  const a = unitById(s, unitId), d = targetId ? unitById(s, targetId) : undefined;
  return mechOf(s, a).weapons.map(id => weaponById(s, id)).filter(w => !weaponProblem(s, a, w, d, counter));
}

/** Geometric weapon coverage, including empty cells; availability is a separate query. */
export function weaponRange(s: BattleState, unitId: string, weaponId: string): Point[] {
  const u = unitById(s, unitId), w = effectiveWeapon(s,u,weaponById(s, weaponId)), cells: Point[] = [];
  for (let y = 0; y < s.stage.map.h; y++) for (let x = 0; x < s.stage.map.w; x++) {
    const d = distance(u, { x, y });
    if (d >= w.range[0] && d <= w.range[1]) cells.push({ x, y });
  }
  return cells;
}

function values(s: BattleState, a: Unit, d: Unit, w: Weapon, response: Response): { hit: number; crit: number; damage: number; critical: number } {
  w = effectiveWeapon(s,a,w);
  const r = s.content.rules, k = r.k, ap = pilotOf(s, a), dp = pilotOf(s, d), dm = mechOf(s, d);
  const tile = terrainModifiers(s, d), ctx = { attackerId: a.id, defenderId: d.id };
  const accuracy = ap.stats.hit * k.hitPilot + w.hit + r.adaptHit[effectiveAdaptation(s, a)] + r.sizeHit[dm.size];
  const evasion = dp.stats.evade * k.evadePilot + (dm.mobility - k.mobilityBase) * k.evadeMobility;
  let hit = (k.hitBase + accuracy - evasion) * (1 + tile.hitMod / 100);
  if (response.type === 'evade') hit *= k.evadeResponse;
  hit = clamp(Math.round(hookValue(s, 'modifyHit', hit, ctx)), 0, 100);
  hit += sumAtom(s,a,'hitAdd') - sumAtom(s,d,'evadeAdd');
  hit = setAtom(s,a,'hitSet') ?? hit;
  if (atomsOf(s,d).some(a=>a.type==='evadeAll')) hit = 0;
  hit = clamp(Math.round(hit),0,100);
  const cr=r.critical,crit = clamp(setAtom(s,a,'critSet') ?? hookValue(s, 'modifyCrit', w.crit + (ap.stats[cr?.stat??'skill'] - dp.stats[cr?.stat??'skill']) * (cr?.coefficient??k.critSkill), ctx), cr?.min??0, cr?.max??100);
  const weaponCrit=w.special?.kind==='critical'?100:crit;
  const stat = w.kind === 'melee' ? ap.stats.melee : ap.stats.shoot;
  const atk = w.power * (stat + effectiveMorale(s,a)) / k.statDivisor * r.adaptDmg[attackAdaptation(s, a, w, d)];
  const def = dm.armor * (dp.stats.defense + effectiveMorale(s,d)) / k.statDivisor * r.adaptDmg[effectiveAdaptation(s, d)];
  const base = (atk - def) * r.sizeDmg[dm.size] * (1 + tile.damageMod / 100);
  const damage = (critical: boolean): number => hookValue(s, 'modifyDamage', base * (critical ? k.critMul : 1) * (response.type === 'defend' ? k.defendResponse : 1), ctx) * mulAtom(s,a,'damageMul') * mulAtom(s,d,'takenMul');
  return { hit, crit:weaponCrit, damage: damage(false), critical: damage(true) };
}
/** Roll is a unit interval value; endpoints are supported for boundary verification. */
export function damageAtRoll(s: BattleState, base: number, roll: number): number {
  if (!Number.isFinite(roll) || roll < 0 || roll > 1) throw new Error('damage roll: expected [0,1]');
  return Math.max(s.content.rules.k.minDamage, Math.floor(base * (1 - s.content.rules.k.spread + 2 * s.content.rules.k.spread * roll)));
}
export function attackForecast(s: BattleState, attackerId: string, targetId: string, weaponId: string, response: Response = { type: 'counter', weaponId }, counter = false): AttackForecast {
  const a = unitById(s, attackerId), d = unitById(s, targetId), w = weaponById(s, weaponId);
  const problem = weaponProblem(s, a, w, d, counter);
  if (problem) throw new Error(`attack: ${problem}`);
  return shotForecast(s,a,d,w,response,counter);
}
function shotForecast(s: BattleState, a: Unit, d: Unit, w: Weapon, response: Response,counter=false,plain=false): AttackForecast {
  if(!plain){const variants=chanceVariants(s,a,d,counter);if(variants.length!==1||variants[0].state!==s){
    const rows=variants.map(v=>({weight:v.weight,f:shotForecast(v.state,unitById(v.state,a.id),unitById(v.state,d.id),w,response,counter,true)}));
    return {hitRate:rows.reduce((n,r)=>n+r.f.hitRate*r.weight,0),critRate:rows.reduce((n,r)=>n+r.f.critRate*r.weight,0),damage:{min:Math.min(...rows.map(r=>r.f.damage.min)),max:Math.max(...rows.map(r=>r.f.damage.max))},criticalDamage:{min:Math.min(...rows.map(r=>r.f.criticalDamage.min)),max:Math.max(...rows.map(r=>r.f.criticalDamage.max))},expectedDamage:rows.reduce((n,r)=>n+r.f.expectedDamage*r.weight,0)};
  }}
  const v = values(s, a, d, w, response);
  const range = (base: number): { min: number; max: number } => ({ min: setAtom(s,d,'takenSet',true) ?? damageAtRoll(s, base*(weaponBounds(s,w)[0]), 0), max: setAtom(s,d,'takenSet',true) ?? damageAtRoll(s, base*(weaponBounds(s,w)[1]), 1) });
  const damage = range(v.damage), criticalDamage = range(v.critical);
  return { hitRate: v.hit, critRate: v.crit, damage, criticalDamage,
    expectedDamage: v.hit / 100 * ((damage.min + damage.max) / 2 * (1 - v.crit / 100) + (criticalDamage.min + criticalDamage.max) / 2 * v.crit / 100) };
}
/** Response policy is shared by the AI and manual-response previews. */
export function chooseResponse(s: BattleState, defenderId: string, attackerId: string): Response {
  const d = unitById(s, defenderId);
  const enemyPolicy=policySide(s,d)!=='player'?s.content.rules.ai.resources?.enemyResponse:undefined;
  if(enemyPolicy){const ratio=d.hp/mechOf(s,d).hp;if(ratio<=enemyPolicy.evadeHp)return {type:'evade'};if(ratio<=enemyPolicy.defendHp)return {type:'defend'};}
  if(!enemyPolicy&&s.content.rules.ai.resources?.safeResponse){const attacks=availableWeapons(s,attackerId,defenderId,true).map(w=>attackForecast(s,attackerId,defenderId,w.id,{type:'defend'},true));if(attacks.some(f=>f.hitRate>0&&f.criticalDamage.max>=d.hp))return {type:'evade'};if(d.hp/mechOf(s,d).hp<=.4||availableWeapons(s,attackerId,defenderId,true).some(w=>{const f=attackForecast(s,attackerId,defenderId,w.id,{type:'counter',weaponId:w.id},true);return f.hitRate>0&&f.criticalDamage.max>=d.hp;}))return {type:'defend'};}
  const candidates = availableWeapons(s, defenderId, attackerId, true).map(w => ({
    id:w.id,damage:attackForecast(s,defenderId,attackerId,w.id,{type:'counter',weaponId:w.id},true).expectedDamage,expected:(()=>{const f=attackForecast(s,defenderId,attackerId,w.id,{type:'counter',weaponId:w.id},true),target=unitById(s,attackerId);return f.expectedDamage<=0&&s.content.rules.ai.resources?-Infinity:resourceScore(s,d,w,f.expectedDamage,target.hp,{hitRate:f.hitRate,target,counterContext:true,kill:f.damage.max>=target.hp});})(),
  })).sort((a, b) => b.expected - a.expected || compareId(a.id, b.id));
  const choice=policySide(s,d)==='player'?candidates[0]:selectResourceCandidate(s,d,candidates,'expected','id');
  if (choice&&choice.expected!==-Infinity) return { type: 'counter', weaponId: choice.id };
  return { type: d.hp / mechOf(s, d).hp <= s.content.rules.ai.defendHp ? 'defend' : 'evade' };
}
export function forecast(s: BattleState, attackerId: string, targetId: string, weaponId: string, response = chooseResponse(s, targetId, attackerId), supports: {supportAttackerId?:string;supportDefenderId?:string} = {}): Forecast {
  if (response.type === 'counter') {
    const problem = weaponProblem(s, unitById(s, targetId), weaponById(s, response.weaponId), unitById(s, attackerId), true);
    if (problem) throw new Error(`counter: ${problem}`);
  }
  const supportAttackers=supportAttackCandidates(s,attackerId,targetId),supportDefenders=supportDefenseCandidates(s,attackerId,targetId,weaponId);
  const selectedSupportAttack=supportAttackers.find(c=>c.unitId===supports.supportAttackerId),selectedSupportDefense=supportDefenders.find(c=>c.unitId===supports.supportDefenderId);
  if(supports.supportAttackerId&&!selectedSupportAttack||supports.supportDefenderId&&!selectedSupportDefense)throw new Error('support: invalid forecast candidate');
  return { ...(selectedSupportDefense?.forecast ?? attackForecast(s, attackerId, targetId, weaponId, response)), response: structuredClone(selectedSupportDefense?{type:'defend'}:response),
    counter: !selectedSupportDefense && response.type === 'counter' ? attackForecast(s, targetId, attackerId, response.weaponId, { type: 'counter', weaponId }, true) : null,
    supportAttackers, supportDefenders, ...(selectedSupportAttack?{selectedSupportAttack}:{}), ...(selectedSupportDefense?{selectedSupportDefense}:{}) };
}
const moraleBudgets=new WeakMap<BattleState,Map<string,number>>();
export function changeMorale(s: BattleState, u: Unit, delta: number, reason: Extract<BattleEvent, { type: 'morale' }>['reason'], events: BattleEvent[]): void {
  const before = u.morale,budget=moraleBudgets.get(s);
  let gain=delta+(delta>0?sumAtom(s,u,'moraleGainAdd'):0);
  if(gain>0&&budget&&s.content.rules.combatMoraleCap!==undefined){gain=Math.min(gain,Math.max(0,s.content.rules.combatMoraleCap-(budget.get(u.id)??0)));budget.set(u.id,(budget.get(u.id)??0)+gain);}
  u.morale = clamp(before + gain, s.content.rules.morale.min, s.content.rules.morale.max + sumAtom(s,u,'moraleCapAdd'));
  if (before !== u.morale) events.push({ type: 'morale', unitId: u.id, before, after: u.morale, reason });
}
function strike(s: BattleState, attackerId: string, targetId: string, weaponId: string, response: Response, counter: boolean, events: BattleEvent[], special: {free?: boolean; map?: boolean; intercept?: boolean; support?: boolean} = {}): void {
  const a = unitById(s, attackerId), d = unitById(s, targetId), w = weaponById(s, weaponId);
  const problem = special.map || special.intercept ? null : weaponProblem(s, a, w, d, counter || !!special.support);
  if (problem) throw new Error(`attack: ${problem}`);
  const hostile = hostileTarget(s,a,d);
  const cleanup=rollSkills(s,a,d,counter,events);
  const v = values(s, a, d, w, response), rolls: [number, number, number] = [0, 0, 0];
  // Always consume three draws for an actual shot, including misses and 0/100% chances.
  for (let i = 0; i < rolls.length; i++) { const r = nextRandom(s.rng); s.rng = r.state; rolls[i] = r.value; }
  if (!special.free && w.finisher) a.aiFinisherUses=(a.aiFinisherUses??0)+1;
  if (!special.free) {a.en -= w.en ?? 0; if (w.ammo !== undefined) a.ammo[w.id]--;stampWeapon(s,a,w);}
  const hit = rolls[0] < v.hit / 100, critical = hit && rolls[1] < v.crit / 100;
  const factor=weaponFactor(s,w);
  const damage = hit ? setAtom(s,d,'takenSet',true) ?? damageAtRoll(s, (critical ? v.critical : v.damage)*factor, rolls[2]) : 0, hpDamage = Math.min(d.hp, damage);
  d.hp -= hpDamage;
  if(hit&&!special.map)drainEnergy(s,a,d,events);
  events.push({ type: 'attack', attackerId, targetId, weaponId, counter, hitRate: v.hit, hit, critical, damage, hpDamage, targetMaxHp: mechOf(s, d).hp, rolls });
  if(!special.free)applyWeaponSpecial(s,a,d,w,hit,hpDamage,events,counter||!!special.support);
  const ctx = { attackerId, defenderId: targetId }, m = s.content.rules.morale;
  if (!special.map) changeMorale(s, a, hookValue(s, 'onAfterAttack', hit ? m.hit : 0, ctx), 'hit', events);
  changeMorale(s, d, hit ? m.damaged : m.evade, hit ? 'damaged' : 'evade', events);
  consumeEffects(s, ['modifyHit', 'modifyCrit', 'onAfterAttack', ...(hit ? ['modifyDamage' as const] : [])], ctx, events);
  if(hit && hostile&&!d.tags?.includes('no-reward')) gainExperience(s,a,experienceFor(s,a,d,d.hp===0),events);
  if (d.hp === 0) {
    if(hostile&&!d.tags?.includes('no-reward')) gainCredits(s,a,d,events);
    d.alive = false; d.moveOrigin = null;
    events.push({ type: 'unit-defeated', unitId: d.id, by: a.id });
    changeMorale(s, a, hookValue(s, 'onDefeated', m.kill, ctx), 'kill', events);
    consumeEffects(s, ['onDefeated'], ctx, events);
    for (const ally of s.units) if (ally.alive && ally.side === a.side && ally.id !== a.id) changeMorale(s, ally, m.allyKill, 'ally-kill', events);
  }
  if (!special.map) expireDuration(s,a.id,'nextAttack',events,false,d.hp>0 || !hostile);
  expireDuration(s,d.id,'nextHitTaken',events,!hit);
  cleanup();
}
/** Resolve a complete exchange on a private transaction copy; public API stays immutable. */
export function resolve(s: BattleState, attackerId: string, targetId: string, weaponId: string, response: Response, supportAttackerId?: string, supportDefenderId?: string): { state: BattleState; events: BattleEvent[] } {
  forecast(s, attackerId, targetId, weaponId, response);
  const support = supportAttackerId ? supportAttackCandidates(s,attackerId,targetId).find(c=>c.unitId===supportAttackerId) : undefined;
  const guard = supportDefenderId ? supportDefenseCandidates(s,attackerId,targetId,weaponId).find(c=>c.unitId===supportDefenderId) : undefined;
  if (supportAttackerId && !support || supportDefenderId && !guard) throw new Error('support: invalid candidate');
  const next = structuredClone(s), events: BattleEvent[] = [];
  if(next.content.rules.combatMoraleCap!==undefined)moraleBudgets.set(next,new Map());
  if (guard) {
    const u=unitById(next,guard.unitId); u.supportDefenseUsed=(u.supportDefenseUsed??0)+1;
    events.push({type:'support',kind:'defense',unitId:u.id,targetId});
    strike(next,attackerId,u.id,weaponId,{type:'defend'},false,events,{intercept:true});
    const damage = events.find(e=>e.type==='attack');
    if(damage?.type==='attack') gainExperience(next,u,Math.floor(damage.hpDamage*next.content.rules.supportDefenseExp),events);
  } else {
    strike(next, attackerId, targetId, weaponId, response, false, events);
    if (response.type === 'counter' && unitById(next,targetId).alive && unitById(next,attackerId).alive && !weaponProblem(next,unitById(next,targetId),weaponById(next,response.weaponId),unitById(next,attackerId),true)) strike(next,targetId,attackerId,response.weaponId,{type:'counter',weaponId},true,events);
  }
  if(support && unitById(next,targetId).alive && unitById(next,support.unitId).alive) {
    const u=unitById(next,support.unitId); u.supportAttackUsed=(u.supportAttackUsed??0)+1;
    events.push({type:'support',kind:'attack',unitId:u.id,targetId});
    strike(next,u.id,targetId,support.weaponId!,{type:'counter',weaponId:support.weaponId!},false,events,{support:true});
  }
  moraleBudgets.delete(next);return { state: next, events };
}
export function supportAttackCandidates(s: BattleState, attackerId: string, targetId: string): SupportCandidate[] {
  const a=unitById(s,attackerId);
  return s.units.filter(u=>u.alive && u.id!==a.id && u.side===a.side && distance(u,a)===1 && (u.supportAttackUsed??0)<sumAtom(s,u,'supportAttack')).flatMap(u=> {
    const weapons=availableWeapons(s,u.id,targetId,true).map(w=>({unitId:u.id,weaponId:w.id,forecast:attackForecast(s,u.id,targetId,w.id,{type:'counter',weaponId:w.id},true)})).sort((a,b)=>b.forecast.expectedDamage-a.forecast.expectedDamage||compareId(a.weaponId,b.weaponId));
    return weapons.slice(0,1);
  }).sort((a,b)=>b.forecast.expectedDamage-a.forecast.expectedDamage||compareId(a.unitId,b.unitId));
}
export function supportDefenseCandidates(s: BattleState, attackerId: string, targetId: string, weaponId: string): SupportCandidate[] {
  const a=unitById(s,attackerId),d=unitById(s,targetId),w=weaponById(s,weaponId);
  return s.units.filter(u=>u.alive && u.id!==d.id && u.side===d.side && distance(u,d)===1 && (u.supportDefenseUsed??0)<sumAtom(s,u,'supportDefense')).map(u=>({unitId:u.id,forecast:shotForecast(s,a,u,w,{type:'defend'})})).sort((a,b)=>a.forecast.expectedDamage-b.forecast.expectedDamage||compareId(a.unitId,b.unitId));
}
export function aiSupportDefender(s: BattleState, attackerId: string, targetId: string, weaponId: string): string | undefined {
  const d=unitById(s,targetId); return d.hp/mechOf(s,d).hp<=s.content.rules.supportDefenseHp ? supportDefenseCandidates(s,attackerId,targetId,weaponId)[0]?.unitId : undefined;
}
export function mapCells(s: BattleState, unitId: string, weaponId: string, point?: Point, direction?: Direction): Point[] {
  const u=unitById(s,unitId),w=weaponById(s,weaponId),m=w.map;
  if(!m) throw new Error('map: weapon has no MAP shape');
  if(m.shape==='area' && (!point || !inBounds(s,point) || distance(u,point)<w.range[0] || distance(u,point)>w.range[1])) throw new Error('map: invalid center');
  const dirs={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
  if(m.shape==='line' && (!direction || !dirs[direction])) throw new Error('map: direction required');
  const cells:Point[]=[];
  for(let y=0;y<s.stage.map.h;y++) for(let x=0;x<s.stage.map.w;x++) {
    const p={x,y},d=distance(u,p);
    const axis=direction ? dirs[direction] : [0,0];
    if(m.shape==='burst' ? d<=m.size : m.shape==='area' ? distance(point!,p)<=m.size : d>0 && d<=m.size && (x-u.x)*axis[1]===(y-u.y)*axis[0] && (x-u.x)*axis[0]+(y-u.y)*axis[1]>0) cells.push(p);
  }
  return cells;
}
export function mapForecast(s: BattleState, unitId: string, weaponId: string, point?: Point, direction?: Direction): MapForecast {
  const u=unitById(s,unitId),w=weaponById(s,weaponId),problem=weaponProblem(s,u,w);
  if(problem) throw new Error(`map: ${problem}`);
  const cells=mapCells(s,unitId,weaponId,point,direction);
  const targets=s.units.filter(d=>d.alive && d.id!==unitId && (w.map!.friendlyFire || hostileTarget(s,u,d)) && cells.some(p=>p.x===d.x&&p.y===d.y)).sort((a,b)=>a.y-b.y||a.x-b.x||compareId(a.id,b.id)).map(d=>({unitId:d.id,friendly:!hostileTarget(s,u,d),...shotForecast(s,u,d,w,{type:'counter',weaponId})}));
  return {cells,targets,friendlyFire:targets.some(t=>t.friendly)};
}
export function resolveMap(s: BattleState, unitId: string, weaponId: string, point: Point|undefined, direction: Direction|undefined, events: BattleEvent[]): void {
  const preview=mapForecast(s,unitId,weaponId,point,direction),u=unitById(s,unitId),w=weaponById(s,weaponId);
  if(!preview.targets.length) throw new Error('map: no targets');
  if(w.finisher)u.aiFinisherUses=(u.aiFinisherUses??0)+1;
  u.en-=w.en??0;if(w.ammo!==undefined)u.ammo[w.id]--;
  events.push({type:'map-attack',unitId,weaponId,targetIds:preview.targets.map(t=>t.unitId)});
  // Freeze combat stats and progression for all targets; commit damage/deaths together.
  const base=structuredClone(s), outcomes: {targetId:string; result:BattleState; events:BattleEvent[]}[]=[];
  let rng=s.rng;
  for(const target of preview.targets) {
    const copy=structuredClone(base);copy.rng=rng;const shotEvents:BattleEvent[]=[];
    strike(copy,unitId,target.unitId,weaponId,{type:'counter',weaponId},false,shotEvents,{free:true,map:true});
    rng=copy.rng;outcomes.push({targetId:target.unitId,result:copy,events:shotEvents});
  }
  s.rng=rng;if(s.content.rules.combatMoraleCap!==undefined)moraleBudgets.set(s,new Map());
  // Commit every HP result first. Defeats and rewards follow all attack events.
  for(const result of outcomes) {
    const target=unitById(s,result.targetId),resolved=unitById(result.result,result.targetId);
    target.hp=resolved.hp;target.alive=resolved.alive;target.effects=resolved.effects;if(!target.alive)target.moveOrigin=null;
  }
  for(const result of outcomes) for(const event of result.events) if(event.type==='attack') events.push(event);
  let drainBudget=s.content.tagEffects?.filter(e=>e.kind==='drain'&&u.tags?.includes(e.tag)).reduce((n,e)=>n+(e.kind==='drain'?e.amount:0),0)??0;
  for(const result of outcomes)if(result.events.some(e=>e.type==='attack'&&e.hit))drainBudget-=drainEnergy(s,u,unitById(s,result.targetId),events,drainBudget);
  const m=s.content.rules.morale;
  if(outcomes.some(o=>o.events.some(e=>e.type==='attack'&&e.hit))) changeMorale(s,u,m.hit,'hit',events);
  let killed=false;
  for(const result of outcomes) {
    const target=unitById(s,result.targetId),shot=result.events.find(e=>e.type==='attack');
    if(shot?.type!=='attack')continue;
    changeMorale(s,target,shot.hit?m.damaged:m.evade,shot.hit?'damaged':'evade',events);
    if(!target.alive) {
      events.push({type:'unit-defeated',unitId:target.id,by:unitId});
      if(!preview.targets.find(t=>t.unitId===target.id)!.friendly) {
        killed=true;changeMorale(s,u,m.kill,'kill',events);
        for(const ally of s.units)if(ally.alive&&ally.side===u.side&&ally.id!==u.id)changeMorale(s,ally,m.allyKill,'ally-kill',events);
      }
    }
    for(const event of result.events) {
      if(event.type==='exp-gained')gainExperience(s,u,event.amount,events);
      if(event.type==='credits-gained'){s.credits=(s.credits??0)+event.amount;events.push(event);}
      if(event.type==='effect-expired' && event.unitId!==unitId)events.push(event);
    }
  }
  // Legacy hook uses and declarative attack effects expire once per MAP volley.
  const first=outcomes.find(o=>o.events.some(e=>e.type==='unit-defeated'))??outcomes.find(o=>o.events.some(e=>e.type==='attack'&&e.hit))??outcomes[0];
  if(first)unitById(s,unitId).effects=unitById(first.result,unitId).effects;
  for(const event of first?.events??[])if(event.type==='effect-expired'&&event.unitId===unitId)events.push(event);
  expireDuration(s,unitId,'nextAttack',events,false,!killed);
  finishAction(s,u);moraleBudgets.delete(s);
}

/** Enumerates legal MAP aims, independently from UI pointer state. */
export function mapAttackCommands(s:BattleState,unitId:string): Extract<import('./types').Command,{type:'mapAttack'}>[] {
  const u=unitById(s,unitId),result:Extract<import('./types').Command,{type:'mapAttack'}>[]=[];
  if(!u.alive||u.acted||u.side!==s.phase||s.outcome||s.pending)return result;
  for(const w of availableWeapons(s,unitId).filter(w=>w.map)) {
    const aims=w.map!.shape==='burst'?[{}]:w.map!.shape==='line'?(['up','left','right','down'] as Direction[]).map(direction=>({direction})):weaponRange(s,unitId,w.id).map(point=>({point}));
    for(const aim of aims)if(mapForecast(s,unitId,w.id,'point' in aim?aim.point:undefined,'direction' in aim?aim.direction:undefined).targets.length)result.push({type:'mapAttack',unitId,weaponId:w.id,...aim});
  }
  return result;
}
