/**
 * 틀: 곡사 (사격)
 *
 * 공격자 화면: 위로 포탄을 쏘아 올리고 반동을 받는다.
 * 맞는 쪽 화면: 그림자가 먼저 커지고, 위에서 포탄이 떨어져 꽂힌다.
 *
 * 값
 *   count 포탄 수 (기본 3)
 *   color 포탄과 폭발 색 (기본 "#ff9866")
 */
import { all, ease, tween, wait, type Step } from '../../flow';
import { burst, groundShadow, shell } from '../../fx';
import { GROUND } from '../scene';
import type { StrikeContext, Template } from '../template';

function* launch(c: StrikeContext): Step {
  const { show, dir } = c, sprite = c.attacker.sprite, count = c.param('count', 3), color = c.param('color', '#ff9866');
  yield* tween(sprite, { rotation: -dir * 0.12 }, 0.4);
  yield* wait(0.12);
  for (let i = 0; i < count; i++) {
    const muzzle = c.muzzle(); burst(show, muzzle.x, muzzle.y, 110, color); show.sound?.play('heavy', 0.7);
    yield* all(shell(show, muzzle, { x: muzzle.x + dir * 320, y: -120 }, 0.24, color, 24), tween(sprite, { x: c.attackerHome - dir * 30 }, 0.09));
    yield* tween(sprite, { x: c.attackerHome }, 0.1);
  }
  yield* tween(sprite, { rotation: 0 }, 0.2);
}

function* impact(c: StrikeContext): Step {
  const { show, dir } = c, count = c.param('count', 3), color = c.param('color', '#ff9866');
  for (let i = 0; i < count; i++) {
    const x = c.defenderHome + dir * (i - (count - 1) / 2) * 70, body = c.body(), shadow = groundShadow(show, x, GROUND);
    yield* tween(shadow.state, { radius: 125 }, 0.35, ease.in);
    show.sound?.play('whoosh');
    yield* shell(show, { x: x - dir * 130, y: -150 }, { x, y: body.y }, 0.22, color, 32);
    shadow.remove(); burst(show, x, body.y, 260, color);
    yield* c.land(i === count - 1 ? 26 : 13, i === count - 1 ? 0.28 : 0.1);
  }
  yield* wait(0.45);
}

export const artillery: Template = { launch, impact };
