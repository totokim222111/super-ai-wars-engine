/**
 * 틀: 필살기 (근접 → 대형 빔, 기본 약 7초)
 *
 * 공격자 화면: 힘을 모으고 돌진한다.
 * 맞는 쪽 화면: 연타로 몰아붙이고 띄운 뒤, 돌아가지 않고 그 자리에서 대형 빔으로 끝낸다.
 *
 * 값
 *   hits  돌진 연타 수 (기본 3)
 *   color 궤적과 빔 색 (기본 "#8eeeff")
 *   width 마무리 빔 굵기 (기본 110)
 *   text  마무리 글자 (기본 "최종 답변")
 */
import { all, ease, tween, wait, type Step } from '../../flow';
import { beam, burst, fist, gather, pop, slash, speedLines } from '../../fx';
import { GROUND } from '../scene';
import { bringIn, trail, type StrikeContext, type Template } from '../template';

function* launch(c: StrikeContext): Step {
  const { show, dir } = c, sprite = c.attacker.sprite, color = c.param('color', '#8eeeff'), muzzle = c.muzzle();
  show.sound?.play('charge'); gather(show, muzzle.x, muzzle.y, 260, color);
  yield* all(tween(sprite, { x: c.attackerHome - dir * 100, rotation: -dir * 0.12 }, 0.65), tween(show.stage.camera, { zoom: 1.16 }, 0.65));
  yield* wait(0.2);
  const lines = speedLines(show, -dir as 1 | -1); lines.alpha = 1;
  show.sound?.play('whoosh');
  yield* all(tween(sprite, { x: c.exitX, rotation: dir * 0.1 }, 0.2, ease.in), trail(show, sprite, 0.2)); lines.remove();
}

function* impact(c: StrikeContext): Step {
  const { show, dir } = c, sprite = c.attacker.sprite, target = c.defender.sprite;
  const hits = c.param('hits', 3), color = c.param('color', '#8eeeff'), reach = c.defenderHome - dir * 300;
  yield* wait(0.15); bringIn(c);
  yield* all(tween(sprite, { x: reach }, 0.18, ease.in), trail(show, sprite, 0.18));
  for (let i = 0; i < hits; i++) {
    const body = c.body(); slash(show, body.x, body.y, dir * (i % 2 ? 0.7 : -0.7), 550, color);
    yield* c.land(12, 0.07);
    yield* tween(sprite, { x: reach + dir * (i % 2 ? 0 : 50) }, 0.12);
  }
  yield* wait(0.16);
  fist(show, c.body().x, c.body().y, -dir * 1.2, color);
  yield* c.land(22, 0.18);
  yield* all(tween(target, { y: GROUND - 160 }, 0.3), tween(sprite, { y: GROUND - 140, x: reach - dir * 70 }, 0.3));
  // 화면은 맞는 쪽 그대로. 공중의 공격자에게 빛이 모인다.
  const from = { x: sprite.x + dir * 100, y: sprite.y - sprite.height * 0.55 };
  gather(show, from.x, from.y, 300, color); show.sound?.play('charge');
  yield* tween(show.stage.camera, { zoom: 1.12 }, 0.45); yield* wait(0.35);
  const text = c.param('text', '최종 답변');
  if (text) pop(show, text, 640, 210, 110, '#fff', color, 0.6);
  const ray = beam(show, from, { x: c.exitX, y: from.y }, c.param('width', 110), color);
  show.sound?.play('heavy');
  yield* tween(ray.state, { grow: 1 }, 0.1, ease.in);
  for (let i = 0; i < 3; i++) { yield* c.land(10, 0.04); yield* wait(0.14); }
  yield* tween(ray.state, { thick: 1.6 }, 0.25); yield* wait(0.12);
  burst(show, c.defenderHome, from.y, 440, color);
  yield* c.land(48, 0.42);
  yield* tween(ray.state, { thick: 0 }, 0.24, ease.in); ray.remove();
  yield* all(tween(target, { y: GROUND }, 0.35), tween(sprite, { y: GROUND, rotation: 0 }, 0.35));
  yield* wait(0.5);
}

export const finisher: Template = { launch, impact };
