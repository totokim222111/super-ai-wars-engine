/**
 * 틀: 주먹 연타 (근접)
 *
 * 공격자 화면: 몸을 당겼다가 잔상을 끌며 뛰어든다.
 * 맞는 쪽 화면: 좌우 연타, 올려치기, 한 박자 뒤 내리꽂기 순서로 친다.
 *
 * 값
 *   hits  짧은 연타 수 (기본 4)
 *   color 주먹과 충격파 색 (기본 "#ffba66")
 *   words 연타 글자 배열 (기본 없음)
 */
import { all, ease, tween, wait, type Step } from '../../flow';
import { fist, pop, ring, speedLines } from '../../fx';
import { GROUND } from '../scene';
import { bringIn, trail, type StrikeContext, type Template } from '../template';

function* launch(c: StrikeContext): Step {
  const { show, dir } = c, sprite = c.attacker.sprite;
  yield* tween(sprite, { x: c.attackerHome - dir * 65, rotation: -dir * 0.1 }, 0.3);
  show.sound?.play('whoosh');
  yield* all(tween(sprite, { x: c.exitX, rotation: dir * 0.08 }, 0.2, ease.in), trail(show, sprite, 0.2));
}

function* impact(c: StrikeContext): Step {
  const { show, dir } = c, sprite = c.attacker.sprite, target = c.defender.sprite;
  const hits = c.param('hits', 4), color = c.param('color', '#ffba66'), words = c.param<string[]>('words', []), reach = c.defenderHome - dir * 230;
  yield* wait(0.12); bringIn(c);
  const lines = speedLines(show, -dir as 1 | -1); lines.alpha = 0.7;
  yield* all(tween(sprite, { x: reach }, 0.16, ease.in), trail(show, sprite, 0.16));
  for (let i = 0; i < hits; i++) {
    const body = c.body(), hand = i % 2 ? 1 : -1;
    fist(show, body.x, body.y + hand * 38, hand * dir * 0.4, color);
    if (words[i]) pop(show, words[i], body.x + dir * 130, body.y - 100, 92, '#fff', color, 0.15);
    yield* c.land(7, 0.035);
    yield* tween(sprite, { x: reach + dir * (i % 2 ? 0 : 34), rotation: hand * dir * 0.06 }, 0.08);
  }
  yield* tween(sprite, { y: GROUND + 28, rotation: -dir * 0.15 }, 0.2);
  const body = c.body(); fist(show, body.x, body.y, -dir * 1.1, color);
  yield* c.land(17, 0.13);
  // 결과 판정은 land에 맡기고, 공중 구도만 만든다. 빗나감/피격의 x 복귀와 겹치지 않는다.
  yield* all(tween(target, { y: GROUND - 150 }, 0.26), tween(sprite, { y: GROUND - 110 }, 0.26));
  yield* wait(0.18);
  fist(show, c.defenderHome, GROUND - 200, dir * 1.2, color);
  yield* all(tween(target, { y: GROUND }, 0.12, ease.in), tween(sprite, { y: GROUND, rotation: 0 }, 0.12, ease.in));
  yield* c.land(28, 0.3);
  ring(show, c.defenderHome, GROUND - 20, 310, color);
  lines.remove();
  yield* wait(0.45);
}

export const punchRush: Template = { launch, impact };
