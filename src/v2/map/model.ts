/**
 * 맵 화면이 규칙 쪽에 묻는 것들.
 *
 * 맵 화면(screen.ts)은 규칙을 모른다. 어디까지 갈 수 있는지, 누구를 칠 수 있는지, 치면 어떻게 되는지를
 * 모두 MapModel에 묻고, 돌려받은 "일어난 일(MapEvent)"을 순서대로 보여 줄 뿐이다.
 * 진짜 게임에서는 규칙 코어를 감싼 MapModel이, 진열장에서는 흉내 낸 MapModel이 들어온다.
 */
import type { Exchange } from '../battle/types';
import type { Spirit } from '../spirit';
import type { Portrait } from '../ui';

export type Team = 'ally' | 'enemy' | 'third' | 'neutral';
export interface Cell { col: number; row: number }
export const sameCell = (a: Cell, b: Cell): boolean => a.col === b.col && a.row === b.row;

/** 맵 위의 기체 하나. 화면이 보여 주는 데 필요한 것만 담는다. */
export interface UnitView {
  actionsRemaining?:number;actionsMax?:number;
  revealed?:boolean;
  id: string;
  team: Team;
  cell: Cell;
  name: string;
  pilot: string;
  /** 맵 아이콘. 기체마다 고유한 그림이어야 한다. */
  icon?: HTMLImageElement;
  iconCrop?: [number,number,number,number];
  /** 기체 그림을 말로 쓸 때 칸 안에 맞춘다. */
  iconFit?: boolean;
  portrait: Portrait;
  hp: number; hpMax: number;
  en: number; enMax: number;
  /** 기력. */
  heat: number;
  barrier?:number;
  /** 이번 턴에 행동을 마쳤는가. */
  acted: boolean;
}

export interface TerrainView { name: string; defense: number; evade: number }
export interface Command { id: string; label: string; disabled?: boolean }
export interface WeaponView { id: string; name: string; power: number; range: string; cost: number; usable: boolean;resources?:string;reason?:string }
export interface SpiritView { id: string; name: string; cost: number; usable: boolean; pilotId?:string;pilot?:string;sp?:number;spMax?:number; targeted?:boolean;desc?:string;duration?:string;target?:string;reason?:string }

/** 전투 전 예측의 한쪽. weapon이 없으면 반격하지 못한다는 뜻이다. */
export interface ForecastSide { unitId: string; weapon?: string; resources?:string; hit?: number; damage?: number; critical?: number }
export interface Forecast { attacker: ForecastSide; defender: ForecastSide }

/** 행동의 결과로 일어난 일. 맵 화면이 이 순서대로 보여 준다. */
export type MapEvent =
  | {type:'status';units:UnitView[];gains:{unitId:string;hp:number;en:number;ammo:boolean}[]}
  | {type:'speech';name:string;portrait:Portrait;text:string;mood:string}
  | {type:'passage';cells:Cell[]}
  | {type:'notice';text:string;unitId?:string;sound?:string}
  | { type: 'move'; unitId: string; path: Cell[] }
  | { type: 'battle'; exchange: Exchange }
  | { type: 'spirit'; unitId: string; spirit: Spirit }
  | { type: 'defeat'; unitId: string; reward?:{name:string;amount:number} }
  | { type: 'spawn'; unit: UnitView }
  | { type: 'look'; cell: Cell }
  | { type: 'phase'; team: Team; turn: number }
  | { type: 'end'; won: boolean }
  | { type: 'story'; scene: string }
  | { type: 'objectives' }
  | {type:'hints'}
  | { type: 'response' }
  | {type:'change';units:UnitView[];focus:Cell};

export interface UnitAction {id:string;label:string}
export interface MapAim {id:string;label:string;cell?:Cell}
export interface MapPreview {cells:Cell[];targets:{unitId:string;damage:number;hit:number;friendly:boolean}[];friendlyFire:boolean}
export interface ResponseChoice {id:string;label:string;forecast:Forecast}
export interface ResponsePrompt {attacker:UnitView;defender:UnitView;choices:ResponseChoice[]}
export interface UnitDetails {
  unit:UnitView; known:boolean; portrait:Portrait;
  tips?:{stats:Record<string,{id:string;desc?:string}>;skills:string[];spirits:{name:string;cost:number;desc?:string;duration?:string;target?:string;reason?:string}[]};
  level:string; morale:string; sp:string; spMax:string;
  pilotStats:[string,string][]; pilotAdapt:string; skills:string[];
  spirits:{name:string;cost:string;usable:boolean}[];
  mech:{upgrades?:[string,string][];image?:HTMLImageElement;faces:'left'|'right';stats:[string,string][];size:string;adapt:string;hp:number;hpMax:number;en:number;enMax:number};
  effects:string[];
  weapons:{reason?:string;name:string;power:string;range:string;hit:string;critical:string;cost:string;traits:string}[];
}
export interface MapModel {
  weaponSkill?(unitId:string,at:Cell,weaponId:string):MapEvent[];
  deviceTargets?(unitId:string,at:Cell,deviceId:string):string[];
  device?(unitId:string,at:Cell,deviceId:string,targetId:string):MapEvent[];
  item?(unitId:string,at:Cell,slot:number):MapEvent[];
  details?(unitId:string):UnitDetails;
  blockedCells?():Cell[];
  terrainPaint?():import('./terrain').MapTerrain|undefined;
  images?(): (HTMLImageElement|undefined)[];
  transformations?(unitId:string,at:Cell):UnitAction[];
  combinations?(unitId:string,at:Cell):UnitAction[];
  transform?(unitId:string,at:Cell,formId:string):MapEvent[];
  combine?(unitId:string,at:Cell,combinationId:string):MapEvent[];
  split?(unitId:string,at:Cell):MapEvent[];
  persuadeTargets?(unitId:string,at:Cell):string[];
  persuade?(unitId:string,at:Cell,targetId:string):MapEvent[];
  mapWeapons?(unitId:string,at:Cell):WeaponView[];
  mapAims?(unitId:string,at:Cell,weaponId:string):MapAim[];
  mapPreview?(unitId:string,at:Cell,weaponId:string,aimId:string):MapPreview;
  mapAttack?(unitId:string,at:Cell,weaponId:string,aimId:string):MapEvent[];
  response?():ResponsePrompt|undefined;
  respond?(choiceId:string):MapEvent[];
  continueTurn?():MapEvent[];
  readonly cols: number;
  readonly rows: number;
  /** 지형 그림. 맵 전체에 깔린다. */
  readonly terrain?: HTMLImageElement;
  turn(): { team: Team; number: number };
  units(): UnitView[];
  terrainAt(cell: Cell): TerrainView;
  /** 그 기체가 이번에 갈 수 있는 칸(지금 선 칸 포함). */
  reach(unitId: string): Cell[];
  /** 지금 선 칸에서 to까지 지나갈 길(양 끝 포함). */
  route(unitId: string, to: Cell): Cell[];
  /** at에 섰을 때 고를 수 있는 명령. */
  commands(unitId: string, at: Cell): Command[];
  /** at에 섰을 때 무기가 닿는 칸(범위 표시용)과, 칠 수 있는 적. */
  range(unitId: string, at: Cell): Cell[];
  targets(unitId: string, at: Cell): string[];
  weapons(unitId: string, at: Cell, targetId: string): WeaponView[];
  forecast(unitId: string, at: Cell, weaponId: string, targetId: string): Forecast;
  spirits(unitId: string): SpiritView[];
  spiritTargets?(unitId:string,spiritId:string):string[];
  /** 행동들. 일어난 일을 순서대로 돌려준다. 돌려준 뒤의 units()는 이미 결과가 반영된 상태다. */
  wait(unitId: string, at: Cell): MapEvent[];
  attack(unitId: string, at: Cell, weaponId: string, targetId: string): MapEvent[];
  cast(unitId: string, spiritId: string,targetId?:string): MapEvent[];
  /** 턴을 끝낸다. 적의 차례 전체와 다음 아군 차례의 시작까지 담아 돌려준다. */
  endTurn(): MapEvent[];
}
