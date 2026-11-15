/**
 * 틀: 산탄 (사격)
 *
 * 공격자 화면: 잠깐 조준한 뒤 여러 탄을 부채꼴로 한꺼번에 쏜다.
 * 맞는 쪽 화면: 퍼진 탄이 한꺼번에 도착해 한 번의 충격을 만든다.
 *
 * 값
 *   count 탄 수 (기본 7)
 *   spread 부채꼴의 반높이 (기본 200)
 *   color 탄 색 (기본 "#ffe275")
 */
import { all, tween, wait, type Step } from '../../flow';
import { burst, shell } from '../../fx';
import type { StrikeContext, Template } from '../template';

const offset = (i: number, count: number, spread: number): number => count <= 1 ? 0 : (i / (count - 1) * 2 - 1) * spread;

function* launch(c: StrikeContext): Step {
  const { show, dir } = c, sprite = c.attacker.sprite, count = c.param('count', 7), color = c.param('color', '#ffe275'), spread = c.param('spread', 200);
  yield* tween(sprite, { x: c.attackerHome - dir * 20 }, 0.3); yield* wait(0.1);
  const muzzle = c.muzzle(); burst(show, muzzle.x, muzzle.y, 150, color); show.sound?.play('shot');
  yield* all(...Array.from({ length: count }, (_, i) => shell(show, muzzle, { x: c.exitX, y: muzzle.y + offset(i, count, spread) }, 0.24, color, 11)), tween(sprite, { x: c.attackerHome - dir * 55 }, 0.08));
  yield* tween(sprite, { x: c.attackerHome }, 0.25);
}

function* impact(c: StrikeContext): Step {
  const { show } = c, count = c.param('count', 7), color = c.param('color', '#ffe275'), spread = c.param('spread', 200), body = c.body();
  yield* wait(0.12);
  yield* all(...Array.from({ length: count }, (_, i) => {
    const y = body.y + offset(i, count, spread);
    return shell(show, { x: c.entryX, y }, { x: body.x, y: body.y + offset(i, count, spread * 0.4) }, 0.2, color, 11);
  }));
  for (let i = 0; i < count; i++) burst(show, body.x, body.y + offset(i, count, spread * 0.4), 90, color);
  yield* c.land(23, 0.25);
  yield* wait(0.45);
}

export const spreadShot: Template = { launch, impact };
