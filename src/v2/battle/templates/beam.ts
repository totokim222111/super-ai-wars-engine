/**
 * 틀: 빔 (사격, 센 한 방)
 *
 * 공격자 화면: 총구에 빛이 모이고(모으기), 굵은 빛줄기가 화면 밖으로 뻗는다.
 * 맞는 쪽 화면: 빛줄기가 반대편에서 뻗어 와 기체를 꿰뚫고, 닿아 있는 동안 여러 번 깎다가 마지막에 크게 터진다.
 *
 * 값
 *   color  빔 색 (기본 "#7fe9f7")
 *   width  빔 굵기 (기본 46)
 *   ticks  닿아 있는 동안 깎는 횟수 (기본 4)
 *   charge 모으는 시간(초) (기본 0.55)
 */
import { all, ease, tween, wait, type Step } from '../../flow';
import { beam, burst, flash, gather, shake } from '../../fx';
import { W } from '../../stage';
import type { StrikeContext, Template } from '../template';

function* launch(c: StrikeContext): Step {
  const { show, dir } = c, { sprite } = c.attacker, camera = show.stage.camera;
  const color = c.param('color', '#7fe9f7'), width = c.param('width', 46), charge = c.param('charge', 0.55);
  const muzzle = c.muzzle();
  // 모으기: 카메라가 다가가고, 총구로 빛의 고리가 조여 든다.
  show.sound?.play('charge');
  for (let i = 0; i < 3; i++) show.runner.run((function* (): Step { yield* wait(i * charge / 3); gather(show, muzzle.x, muzzle.y, 190, color); })());
  yield* all(tween(camera, { x: W / 2 + dir * 60, zoom: 1.14 }, charge, ease.inOut), tween(sprite, { x: c.attackerHome - dir * 20 }, charge));
  burst(show, muzzle.x, muzzle.y, 150, color);
  yield* wait(0.08);   // 쏘기 직전의 한 박자
  // 발사: 빛줄기가 화면 밖까지 뻗고, 반동으로 밀린다.
  flash(show, 0.6, 0.2); show.sound?.play('beam', 0.8);
  const ray = beam(show, muzzle, { x: c.exitX, y: muzzle.y }, width, color);
  show.runner.run(shake(show, 16, 0.7));
  yield* all(tween(ray.state, { grow: 1 }, 0.08, ease.in), tween(sprite, { x: c.attackerHome - dir * 46 }, 0.08));
  yield* wait(0.55);
  yield* all(tween(ray.state, { thick: 0 }, 0.2, ease.in), tween(sprite, { x: c.attackerHome }, 0.3));
  ray.remove();
}

function* impact(c: StrikeContext): Step {
  const { show } = c, color = c.param('color', '#7fe9f7'), width = c.param('width', 46), ticks = c.param('ticks', 4);
  yield* wait(0.15);
  const body = c.body();
  // 빛줄기가 들어와 기체를 지나 반대편 끝까지 꿰뚫는다.
  show.sound?.play('heavy', 0.7);
  const ray = beam(show, { x: c.entryX, y: body.y }, { x: c.exitX, y: body.y }, width, color);
  yield* tween(ray.state, { grow: 1 }, 0.1, ease.in);
  show.runner.run(shake(show, 12, 0.2 + ticks * 0.11));
  for (let i = 0; i < ticks; i++) { yield* c.land(6, 0.03); yield* wait(0.07); }
  // 빛이 한 번 부풀었다가 꺼지며 크게 터진다.
  yield* tween(ray.state, { thick: 1.5 }, 0.12);
  burst(show, body.x, body.y, 260, color);
  yield* all(tween(ray.state, { thick: 0 }, 0.16, ease.in), c.land(24, 0.3));
  ray.remove();
  yield* wait(0.3);
}

export const beamShot: Template = { launch, impact };
