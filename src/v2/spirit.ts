/**
 * 정신기(정신 커맨드) 효과.
 *
 * 발동하면 파일럿 얼굴과 정신기 이름이 띠로 지나가고, 기체에 종류별 효과가 걸린다.
 * 맵 위의 작은 기체에도, 전투 장면의 큰 기체에도 같은 함수를 쓴다(unit에 위치와 키만 넘긴다).
 *
 * 종류(kind)
 *   boost  기세가 오른다: 불기둥처럼 솟는 빛줄기 (열혈, 기합 등 공격·기력 계열)
 *   focus  감각이 모인다: 빛의 고리가 조여 든다 (필중, 집중, 번뜩임 등 명중·회피 계열)
 *   guard  몸을 굳힌다: 방패 같은 빛의 벽 (철벽, 불굴 등 방어 계열)
 *   heal   회복한다: 떠오르는 십자와 회복량 (근성, 신뢰, 보급 등)
 *   speed  빨라진다: 뒤로 흐르는 바람 줄기 (가속, 질풍 등)
 *   luck   행운이 따른다: 반짝이는 별 (행운, 축복 등)
 * 새 종류가 필요하면 아래 EFFECTS에 함수를 하나 더한다.
 */
import { all, ease, tween, wait, type Step } from './flow';
import { burst, gather, pop, ring, spawn, type Show } from './fx';
import { Shape, W } from './stage';
import { drawPortrait, faceOf, FONT, plate, type Portrait } from './ui';

export type SpiritKind = 'boost' | 'focus' | 'guard' | 'heal' | 'speed' | 'luck';
export interface Spirit { name: string; kind: SpiritKind; color?: string; amount?: number }
/** 효과가 걸릴 기체: 발밑 한가운데의 위치와 키. */
export interface SpiritTarget { x: number; y: number; height: number }

const COLORS: Record<SpiritKind, string> = { boost: '#ff7b2f', focus: '#ffd23f', guard: '#7fe9f7', heal: '#5fe08a', speed: '#8cffe3', luck: '#fff18b' };

/** 솟는 빛줄기 여러 가닥. boost와 heal의 바탕. */
function rise(show: Show, unit: SpiritTarget, color: string, seconds: number): void {
  const node = new Shape({ t: 0 }, (ctx, s) => {
    ctx.lineCap = 'round'; ctx.strokeStyle = color;
    for (let i = 0; i < 16; i++) {
      const phase = (s.t * 1.6 + i * 0.137) % 1, x = (((i * 71) % 100) / 100 - 0.5) * unit.height * 0.9, top = -unit.height * 1.15 * phase;
      ctx.globalAlpha = Math.sin(phase * Math.PI) * 0.85; ctx.lineWidth = 3 + (i % 3) * 2;
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top - 46 - (i % 4) * 14); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });
  Object.assign(node, { x: unit.x, y: unit.y, blend: 'lighter', z: 22 });
  spawn(show, show.stage.fx, node, function* (n) {
    yield* tween(n.state, { t: 1 }, seconds, ease.linear);
    yield* tween(n, { alpha: 0 }, 0.15);
  });
}

const EFFECTS: Record<SpiritKind, (show: Show, unit: SpiritTarget, spirit: Spirit, color: string) => Step> = {
  *speed(show, unit, _spirit, color) {
    const wind = new Shape({ t: 0 }, (ctx, s) => {
      ctx.strokeStyle = color; ctx.lineCap = 'round';
      for (let i = 0; i < 15; i++) {
        const phase = (s.t * 2 + i * 0.131) % 1, x = (phase - 0.35) * unit.height * 1.6;
        const y = -unit.height * (0.12 + (i % 7) * 0.14);
        ctx.globalAlpha = Math.sin(phase * Math.PI); ctx.lineWidth = 2 + i % 3;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 55, y - 18, x + 135, y - 8); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    });
    Object.assign(wind, { x: unit.x, y: unit.y, z: 22, blend: 'lighter' });
    show.sound?.play('whoosh');
    spawn(show, show.stage.fx, wind, n => tween(n.state, { t: 1 }, 1, ease.linear));
    yield* wait(1.05);
  },
  *luck(show, unit, _spirit, color) {
    const stars = new Shape({ t: 0 }, (ctx, s) => {
      ctx.fillStyle = color;
      for (let i = 0; i < 12; i++) {
        const phase = Math.min(1, Math.max(0, s.t * 1.7 - i * 0.055)), size = Math.sin(phase * Math.PI) * (14 + i % 3 * 8);
        const x = ((i * 73 % 110) / 110 - 0.5) * unit.height * 1.3, y = -unit.height * (0.2 + (i % 5) * 0.2) - phase * 45;
        ctx.save(); ctx.translate(x, y); ctx.rotate(phase * 1.4); ctx.beginPath();
        for (let j = 0; j < 10; j++) {
          const a = -Math.PI / 2 + j * Math.PI / 5, r = size * (j % 2 ? 0.4 : 1);
          if (!j) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath(); ctx.fill(); ctx.restore();
      }
    });
    Object.assign(stars, { x: unit.x, y: unit.y, z: 23, blend: 'lighter' });
    show.sound?.play('flash', 0.7);
    spawn(show, show.stage.fx, stars, n => tween(n.state, { t: 1 }, 1.1, ease.linear));
    yield* wait(1.15);
  },
  *boost(show, unit, _spirit, color) {
    const center = unit.y - unit.height * 0.5;
    show.sound?.play('charge');
    rise(show, unit, color, 0.9);
    yield* wait(0.45);
    burst(show, unit.x, center, unit.height * 0.8, color);
    ring(show, unit.x, center, unit.height * 0.9, color);
    show.sound?.play('heavy', 0.6);
    yield* wait(0.5);
  },
  *focus(show, unit, _spirit, color) {
    const center = unit.y - unit.height * 0.5;
    show.sound?.play('charge', 0.8);
    for (let i = 0; i < 3; i++) { gather(show, unit.x, center, unit.height * (0.9 - i * 0.12), color); yield* wait(0.16); }
    yield* wait(0.2);
    burst(show, unit.x, center, unit.height * 0.35, '#ffffff');
    show.sound?.play('flash');
    yield* wait(0.4);
  },
  *guard(show, unit, _spirit, color) {
    const size = unit.height * 0.62;
    const wall = new Shape({ grow: 0 }, (ctx, s) => {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // 육각형 벽이 아래에서 위로 세워진다.
      for (const [scale, width, stroke] of [[1, 12, color], [0.84, 5, '#ffffff']] as const) {
        ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.beginPath();
        for (let i = 0; i <= 6 * s.grow; i++) {
          const angle = Math.PI / 2 + i * Math.PI / 3, px = Math.cos(angle) * size * scale, py = -Math.sin(angle) * size * scale;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    });
    Object.assign(wall, { x: unit.x, y: unit.y - unit.height * 0.5, blend: 'lighter', z: 22 });
    show.stage.fx.add(wall);
    show.sound?.play('charge', 0.7);
    yield* tween(wall.state, { grow: 1 }, 0.4, ease.out);
    show.sound?.play('hit', 0.5);
    ring(show, wall.x, wall.y, size * 1.5, color);
    yield* wait(0.25);
    yield* tween(wall, { alpha: 0 }, 0.3);
    wall.remove();
  },
  *heal(show, unit, spirit, color) {
    const center = unit.y - unit.height * 0.5;
    show.sound?.play('confirm');
    rise(show, unit, color, 0.9);
    // 떠오르는 십자 표시
    const crosses = new Shape({ t: 0 }, (ctx, s) => {
      ctx.fillStyle = '#eaffef';
      for (let i = 0; i < 5; i++) {
        const phase = Math.min(1, Math.max(0, s.t * 1.4 - i * 0.12)), x = (i - 2) * unit.height * 0.16, y = -unit.height * (0.2 + phase * 0.7), size = 9 + (i % 2) * 5;
        ctx.globalAlpha = Math.sin(phase * Math.PI);
        ctx.fillRect(x - size, y - size / 3, size * 2, size * 2 / 3); ctx.fillRect(x - size / 3, y - size, size * 2 / 3, size * 2);
      }
      ctx.globalAlpha = 1;
    });
    Object.assign(crosses, { x: unit.x, y: unit.y, z: 23 });
    spawn(show, show.stage.fx, crosses, n => tween(n.state, { t: 1 }, 0.9, ease.linear));
    yield* wait(0.35);
    if (spirit.amount) pop(show, `+${spirit.amount}`, unit.x, center - unit.height * 0.5, 86, '#eaffef', '#0f7a3a', 0.7);
    yield* wait(0.75);
  },
};

/**
 * 정신기를 발동한다.
 * @param portrait 쓰는 파일럿의 얼굴. 주면 이름 띠에 함께 나온다.
 */
export function* castSpirit(show: Show, unit: SpiritTarget, spirit: Spirit, portrait?: Portrait): Step {
  const color = spirit.color ?? COLORS[spirit.kind], face = portrait && faceOf(portrait, 'attack');
  // 이름 띠: 왼쪽에서 미끄러져 들어와 잠깐 머문다.
  const band = new Shape({}, ctx => {
    ctx.font = `46px ${FONT.display}`;
    const width = ctx.measureText(spirit.name).width + (face ? 210 : 110);
    plate(ctx, 6, 6, width, 96, 'rgba(0,0,0,.45)', 'right');
    plate(ctx, 0, 0, width, 96, '#0b1638', 'right');
    ctx.fillStyle = color; ctx.fillRect(0, 0, 8, 96); ctx.fillRect(0, 92, width - 42, 4);
    if (face?.naturalWidth && portrait) {
      drawPortrait(ctx,portrait,'attack',portrait.crop,18,6,82,82);
    }
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(spirit.name, face ? 118 : 30, 49);
  });
  Object.assign(band, { x: -W * 0.6, y: 150, z: 58 });
  show.stage.ui.add(band);
  show.sound?.play('whoosh', 0.8);
  yield* tween(band, { x: 0 }, 0.22, ease.out);
  yield* all(EFFECTS[spirit.kind](show, unit, spirit, color), (function* (): Step {
    yield* wait(0.7);
    yield* tween(band, { x: -W * 0.6, alpha: 0 }, 0.22, ease.in);
  })());
  band.remove();
}
