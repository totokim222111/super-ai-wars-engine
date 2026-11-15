/**
 * 무기 연출 틀의 약속.
 *
 * 틀 하나는 두 토막이다.
 *   launch  공격하는 쪽 화면에서: 쏘거나, 화면 밖으로 달려 나간다.
 *   impact  맞는 쪽 화면에서: 탄이 날아와 꽂히거나, 공격한 기체가 뛰어들어 친다.
 * 그 앞뒤(선언, 컷인, 화면 전환, 피해 숫자, 격파, 대사)는 play.ts가 모든 무기에 똑같이 붙인다.
 *
 * 틀이 지켜야 할 것
 *   1. 한 방이 닿는 순간마다 c.land(세기, 정지)를 부른다. 명중·빗나감·방어·크리티컬은 틀이 가리지 않는다.
 *      (빗나갔을 때 무엇을 보여 줄지는 장면이 정한다.)
 *   2. 방향은 c.dir만 곱해 쓴다. 왼쪽·오른쪽을 직접 쓰지 않는다. 그래야 적의 공격이 저절로 대칭이 된다.
 *   3. 박자를 지킨다: 모으기 → 빠른 동작 → 타격 정지 → 반응. 결정타 앞에는 한 박자 쉰다.
 *   4. 값은 c.param('이름', 기본값)으로 읽는다. 값이 없어도 틀은 돌아가야 한다.
 *   5. 올린 노드는 스스로 치운다(fx.ts의 부품은 알아서 사라진다).
 */
import type { Step } from '../flow';
import { afterimage, type Show } from '../fx';
import type { Sprite } from '../stage';
import { GROUND, HOME, OFF, type Actor, type BattleScene } from './scene';
import type { Outcome, Weapon } from './types';

export interface Point { x: number; y: number }

export interface StrikeContext {
  scene: BattleScene;
  show: Show;
  attacker: Actor;
  defender: Actor;
  /** 공격이 나가는 방향. 아군이 치면 -1(왼쪽), 적이 치면 +1(오른쪽). */
  dir: 1 | -1;
  weapon: Weapon;
  outcome: Outcome;
  /** 한 방이 닿는 순간. 세기: 연사 3~4, 보통 8~12, 결정타 20 이상. 정지: 0.02 / 0.07 / 0.3 안팎. */
  land(power: number, stop?: number): Step;
  /** 무기 자료의 연출 값을 읽는다. 없으면 기본값. */
  param<T>(name: string, fallback: T): T;
  /** 공격이 공격자 화면을 떠나는 쪽 끝의 x, 그리고 맞는 쪽 화면으로 들어오는 쪽 끝의 x. */
  exitX: number;
  entryX: number;
  /** 공격자의 제자리와 방어자의 제자리 x. */
  attackerHome: number;
  defenderHome: number;
  /**
   * 탄이 나가는 곳과 맞는 곳. 기체 자료의 기준점(anchors)을 따른다. 부를 때의 위치를 돌려준다.
   *   muzzle  공격자의 발사 위치. 무기 자료에 from이 있으면 그 기준점, 없으면 "muzzle"
   *   body    방어자의 몸통("core")
   *   point   공격자의 다른 기준점을 이름으로(예: point('shoulder'))
   * 틀에서 기체의 x·y에 숫자를 더해 발사 위치를 어림하지 않는다. 반드시 이것들을 쓴다.
   */
  muzzle(): Point;
  body(): Point;
  point(name: string): Point;
}

export interface Template {
  launch(c: StrikeContext): Step;
  impact(c: StrikeContext): Step;
}

export function makeContext(scene: BattleScene, attacker: Actor, defender: Actor, weapon: Weapon, outcome: Outcome): StrikeContext {
  const dir = scene.dir(attacker), anim = weapon.anim;
  return {
    scene, show: scene.show, attacker, defender, dir, weapon, outcome,
    land: (power, stop) => scene.land(defender, dir, outcome, power, stop),
    param: <T>(name: string, fallback: T): T => (anim[name] === undefined ? fallback : anim[name] as T),
    exitX: dir < 0 ? OFF.left : OFF.right,
    entryX: dir < 0 ? OFF.right : OFF.left,
    attackerHome: HOME[attacker.fighter.side],
    defenderHome: HOME[defender.fighter.side],
    muzzle: () => scene.at(attacker, typeof anim.from === 'string' ? anim.from : 'muzzle'),
    body: () => scene.at(defender, 'core'),
    point: name => scene.at(attacker, name),
  };
}

/** 움직이는 동안 잔상을 남긴다. 빠른 이동과 함께(all) 돌린다. */
export function* trail(show: Show, sprite: Sprite, seconds: number): Step {
  let t = 0, since = 1;
  while (t < seconds) {
    const dt = yield;
    t += dt; since += dt;
    if (since > 0.02) { afterimage(show, sprite); since = 0; }
  }
}

/** 근접 공격: 공격한 기체를 맞는 쪽 화면의 들어오는 끝에 세운다. 여기서부터 뛰어들면 된다. */
export function bringIn(c: StrikeContext): void {
  Object.assign(c.attacker.sprite, { visible: true, x: c.entryX, y: GROUND, rotation: c.dir * 0.08 });
}
