/**
 * 틀: 대구경 한 발 (사격)
 *
 * 공격자 화면: 조준선과 카메라가 조여 들고, 한 박자 쉰 뒤 큰 반동으로 포탄을 쏜다.
 * 맞는 쪽 화면: 굵은 포탄이 들어와 꽂히며 크게 폭발한다.
 *
 * 값
 *   color  포탄과 폭발 색 (기본 "#ffb454")
 *   charge 조준 시간(초) (기본 0.65)
 *   size   포탄 크기 (기본 28)
 */
import { all, ease, tween, wait, type Step } from '../../flow';
import { burst, flash, reticle, shell } from '../../fx';
import { W } from '../../stage';
import type { StrikeContext, Template } from '../template';

function* launch(c: StrikeContext): Step {
  const { show, dir } = c, sprite = c.attacker.sprite, muzzle = c.muzzle();
  const color = c.param('color', '#ffb454'), charge = c.param('charge', 0.65), size = c.param('size', 28);
  const aim = reticle(show, muzzle.x + dir * 160, muzzle.y, color);
  show.sound?.play('charge');
  yield* all(tween(show.stage.camera, { x: W / 2 + dir * 60, zoom: 1.17 }, charge), tween(aim.state, { radius: 50 }, charge));
  yield* wait(0.14);
  aim.remove();
  burst(show, muzzle.x, muzzle.y, 180, color); flash(show, 0.5, 0.15);
  show.sound?.play('heavy');
  yield* all(shell(show, muzzle, { x: c.exitX, y: muzzle.y }, 0.18, color, size), tween(sprite, { x: c.attackerHome - dir * 85, rotation: -dir * 0.09 }, 0.12, ease.out));
  yield* tween(sprite, { x: c.attackerHome, rotation: 0 }, 0.35);
}

function* impact(c: StrikeContext): Step {
  const { show } = c, body = c.body(), color = c.param('color', '#ffb454');
  yield* wait(0.16);
  yield* shell(show, { x: c.entryX, y: body.y }, body, 0.22, color, c.param('size', 28));
  burst(show, body.x, body.y, 330, color);
  yield* c.land(30, 0.32);
  yield* wait(0.5);
}

export const heavyShot: Template = { launch, impact };
