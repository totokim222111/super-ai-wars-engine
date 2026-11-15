/**
 * 틀: 미사일 다발 (사격)
 *
 * 공격자 화면: 미사일이 하나씩 솟구쳐 연기를 끌며 화면 밖으로 날아간다.
 * 맞는 쪽 화면: 위쪽에서 차례로 쏟아져 터진다. 마지막 한 발이 가장 크다.
 *
 * 값
 *   from   솟는 자리의 기준점 이름 (기본 "shoulder")
 *   count  미사일 수 (기본 6)
 *   color  탄두와 폭발의 색 (기본 "#ff9a3c")
 */
import { tween, wait, type Step } from '../../flow';
import { burst, missile, shake } from '../../fx';
import { GROUND } from '../scene';
import type { StrikeContext, Template } from '../template';

function* launch(c: StrikeContext): Step {
  const { show, dir } = c, { sprite } = c.attacker, count = c.param('count', 6), color = c.param('color', '#ff9a3c');
  for (let i = 0; i < count; i++) {
    // 어깨에서 번갈아 가며 솟는다. 자리는 기체 자료의 기준점(shoulder)을 따른다.
    const shoulder = c.point(c.param('from', 'shoulder')), from = { x: shoulder.x + (i % 2 ? 26 : -26), y: shoulder.y };
    const via = { x: from.x + dir * 220, y: from.y - 260 - (i % 3) * 40 }, to = { x: c.exitX, y: from.y - 60 + (i % 3) * 70 };
    burst(show, from.x, from.y, 60, color);
    show.sound?.play('missile', 0.8);
    show.runner.run(missile(show, from, via, to, 0.5, color));
    // 쏠 때마다 몸이 살짝 주저앉는다.
    sprite.y = GROUND + 6;
    show.runner.run(tween(sprite, { y: GROUND }, 0.08));
    yield* wait(0.09);
  }
  yield* wait(0.5);
}

function* impact(c: StrikeContext): Step {
  const { show, dir } = c, count = c.param('count', 6), color = c.param('color', '#ff9a3c');
  yield* wait(0.2);
  for (let i = 0; i < count; i++) {
    const body = c.body(), last = i === count - 1;
    // 맞는 자리를 조금씩 흩어 놓는다.
    const to = { x: body.x + ((i * 53) % 90) - 45, y: body.y + ((i * 37) % 120) - 60 };
    const from = { x: c.entryX, y: -80 - (i % 3) * 60 }, via = { x: to.x - dir * 260, y: -140 };
    yield* missile(show, from, via, to, last ? 0.34 : 0.2, color);
    burst(show, to.x, to.y, last ? 240 : 150, color);
    if (last) show.runner.run(shake(show, 20, 0.4));
    yield* c.land(last ? 20 : 6, last ? 0.24 : 0.03);
  }
  yield* wait(0.3);
}

export const missileSalvo: Template = { launch, impact };
