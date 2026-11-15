import { playerName,interpolate,validPlayerName } from './player';
import {dialoguePlain} from '../game/text';
import {persistBattle} from './progress';
import {validateLoadout} from '../core/validate';
import { restore, snapshot, nearestFree } from '../core';
import type { Content, Stage, StageUnit } from '../core';
import { createScenarioGame,GAME_MODES } from '../game/controller';
import type { Game } from '../game/controller';
import type { CampaignContent } from './content';
import { newCampaign, nextNode } from './state';
import type { CampaignState } from './state';
import type { RunnerState } from '../scenario/types';
import {enemyUpgradeLevel,scaleEnemyReference} from '../core/stage-content';
import {upgradeCap} from './new-game-plus';


export type Screen = 'title' | 'battle' | 'result' | 'intermission' | 'end' | 'roster';
export interface Session { screen: Screen; campaign: CampaignState; stageStart: CampaignState; game: Game | null; seed: number }
export const SAVE_KEY='srpg:session:2';
export interface Storage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export const titleSession = (seed = 1): Session => ({ screen: 'title', campaign: newCampaign(), stageStart: newCampaign(), game: null, seed });
const personalized=(content:Content,c:CampaignState):Content=>({...content,pilots:content.pilots.map(p=>p.id===c.player?.pilotId?{...p,name:playerName(c)}:p)});
export function deployment(stage: Stage, campaign: CampaignState, content: Content): Stage {
  const s = structuredClone(stage);
  if(s.enemyUpgradeLevel!==undefined)s.enemyUpgradeLevel=enemyUpgradeLevel(s.enemyUpgradeLevel,campaign.cycle??1,content.rules);
  s.units=s.units.map(u=> {const saved=campaign.roster.find(v=>v.id===u.id)??campaign.inheritance?.find(v=>v.id===u.id);if(!saved||u.side!=='player')return u;return {...u,...saved,...(s.minimumLevel!==undefined?{level:Math.max(s.minimumLevel,saved.level??1),tags:u.tags}:{}),x:u.x,y:u.y};});
  for (const [id, [x, y]] of Object.entries(s.rosterDeployments ?? {})) {
    const unit = campaign.roster.find(u => u.id === id); if (!unit || s.units.some(u => u.id === id)) continue;
    const placed = { ...unit,...(s.minimumLevel!==undefined?{level:Math.max(s.minimumLevel,unit.level??1)}:{}), x, y, side: 'player' as const };
    const p = nearestFree({ stage: s, content, units: s.units.map(u => ({ ...u, alive: true })) } as Game['battle'], placed);
    s.units.push({ ...placed, ...p });
  }
  if(s.minimumLevel!==undefined)for(const u of s.units)if(u.side==='player')u.level=Math.max(s.minimumLevel,u.level??1);
  if(campaign.inheritance){const inherit=(u:import('../core').StageUnit)=>{const saved=campaign.inheritance!.find(v=>v.id===u.id);if(u.side!=='player'||!saved)return u;return {...u,level:Math.max(u.level??1,saved.level??1,s.minimumLevel??1),exp:saved.exp,upgrades:structuredClone(saved.upgrades),parts:structuredClone(saved.parts),fullUpgradeBonus:saved.fullUpgradeBonus,subPilotProgress:structuredClone(saved.subPilotProgress)};};if(s.definitions)s.definitions=s.definitions.map(inherit);if(s.waves)s.waves=Object.fromEntries(Object.entries(s.waves).map(([id,list])=>[id,list.map(inherit)]));}
  const progress=(u:import('../core').StageUnit)=>u.side==='player'&&campaign.retryExperience?.[u.id]?{...u,...structuredClone(campaign.retryExperience[u.id])}:u;
  s.units=s.units.map(progress);if(s.definitions)s.definitions=s.definitions.map(progress);if(s.waves)s.waves=Object.fromEntries(Object.entries(s.waves).map(([id,rows])=>[id,rows.map(progress)]));
  scaleEnemyReference(s,campaign.roster,content,campaign.cycle??1);
  return s;
}
export function enterNode(session: Session, data: CampaignContent, content: Content, advance = false): Session {
  const s = structuredClone(session); s.campaign.node = s.campaign.retryNode??nextNode(data.nodes, s.campaign, advance);delete s.campaign.retryNode;
  const node = data.nodes[s.campaign.node];
  if (!node) { s.screen = 'end'; return s; }
  if (node.type === 'intermission') { s.screen = 'intermission'; return s; }
  const stage = deployment(data.stages[node.id].stage, s.campaign, content);
  for (const u of stage.units.filter(u => u.side === 'player')) if (!s.campaign.roster.some(v => v.id === u.id)) s.campaign.roster.push(structuredClone(u));
  delete s.campaign.battleCredits;
  s.campaign.stageCredits = s.campaign.credits;
  s.stageStart = structuredClone(s.campaign);
  s.game = createScenarioGame(personalized(content,s.campaign), stage, data.stages[node.id].program, s.campaign, s.seed);
  s.campaign = s.game.scenario!.campaign; s.screen = 'battle'; return s;
}
export function finishStage(session: Session): void {
  if (!session.game?.battle.outcome || session.game.mode !== 'outcome' || session.screen !== 'battle') return;
  session.campaign = persistBattle(session.game.scenario!.campaign,session.game.battle);
  session.game.scenario!.campaign=session.campaign;
  if (session.game.battle.outcome === 'victory' && !session.campaign.cleared.includes(session.game.battle.stage.id)) session.campaign.cleared.push(session.game.battle.stage.id);
  session.screen = 'result';
}
export function fingerprint(data: CampaignContent): number { let hash = 2166136261; for (const ch of JSON.stringify(Object.fromEntries(Object.entries(data).filter(([k])=>k!=='saveMigrations')))) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619); return hash >>> 0; }
export function serialize(session: Session, data: CampaignContent): string {
  const { game, ...rest } = session;
  const savedGame = game ? { ...game, battle: snapshot(game.battle), before: game.before ? snapshot(game.before) : null, scenario: { runner: game.scenario!.runner } } : null;
  return JSON.stringify({ version: 'srpg-session-2', fingerprint: fingerprint(data), session: { ...rest, game: savedGame } });
}
function validateM6Display(g:Game):void {
  const fail=():never=>{throw new Error('잘못된 SRW 화면 저장 상태');};
  const nonnegative=(n:unknown):boolean=>Number.isSafeInteger(n)&&Number(n)>=0;
  const exists=(id:string)=>g.battle.units.some(u=>u.id===id);
  if(g.rewards){
    const r=g.rewards;
    if(!nonnegative(r.exp)||!nonnegative(r.credits)||typeof r.shown!=='boolean'||!Array.isArray(r.levels)||r.levels.length>256)fail();
    for(const level of r.levels){
      const e=level?.event;
      if(!e||e.type!=='level-up'||!exists(e.unitId)||!Number.isSafeInteger(e.from)||!Number.isSafeInteger(e.to)||e.from<1||e.to<=e.from||e.to>g.battle.content.rules.levelMax||!Array.isArray(e.newSpirits)||e.newSpirits.some(id=>!g.battle.content.spirits?.some(d=>d.id===id)))fail();
      for(const p of [level.before,level.after])if(!p?.stats||!['melee','shoot','hit','evade','skill','defense'].every(key=>Number.isFinite(p.stats[key as keyof typeof p.stats])))fail();
    }
  }
  if(['reward','levelUp'].includes(g.mode)&&!g.rewards)fail();
  if(g.mode==='levelUp'&&!g.rewards?.levels.length)fail();
  if(g.mode==='ability'&&(!Array.isArray(g.abilityEvents)||!g.abilityEvents.length||g.abilityEvents.some(e=>!['spirit','item-used','transform','combine','split'].includes(e.type))))fail();
  if(g.mode==='mapResult'&&(!g.before||!Array.isArray(g.mapEvents)||!g.mapEvents.some(e=>e.type==='map-attack')||!Array.isArray(g.mapArea)||g.mapArea.some(p=>!Number.isSafeInteger(p.x)||!Number.isSafeInteger(p.y)||p.x<0||p.y<0||p.x>=g.battle.stage.map.w||p.y>=g.battle.stage.map.h)))fail();
  if(g.mode==='spiritTarget'&&(!g.selected||!exists(g.selected)||!g.battle.content.spirits?.some(d=>d.id===g.spirit)))fail();
}
export function deserialize(json: string, data: CampaignContent, content: Content): Session {
  const save = JSON.parse(json);
  if (save.version !== 'srpg-session-2' || save.fingerprint !== fingerprint(data)) throw new Error('저장 파일과 콘텐츠 버전이 다릅니다');
  const s = save.session as Session;
  const state = (c: CampaignState) => {
    if (!c || !Number.isSafeInteger(c.node) || c.node < 0 || c.node > data.nodes.length || !Number.isSafeInteger(c.credits) || c.credits < 0 || !Number.isSafeInteger(c.stageCredits) || c.stageCredits < 0 || !Array.isArray(c.roster) || !Array.isArray(c.parts) || c.parts.some(p => typeof p !== 'string') || !Array.isArray(c.cleared) || c.cleared.some(id => !data.stages[id]) || !c.flags || typeof c.flags !== 'object' || Object.values(c.flags).some(v => typeof v !== 'boolean')) throw new Error('잘못된 캠페인 저장 상태');
    if(c.retryNode!==undefined&&(!Number.isSafeInteger(c.retryNode)||c.retryNode!==c.node||data.nodes[c.retryNode]?.type!=='stage'))throw Error('invalid retry node');
    if(c.retryExperience!==undefined){if(!c.retryExperience||typeof c.retryExperience!=='object'||Array.isArray(c.retryExperience))throw Error('invalid retry experience');for(const [id,progress]of Object.entries(c.retryExperience)){if(!Object.values(data.stages).some(s=>[...s.stage.units,...(s.stage.definitions??[]),...Object.values(s.stage.waves??{}).flat()].some(u=>u.id===id)))throw Error('unknown retry unit');validateLoadout(progress as Record<string,unknown>,'retry experience',content);if(Object.keys(progress).some(k=>!['level','exp','subPilotProgress'].includes(k)))throw Error('invalid retry reward');}}
    if(c.cycle!==undefined&&(!Number.isSafeInteger(c.cycle)||c.cycle<1))throw Error('invalid cycle');
    if(c.inheritance!==undefined&&!Array.isArray(c.inheritance))throw Error('invalid inheritance');
    for(const u of [...c.roster,...(c.inheritance??[])]){validateLoadout(u as unknown as Record<string,unknown>,'campaign progress',content);if(!content.pilots.some(p=>p.id===u.pilotId)||!content.mechs.some(m=>m.id===u.mechId))throw Error('unknown inherited entity');for(const [key,n]of Object.entries(u.upgrades??{}))if(n>upgradeCap(content,key as import('../core').UpgradeKey,c.cycle))throw Error('upgrade exceeds cycle cap');}
    if (new Set(c.roster.map(u => u.id)).size !== c.roster.length || c.roster.some(u => !u || !content.pilots.some(p => p.id === u.pilotId) || !content.mechs.some(m => m.id === u.mechId) || u.side !== 'player')) throw new Error('잘못된 부대 저장 상태');
  };
  for(const c of [s.campaign,s.stageStart]) {for(const u of c.roster)validateLoadout(u as unknown as Record<string,unknown>,'campaign.roster',content);if(c.battleCredits!==undefined&&(!Number.isSafeInteger(c.battleCredits)||c.battleCredits<0))throw new Error('invalid battle credits');}
  state(s.campaign); state(s.stageStart);
  if(s.campaign.retryNode!==undefined&&(s.screen!=='intermission'||s.game))throw Error('invalid retry screen');
  for(const c of [s.campaign,s.stageStart])if(c.player){const config=data.players;if(config&&(!validPlayerName(c.player.name,config.name)||!config.presets.some(p=>p.id===c.player!.preset&&p.type===c.player!.type&&p.cast===c.player!.cast)||!config.lines.some(l=>l.id===c.player!.line)))throw new Error('잘못된 플레이어 설정');}
  for(const c of [s.campaign,s.stageStart])if(c.affectionChoices&&Object.values(c.affectionChoices).some(n=>!Number.isSafeInteger(n)||n<1||n>4))throw new Error('잘못된 선택지 기록');
  if(s.campaign.affection&&Object.values(s.campaign.affection).some(n=>!Number.isSafeInteger(n)||n<0))throw new Error('잘못된 호감도');
  if (!['battle', 'result', 'intermission', 'end', 'roster'].includes(s.screen) || !Number.isSafeInteger(s.seed)) throw new Error('잘못된 저장 화면');
  if (s.game) {
    const saved = s.game as unknown as { battle: string; before: string | null; scenario: { runner: RunnerState } };
    const id = JSON.parse(saved.battle).stageId, item = data.stages[id];
    if (!item) throw new Error('저장된 스테이지가 없습니다');
    const stage = deployment(item.stage, s.stageStart, content);
    const loadedContent=personalized(content,s.campaign);
    const program=item.program;
    if(!program)throw new Error('잘못된 인터미션 대화');
    const battle = restore(loadedContent, stage, saved.battle), runner = saved.scenario.runner;
    if (!runner || !Array.isArray(runner.queue) || !Array.isArray(runner.fired) || !runner.allCounts || Object.values(runner.allCounts).some(n => !Number.isSafeInteger(n) || n < 0) || runner.queue.some(t => !program.events[t.event] || !Number.isSafeInteger(t.pc) || t.pc < 0 || t.pc > program.events[t.event].code.length)) throw new Error('잘못된 스크립트 포인터');
    if (!runner.objectives || !['win', 'lose'].every(k => Array.isArray(runner.objectives[k as 'win' | 'lose']) && runner.objectives[k as 'win' | 'lose'].every(v => typeof v === 'string')) || !Number.isInteger(runner.fade) || runner.fade < 0 || runner.fade > 7) throw new Error('잘못된 목표 또는 팔레트 상태');
    if (runner.waiting) {
      const w = runner.waiting, task = runner.queue[0], instruction = task && program.events[task.event].code[task.pc - 1];
      if (!instruction || 'to' in instruction || JSON.stringify(w.command) !== JSON.stringify(instruction) || !Number.isFinite(w.remaining) || w.remaining < 0 || !Number.isFinite(w.visible) || w.visible < 0 || !Array.isArray(w.ids) || !Array.isArray(w.before)) throw new Error('잘못된 화면 대기 상태');
      const length=Array.from(dialoguePlain(interpolate(w.command.args.at(-1)??'',s.campaign))).length;
      if([w.pageStart,w.pageEnd,w.pageNext].some(n=>n!==undefined&&(!Number.isSafeInteger(n)||n<0||n>length))||w.pageEnd!==undefined&&w.pageEnd<(w.pageStart??0)||w.pageNext!==undefined&&w.pageNext<(w.pageEnd??0))throw new Error('잘못된 대사 페이지 위치');
    }
    if (!Array.isArray(s.game.commands) || !Number.isFinite(s.game.elapsed) || !GAME_MODES.includes(s.game.mode)) throw new Error('잘못된 전투 화면 상태');
    s.game = { ...s.game, battle, before: saved.before ? restore(loadedContent, stage, saved.before) : null, scenario: { program, runner, campaign: s.campaign } };
    validateM6Display(s.game);
    if (s.game.mode === 'scenario' && !runner.waiting) throw new Error('잘못된 화면 대기 상태');
  } else if (s.screen === 'battle' || s.screen === 'result') throw new Error('전투 저장 상태가 없습니다');
  return s;
}
export function saveSession(storage: Storage, session: Session, data: CampaignContent): boolean {
  try { storage.setItem(`${data.id??'default'}:${SAVE_KEY}`, serialize(session, data)); return true; } catch { return false; }
}
export function loadSession(storage: Storage, data: CampaignContent, content: Content): Session | null {
  try { const json = storage.getItem(`${data.id??'default'}:${SAVE_KEY}`); return json ? deserialize(json, data, content) : null; } catch { return null; }
}

/** Revert the entire sortie transaction, then carry only the explicitly allowed rewards. */
export function retryDefeat(session:Session,content:Content):Session {
  const rule=content.rules.retryOnDefeat;
  if(!rule||session.game?.battle.outcome!=='defeat'||!['battle','result'].includes(session.screen))throw Error('retry is not available');
  const current=persistBattle(session.campaign,session.game.battle),campaign=structuredClone(session.stageStart);
  if(rule.keep.includes('credits'))campaign.credits=current.credits;
  if(rule.keep.includes('exp')){
    campaign.retryExperience??={};
    for(const unit of current.roster){
      const progress:Pick<StageUnit,'level'|'exp'|'subPilotProgress'>={level:unit.level,exp:unit.exp,subPilotProgress:structuredClone(unit.subPilotProgress)};
      const original=campaign.roster.find(u=>u.id===unit.id);
      if(original){Object.assign(original,progress);delete campaign.retryExperience[unit.id];}
      else campaign.retryExperience[unit.id]=progress;
    }
  }
  campaign.retryNode=session.stageStart.node;
  delete campaign.battleCredits;campaign.stageCredits=campaign.credits;
  return {...session,screen:'intermission',game:null,campaign,stageStart:structuredClone(campaign)};
}
