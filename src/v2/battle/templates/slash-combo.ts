/**
 * 틀: 베기 연타 (근접)
 *
 * 공격자 화면: 몸을 당겼다가 화면 밖으로 돌진한다.
 * 맞는 쪽 화면: 뛰어들어 짧게 여러 번 베고, 한 박자 쉰 뒤 화면이 꺼진 사이 한 줄기 빛으로 베고 지나간다(일섬).
 *
 * 값
 *   hits          짧게 베는 횟수 (기본 3)
 *   words         벨 때마다 튀어나오는 글자들. 예: ["기","승","전"] (기본 없음)
 *   finisher      일섬으로 끝내는가 (기본 true). false면 연타로 끝난다
 *   finisherWord  일섬의 글자. 예: "결" (기본 없음)
 *   color         궤적 색 (기본 "#6fc4ff")
 */
import { all, ease, tween, wait, type Step } from '../../flow';
import { pop, slash, speedLines } from '../../fx';
import { Shape, W } from '../../stage';
import { cover } from '../../ui';
import { GROUND } from '../scene';
import { bringIn, trail, type StrikeContext, type Template } from '../template';

function* launch(c: StrikeContext): Step {
  const { show, dir } = c, { sprite } = c.attacker;
  // 모으기: 몸을 뒤로 당긴다. 이 박자가 있어야 돌진이 빨라 보인다.
  yield* tween(sprite, { x: c.attackerHome - dir * 70, rotation: -dir * 0.07 }, 0.28);
  // 돌진: 화면 밖으로 사라진다.
  const rush = speedLines(show, -dir as 1 | -1);
  rush.alpha = 1;
  show.sound?.play('whoosh');
  yield* all(tween(sprite, { x: c.exitX, rotation: dir * 0.08 }, 0.2, ease.in), trail(show, sprite, 0.2));
  rush.remove();
}

function* impact(c: StrikeContext): Step {
  const { show, dir } = c, { sprite } = c.attacker, camera = show.stage.camera;
  const hits = c.param('hits', 3), words = c.param<string[]>('words', []), color = c.param('color', '#6fc4ff');
  const reach = c.defenderHome - dir * 270;
  yield* wait(0.12);   // 맞는 쪽이 혼자 서 있는 짧은 틈. 곧 뭔가 온다는 예고가 된다.
  bringIn(c);
  const lines = speedLines(show, -dir as 1 | -1);
  lines.alpha = 1;
  yield* all(tween(sprite, { x: reach }, 0.1, ease.in), tween(camera, { zoom: 1.1 }, 0.1), trail(show, sprite, 0.1));

  // 짧은 베기: 각도를 바꿔 가며.
  const angles = [-0.75, 0.65, -0.2, 0.4, -0.5];
  for (let i = 0; i < hits; i++) {
    const body = c.body(), last = i === hits - 1 && !c.param('finisher', true);
    slash(show, body.x, body.y, angles[i % angles.length] * -dir, 480, color);
    if (words[i]) pop(show, words[i], body.x + dir * (120 - i * 130), GROUND - 400 + i * 14, 120, '#ffffff', '#2f8cff', 0.22);
    yield* c.land(last ? 20 : 10, last ? 0.26 : 0.07);
    yield* tween(sprite, { x: reach - dir * (i % 2 ? 0 : 24) }, 0.1);
  }

  if (c.param('finisher', true)) {
    // 일섬: 한 박자 쉬고, 화면이 꺼진 사이 한 줄기 빛으로 베고 지나간다.
    yield* tween(sprite, { x: reach - dir * 80, rotation: -dir * 0.09 }, 0.3);
    yield* wait(0.1);
    const dark = show.stage.ui.add(cover('#000'));
    const fromX = dir < 0 ? W + 60 : -60, toX = dir < 0 ? -120 : W + 120;
    const streak = show.stage.ui.add(new Shape({ t: 0 }, (ctx, s) => {
      for (const [stroke, width] of [[color, 26], ['#ffffff', 9]] as const) {
        ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(fromX, 250); ctx.lineTo(fromX + (toX - fromX) * s.t, 250 + 180 * s.t); ctx.stroke();
      }
    }));
    Object.assign(dark, { z: 44, alpha: 0.93 }); streak.z = 45;
    show.sound?.play('slash');
    yield* all(tween(streak.state, { t: 1 }, 0.07, ease.in), tween(sprite, { x: c.exitX, rotation: dir * 0.1 }, 0.07, ease.in));
    yield* wait(0.2);    // 어둠 속에 빛줄기만 남은 정적
    dark.remove(); streak.remove();
    const body = c.body(), word = c.param('finisherWord', '');
    slash(show, body.x, body.y - 20, 0.14 * dir, 1100, '#bfe6ff');
    if (word) pop(show, word, body.x - dir * 250, GROUND - 320, 210, '#ffffff', '#ff5a1f', 0.35);
    camera.zoom = 1.22;
    yield* c.land(26, 0.34);
    yield* wait(0.45);   // 글자가 걷힌 뒤에 피해 숫자가 나오게 한다
  }
  lines.remove();
}

export const slashCombo: Template = { launch, impact };
