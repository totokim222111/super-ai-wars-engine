import {scaleEnemyReference} from '../../core/stage-content';
import {nextCycle} from '../../campaign/new-game-plus';
import {prepareRules} from '../rules/runtime';
import {term} from '../terms';
/** 기존 캠페인의 자금·개조·파츠·저장을 감싼다. 화면과 브라우저 API는 모른다. */
import { effectivePilot } from '../../core';
import type { BattleState, Content, Unit, UpgradeKey } from '../../core';
import { previewUpgrade, upgradeMech, equipPart, unequipPart } from '../../campaign/intermission';
import {enabledFlag} from '../../campaign/conditions';
import { titleSession, deployment, finishStage, retryDefeat } from '../../campaign/session';
import type { Session } from '../../campaign/session';
import { nextNode } from '../../campaign/state';
import { setPlayer, playerName, validPlayerName } from '../../campaign/player';
import {persistentUnit, persistBattle } from '../../campaign/progress';
import type { CampaignContent } from '../../campaign/content';
import { makeSave, slotName, type Saves, type SlotId } from '../../campaign/saves';
import { normalizeSettings, settingsKey, reducedMotion } from '../../platform/settings';
import type { LocalStore } from '../../platform/storage';
import { createGame } from '../../game/controller';
import { createRunner } from '../../scenario/runner';
import type { MenuModel, MenuSettings, StageResult, NewGameDraft, CreditLine } from '../menus/model';
import type { MapLookup, MapChange } from './map';
import {defeatPoints,type Progression} from '../pack/progression';
import {readGrowth,trainedContent,type Growth} from './training';
import {TrainingSaves} from './saves';
import {defaultPlayers} from '../../campaign/player';
import {encodeSaveCode,decodeSaveCode} from '../../campaign/save-code';
import {SLOT_IDS} from '../../campaign/saves';
import {STORAGE_NOTICE} from '../../platform/storage';
import {storageKey} from '../../platform/storage';

const keys: UpgradeKey[] = ['hp', 'en', 'armor', 'mobility', 'weapons'];
const names:Partial<Record<UpgradeKey,string>> = {hp:'HP',armor:'장갑',mobility:'운동성',weapons:'무기 개조'};

export class CoreCampaign implements MenuModel {
  session: Session = titleSession();
  private preferences: MenuSettings = {uiSize:'auto',flash:reducedMotion()?3:7,enemyBattle:'full',helpSeen:false,tutorial:true, sfx: 8, music: 6, animation: 'on', speed: 1, shake: 10 };
  private playTime = 0;
  private started = Date.now();
  /** 불러오기 검사에서 선택한 현재 캠페인 계약으로 후속 저장도 검사한다. */
  private savingData?:CampaignContent;
  private last: StageResult = { title: '', won: false, credits: 0, exp: 0, kills: 0, parts: [], levels: [] };
  onSettings?: (settings: MenuSettings) => void;
  constructor(readonly data: CampaignContent, readonly content: Content, readonly saves: Saves, readonly lookup: MapLookup,
    private readonly storage?: LocalStore, private readonly creditLines: CreditLine[] = [],private readonly progression:Progression={}) {
    if(progression.training&&!(saves instanceof TrainingSaves)){this.saves=new TrainingSaves(saves.storage,data,content,progression.training);this.saves.slots=saves.slots;}
    try {
      const old = normalizeSettings(JSON.parse(storage?.getItem(settingsKey(data.id)) ?? '{}'));
      this.preferences = { ...this.preferences, sfx: old.volume, animation: old.animation };
      this.setSettings({ ...this.preferences, ...JSON.parse(storage?.getItem(storageKey(data.id??'default','settings')) ?? '{}') });
    } catch { /* 이전 설정이 손상돼도 기본 설정으로 시작 */ }
  }
  /** 임의 값은 기존 boolean flags 안에 JSON을 담은 키로 보존한다. */
  storyValue(name:string): import('../story/parse').Value { const flags=this.session.campaign.flags,key=Object.keys(flags).find(k=>k.startsWith(`v2:value:${encodeURIComponent(name)}:`)); if(key){try{return JSON.parse(decodeURIComponent(key.slice(key.lastIndexOf(':')+1)));}catch{return false;}}return flags[name]??false; }
  setStoryValue(name:string,value:import('../story/parse').Value):void { const flags=this.session.campaign.flags,prefix=`v2:value:${encodeURIComponent(name)}:`; for(const k of Object.keys(flags))if(k.startsWith(prefix))delete flags[k]; if(typeof value==='boolean'){if(value)flags[name]=true;else delete flags[name];}else flags[prefix+encodeURIComponent(JSON.stringify(value))]=true; }
  storyChoice(name:string,index:number):void{if(index>=1&&index<=4){this.session.campaign.affectionChoices??={};this.session.campaign.affectionChoices[name]=index;}}
  /** 대본의 조건 분기를 통과한 동료를 편성에 등록한다. 현재 전장에는 소환하지 않는다. */
  storyRecruit(id:string):void {
    if(this.session.campaign.roster.some(u=>u.id===id))return;
    const definition=Object.values(this.data.stages).flatMap(s=>[...s.stage.units,...(s.stage.definitions??[])]).find(u=>u.id===id&&u.side==='player');
    if(!definition)throw new Error(`합류 아군 정의 없음: ${id}`);
    this.session.campaign.roster.push({...structuredClone(definition),...this.session.campaign.inheritance?.find(u=>u.id===id),...this.session.campaign.retryExperience?.[id]});
    if(this.session.campaign.retryExperience)delete this.session.campaign.retryExperience[id];
  }
  storyAffection(who:string,amount=0):number {const id=this.progression.story?.affectionAliases?.[who]??who,c=this.session.campaign;c.affection??={};return c.affection[id]=(c.affection[id]??0)+amount;}
  funds(): number { return this.session.campaign.credits; }
  hub() {
    const c = this.session.campaign, next = this.data.nodes[c.retryNode??c.node + 1];
    return { chapter: this.data.stages[c.cleared.at(-1) ?? '']?.stage.name ?? '출격 준비', next: next?.type === 'stage' ? this.data.stages[next.id].stage.name ?? next.id : '시범 완료', funds: this.funds() };
  }
  entries() { return [
    { id: 'sortie', label: this.session.campaign.retryNode!==undefined?'재출격':'다음 화로', about: '준비를 마치고 출격합니다.' },
    { id: 'upgrade', label: '기체 개조', about: `${term('funds')}으로 기체의 능력치를 올립니다.` },
    { id: 'parts', label: term('parts'), about: `보유한 ${term('parts')}을 장착하거나 해제합니다.` },
    { id: 'pilot', label: '파일럿', about: `${term('training')}로 능력치를 올리고 기술을 배웁니다.` },
    { id: 'shop', label: '상점', about: `${term('funds')}으로 ${term('parts')}을 사고 팝니다.` },
    { id: 'save', label: '저장', about: '기존 저장 형식으로 진행을 저장합니다.' },
    { id: 'load', label: '불러오기', about: '저장된 진행을 불러옵니다.' },
    { id: 'settings', label: '설정', about: '소리·전투 연출·속도·흔들림을 바꿉니다.' },
  ]; }
  private visibleRoster(){const declared=Object.values(this.data.stages).flatMap(s=>[...s.stage.units,...s.stage.definitions??[]]);return this.session.campaign.roster.filter(u=>!declared.some(d=>d.id===u.id&&!enabledFlag(this.session.campaign.flags,d.requiresFlag)));}
  upgradeUnits() { return this.visibleRoster().map(u => ({ id: u.id, name: this.content.mechs.find(m => m.id === u.mechId)!.name,
    pilot: u.pilotId === this.data.players?.pilotId ? playerName(this.session.campaign) : this.content.pilots.find(p => p.id === u.pilotId)!.name,
    weapons:(()=>{const p=previewUpgrade(this.session,this.content,u.id,'weapons');return Object.entries(p.before.weaponPower).map(([id,value])=>({name:this.content.weapons.find(w=>w.id===id)!.name,value,next:p.from<p.max?p.after.weaponPower[id]:undefined}));})(),
    image: this.lookup.battle.mech(this.content.mechs.find(m => m.id === u.mechId)!, { ...u, effects: [] } as unknown as Unit).image,
    stats: keys.map(key => { const p = previewUpgrade(this.session, this.content, u.id, key);
      const value = (which: 'before' | 'after') => key === 'weapons' ? Object.values(p[which].weaponPower)[0] : p[which][key];
      return { id: key, label: key==='en'?term('en'):names[key]!, level: p.from, max: p.max, value: value('before'), next: p.from < p.max ? value('after') : undefined, cost: p.from < p.max ? p.cost : undefined };
    }) })); }
  upgrade(id: string, key: string): boolean { try { if (!keys.includes(key as UpgradeKey)) return false; this.session = upgradeMech(this.session, this.content, id, key as UpgradeKey); return true; } catch { return false; } }
  inventory() { return (this.content.parts ?? []).map(p => ({ id: p.id, name: p.name, description: p.desc, owned: this.session.campaign.parts.filter(id => id === p.id).length })); }
  partUnits() { return this.visibleRoster().map(u => ({ id: u.id, name: this.content.mechs.find(m => m.id === u.mechId)!.name,
    slots: Array.from({ length: this.content.mechs.find(m => m.id === u.mechId)!.partSlots ?? 0 }, (_, i) => this.inventory().find(p => p.id === u.parts?.[i]) ?? null) })); }
  equip(id: string, slot: number, partId: string | null): boolean { try { this.session = partId ? equipPart(this.session, this.content, id, slot, partId) : unequipPart(this.session, this.content, id, slot); return true; } catch { return false; } }
  pilots() { return this.visibleRoster().map(u => {
    const p = effectivePilot({ content: this.trainedRules() } as BattleState, { ...u, effects: [] } as unknown as Unit);
    return { id: u.id, name: p.id === this.data.players?.pilotId ? playerName(this.session.campaign) : p.name, level: u.level ?? 1, exp: u.exp ?? 0,
      portrait: this.lookup.battle.pilot(p, { ...u, effects: [] } as unknown as Unit).portrait,
      stats:Object.entries(p.stats).map(([key,n])=>[this.lookup.unitInfo?.stats?.[key]?.name??({melee:'격투',shoot:'사격',hit:'명중',evade:'회피',skill:'기량',defense:'방어'}as Record<string,string>)[key]??key,String(n)]as [string,string]),
      spirits: (p.spirits ?? []).map(ref => `${this.content.spirits?.find(d => d.id === ref.id)?.name ?? ref.id} (Lv ${ref.level})`),
      skills: (p.skills ?? []).map(ref => this.content.skills?.find(d => d.id === ref.id)?.name ?? ref.id) };
  }); }
  /** 막 끝난 화의 상점이다. 새로 출격하기 전의 진열이 미리 열리지 않는다. */
  private episode():number {const cleared=this.session.campaign.cleared.map(id=>Number(id.match(/\d+$/)?.[0]??0));return Math.max(1,...cleared);}
  shop() {const e=this.progression.economy;return e?this.inventory().filter(p=>e.items[p.id]&&e.items[p.id].fromEpisode<=this.episode()).map(p=>({...p,price:e.items[p.id].price,sellPrice:Math.floor(e.items[p.id].price*e.sellRatio)})):[];}
  shopLimit():number{return this.progression.economy?.maxQuantity??1;}
  buy(id: string, quantity: number): boolean {
    const p = this.shop().find(p => p.id === id);
    if (this.session.screen !== 'intermission' || !p || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > this.shopLimit() || !Number.isSafeInteger(p.price!*quantity)||p.price! * quantity > this.funds()) return false;
    const next = structuredClone(this.session); next.campaign.credits -= p.price! * quantity; next.campaign.parts.push(...Array<string>(quantity).fill(id)); this.session = next; return true;
  }
  sell(id:string,quantity:number):boolean {
    const e=this.progression.economy,item=e?.items[id],owned=this.inventory().find(p=>p.id===id)?.owned??0;
    if(this.session.screen!=='intermission'||!item||!Number.isSafeInteger(quantity)||quantity<1||quantity>this.shopLimit()||quantity>owned)return false;
    const amount=Math.floor(item.price*e!.sellRatio)*quantity;if(!Number.isSafeInteger(this.funds()+amount))return false;
    const next=structuredClone(this.session);for(let i=0;i<quantity;i++)next.campaign.parts.splice(next.campaign.parts.indexOf(id),1);next.campaign.credits+=amount;this.session=next;return true;
  }
  /** 판매 목록에는 해금 전이라도 가진 품목을 넣는다. 장착한 품목은 inventory에 없다. */
  sellItems(){const e=this.progression.economy;return e?this.inventory().filter(p=>e.items[p.id]&&p.owned>0).map(p=>({...p,price:e.items[p.id].price,sellPrice:Math.floor(e.items[p.id].price*e.sellRatio)})):[];}
  private growth():Growth{return readGrowth(this.storyValue('v2:training'));}
  private putGrowth(g:Growth):void {this.setStoryValue('v2:training',JSON.stringify(g));}
  private trainedRules():Content{return trainedContent(this.content,this.growth(),this.progression.training);}
  training(unitId:string){
    const u=this.session.campaign.roster.find(u=>u.id===unitId),t=this.progression.training;if(!u||!t)return undefined;
    const record=this.growth().pilots[u.pilotId]??{points:0,stats:{},skills:{}},p=effectivePilot({content:this.trainedRules()}as BattleState,{...u,effects:[]}as unknown as Unit);
    return {pilotId:u.pilotId,points:record.points,stats:Object.entries(t.stats).filter(([,rule])=>(rule.fromEpisode??1)<=this.episode()).map(([id,rule])=>{const key=id as keyof typeof p.stats,n=record.stats[id]??0;return {id,label:rule.label,value:p.stats[key],...(n<rule.costs.length?{next:p.stats[key]+rule.step,cost:rule.costs[n]}:{})};}),
      skills:Object.entries(t.skills).filter(([,r])=>r.fromEpisode<=this.episode()).map(([id,rule])=>{const skill=this.content.skills!.find(s=>s.id===id)!,ref=p.skills?.find(s=>s.id===id),level=ref?(ref.level??1):0;return {id,name:skill.name,description:skill.desc,level,...(level<rule.costs.length?{next:level+1,cost:rule.costs[level]}:{})};})};
  }
  train(unitId:string,statId:string):boolean {return this.spendTraining(unitId,statId,false);}
  learn(unitId:string,skillId:string):boolean {return this.spendTraining(unitId,skillId,true);}
  private spendTraining(unitId:string,id:string,skill:boolean):boolean {
    const info=this.training(unitId),item=skill?info?.skills.find(s=>s.id===id):info?.stats.find(s=>s.id===id);
    if(this.session.screen!=='intermission'||!info||!item||item.cost===undefined||item.cost>info.points)return false;
    const g=this.growth(),p=g.pilots[info.pilotId]??={points:0,stats:{},skills:{}};p.points-=item.cost;
    if(skill)p.skills[id]=(item as NonNullable<typeof info>['skills'][number]).next!;else p.stats[id]=(p.stats[id]??0)+1;
    this.putGrowth(g);return true;
  }
  rewardForDefeat(before:BattleState,event:Extract<import('../../core').BattleEvent,{type:'unit-defeated'}>):{name:string;amount:number}|undefined {
    const attacker=before.units.find(u=>u.id===event.by),target=before.units.find(u=>u.id===event.unitId);
    if(!attacker||attacker.side!=='player'||!target||target.side!=='enemy'||!target.alive||target.tags?.includes('no-reward'))return undefined;
    const amount=defeatPoints(this.progression.training,before,target);return amount?{name:attacker.pilotId===this.data.players?.pilotId?playerName(this.session.campaign):before.content.pilots.find(p=>p.id===attacker.pilotId)!.name,amount}:undefined;
  }
  slots() { return this.saves.slots.map(s => ({ id: s.id, label: slotName(s.id), available: s.status === 'ok', detail: s.file ? `${s.file.summary.stage} · ${s.file.summary.turn===undefined?'인터미션':s.file.summary.turn+'턴'} · ${new Date(s.file.savedAt).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})} · ${playerName(s.file.campaign)}` : s.status === 'empty' ? s.id==='suspend'?'맵에서 나갈 때 자동 저장':'빈 칸' : '읽을 수 없음' })); }
  private writeSave(slot:string):Promise<void>{return this.saves.write(slot as SlotId,makeSave(this.session,this.savingData??this.data,this.playTime+Date.now()-this.started));}
  async save(slot:string):Promise<void>{try{await this.writeSave(slot);}catch(error){console.warn('[save] 수동 저장 실패',error);this.storageNotice=STORAGE_NOTICE;this.onStorageIssue?.();throw new Error('저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.');}}
  private autoSaving?:Promise<void>;private autoDirty=false;
  /** Validation precedes replacement. A failed attempt leaves the previous slot intact;
   * the next safe command/scene requests a fresh snapshot instead of retrying bad bytes. */
  autoSave():Promise<void>{
    this.autoDirty=true;if(this.autoSaving)return this.autoSaving;
    this.autoSaving=(async()=>{while(this.autoDirty){this.autoDirty=false;try{await this.writeSave('auto');}catch(error){console.warn('[save] 자동 저장 보류: 다음 안전한 시점에 다시 시도합니다.',error);this.storageNotice=STORAGE_NOTICE;this.onStorageIssue?.();break;}}})().finally(()=>{this.autoSaving=undefined;});
    return this.autoSaving;
  }
  storageNotice?:string;onStorageIssue?:()=>void;
  migrationNotice?:string;
  async load(slot: string): Promise<void> { const loaded = await this.saves.load(slot as SlotId); this.session = loaded.session;if(loaded.file.migrationNotice)this.migrationNotice=loaded.file.migrationNotice.restartedStage?'게임이 업데이트되어 이 스테이지를 처음부터 시작합니다':loaded.file.migrationNotice.updated&&loaded.file.migrationNotice.refund===0?'게임이 업데이트되어 저장을 새 판에 맞췄습니다.':loaded.file.migrationNotice.refund>0?`밸런스가 바뀌어 개조 비용 ${loaded.file.migrationNotice.refund.toLocaleString()} ${this.content.terms?.credits??'크레딧'}을 돌려드렸습니다.`:'밸런스가 바뀌어 저장을 새 판에 맞췄습니다.';this.savingData='data'in loaded?loaded.data as CampaignContent:undefined; this.playTime = loaded.file.playTimeMs; this.started = Date.now(); }
  async saveCode():Promise<string>{await this.saves.refresh();const slots=Object.fromEntries(SLOT_IDS.map(id=>[id,this.saves.slots.find(s=>s.id===id)?.file?JSON.stringify(this.saves.slots.find(s=>s.id===id)!.file):null]));if(this.session.screen!=='title'){const file=makeSave(this.session,this.savingData??this.data,this.playTime+Date.now()-this.started);const check=JSON.stringify({format:`${this.data.id??'default'}:slots:2`,slots:{suspend:JSON.stringify(file)}});this.saves.importFile(check);slots.suspend=JSON.stringify(file);}if(!Object.values(slots).some(Boolean))throw Error('먼저 게임을 시작하거나 저장을 불러오세요.');return encodeSaveCode(JSON.stringify({format:`${this.data.id??'default'}:slots:2`,slots}));}
  async importSaveCode(code:string):Promise<void>{const entries=this.saves.importFile(decodeSaveCode(code));if(!entries.length)throw Error('저장 코드에 슬롯이 없습니다.');for(const e of entries)await this.saves.write(e.id,e.file);await this.saves.refresh();}
  settings(): MenuSettings { return { ...this.preferences }; }
  setSettings(s: MenuSettings): void {
    const number = (n: number, min: number, max: number, fallback: number) => Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
    this.preferences = {uiSize:['auto','normal','large'].includes(s.uiSize??'auto')?s.uiSize:'auto',flash:number(s.flash??(reducedMotion()?3:7),0,10,7),enemyBattle:s.enemyBattle==='brief'?'brief':'full',helpSeen:s.helpSeen===true,tutorial:s.tutorial!==false, cinematic:s.cinematic!==false, sfx: number(s.sfx, 0, 10, 8), music: number(s.music, 0, 10, 6), speed: number(s.speed, 1, 3, 1), shake: number(s.shake, 0, 10, 10), animation: ['on', 'off', 'allies'].includes(s.animation) ? s.animation : 'on' };
    try {
      const old = normalizeSettings(JSON.parse(this.storage?.getItem(settingsKey(this.data.id)) ?? '{}'));
      this.storage?.setItem(settingsKey(this.data.id), JSON.stringify(normalizeSettings({ ...old, volume: this.preferences.sfx, animation: this.preferences.animation })));
      this.storage?.setItem(storageKey(this.data.id??'default','settings'), JSON.stringify(this.preferences));
    } catch { /* 설정 저장 실패 시에도 현재 세션에는 적용 */ }
    this.onSettings?.(this.settings());
  }
  result(): StageResult {
    const game = this.session.game;
    if (!game) return structuredClone(this.last);
    const projected = persistBattle(this.session.campaign, game.battle);
    return { ...structuredClone(this.last), title: game.battle.stage.name ?? game.battle.stage.id,
      won: game.battle.outcome === 'victory', credits: projected.credits - this.session.campaign.stageCredits,
      exp: game.rewards?.exp ?? this.last.exp,
      kills: game.battle.units.filter(u => u.side === 'enemy' && !u.alive && !u.removed).length,
      training:this.stageTraining(),levels: game.rewards?.levels.map(l => `${game.battle.content.pilots.find(p => p.id === (l.event.pilotId??game.battle.units.find(u => u.id === l.event.unitId)?.pilotId))?.name ?? l.event.unitId}  Lv ${l.event.from} → ${l.event.to}`) ?? this.last.levels };
  }
  private stageTraining(){return Object.entries(this.growth().stage?.earned??{}).map(([pilotId,amount])=>({pilotId,amount,clear:this.growth().stage?.clearRecipients?.includes(pilotId)?this.progression.training?.clearReward:undefined,name:pilotId===this.data.players?.pilotId?playerName(this.session.campaign):this.content.pilots.find(p=>p.id===pilotId)?.name??pilotId}));}
  credits(): CreditLine[] { return this.creditLines.map(c => ({ ...c })); }
  playerConfig(){return this.data.players??defaultPlayers;}
  newGame(draft: NewGameDraft): void {
    if (!validPlayerName(draft.name, this.playerConfig().name)) throw new Error(`지원하는 글자로 ${this.playerConfig().name.min}~${this.playerConfig().name.max}자 입력해 주세요`);
    this.playTime = 0; this.started = Date.now();
    this.session = titleSession(); setPlayer(this.session.campaign, draft,this.playerConfig()); this.advance(false);
  }
  canRetry():boolean {return !!this.content.rules.retryOnDefeat&&this.session.game?.battle.outcome==='defeat';}
  retryDescription():string {const keep=this.content.rules.retryOnDefeat?.keep??[],names=keep.map(k=>k==='exp'?'경험치':term('funds'));return names.length?`얻은 ${names.join('·')}을 가지고 출격 준비로 돌아갑니다.`:'출격 직전 상태로 돌아갑니다.';}
  async retry():Promise<void> {this.session=retryDefeat(this.session,this.content);this.savingData=undefined;await this.autoSave();}
  newGamePlus():boolean {if(!this.content.rules.newGamePlus||this.session.screen!=='end')return false;const campaign=nextCycle(this.session.campaign,this.content);this.session=titleSession(this.session.seed);this.session.campaign=campaign;this.advance(false);return true;}
  /** 대본을 실행하지 않고 기존 배치·성장·노드 규칙으로 다음 화면을 연다. */
  advance(advance = true): void {
    this.savingData=undefined;
    const s = structuredClone(this.session);
    s.campaign.node = s.campaign.retryNode??nextNode(this.data.nodes, s.campaign, advance);delete s.campaign.retryNode; const node = this.data.nodes[s.campaign.node];
    if (!node) { s.screen = 'end'; s.game = null; this.session = s; return; }
    if (node.type === 'intermission') { s.screen = 'intermission'; s.game = null; this.session = s; return; }
    const stage = deployment(this.data.stages[node.id].stage, s.campaign, this.trainedRules()); stage.scenario = false;
    // 편성 진행은 저장에서 이어받고 기체 모델은 새 화의 선언을 따른다.
    const declared=[...this.data.stages[node.id].stage.units,...(this.data.stages[node.id].stage.definitions??[])];
    s.campaign.roster=s.campaign.roster.filter(u=>!declared.some(d=>d.id===u.id&&!enabledFlag(s.campaign.flags,d.requiresFlag)));
    for(const u of stage.units.filter(u=>u.side==='player')){const model=declared.find(d=>d.id===u.id&&d.side==='player');if(model){u.mechId=model.mechId;u.tags=[...(model.tags??[])];}}
    const player=stage.units.find(u=>u.id===this.playerConfig().unitId),line=this.playerConfig().lines.find(l=>l.id===s.campaign.player?.line);if(player)player.mechId=line?.mechs?.[player.mechId]??player.mechId;
    for (const u of stage.units.filter(u => u.side === 'player')) {const saved=s.campaign.roster.find(v=>v.id===u.id);if(saved)saved.mechId=u.mechId;else s.campaign.roster.push(structuredClone(u));}
    scaleEnemyReference(stage,s.campaign.roster,this.trainedRules(),s.campaign.cycle??1);
    delete s.campaign.battleCredits; s.campaign.stageCredits = s.campaign.credits; s.stageStart = structuredClone(s.campaign);
    const rules=this.trainedRules();const content = { ...rules, pilots: rules.pilots.map(p => p.id === this.playerConfig().pilotId ? { ...p, name: playerName(s.campaign) } : p) };
    s.game = createGame(content, stage, s.seed, false); prepareRules(s.game.battle); s.game.mode = 'idle';
    s.game.scenario = { program: this.data.stages[node.id].program, runner: createRunner(), campaign: s.campaign };
    s.screen = 'battle'; this.session = s;
    if(this.progression.training||this.progression.economy){const g=this.growth();g.stage={id:stage.id,earned:{},seen:[]};this.putGrowth(g);s.stageStart=structuredClone(s.campaign);s.game.scenario!.campaign=s.campaign;}
    this.last = { title: stage.name ?? stage.id, won: false, credits: 0, exp: 0, kills: 0, parts: [], levels: [] };
  }
  acceptBattle(state: BattleState, changes: readonly MapChange[]): void {
    const game = this.session.game; if (!game) return;
    game.battle = state; game.commands.push(...changes.map(c => c.command));
    game.mode = state.pending?'response':state.outcome ? 'outcome' : 'idle'; game.selected = game.target = game.weapon = null; game.before = null; game.clips = [];
    for (const { events, before } of changes) for (const e of events) {
      const earned = 'unitId' in e && state.units.find(u => u.id === e.unitId)?.side === 'player';
      if (earned && ['credits-gained', 'exp-gained', 'level-up'].includes(e.type)) game.rewards ??= { exp: 0, credits: 0, levels: [], shown: true };
      if (e.type === 'credits-gained' && earned) game.rewards!.credits += e.amount;
      if (e.type === 'exp-gained' && earned) game.rewards!.exp += e.amount;
      if (e.type === 'level-up' && earned) {
        const unit = before.units.find(u => u.id === e.unitId)!;
        game.rewards!.levels.push({ event: e, before: effectivePilot(before, { ...unit,pilotId:e.pilotId??unit.pilotId, level: e.from }), after: effectivePilot(before, { ...unit,pilotId:e.pilotId??unit.pilotId, level: e.to }) });
      }
      if (e.type === 'credits-gained' && earned) this.last.credits += e.amount;
      if (e.type === 'exp-gained' && earned) this.last.exp += e.amount;
      if (e.type === 'unit-defeated' && state.units.find(u => u.id === e.unitId)?.side === 'enemy') this.last.kills++;
      if (e.type === 'level-up' && earned) this.last.levels.push(`${state.content.pilots.find(p => p.id === (e.pilotId??state.units.find(u => u.id === e.unitId)?.pilotId))?.name ?? e.unitId}  Lv ${e.from} → ${e.to}`);
    }
    for(const u of state.units)if(u.side==='player'&&!this.session.campaign.roster.some(v=>v.id===u.id)&&changes.some(c=>c.before.units.some(v=>v.id===u.id&&v.side!=='player')))this.session.campaign.roster.push(persistentUnit(u));
    this.session.campaign = persistBattle(this.session.campaign, state);
    if(this.progression.training){const g=this.growth();g.stage??={id:state.stage.id,earned:{},seen:[]};
      for(const change of changes)for(const [index,event]of change.events.entries())if(event.type==='unit-defeated'){
        const reward=this.rewardForDefeat(change.before,event),attacker=change.before.units.find(u=>u.id===event.by),token=JSON.stringify([change.before.stage.id,change.before.round,change.before.phase,change.before.rng,change.after.rng,event.unitId,event.by,index]);
        if(reward&&attacker&&!g.stage.seen.includes(token)){const p=g.pilots[attacker.pilotId]??={points:0,stats:{},skills:{}};p.points+=reward.amount;g.stage.earned[attacker.pilotId]=(g.stage.earned[attacker.pilotId]??0)+reward.amount;g.stage.seen.push(token);}
      }this.putGrowth(g);
    }
    game.scenario!.campaign = this.session.campaign;
  }
  finish(): void {
    const battle=this.session.game?.battle;if(battle?.outcome==='victory'&&!this.session.campaign.cleared.includes(battle.stage.id)){
      for(const r of this.progression.game?.recruitment?.[battle.stage.id]??[])if(r.afterClear){this.storyRecruit(r.unit);if(r.flag)this.setStoryValue(r.flag,1);}
      const amount=this.progression.training?.clearReward??0,g=this.growth();g.stage??={id:battle.stage.id,earned:{},seen:[]};
      if(amount&&!g.stage.clearAwarded){const pilots=new Set(this.session.campaign.roster.flatMap(u=>[u.pilotId,...this.content.mechs.find(m=>m.id===u.mechId)?.subPilots??[]]));for(const id of pilots){const p=g.pilots[id]??={points:0,stats:{},skills:{}};p.points+=amount;g.stage.earned[id]=(g.stage.earned[id]??0)+amount;}g.stage.clearAwarded=true;g.stage.clearRecipients=[...pilots];this.putGrowth(g);}
    }
    const current=this.session.game;if(current?.battle.outcome==='victory'&&!this.session.campaign.cleared.includes(current.battle.stage.id))for(const [id,count]of Object.entries(this.progression.stageRewards?.[current.battle.stage.id]??{}))this.session.campaign.parts.push(...Array<string>(count).fill(id));
    const game=this.session.game,e=this.progression.economy,g=this.growth();
    if(game?.battle.outcome==='victory'&&game.mode==='outcome'&&this.session.screen==='battle'&&e?.income[game.battle.stage.id]&&!g.stage?.settled){
      const c=this.session.campaign,projected=persistBattle(c,game.battle),already=projected.credits-c.stageCredits-(game.battle.credits??0),extra=Math.max(0,e.income[game.battle.stage.id].clear+Object.entries(e.income[game.battle.stage.id].rosterClear??{}).reduce((n,[id,amount])=>n+(c.roster.some(u=>u.id===id)?amount:0),0)-already);c.credits+=extra;game.scenario!.campaign=c;
      g.stage??={id:game.battle.stage.id,earned:{},seen:[]};g.stage.settled=true;this.putGrowth(g);
    }
    finishStage(this.session); this.last.won = this.session.game?.battle.outcome === 'victory';this.last.training=this.stageTraining();
  }
}
