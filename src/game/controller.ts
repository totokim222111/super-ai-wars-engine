import {term} from '../v2/terms';
import {dialoguePlain} from '../game/text';
import {choiceText} from '../ui/choice';
import { displayDescription } from '../ui/terminology';
import { quotaCost } from '../ui/quota';
import { interpolate } from '../campaign/player';
import {formatNumericText} from '../ui/number-format';
import { abilityActions, effectiveMech, effectivePilot, effectiveWeapon, spiritProblem, mapAttackCommands, mapForecast, mapCells, apply, availableActions, availableWeapons, chooseResponse, createBattle, forecast, nextAICommand, pathTo, pendingForecast, reachable, responseOptions, unitAt, unitById, weaponProblem, weaponRange } from '../core';
import type { BattleEvent, BattleState, Command, Content, Point, Stage, Weapon, Direction, Pilot } from '../core';
export const BANNER_DURATION=1080;
import { formatRange } from './format';
import type { CampaignState } from '../campaign/state';
import type { Program, RunnerState } from '../scenario/types';
import { createRunner, enqueue, resume, run, talkTargets } from '../scenario/runner';

type AnimationMode='on'|'off'|'allies';

export const GAME_MODES = ['intro','banner','idle','selected','preview','moving','weapons','target','forecast','result','enemy','response','counter','confirm','map','detail','outcome','scenario','objectives','persuade','settings','spirits','spiritTarget','items','forms','ability','mapAim','mapForecast','mapResult','reward','levelUp'] as const;
export type Mode = typeof GAME_MODES[number];
export function clipDuration(event:BattleEvent):number{return event.type==='move'?(event.path.length-1)*80:event.type==='attack'?616:event.type==='unit-defeated'?300:0;}
export type Clip = { event: BattleEvent; duration: number };
export interface Game {
  spirit?: string; supportAttacker?: string; supportDefender?: string;
  aim?: Point; direction?: Direction; abilityEvents?: BattleEvent[]; mapEvents?: BattleEvent[]; mapArea?: Point[];
  rewards?: {exp:number; credits:number; levels: {event:Extract<BattleEvent,{type:'level-up'}>; before:Pilot; after:Pilot}[]; shown:boolean};
  battle: BattleState; seed: number; mode: Mode; cursor: Point; selected: string | null;
  target: string | null; weapon: string | null; path: Point[]; lastTap: Point | null;
  menuIndex: number; elapsed: number; clips: Clip[]; before: BattleState | null;
  returnMode: Mode; held: boolean; mapKeys: boolean; commands: Command[];
  showThreat?: boolean; sound?: boolean; fastEnemy?: boolean; bannerPending?: boolean;
  animation?: AnimationMode; textMs?: number;
  scenario?: { program: Program; runner: RunnerState; campaign: CampaignState };
}
export type Input = { type: 'tap' | 'hover' | 'detail'; cell: Point } | { type: 'action'; id: string }
  | { type: 'cancel' | 'introDone' | 'endTurn' | 'clearTap' } | { type: 'tick'; ms: number }
  | { type: 'held'; value: boolean } | { type: 'key'; key: string };
export interface MenuItem { id: string; label: string; sub?: string; disabled?: boolean }
const same = (a: Point | null, b: Point): boolean => !!a && a.x === b.x && a.y === b.y;
export function createGame(content: Content, stage: Stage, seed = 1, intro = true): Game {
  const battle = createBattle(content, stage, seed);
  const first = battle.units.find(u => u.side === 'player')!;
  return { battle, seed, mode: intro ? 'intro' : 'banner', cursor: { x: first.x, y: first.y }, selected: null, target: null, weapon: null,
    path: [], lastTap: null, menuIndex: 0, elapsed: 0, clips: [], before: null, returnMode: 'idle', held: false, mapKeys: false, commands: [] };
}
function setMode(g: Game, mode: Mode): void { g.mode = mode; g.elapsed = 0; g.menuIndex = 0; g.lastTap = null; g.mapKeys = ['preview','target','spiritTarget','mapAim'].includes(mode); }
function collectRewards(g: Game, before: BattleState, events: BattleEvent[]): void {
  const relevant = events.filter(e => ('unitId' in e) && before.units.some(u=>u.id===e.unitId&&u.side==='player'));
  const levels = relevant.filter((e): e is Extract<BattleEvent,{type:'level-up'}> => e.type==='level-up').map(event=> {
    const u=unitById(before,event.unitId);
    return {event,before:effectivePilot(before,{...u,level:event.from}),after:effectivePilot(before,{...u,level:event.to})};
  });
  const total=(type:'exp-gained'|'credits-gained')=>relevant.reduce((n,e)=>n+(e.type===type?e.amount:0),0);
  const exp=total('exp-gained'),credits=total('credits-gained');
  if(exp||credits||levels.length)g.rewards={exp:(g.rewards?.exp??0)+exp,credits:(g.rewards?.credits??0)+credits,levels:[...(g.rewards?.levels??[]),...levels],shown:false};
}
function showRewards(g:Game): boolean {
  if (!g.rewards) return false;
  if (!g.rewards.shown) {g.rewards={...g.rewards,shown:true};setMode(g,'reward');return true;}
  if (g.rewards.levels.length) {setMode(g,'levelUp');return true;}
  g.rewards=undefined;return false;
}
function closeReward(g:Game):void {
  if(g.mode==='levelUp'&&g.rewards)g.rewards={...g.rewards,levels:g.rewards.levels.slice(1)};
  settle(g);
}
function settle(g: Game): void {
  g.before = null; g.clips = []; g.path = [];
  if(showRewards(g))return;
  if (g.scenario && !g.battle.outcome) {
    const s = g.scenario;
    const before=g.battle,emitted:BattleEvent[]=[];
    g.battle = run(s.runner, s.program, g.battle, s.campaign, g.commands,emitted);
    collectRewards(g,before,emitted);if(showRewards(g))return;
    if (s.runner.waiting) {
      const w = s.runner.waiting;
      if (w.command.op === 'camera') {
        const a = w.command.args[0], target = a.startsWith('unit:') ? unitById(g.battle, a.slice(5)) : (() => { const [x, y] = a.split(',').map(Number); return { x, y }; })();
        g.cursor = { x: target.x, y: target.y };
      } else if (w.ids.length) { const target = unitById(g.battle, w.ids[0]); g.cursor = { x: target.x, y: target.y }; }
      setMode(g, 'scenario'); return;
    }
  }
  if (g.bannerPending && !g.battle.outcome) { g.bannerPending=false; setMode(g,'banner'); return; }
  if (g.battle.outcome) { g.selected = null; setMode(g, 'outcome'); }
  else if (g.battle.pending) { const u = unitById(g.battle, g.battle.pending.targetId); g.cursor = { x: u.x, y: u.y }; setMode(g, 'response'); }
  else if (g.battle.phase === 'enemy') setMode(g, 'enemy');
  else if (g.selected && !unitById(g.battle, g.selected).acted) setMode(g, 'selected');
  else { g.selected = null; setMode(g, g.battle.units.some(u => u.alive && u.side === 'player' && !u.acted) ? 'idle' : 'confirm'); }
}
function command(g: Game, cmd: Command): void {
  const before = g.battle, result = apply(before, cmd);
  g.battle = result.state; g.commands = [...g.commands, cmd]; g.before = before;g.supportAttacker=undefined;g.supportDefender=undefined;
  collectRewards(g,before,result.events);
  if (result.events.some(e=>e.type==='phase-start')) g.bannerPending=true;
  if (g.scenario) enqueue(g.scenario.runner, g.scenario.program, result.events, g.battle);
  g.clips = result.events.flatMap(event => {
    const duration = clipDuration(event);
    return duration ? [{ event, duration }] : [];
  });
  const mapEvent=result.events.find(e=>e.type==='map-attack');
  if(mapEvent){const aim=cmd.type==='mapAttack'?cmd:undefined;g.mapArea=mapCells(before,mapEvent.unitId,mapEvent.weaponId,aim?.point,aim?.direction);g.mapEvents=result.events;setMode(g,'mapResult');return;}
  const abilities=result.events.filter(e=>['spirit','item-used','transform','combine','split'].includes(e.type));
  if(abilities.length){g.abilityEvents=abilities;setMode(g,'ability');return;}
  if (cmd.type === 'endPhase') { g.selected = null; if (g.scenario) settle(g); else { g.bannerPending=false; setMode(g, 'banner'); } }
  else if (g.clips.length) setMode(g, g.clips[0].event.type === 'move' ? 'moving' : 'result');
  else settle(g);
}
export function weaponRows(g: Game, counter = false): { weapon: Weapon; reason: string | null }[] {
  const s = g.battle, id = counter ? s.pending!.targetId : g.selected!;
  const u = unitById(s, id), target = counter ? unitById(s, s.pending!.attackerId) : undefined;
  const mech = effectiveMech(s,u);
  return mech.weapons.map(id => {
    const raw=s.content.weapons.find(w=>w.id===id)!,weapon=effectiveWeapon(s,u,raw);
    let reason = weaponProblem(s, u, raw, target, counter);
    if(!reason&&weapon.map&&!mapAttackCommands(s,u.id).some(c=>c.weaponId===weapon.id))reason='target outside weapon range';
    if (!reason && !weapon.map && !counter && !s.units.some(d => !weaponProblem(s, u, raw, d))) reason = 'target outside weapon range';
    return { weapon, reason };
  }).filter(row => !counter || !row.reason);
}
export function reasonText(reason: string | null): string {
  if (!reason) return '';
  if (reason.includes('non-P')) return '이동 후 불가';
  if (reason.includes('EN')) return `${term('en')} 부족`;
  if (reason.includes('ammo')) return '탄수 부족';
  if (reason.includes('morale')) return `${term('morale')} 부족`;
  if(reason.includes('SP'))return `${term('sp')} 부족`;
  if(reason.includes('active'))return '이미 적용';
  if(reason.includes('locked'))return '미습득';
  if(reason.includes('target'))return '대상 없음';
  if(reason.includes('phase'))return '사용할 페이즈 아님';
  return '사거리 밖';
}
export function menuItems(g: Game): MenuItem[] {
  const cancel = { id: 'cancel', label: '취소' }, s = g.battle;
  switch (g.mode) {
    case 'scenario': {const w=g.scenario?.runner.waiting;return w?.command.op==='choice'?w.command.args.slice(1).map((label,i)=>({id:`choice:${i+1}`,label:choiceText(interpolate(label,g.scenario!.campaign))})):[];}
    case 'selected': case 'preview': {
      const u=unitById(s,g.selected!),m=effectiveMech(s,u),actions=abilityActions(s,u.id);
      const available=availableActions(s,u.id);
      const moved=u.moved,attack={id:'attack',label:'공격',disabled:u.moved&&!available.some(c=>c.type==='attack'||c.type==='mapAttack')};
      const persuade=g.scenario&&talkTargets(g.scenario.runner,g.scenario.program,s,u.id).length?[{id:'persuade',label:'설득'}]:[];
      const combinations=actions.filter(c=>c.type==='combine'||c.type==='split').map(c=>({id:c.type==='split'?'split':`combine:${c.combinationId}`,label:c.type==='split'?'분리':'합체'}));
      return [...(!moved&&!u.acted?[{id:'move',label:'이동'}]:[]),...(!u.acted&&(!moved||!attack.disabled)?[attack]:[]),
        ...((effectivePilot(s,u).spirits?.length??0)>0?[{id:'spirits',label:'정신'}]:[]),
        ...(u.parts?.some(id=>s.content.parts?.some(p=>p.id===id&&p.kind==='consumable'))?[{id:'items',label:'아이템'}]:[]),
        ...((m.forms?.length??0)>1?[{id:'forms',label:'변형'}]:[]),...persuade,...combinations,{id:'detail',label:'상세'},...(!u.acted?[{id:'wait',label:'대기'}]:[]),
        {id:'cancel',label:moved&&!u.moveCommitted&&!u.acted?'이동 취소':'취소'}];
    }
    case 'spirits': return [...spiritRows(g).map(r=>({id:`spirit:${r.spirit.id}`,label:`${r.spirit.name} · ${quotaCost(r.spirit.sp,effectivePilot(s,unitById(s,g.selected!)).sp)}`,sub:r.reason?.includes('locked')?`Lv ${r.learnLevel} 습득 · ${r.spirit.desc}`:r.reason?reasonText(r.reason):r.spirit.desc,disabled:!!r.reason})),cancel];
    case 'spiritTarget': return [cancel];
    case 'items': {const u=unitById(s,g.selected!),actions=abilityActions(s,u.id);return [...(u.parts??[]).flatMap((id,slot)=>{const p=s.content.parts?.find(p=>p.id===id&&p.kind==='consumable');return p?[{id:`item:${slot}`,label:p.name,sub:u.usedItems?.includes(slot)?'사용 완료':displayDescription(p.desc),disabled:!actions.some(c=>c.type==='useItem'&&c.slot===slot)}]:[];}),cancel];}
    case 'forms': {const u=unitById(s,g.selected!),actions=abilityActions(s,u.id);return [...(effectiveMech(s,u).forms??[]).map(f=>({id:`form:${f.id}`,label:f.name,sub:f.id===(u.formId??effectiveMech(s,u).forms?.[0].id)?'현재 형태':u.transformedRound===s.round?'이번 라운드 변형 완료':'',disabled:!actions.some(c=>c.type==='transform'&&c.formId===f.id)})),cancel];}
    case 'mapAim': return [...(s.content.weapons.find(w=>w.id===g.weapon)?.map?.shape==='line'?(['up','left','right','down'] as const).map((d,i)=>({id:`direction:${d}`,label:['위 ↑','왼쪽 ←','오른쪽 →','아래 ↓'][i]})):[{id:'mapPreview',label:'범위 확인',disabled:!currentMapForecast(g)}]),cancel];
    case 'mapForecast': return [{id:'mapFire',label:'MAP 발사',disabled:!currentMapForecast(g)?.targets.length},cancel];
    case 'weapons': case 'counter': return [...weaponRows(g, g.mode === 'counter').map(({ weapon: w, reason }) => ({ id: `weapon:${w.id}`, label: `${w.name}${w.postMove ? ' (P)' : ''}  ${formatNumericText(w.power)}  ${formatRange(w.range)}`,
      sub: `${term('en')} ${w.en ?? 0}${w.ammo !== undefined ? ` · 탄 ${unitById(s, g.mode === 'counter' ? s.pending!.targetId : g.selected!).ammo[w.id]}/${w.ammo}` : ''}${reason ? ` · ${reasonText(reason)}` : ''}`, disabled: !!reason })), cancel];
    case 'target': return [cancel];
    case 'forecast': return [{ id: 'fire', label: '전투 개시' }, {id:'changeWeapon',label:'무기 변경'}, cancel,...supportRows(g)];
    case 'map': return [{ id:'endTurn',label:'턴 종료' },{id:'objectives',label:'목표'}, {id:'threat',label:`적 사정거리 ${g.showThreat?'켜짐':'꺼짐'}`}, {id:'units',label:'유닛 목록',disabled:true,sub:'준비 중'}, {id:'settings',label:'설정'},...(g.scenario?[{id:'suspend',label:'중단'}]:[]),cancel];
    case 'settings': return [{id:'animation',label:`전투 연출 ${g.animation==='off'?'끔':g.animation==='allies'?'아군만':'켬'}`},{id:'sound',label:`효과음 ${g.sound!==false?'켜짐':'꺼짐'}`},{id:'fast',label:`적 페이즈 빠르게 ${g.fastEnemy?'켜짐':'꺼짐'}`},{id:'auto',label:`자동 응답 ${s.options.autoResponse?'켜짐':'꺼짐'}`},cancel];
    case 'persuade': return [...talkTargets(g.scenario!.runner, g.scenario!.program, s, g.selected!).map(u => ({ id: `persuade:${u.id}`, label: s.content.pilots.find(p => p.id === u.pilotId)!.name })), cancel];
    case 'confirm': return [{ id: 'yes', label: '예' }, { id: 'cancel', label: '아니오' }];
    case 'response': {
      const defend = pendingForecast(s, { type: 'defend' }), evade = pendingForecast(s, { type: 'evade' });
      const counter = currentForecast(g)?.value.counter;
      return [{ id:'counter',label:'반격 (무기)',sub:counter?`명중 ${counter.hitRate}% · 피해 ${formatNumericText(counter.damage.max)}`:'반격 가능한 무기 없음',disabled:!responseOptions(s).some(r=>r.type==='counter') },{id:'defend',label:'방어',sub:`피해 ${formatNumericText(defend.damage.min)}~${formatNumericText(defend.damage.max)}`},{id:'evade',label:'회피',sub:`명중 ${evade.hitRate}%`},...supportRows(g)];
    }
    case 'outcome': return [{ id: 'retry', label: '다시 하기' }, { id: 'newSeed', label: '다른 시드' }];
    default: return [];
  }
}
export function spiritRows(g:Game) {
  const s=g.battle,u=unitById(s,g.selected!),p=effectivePilot(s,u);
  return (p.spirits??[]).map(ref=>{const raw=s.content.spirits!.find(d=>d.id===ref.id)!,spirit={...raw,desc:displayDescription(raw.desc)};
    const targets=['ally','enemy'].includes(spirit.target)?s.units.map(v=>v.id):[undefined];
    const problems=targets.map(id=>spiritProblem(s,u.id,spirit.id,id));
    return {spirit,quota:quotaCost(spirit.sp,p.sp),learnLevel:ref.level,reason:problems.includes(null)?null:problems.find(p=>p&&!p.includes('target'))??problems[0]??'target'};
  });
}
export function spiritTargets(g:Game) {return g.spirit?g.battle.units.filter(u=>!spiritProblem(g.battle,g.selected!,g.spirit!,u.id)):[];}
export function currentMapForecast(g:Game) {
  if(!g.selected||!g.weapon)return null;
  try{return mapForecast(g.battle,g.selected,g.weapon,g.aim,g.direction);}catch{return null;}
}
export function supportRows(g:Game):MenuItem[] {
  const f=currentForecast(g);if(!f)return [];
  const defense=!!g.battle.pending,candidates=defense?f.value.supportDefenders:f.value.supportAttackers;
  if(!candidates?.length)return [];
  return [{id:'support:none',label:'없음'},...candidates.map(c=>({id:`support:${c.unitId}`,label:g.battle.content.pilots.find(p=>p.id===unitById(g.battle,c.unitId).pilotId)!.name}))];
}
export function ranges(g: Game): { cells: Point[]; enemy: boolean } {
  if(g.mode==='spiritTarget')return {cells:spiritTargets(g).map(u=>({x:u.x,y:u.y})),enemy:g.battle.content.spirits?.find(d=>d.id===g.spirit)?.target==='enemy'};
  if(['mapAim','mapForecast'].includes(g.mode))return {cells:currentMapForecast(g)?.cells??[],enemy:true};
  if (g.selected && ['selected', 'preview'].includes(g.mode)) return { cells: reachable(g.battle, g.selected), enemy: false };
  if (g.selected && g.weapon && ['target', 'forecast'].includes(g.mode)) return { cells: weaponRange(g.battle, g.selected, g.weapon), enemy: true };
  return { cells: [], enemy: false };
}
export function currentForecast(g: Game) {
  if (g.battle.pending) {
    const p = g.battle.pending, response = chooseResponse(g.battle, p.targetId, p.attackerId);
    return { attacker: p.attackerId, target: p.targetId, weapon: p.weaponId, value: pendingForecast(g.battle, response,g.supportDefender) };
  }
  if (!g.selected || !g.target || !g.weapon) return null;
  return { attacker: g.selected, target: g.target, weapon: g.weapon, value: forecast(g.battle, g.selected, g.target, g.weapon,undefined,{supportAttackerId:g.supportAttacker}) };
}
function cancel(g: Game): void {
  switch (g.mode) {
    case 'spirits': case 'items': case 'forms': setMode(g,'selected');break;
    case 'spiritTarget': g.spirit=undefined;setMode(g,'spirits');break;
    case 'mapForecast': setMode(g,'mapAim');break;
    case 'mapAim': g.weapon=null;g.aim=undefined;g.direction=undefined;setMode(g,'weapons');break;
    case 'detail': setMode(g, g.returnMode); break;
    case 'settings': case 'objectives': setMode(g, 'map'); break;
    case 'persuade': setMode(g, 'selected'); break;
    case 'forecast': setMode(g, 'target'); break;
    case 'target': g.weapon = null; setMode(g, 'weapons'); break;
    case 'weapons': setMode(g, 'selected'); break;
    case 'counter': setMode(g, 'response'); break;
    case 'preview': g.path = []; setMode(g, 'selected'); break;
    case 'selected':
      if (unitById(g.battle, g.selected!).moved&&!unitById(g.battle,g.selected!).moveCommitted&&!unitById(g.battle,g.selected!).acted) command(g, { type: 'undoMove', unitId: g.selected! });
      else { g.selected = null; setMode(g, 'idle'); } break;
    case 'confirm': case 'map': setMode(g, 'idle'); break;
    // Pending attacks cannot be abandoned: cancel only dismisses a subwindow.
    default: break;
  }
}
function action(g: Game, id: string): Game {
  if (id === 'cancel') { cancel(g); return g; }
  if (!menuItems(g).some(item => item.id === id && !item.disabled)) return g;
  if(id.startsWith('support:')){const value=id.slice(8)==='none'?undefined:id.slice(8);if(g.battle.pending)g.supportDefender=value;else g.supportAttacker=value;return g;}
  if(id.startsWith('spirit:')){g.spirit=id.slice(7);const def=g.battle.content.spirits!.find(d=>d.id===g.spirit)!;if(['ally','enemy'].includes(def.target))setMode(g,'spiritTarget');else command(g,{type:'spirit',unitId:g.selected!,spiritId:g.spirit});return g;}
  if(id.startsWith('item:')){command(g,{type:'useItem',unitId:g.selected!,slot:Number(id.slice(5))});return g;}
  if(id.startsWith('form:')){command(g,{type:'transform',unitId:g.selected!,formId:id.slice(5)});return g;}
  if(id.startsWith('combine:')){command(g,{type:'combine',unitId:g.selected!,combinationId:id.slice(8)});return g;}
  if(id.startsWith('direction:')){g.direction=id.slice(10) as Direction;setMode(g,'mapForecast');return g;}
  if (id.startsWith('persuade:')) { command(g, { type: 'persuade', unitId: g.selected!, targetId: id.slice(9) }); return g; }
  if (id.startsWith('weapon:')) {
    const weaponId = id.slice(7);
    if (g.mode === 'counter') command(g, { type: 'respond', response: { type: 'counter', weaponId },supportDefenderId:g.supportDefender });
    else {g.supportAttacker=undefined;g.weapon=weaponId;const w=g.battle.content.weapons.find(w=>w.id===weaponId)!;if(w.map){const aim=mapAttackCommands(g.battle,g.selected!).find(c=>c.weaponId===weaponId);g.aim=aim?.point;g.direction=aim?.direction;setMode(g,w.map.shape==='burst'?'mapForecast':'mapAim');}else setMode(g,'target');}
  } else switch (id) {
    case 'move': g.mapKeys=true;break;
    case 'spirits':case 'items':case 'forms':setMode(g,id);break;
    case 'split':command(g,{type:'split',unitId:g.selected!});break;
    case 'mapPreview':setMode(g,'mapForecast');break;
    case 'mapFire':command(g,{type:'mapAttack',unitId:g.selected!,weaponId:g.weapon!,point:g.aim,direction:g.direction});break;
    case 'changeWeapon': setMode(g,'weapons'); break;
    case 'settings': setMode(g,'settings'); break;
    case 'sound': g.sound=g.sound===false; break;
    case 'animation': g.animation=g.animation==='off'?'allies':g.animation==='allies'?'on':'off'; break;
    case 'fast': g.fastEnemy=!g.fastEnemy; break;
    case 'threat': g.showThreat=!g.showThreat; break;
    case 'attack': setMode(g, 'weapons'); break;
    case 'persuade': setMode(g, 'persuade'); break;
    case 'objectives': setMode(g, 'objectives'); break;
    case 'wait': command(g, { type: 'wait', unitId: g.selected! }); break;
    case 'detail': g.returnMode = g.mode; setMode(g, 'detail'); break;
    case 'fire': command(g, { type: 'attack', unitId: g.selected!, targetId: g.target!, weaponId: g.weapon!,supportAttackerId:g.supportAttacker }); break;
    case 'endTurn': setMode(g, 'confirm'); break;
    case 'yes': command(g, { type: 'endPhase' }); break;
    case 'auto': g.battle = { ...g.battle, options: { autoResponse: !g.battle.options.autoResponse } }; break;
    case 'counter': setMode(g, 'counter'); break;
    case 'defend': case 'evade': command(g, { type: 'respond', response: { type: id },supportDefenderId:g.supportDefender }); break;
    case 'retry': case 'newSeed': return { ...createGame(g.battle.content, g.battle.stage, id === 'retry' ? g.seed : (g.seed + 1) >>> 0, false), animation:g.animation,sound:g.sound,fastEnemy:g.fastEnemy };
  }
  return g;
}
/** Pure UI reducer. Timers and pointer coordinates are supplied by the adapters. */
export function transition(input: Game, event: Input): Game {
  const g: Game = { ...input, cursor: { ...input.cursor }, clips: [...input.clips] };
  if (input.scenario) { g.scenario = { program: input.scenario.program, runner: structuredClone(input.scenario.runner), campaign: structuredClone(input.scenario.campaign) }; g.commands = [...input.commands]; }
  if(g.mode==='levelUp'){if(event.type==='tap'||event.type==='cancel'||event.type==='key'&&['Enter',' ','Escape'].includes(event.key))closeReward(g);return g;}
  if(g.mode==='reward'){if(event.type==='tick'){g.elapsed+=event.ms;if(g.elapsed>=900)settle(g);}return g;}
  if(['ability','mapResult'].includes(g.mode)){if(event.type==='tick'){g.elapsed+=event.ms;if(g.elapsed>=(g.mode==='ability'?700:1000))settle(g);}return g;}
  if (g.mode === 'scenario') {
    if(event.type==='tick')g.elapsed+=event.ms;
    const waiting = g.scenario!.runner.waiting!;
    if(waiting.command.op==='choice'){
      let choice=event.type==='action'&&event.id.startsWith('choice:')?Number(event.id.slice(7)):0;
      if(event.type==='key'){if(['ArrowUp','ArrowDown'].includes(event.key))g.menuIndex=(g.menuIndex+(event.key==='ArrowUp'?-1:1)+waiting.command.args.length-1)%(waiting.command.args.length-1);if(['Enter',' '].includes(event.key))choice=g.menuIndex+1;}
      if(choice>=1&&choice<waiting.command.args.length){const campaign=g.scenario!.campaign;campaign.affectionChoices??={};campaign.affectionChoices[waiting.command.args[0]]=choice;campaign.affection??={};g.scenario!.campaign.flags[`${waiting.command.args[0]}-${choice}`]=true;resume(g.scenario!.runner);g.menuIndex=0;settle(g);}return g;
    }
    const text = ['talk', 'narrate'].includes(waiting.command.op);
    const fullLength=text?Array.from(dialoguePlain(interpolate(waiting.command.args.at(-1)!,g.scenario!.campaign))).length:0;
    const pageLength=(waiting.pageEnd??fullLength)-(waiting.pageStart??0);
    if (event.type === 'tick') {
      if (text) waiting.visible = Math.min(pageLength, g.textMs===0?Infinity:waiting.visible + event.ms / (g.textMs??(1000/60)));
      else { waiting.remaining -= event.ms; if (waiting.remaining <= 0) { resume(g.scenario!.runner); settle(g); } }
    } else if (text && (event.type === 'tap' || (event.type === 'key' && ['Enter', ' '].includes(event.key)))) {
      if (waiting.visible < pageLength) waiting.visible = pageLength;
      else if((waiting.pageNext??fullLength)<fullLength){waiting.pageStart=waiting.pageNext;delete waiting.pageEnd;delete waiting.pageNext;waiting.visible=0;}
      else { resume(g.scenario!.runner); settle(g); }
    }
    return g;
  }
  if (event.type === 'held') { g.held = event.value; return g; }
  if (event.type === 'clearTap') { g.lastTap = null; return g; }
  if (event.type === 'introDone') { if (g.mode === 'intro') setMode(g, 'banner'); return g; }
  if (event.type === 'tick') {
    g.elapsed += event.ms * ((g.held || g.fastEnemy) && g.battle.phase === 'enemy' ? 2 : 1);
    if (g.mode === 'banner' && g.elapsed >= BANNER_DURATION) settle(g);
    else if (g.mode === 'moving' || g.mode === 'result') {
      while (g.clips.length && g.elapsed >= g.clips[0].duration) {
        g.elapsed -= g.clips[0].duration;
        const clip = g.clips.shift()!;
        // Commit the completed visual event, preserving later counter/defeat frames.
        if (g.before) {
          g.before = { ...g.before, units: g.before.units.map(u => {
            if (clip.event.type === 'attack' && u.id === clip.event.targetId) return { ...u, hp: Math.max(0, u.hp - clip.event.hpDamage) };
            if (clip.event.type === 'unit-defeated' && u.id === clip.event.unitId) return { ...u, alive: false };
            if (clip.event.type === 'move' && u.id === clip.event.unitId) return { ...u, ...clip.event.path.at(-1)! };
            return u;
          }) };
        }
      }
      if (!g.clips.length) settle(g);
    } else if (g.mode === 'enemy' && g.elapsed >= 120) {
      const cmd = nextAICommand(g.battle);
      if (cmd) {
        if ('unitId' in cmd) { const u = unitById(g.battle, cmd.unitId); g.cursor = { x: u.x, y: u.y }; }
        command(g, cmd);
      }
    }
    return g;
  }
  if (event.type === 'cancel') { cancel(g); return g; }
  if (event.type === 'endTurn') { if (g.battle.phase === 'player' && ['idle', 'selected', 'preview', 'map'].includes(g.mode)) setMode(g, 'confirm'); return g; }
  if (event.type === 'key') {
    const key = event.key, items = menuItems(g);
    if (key === 'Tab' && ['selected', 'preview', 'target','spiritTarget','mapAim'].includes(g.mode)) { g.mapKeys = !g.mapKeys; return g; }
    if (g.mode === 'selected' && (key === 'ArrowLeft' || key === 'ArrowRight')) g.mapKeys = true;
    if (key === 'Escape') return transition(g, { type: 'cancel' });
    if (key.toLowerCase() === 'e') return transition(g, { type: 'endTurn' });
    if (key === 'Enter' || key === ' ') {
      if (items.length && !g.mapKeys) return action(g, items[g.menuIndex % items.length].id);
      return transition(g, { type: 'tap', cell: g.cursor });
    }
    if (items.length && !g.mapKeys && (key === 'ArrowUp' || key === 'ArrowDown' || (['forecast','response'].includes(g.mode) && ['ArrowLeft','ArrowRight'].includes(key)))) {
      g.menuIndex = (g.menuIndex + (['ArrowUp','ArrowLeft'].includes(key) ? -1 : 1) + items.length) % items.length; return g;
    }
    const cell = { x: Math.max(0, Math.min(g.battle.stage.map.w - 1, g.cursor.x + (key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0))),
      y: Math.max(0, Math.min(g.battle.stage.map.h - 1, g.cursor.y + (key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0))) };
    g.cursor = cell; g.lastTap = cell; return g;
  }
  if (event.type === 'action') { if(event.id==='openMap'&&['idle','selected','preview','map'].includes(g.mode)){g.selected=null;setMode(g,'map');return g;} return action(g, event.id); }
  if (event.type === 'tap' && (g.mode === 'detail' || g.mode === 'objectives')) { cancel(g); return g; }
  if (event.type === 'tap' && g.mode === 'result') { settle(g); return g; }
  if (['intro', 'banner', 'moving', 'result', 'enemy', 'outcome', 'response', 'counter', 'forecast', 'confirm', 'map', 'settings', 'detail', 'persuade','spirits','items','forms','mapForecast'].includes(g.mode)) return g;
  if (!('cell' in event)) return g;
  const cell = event.cell;
  if (cell.x < 0 || cell.y < 0 || cell.x >= g.battle.stage.map.w || cell.y >= g.battle.stage.map.h) return g;
  const repeated = same(g.lastTap, cell), u = unitAt(g.battle, cell);
  g.cursor = { ...cell };
  if (event.type === 'hover') return g;
  if (event.type === 'detail') { if (u) { g.returnMode = g.mode; setMode(g, 'detail'); } return g; }
  if(g.mode==='spiritTarget'){if(u&&spiritTargets(g).some(v=>v.id===u.id)){g.target=u.id;if(repeated)command(g,{type:'spirit',unitId:g.selected!,spiritId:g.spirit!,targetId:u.id});}}
  else if(g.mode==='mapAim'){try{mapForecast(g.battle,g.selected!,g.weapon!,cell,g.direction);g.aim={...cell};if(repeated)setMode(g,'mapForecast');}catch{/* invalid aim stays on map */}}
  else if (g.mode === 'target') {
    if (u && g.selected && g.weapon && availableWeapons(g.battle, g.selected, u.id).some(w => w.id === g.weapon)) {
      g.target = u.id;
      if (repeated) setMode(g, 'forecast');
    }
  } else if (g.selected && ['selected', 'preview'].includes(g.mode)) {
    const path = pathTo(g.battle, g.selected, cell);
    if (path && path.length > 1) {
      if (g.mode === 'preview' && repeated) command(g, { type: 'move', unitId: g.selected, ...cell });
      else { g.path = path; setMode(g, 'preview'); }
    }
  } else if (g.mode === 'idle' && repeated) {
    if (u?.side === 'player') { g.selected = u.id; setMode(g, 'selected'); }
    else if (!u) setMode(g, 'map');
  }
  g.lastTap = { ...cell }; return g;
}
export function createScenarioGame(content: Content, stage: Stage, program: Program, campaign: CampaignState, seed = 1): Game {
  const g = createGame(content, stage, seed, false);
  g.bannerPending=true;
  g.scenario = { program, runner: createRunner(), campaign: structuredClone(campaign) };
  enqueue(g.scenario.runner, program, [{ type: 'start' }, { type: 'phase-start', round: 1, phase: 'player' }], g.battle);
  settle(g); return g;
}
