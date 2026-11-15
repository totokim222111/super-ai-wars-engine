/**
 * 틀: 몸통 돌진 (근접)
 *
 * 공격자 화면: 길게 모은 뒤 잔상을 끌며 화면 밖으로 돌진한다.
 * 맞는 쪽 화면: 화면을 가로질러 한 번 세게 들이받고 그대로 지나간다.
 *
 * 값
 *   charge 모으는 시간(초) (기본 0.85)
 *   color  모으는 빛과 궤적 색 (기본 "#ff8b58")
 */
import { all, ease, tween, wait, type Step } from '../../flow';
import { gather, ring, speedLines } from '../../fx';
import { bringIn, trail, type StrikeContext, type Template } from '../template';

function* launch(c: StrikeContext): Step {
  const { show, dir } = c, sprite = c.attacker.sprite, charge = c.param('charge', 0.85), muzzle = c.muzzle();
  show.sound?.play('charge');
  gather(show, muzzle.x, muzzle.y, 220, c.param('color', '#ff8b58'));
  yield* tween(sprite, { x: c.attackerHome - dir * 120, rotation: -dir * 0.13 }, charge);
  yield* wait(0.14);
  const lines = speedLines(show, -dir as 1 | -1); lines.alpha = 1;
  show.sound?.play('whoosh');
  yield* all(tween(sprite, { x: c.exitX, rotation: dir * 0.18 }, 0.18, ease.in), trail(show, sprite, 0.18));
  lines.remove();
}

function* impact(c: StrikeContext): Step {
  const { show, dir } = c, sprite = c.attacker.sprite;
  yield* wait(0.16);
  bringIn(c);
  const lines = speedLines(show, -dir as 1 | -1); lines.alpha = 1;
  yield* all(tween(sprite, { x: c.defenderHome - dir * 100 }, 0.17, ease.in), trail(show, sprite, 0.17));
  const body = c.body(); ring(show, body.x, body.y, 500, c.param('color', '#ff8b58'));
  yield* c.land(38, 0.4);
  yield* all(tween(sprite, { x: c.exitX }, 0.22, ease.in), trail(show, sprite, 0.22));
  lines.remove();
  yield* wait(0.4);
}

export const chargeRam: Template = { launch, impact };
