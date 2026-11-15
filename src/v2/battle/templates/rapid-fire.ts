/**
 * 틀: 연사 (사격)
 *
 * 공격자 화면: 제자리에서 여러 줄을 쏜다. 탄은 화면 밖으로 나간다.
 * 맞는 쪽 화면: 그 탄이 반대편에서 날아와 꽂힌다.
 *
 * 값
 *   rows    줄 수 (기본 3)
 *   shots   한 줄의 발 수 (기본 5)
 *   labels  줄마다 총구 위에 뜨는 글자. 예: ["1.","2.","3."] (기본 없음)
 *   color   탄 색 (기본 "#ffd23f")
 */
import { ease, tween, wait, type Step } from '../../flow';
import { burst, pop, shake, tracer } from '../../fx';
import { W } from '../../stage';
import type { StrikeContext, Template } from '../template';

const rowOffset = (row: number, rows: number): number => (row - (rows - 1) / 2) * 50;

function* launch(c: StrikeContext): Step {
  const { show, dir } = c, { sprite } = c.attacker, camera = show.stage.camera;
  const rows = c.param('rows', 3), shots = c.param('shots', 5), labels = c.param<string[]>('labels', []), color = c.param('color', '#ffd23f');
  // 카메라가 쏘는 쪽으로 조금 다가간다.
  yield* tween(camera, { x: W / 2 + dir * 40, zoom: 1.08 }, 0.3, ease.inOut);
  for (let row = 0; row < rows; row++) {
    const base = c.muzzle(), muzzle = { x: base.x, y: base.y + rowOffset(row, rows) };
    if (labels[row]) pop(show, labels[row], muzzle.x - dir * 40, muzzle.y - 84, 90, '#ffffff', '#c98a00', 0.3);
    for (let shot = 0; shot < shots; shot++) {
      burst(show, muzzle.x, muzzle.y, 70, color);
      tracer(show, muzzle, { x: c.exitX - dir * 60, y: muzzle.y + 20 }, color, 0.2);
      // 반동: 한 발마다 밀렸다가 돌아오고, 화면도 잘게 떤다.
      sprite.x = c.attackerHome - dir * 16;
      show.runner.run(tween(sprite, { x: c.attackerHome }, 0.05));
      show.runner.run(shake(show, 7, 0.08));
      yield* wait(0.06);
    }
    yield* wait(0.1);
  }
  yield* wait(0.15);
}

function* impact(c: StrikeContext): Step {
  const { show } = c, rows = c.param('rows', 3), shots = c.param('shots', 5), color = c.param('color', '#ffd23f');
  for (let row = 0; row < rows; row++) {
    for (let shot = 0; shot < shots; shot++) {
      const body = c.body(), y = body.y + rowOffset(row, rows);
      tracer(show, { x: c.entryX, y: y - 10 }, { x: body.x, y: y + 10 }, color, 0.1);
      yield* wait(0.045);
      // 마지막 한 발만 조금 세게 쳐서 연사에도 끝맺음을 준다.
      const last = row === rows - 1 && shot === shots - 1;
      yield* c.land(last ? 9 : 4, last ? 0.08 : 0.02);
    }
    yield* wait(0.08);
  }
}

export const rapidFire: Template = { launch, impact };
