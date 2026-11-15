/**
 * 틀: 낙하 글자 (개그)
 *
 * 공격자 화면: 명령어를 모으고 하늘로 올려 보낸다.
 * 맞는 쪽 화면: text의 글자가 한 자씩 떨어져 쿵쿵 깔아뭉갠다.
 *
 * 값
 *   text  떨어지는 글자 (기본 "반려")
 *   size  글자 크기 (기본 200)
 *   color 글자 테두리 색 (기본 "#ff68ad")
 */
import { all, ease, tween, wait, type Step } from '../../flow';
import { fallingText, gather, ring } from '../../fx';
import { GROUND } from '../scene';
import type { StrikeContext, Template } from '../template';

function* launch(c: StrikeContext): Step {
  const { show, dir } = c, muzzle = c.muzzle(), color = c.param('color', '#ff68ad');
  gather(show, muzzle.x, muzzle.y, 180, color); show.sound?.play('charge', 0.7);
  yield* wait(0.4);
  const word = fallingText(show, c.param('text', '반려'), muzzle.x, c.param('size', 200) * 0.55, color); word.y = muzzle.y;
  yield* tween(word, { scaleX: 1.2, scaleY: 1.2 }, 0.18, ease.back); yield* wait(0.1);
  show.sound?.play('whoosh');
  yield* tween(word, { x: muzzle.x + dir * 180, y: -220 }, 0.3, ease.in); word.remove();
}

function* impact(c: StrikeContext): Step {
  const { show, dir } = c, text = c.param('text', '반려'), chars = Array.from(text || '반려'), color = c.param('color', '#ff68ad'), size = c.param('size', 200);
  yield* wait(0.18);
  for (let i = 0; i < chars.length; i++) {
    const x = c.defenderHome + dir * (i - (chars.length - 1) / 2) * Math.min(100, 450 / chars.length);
    const letter = fallingText(show, chars[i], x - dir * 100, size, color);
    show.sound?.play('whoosh', 0.5);
    yield* tween(letter, { x, y: GROUND - 130 }, 0.3, ease.in);
    const last = i === chars.length - 1;
    ring(show, x, GROUND - 10, last ? 330 : 180, color);
    yield* c.land(last ? 29 : 14, last ? 0.28 : 0.09);
    yield* all(tween(letter, { scaleY: 0.6, scaleX: 1.3 }, 0.12), tween(letter, { alpha: 0 }, 0.28)); letter.remove();
  }
  yield* wait(0.35);
}

export const wordSlam: Template = { launch, impact };
