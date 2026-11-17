/**
 * 전투 연출이 받는 자료.
 *
 * 연출은 계산하지 않는다. 누가 누구를 무슨 무기로 쳤고 결과가 어땠는지를 받아서 보여 줄 뿐이다.
 * 계산은 규칙 코어가 하고, 그 결과를 이 모양(Exchange)으로 바꿔 넘긴다.
 */
import type { Speech } from './lines';
import type { Flow } from '../flow';
import type { Portrait, Rect } from '../ui';

export type Side = 'ally' | 'enemy';

/**
 * 그림 위의 기준점. 무기가 나가는 자리와 맞는 자리를 **기체마다** 정한다.
 * 기체 그림은 생김새가 제각각이라, 정해 주지 않으면 탄이 허공에서 나오거나 엉뚱한 데 맞는다.
 *
 * 값은 그림의 보이는 부분(투명 여백 제외) 안에서의 비율이다: [x, y], x는 왼쪽 끝 0 ~ 오른쪽 끝 1, y는 위 0 ~ 아래 1.
 * **그림에 그려진 방향 그대로** 적는다. 엔진이 그림을 뒤집어 쓸 때는 기준점도 함께 뒤집는다.
 *
 *   muzzle    주무장의 끝. 탄과 빔이 나가는 곳(무기 자료에 from이 없을 때 쓴다)
 *   core      몸통 한가운데. 맞는 자리
 *   shoulder  어깨 위. 미사일이 솟는 곳
 *   head      머리. 머리 발칸 같은 무기
 *   hand      근접 무기를 쥔 손
 * 그 밖의 이름을 더해도 된다. 무기 자료의 anim.from이 이름으로 고른다(예: from: "head").
 * 적지 않은 기준점은 엔진의 어림값을 쓴다(scene.ts의 DEFAULT_ANCHORS). 어림값은 어디까지나 임시다.
 */
export type Anchors = Record<string, readonly [number, number]>;

export interface Fighter {
  id: string;
  side: Side;
  name: string;
  pilot: string;
  revealed?:boolean;
  hp: number; hpMax: number;
  en: number; enMax: number;
  image?: HTMLImageElement;
  /** 화면에 그릴 기체의 키(논리 픽셀). 보이는 부분 기준. */
  height: number;
  /** 그림 속 기체가 보는 방향. 아군은 왼쪽, 적은 오른쪽을 봐야 하므로 엔진이 필요하면 뒤집는다. */
  faces: 'left' | 'right';
  /** 대사창의 얼굴. 기체 그림을 그대로 쓰지 않는다. */
  portrait: Portrait;
  /** 컷인에 쓸 영역(눈매 둘레). portrait의 그림에서 잘라 낸다. 없으면 컷인을 하지 않는다. */
  cutin?: Rect;
  /** 이 기체 그림의 기준점(총구, 몸통 등). */
  anchors?: Anchors;
}

/** 무기 연출: 어떤 틀을 어떤 값으로 틀지. 틀마다 받는 값은 templates/의 각 파일 머리말에 있다. */
export interface WeaponAnim { template: string; [param: string]: unknown }

export interface Weapon {
  video?:string;
  id?:string;
  kind?:'melee'|'shoot'|'beam'|'missile'|'map';
  name: string;
  /** 쓰는 EN(원작의 EN). */
  cost: number;
  anim: WeaponAnim;
  /** 파일럿 컷인을 넣는가. 센 무기에만 켠다. */
  cutin?: boolean;
}

/** 공격 한 번의 결과. 규칙 코어가 정한다. */
export interface Outcome {
  hit: boolean;
  damage: number;
  critical?: boolean;
  barrier?: 'immune'|'reduce';
  /** 방어를 골라 피해를 줄였는가. */
  guard?: boolean;
}

/** 공격 한 번에 붙는 대사. 없는 것은 건너뛴다. */
export interface Lines {
  /** 공격하는 쪽의 선언. */
  before?: Speech;
  /** 격파한 뒤 공격한 쪽의 한마디. */
  after?: Speech;
  /** 맞고 살아남은 쪽의 한마디. */
  reaction?: Speech;
  /** 피한 쪽의 한마디. */
  dodge?: Speech;
  /** 격파되는 쪽의 마지막 한마디. */
  lastWords?: Speech;
}

export interface Strike {
  effects?:{targetId:string;text:string}[];
  /** 공격하는 기체와 겨냥한 기체의 id. */
  attacker: string;
  target: string;
  /** 원호 방어: 대신 맞아 주는 기체의 id. */
  cover?: string;
  weapon: Weapon;
  outcome: Outcome;
  lines?: Lines;
  /** 이 공격 앞에 띄울 알림. "반격", "원호 공격" 등. */
  banner?: string;
  combo?:{partner:Fighter;line:string;dialogue?:{fighter:Fighter;line:import('./lines').BattleLine}[]};
}

/** 전투 한 판: 본 공격, 반격, 원호 공격을 일어난 순서대로 담는다. */
export interface Exchange {
  settlement?:{exp:number;credits:number;levels:{name:string;from:number;to:number}[]};
  /** Runtime painter library, reconstructed from the pack; never part of rules/save data. */
  animationArt?:import('./animation-art').AnimationArt;
  area?:{x:number;y:number}[];
  /** 격파 보상의 작은 알림. 지급 자체는 캠페인 어댑터가 끝냈다. */
  rewards?:{name:string;amount:number}[];
  background?: HTMLImageElement;
  fighters: Fighter[];
  strikes: Strike[];
}

/** 값을 돌려주는 연출 스텝(격파됐는지 등). */
export type { Flow };
