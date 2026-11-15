import type { ByteStore } from '../platform/storage';
import {convertBalanceSave} from './save-migration';
import { deserialize, serialize, fingerprint } from './session';
import type { Session } from './session';
import type { CampaignContent } from './content';
import type { Content } from '../core';
import {validCommandShape} from '../core/command-contract';
import {GAME_MODES,clipDuration} from '../game/controller';

export const SLOT_IDS = ['suspend', 'auto', '1', '2', '3'] as const;
export type SlotId = typeof SLOT_IDS[number];
export const slotName = (id: SlotId): string => id === 'auto' ? '자동' : id === 'suspend' ? '중단' : `슬롯 ${id}`;
export interface SaveSummary { stage: string; turn?: number; credits: number; pilot?: string }
export interface SaveFile {
  packId:string; saveVersion: number; contentVersion: number; savedAt: string; playTimeMs: number; summary: SaveSummary;
  campaign: Session['campaign']; stageStart: Session['stageStart']; screen: Session['screen']; seed: number;
  battle?: Record<string, unknown>; scenario?: unknown; migrationNotice?:{refund:number};
}
export interface Slot { id: SlotId; status: 'empty' | 'ok' | 'unreadable'; file?: SaveFile; error?: string }
export const SAVE_VERSION = 6;
/** Public save format starts here. Unknown and pre-split files are rejected. */
export function migrate(value:unknown):SaveFile{const v=value as SaveFile;if(!v||v.saveVersion!==SAVE_VERSION)throw new Error('지원하지 않는 저장 버전');return structuredClone(v);}
export function makeSave(session: Session, data: CampaignContent, playTimeMs: number, savedAt = new Date().toISOString()): SaveFile {
  const legacy = JSON.parse(serialize(session, data)), { game, ...rest } = legacy.session;
  const { scenario, ...battle } = game ?? {};
  if(game)battle.held=false;
  const node = data.nodes[session.campaign.node];
  const currentStage=node?.type==='stage'?data.stages[node.id].stage:session.game?.battle.stage??data.stages[session.campaign.cleared.at(-1)??'']?.stage;
  const credits=session.campaign.credits+Math.max(0,(session.game?.battle.credits??0)-(session.campaign.battleCredits??0));
  const summary: SaveSummary = { stage: session.screen==='end'?'캠페인 완료':currentStage?.name??'인터미션', credits, pilot: session.campaign.roster[0]?.pilotId };
  if (session.screen === 'battle') summary.turn = session.game!.battle.round;
  return { packId:data.id??'default',saveVersion: SAVE_VERSION, contentVersion: legacy.fingerprint, savedAt, playTimeMs: Math.floor(playTimeMs), summary, ...rest, ...(game ? { battle, scenario: scenario.runner } : {}) };
}
export function restoreSave(value: unknown, data: CampaignContent, content: Content,legacyContent?:(c:import('./save-migration').SaveMigration)=>Content): { file: SaveFile; session: Session } {
  let file = migrate(value);
  if(file.packId!==(data.id??'default'))throw new Error('다른 팩의 저장 파일');
  if (!Number.isSafeInteger(file.playTimeMs) || file.playTimeMs < 0 || typeof file.savedAt !== 'string' || !Number.isFinite(Date.parse(file.savedAt)) || !file.summary || typeof file.summary.stage !== 'string') throw new Error('손상된 저장 정보');
  if(file.contentVersion!==fingerprint(data)){const contract=data.saveMigrations?.find(c=>c.from.includes(file.contentVersion));if(!contract)throw Error('저장 파일과 콘텐츠 버전이 다릅니다');restoreSave(file,contract.campaign,legacyContent?.(contract)??contract.content);file=convertBalanceSave(file,data,content,contract).file;}
  if(file.migrationNotice&&(!Number.isSafeInteger(file.migrationNotice.refund)||file.migrationNotice.refund<0))throw Error('손상된 변환 정보');
  const { campaign, stageStart, screen, seed, battle, scenario } = file;
  const session = deserialize(JSON.stringify({ version: 'srpg-session-2', fingerprint: file.contentVersion, session: { campaign, stageStart, screen, seed, game: battle ? { ...battle, scenario: { runner: scenario } } : null } }), data, content);
  if(session.game)validateResume(session.game);
  // Display metadata is derived from validated game state, never trusted from an import.
  return { file: { ...file, summary: makeSave(session, data, file.playTimeMs, file.savedAt).summary }, session };
}
/** Core snapshots and playback are checked by deserialize. Check the surrounding
 * controller fields too, so malformed display state is isolated before attachment. */
function validateResume(g: NonNullable<Session['game']>): void {
  const fail=(field='display'):never=>{throw new Error('손상된 전투 화면 상태: '+field);};
  const point=(p:unknown):boolean=>{const q=p as {x:number;y:number}|null;return !!q&&Number.isSafeInteger(q.x)&&Number.isSafeInteger(q.y)&&q.x>=0&&q.y>=0&&q.x<g.battle.stage.map.w&&q.y<g.battle.stage.map.h;};
  const unit=(id:unknown):boolean=>typeof id==='string'&&g.battle.units.some(u=>u.id===id);
  const weapon=(id:unknown):boolean=>typeof id==='string'&&g.battle.content.weapons.some(w=>w.id===id);
  if(!point(g.cursor))fail('cursor');
  if(!Array.isArray(g.path)||g.path.some(p=>!point(p))||g.lastTap!==null&&!point(g.lastTap))fail('path/lastTap');
  if(!Number.isSafeInteger(g.menuIndex)||g.menuIndex<0||!Number.isFinite(g.elapsed)||g.elapsed<0||typeof g.held!=='boolean'||typeof g.mapKeys!=='boolean'||!GAME_MODES.includes(g.returnMode))fail('menu/timing/returnMode');
  if(g.selected!==null&&!unit(g.selected)||g.target!==null&&!unit(g.target)||g.weapon!==null&&!weapon(g.weapon))fail();
  if(['selected','preview','weapons','target','forecast','spirits','spiritTarget','items','forms','mapAim','mapForecast'].includes(g.mode)&&!unit(g.selected))fail();
  if(['target','forecast','mapAim','mapForecast'].includes(g.mode)&&!weapon(g.weapon))fail();
  if(g.mode==='forecast'&&!unit(g.target)||['response','counter'].includes(g.mode)&&!g.battle.pending||g.mode==='moving'&&!g.before)fail();
  if(!Array.isArray(g.clips)||g.clips.length>1024)fail();
  for(const clip of g.clips){
    if(!clip||!Number.isFinite(clip.duration)||clip.duration<=0||!clip.event)fail();
    const e=clip.event;
    if(e.type==='move'){if(!unit(e.unitId)||!Array.isArray(e.path)||e.path.length<2||e.path.some(p=>!point(p)))fail();}
    else if(e.type==='attack'){if(!unit(e.attackerId)||!unit(e.targetId)||!weapon(e.weaponId)||!['damage','hpDamage','hitRate'].every(k=>Number.isFinite(e[k as 'damage']))||typeof e.hit!=='boolean'||typeof e.counter!=='boolean'||typeof e.critical!=='boolean')fail();}
    else if(e.type==='unit-defeated'){if(!unit(e.unitId))fail();}
    else fail();
    if(clipDuration(e)<=0)fail('clips.event');
  }
  if(g.commands.some(c=>!validCommandShape(c)))fail('commands');
}
export class Saves {
  slots: Slot[] = SLOT_IDS.map(id => ({ id, status: 'empty' }));
  private queue: Promise<unknown> = Promise.resolve();
  constructor(readonly storage: ByteStore, readonly data: CampaignContent, readonly content: Content) {}
  async init():Promise<void>{await this.refresh();}
  async refresh(): Promise<void> {
    this.slots = await Promise.all(SLOT_IDS.map(async id => {
      try {
        const raw = await this.storage.read(id); if (raw === null) return { id, status: 'empty' as const };
        return { id, status: 'ok' as const, file: restoreSave(JSON.parse(raw), this.data, this.content).file };
      } catch (error) { return { id, status: 'unreadable' as const, error: String(error) }; }
    }));
  }
  latest(): Slot | undefined { return this.slots.filter(s => ['auto', 'suspend'].includes(s.id) && s.status === 'ok').sort((a, b) => Date.parse(b.file!.savedAt) - Date.parse(a.file!.savedAt))[0]; }
  async load(id: SlotId): Promise<{ file: SaveFile; session: Session }> {
    const raw = await this.storage.read(id); if (!raw) throw new Error('빈 슬롯');
    const loaded=restoreSave(JSON.parse(raw), this.data, this.content);if(loaded.file.migrationNotice){const clean=structuredClone(loaded.file);delete clean.migrationNotice;await this.storage.replace(id,JSON.stringify(clean));await this.refresh();}return loaded;
  }
  write(id: SlotId, file: SaveFile): Promise<void> {
    const checked = restoreSave(file, this.data, this.content).file, bytes = JSON.stringify(checked);
    const operation = this.queue.then(async () => { await this.storage.replace(id, bytes); await this.refresh(); });
    this.queue = operation.catch(() => {}); return operation;
  }
  async export(): Promise<string> {
    await this.queue;
    const slots = Object.fromEntries(await Promise.all(SLOT_IDS.map(async id => [id, await this.storage.read(id)])));
    return JSON.stringify({ format: `${this.data.id??'default'}:slots:2`, slots }, null, 2);
  }
  importFile(json: string): { id: SlotId; file: SaveFile }[] {
    if (json.length > 10_000_000) throw new Error('파일이 너무 큽니다');
    const bundle = JSON.parse(json);
    if (bundle?.format !== `${this.data.id??'default'}:slots:2` || !bundle.slots || typeof bundle.slots !== 'object' || Array.isArray(bundle.slots) || Object.keys(bundle.slots).some(id => !SLOT_IDS.includes(id as SlotId))) throw new Error('저장 파일 형식 오류');
    return SLOT_IDS.flatMap(id => {
      const raw = bundle.slots[id]; if (raw === null || raw === undefined) return [];
      if (typeof raw !== 'string') throw new Error('슬롯 형식 오류');
      return [{ id, file: restoreSave(JSON.parse(raw), this.data, this.content).file }];
    });
  }
}
