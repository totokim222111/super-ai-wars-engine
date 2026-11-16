/**
 * 메뉴 화면이 게임 진행 쪽에 묻는 것들.
 *
 * 맵 화면과 같은 방식이다. 메뉴 화면은 자금이 얼마인지, 무엇을 살 수 있는지, 사면 어떻게 되는지를 모른다.
 * 모두 CampaignModel에 묻고, 결과를 보여 줄 뿐이다. 진짜 게임에서는 캠페인(저장 데이터와 규칙)을 감싼 것이,
 * 진열장에서는 흉내 낸 것이 들어온다.
 *
 * 화면이 늘어나면 이 인터페이스에 그 화면이 묻는 것을 더한다(강화 파츠, 상점, 파일럿, 저장 등).
 */

/** 인터미션 첫 화면의 머리말. */
export interface HubInfo {
  /** 방금 끝낸 화와 다음 화의 이름. */
  chapter: string;
  next: string;
  funds: number;
}

/** 인터미션 메뉴의 항목 하나. id는 화면이 어디로 갈지 정하는 데 쓴다. */
export interface HubEntry { id: string; label: string; about: string; disabled?: boolean }

/** 개조할 수 있는 능력치 하나. cost가 없으면 더 올릴 수 없다는 뜻이다. */
export interface UpgradeStat { id: string; label: string; level: number; max: number; value: number; next?: number; cost?: number }
export interface UpgradeUnit { id: string; name: string; pilot: string; image?: HTMLImageElement; weapons?:{name:string;value:number;next?:number}[];stats: UpgradeStat[] }

export interface CampaignModel {
  hub(): HubInfo;
  entries(): HubEntry[];
  funds(): number;
  upgradeUnits(): UpgradeUnit[];
  /** 한 단계 올린다. 자금이 모자라거나 더 올릴 수 없으면 false. */
  upgrade(unitId: string, statId: string): boolean;
}


/** 추가 메뉴의 자료. 기존 CampaignModel 구현은 이 선택 항목 없이도 돌아간다. */
export interface PartItem { id: string; name: string; description: string; owned: number; price?: number; sellPrice?:number }
export interface PartUnit { id: string; name: string; slots: (PartItem | null)[] }
export interface PilotInfo { id: string; name: string; level: number; exp: number; portrait?: import('../ui').Portrait; stats: [string, string][]; spirits: string[]; skills: string[] }
export interface SaveSlot { id: string; label: string; available: boolean; detail: string }
export interface MenuSettings { cinematic?:boolean; sfx: number; music: number; animation: 'on' | 'off' | 'allies'; speed: number; shake: number }
export interface StageResult { title: string; won: boolean; credits: number; exp: number; kills: number; parts: string[]; levels: string[]; training?:{pilotId:string;name:string;amount:number;clear?:number}[] }
export interface PilotTraining {pilotId:string;points:number;stats:{id:string;label:string;value:number;next?:number;cost?:number}[];skills:{id:string;name:string;description:string;level:number;next?:number;cost?:number}[]}
export interface NewGameDraft { name: string; preset: number; line: string }
export interface CreditLine { title: string; detail: string }
export interface MenuQueries {
  playerConfig?():import('../../campaign/player').PlayerConfig;
  partUnits(): PartUnit[];
  inventory(): PartItem[];
  equip(unitId: string, slot: number, partId: string | null): boolean;
  pilots(): PilotInfo[];
  shop(): PartItem[];
  buy(partId: string, quantity: number): boolean;
  /** 기존 모델은 생략할 수 있다. 그때 육성 화면은 조회만 한다. */
  sell?(partId:string,quantity:number):boolean;
  sellItems?():PartItem[];
  shopLimit?():number;
  training?(unitId:string):PilotTraining|undefined;
  train?(unitId:string,statId:string):boolean;
  learn?(unitId:string,skillId:string):boolean;
  saveCode?():Promise<string>;
  importSaveCode?(code:string):Promise<void>;
  storageNotice?:string;
  slots(): SaveSlot[];
  save(slot: string): Promise<void>;
  load(slot: string): Promise<void>;
  settings(): MenuSettings;
  setSettings(settings: MenuSettings): void;
  result(): StageResult;
  newGame(draft: NewGameDraft): void;
  canRetry?():boolean;
  retryDescription?():string;
  credits(): CreditLine[];
}
export interface CampaignModel extends Partial<MenuQueries> {}
export type MenuModel = CampaignModel & MenuQueries;
