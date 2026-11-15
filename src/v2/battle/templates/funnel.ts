/**
 * 틀: 원격 병기 (사격)
 *
 * 공격자 화면: 작은 비트가 기체에서 흩어져 화면 밖으로 날아간다.
 * 맞는 쪽 화면: 비트가 사방에 자리 잡고 번갈아 빛줄기를 쏜 뒤 떠난다.
 *
 * 값
 *   count 비트 수 (기본 6)
 *   color 비트와 빛줄기 색 (기본 "#c799ff")
 */
import { all, ease, tween, wait, type Step } from '../../flow';
import { beam, bit, gather } from '../../fx';
import type { StrikeContext, Template } from '../template';

function* launch(c: StrikeContext): Step {
  const { show, dir } = c, color = c.param('color', '#c799ff'), count = c.param('count', 6), muzzle = c.muzzle();
  gather(show, muzzle.x, muzzle.y, 150, color); show.sound?.play('charge', 0.6);
  yield* wait(0.35);
  const bits = Array.from({ length: count }, () => bit(show, muzzle.x, muzzle.y, dir, color));
  yield* all(...bits.map((n, i) => tween(n, { x: muzzle.x + dir * (80 + i * 22), y: muzzle.y - 180 + i * 60, rotation: dir * (i - 2) * 0.2 }, 0.35)));
  yield* wait(0.1); show.sound?.play('whoosh');
  yield* all(...bits.map(n => tween(n, { x: c.exitX }, 0.3, ease.in)));
  bits.forEach(n => n.remove());
}

function* impact(c: StrikeContext): Step {
  const { show, dir } = c, count = c.param('count', 6), color = c.param('color', '#c799ff'), body = c.body();
  const bits = Array.from({ length: count }, (_, i) => bit(show, c.entryX, 70 + i * 75, dir, color));
  yield* all(...bits.map((n, i) => {
    const angle = i * Math.PI * 2 / count;
    return tween(n, { x: c.defenderHome - dir * Math.cos(angle) * 360, y: body.y + Math.sin(angle) * 240, rotation: angle * dir }, 0.35);
  }));
  yield* wait(0.15);
  for (let i = 0; i < bits.length; i++) {
    const n = bits[i], ray = beam(show, n, c.body(), 13, color);
    show.sound?.play('shot', 0.7);
    yield* tween(ray.state, { grow: 1 }, 0.06, ease.in);
    yield* c.land(i === bits.length - 1 ? 21 : 6, i === bits.length - 1 ? 0.24 : 0.03);
    yield* tween(ray.state, { thick: 0 }, 0.08); ray.remove();
  }
  yield* all(...bits.map(n => tween(n, { x: c.exitX, alpha: 0 }, 0.3, ease.in)));
  bits.forEach(n => n.remove());
  yield* wait(0.3);
}

export const funnel: Template = { launch, impact };
