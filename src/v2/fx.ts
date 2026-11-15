/**
 * 효과 부품. 하나하나는 "노드를 올리고, 잠깐 움직이고, 스스로 치운다".
 * 전투 연출(battle.ts)은 이 부품들을 시간 순서로 늘어놓기만 한다.
 */
import { all, ease, tween, wait, type Runner, type Step } from './flow';
import { H, Shape, Sprite, W, type Layer, type Node, type Stage } from './stage';
import type { Sound } from './sound';
import { bigText, cover, type HudState } from './ui';

/** 효과가 일할 곳: 무대, 시간, 소리. 화면(Screen)의 show로 얻는다. 소리는 없어도 된다. */
export interface Show { stage: Stage; runner: Runner; sound?: Sound }

/** 노드를 올리고 play가 끝나면 치운다. 본 흐름은 기다리지 않는다. */
export function spawn<T extends Node>(show: Show, layer: Layer, node: T, play: (node: T) => Step): T {
  layer.add(node);
  show.runner.run((function* () { yield* play(node); node.remove(); })());
  return node;
}

/** 베기 궤적: 한쪽 끝에서 초승달이 자라났다가 가늘어지며 사라진다. */
export function slash(show: Show, x: number, y: number, angle: number, length: number, color: string): void {
  const node = new Shape({ grow: 0, thick: 1 }, (ctx, s) => {
    const half = length / 2, tip = -half + length * s.grow, belly = length * 0.16 * s.thick;
    for (const [fill, k] of [[color, 1], ['#ffffff', 0.55]] as const) {
      ctx.beginPath(); ctx.moveTo(-half, 0);
      ctx.quadraticCurveTo((tip - half) / 2, -belly * k * 2, tip, 0);
      ctx.quadraticCurveTo((tip - half) / 2, -belly * k * 0.5, -half, 0);
      ctx.fillStyle = fill; ctx.fill();
    }
  });
  Object.assign(node, { x, y, rotation: angle, blend: 'lighter', z: 20 });
  show.sound?.play('slash', Math.min(1, length / 600));
  spawn(show, show.stage.fx, node, function* (n) {
    yield* tween(n.state, { grow: 1 }, 0.07, ease.out);
    yield* all(tween(n.state, { thick: 0 }, 0.24, ease.in), tween(n, { alpha: 0 }, 0.24, ease.in));
  });
}

/** 번쩍 터지는 빛 덩어리. */
export function burst(show: Show, x: number, y: number, radius: number, color: string): void {
  const node = new Shape({}, ctx => {
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    glow.addColorStop(0, '#ffffff'); glow.addColorStop(0.25, '#ffffff'); glow.addColorStop(0.5, color); glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow; ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
  });
  Object.assign(node, { x, y, blend: 'lighter', z: 15, scale: 0.25 });
  spawn(show, show.stage.fx, node, n => all(tween(n, { scaleX: 1, scaleY: 1 }, 0.1, ease.out), (function* () { yield* wait(0.06); yield* tween(n, { alpha: 0 }, 0.2); })()));
}

/** 사방으로 튀는 불티. 방향은 순번으로 정해서 볼 때마다 같은 모양이 나온다. */
export function sparks(show: Show, x: number, y: number, count: number, reach: number, color: string): void {
  const node = new Shape({ t: 0 }, (ctx, s) => {
    ctx.lineCap = 'round'; ctx.strokeStyle = color;
    for (let i = 0; i < count; i++) {
      const angle = i * 2.399963 + 0.4, far = reach * (0.55 + ((i * 37) % 10) / 22), near = far * Math.max(0, s.t - 0.25);
      ctx.lineWidth = 5 * (1 - s.t) + 1;
      ctx.beginPath(); ctx.moveTo(Math.cos(angle) * near, Math.sin(angle) * near);
      ctx.lineTo(Math.cos(angle) * far * s.t, Math.sin(angle) * far * s.t); ctx.stroke();
    }
  });
  Object.assign(node, { x, y, blend: 'lighter', z: 16 });
  spawn(show, show.stage.fx, node, n => all(tween(n.state, { t: 1 }, 0.34, ease.out), (function* () { yield* wait(0.2); yield* tween(n, { alpha: 0 }, 0.14); })()));
}

/** 집중선: 한 점에서 화면 끝까지 뻗는 빛줄기. 센 타격의 순간에만 쓴다. */
export function impactLines(show: Show, x: number, y: number): void {
  const node = new Shape({ t: 0 }, (ctx, s) => {
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 34; i++) {
      const angle = i * 0.1848 * 2 + ((i * 7) % 5) * 0.03, inner = 150 + ((i * 53) % 90) + s.t * 120, width = 0.012 + ((i * 31) % 7) * 0.004;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      ctx.lineTo(Math.cos(angle - width) * 1700, Math.sin(angle - width) * 1700);
      ctx.lineTo(Math.cos(angle + width) * 1700, Math.sin(angle + width) * 1700);
      ctx.closePath(); ctx.fill();
    }
  });
  Object.assign(node, { x, y, z: 14, alpha: 0.85, blend: 'lighter' });
  spawn(show, show.stage.fx, node, n => all(tween(n.state, { t: 1 }, 0.3, ease.out), (function* () { yield* wait(0.1); yield* tween(n, { alpha: 0 }, 0.2); })()));
}

/** 충격파: 맞은 자리에서 퍼져 나가는 고리. */
export function ring(show: Show, x: number, y: number, radius: number, color: string): void {
  const node = new Shape({ r: radius * 0.15 }, (ctx, s) => {
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, 26 * (1 - s.r / radius));
    ctx.beginPath(); ctx.ellipse(0, 0, s.r, s.r * 0.82, 0, 0, Math.PI * 2); ctx.stroke();
  });
  Object.assign(node, { x, y, z: 13, blend: 'lighter' });
  spawn(show, show.stage.fx, node, n => all(tween(n.state, { r: radius }, 0.32, ease.out), (function* () { yield* wait(0.14); yield* tween(n, { alpha: 0 }, 0.18); })()));
}

/** 모이는 빛: 고리가 바깥에서 한 점으로 조여 든다. 쏘기 전의 "모으기"에 쓴다. */
export function gather(show: Show, x: number, y: number, radius: number, color: string): void {
  const node = new Shape({ r: radius }, (ctx, s) => {
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, 14 * (s.r / radius));
    ctx.beginPath(); ctx.arc(0, 0, Math.max(1, s.r), 0, Math.PI * 2); ctx.stroke();
  });
  Object.assign(node, { x, y, z: 13, blend: 'lighter', alpha: 0 });
  spawn(show, show.stage.fx, node, n => all(tween(n.state, { r: 6 }, 0.3, ease.in), tween(n, { alpha: 1 }, 0.2)));
}

/**
 * 빛줄기. from에서 to까지 뻗는다. 돌려받은 노드의 state.grow(0~1)로 뻗는 정도를, state.thick으로 굵기를 움직인다.
 * 다 쓰면 remove()한다.
 */
export function beam(show: Show, from: { x: number; y: number }, to: { x: number; y: number }, width: number, color: string): Shape<{ grow: number; thick: number; t: number }> {
  const dx = to.x - from.x, dy = to.y - from.y, distance = Math.hypot(dx, dy);
  const node = new Shape({ grow: 0, thick: 1, t: 0 }, (ctx, s) => {
    const length = distance * s.grow, flicker = 1 + Math.sin(s.t * 70) * 0.08;
    if (length < 1 || s.thick <= 0) return;
    ctx.lineCap = 'round';
    for (const [stroke, scale, alpha] of [[color, 1.9, 0.3], [color, 1.15, 0.85], ['#ffffff', 0.5, 1]] as const) {
      ctx.globalAlpha = alpha; ctx.strokeStyle = stroke; ctx.lineWidth = Math.max(1, width * scale * s.thick * flicker);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(length, 0); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });
  Object.assign(node, { x: from.x, y: from.y, rotation: Math.atan2(dy, dx), blend: 'lighter', z: 17 });
  show.stage.fx.add(node);
  show.runner.run((function* (): Step { while (node.layer) node.state.t += yield; })());
  return node;
}

/**
 * 미사일 한 발. from에서 via를 스치는 곡선을 그리며 to까지 날아가고, 연기를 끈다.
 * 도착하면 끝난다(터지는 그림은 부르는 쪽이 올린다).
 */
export function* missile(show: Show, from: { x: number; y: number }, via: { x: number; y: number }, to: { x: number; y: number }, seconds: number, color: string): Step {
  const at = (t: number): { x: number; y: number } => ({
    x: (1 - t) ** 2 * from.x + 2 * (1 - t) * t * via.x + t * t * to.x,
    y: (1 - t) ** 2 * from.y + 2 * (1 - t) * t * via.y + t * t * to.y,
  });
  const node = new Shape({ t: 0 }, (ctx, s) => {
    // 연기: 지나온 길에 점점 옅어지는 덩어리.
    for (let i = 1; i <= 9; i++) {
      const p = at(Math.max(0, s.t - i * 0.035));
      ctx.globalAlpha = 0.42 * (1 - i / 10); ctx.fillStyle = '#dfe6f2';
      ctx.beginPath(); ctx.arc(p.x, p.y, 7 + i * 1.6, 0, Math.PI * 2); ctx.fill();
    }
    const p = at(s.t), ahead = at(Math.min(1, s.t + 0.02));
    ctx.globalAlpha = 1; ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(ahead.y - p.y, ahead.x - p.x));
    ctx.fillStyle = '#f4f7ff'; ctx.fillRect(-22, -6, 34, 12);
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(12, -6); ctx.lineTo(26, 0); ctx.lineTo(12, 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(-22, -5); ctx.lineTo(-40, 0); ctx.lineTo(-22, 5); ctx.closePath(); ctx.fill();
  });
  node.z = 16;
  show.stage.fx.add(node);
  yield* tween(node.state, { t: 1 }, seconds, ease.in);
  node.remove();
}

/** 화면 전체 번쩍임. */
export function flash(show: Show, strength = 1, seconds = 0.3, color = '#ffffff'): void {
  const node = cover(color); node.alpha = strength; node.z = 90;
  spawn(show, show.stage.ui, node, n => tween(n, { alpha: 0 }, seconds, ease.in));
}

/** 카메라를 흔든다. 세게 시작해서 잦아든다. */
export function* shake(show: Show, power: number, seconds = 0.3): Step {
  show.stage.camera.shake = power;
  yield* tween(show.stage.camera, { shake: 0 }, seconds, ease.out);
}

/**
 * 속도선. 돌진·컷인 때 화면에 흐르는 가로줄.
 * 돌려받은 노드의 alpha를 0으로 내리고 remove()하면 끝난다.
 */
export function speedLines(show: Show, direction: 1 | -1): Shape<{ t: number }> {
  const node = new Shape({ t: 0 }, (ctx, s) => {
    ctx.fillStyle = 'rgba(215,236,255,.5)';
    for (let i = 0; i < 26; i++) {
      const y = 110 + ((i * 53) % 470), length = 160 + ((i * 97) % 380), speed = 2600 + ((i * 131) % 1500);
      const travel = (s.t * speed + i * 211) % (W + length), x = direction > 0 ? travel - length : W - travel;
      ctx.fillRect(x, y, length, 2 + (i % 3));
    }
  });
  node.blend = 'screen'; node.z = -5; node.alpha = 0;
  show.stage.ui.add(node);
  show.runner.run((function* () { while (node.layer) node.state.t += yield; })());
  return node;
}

/** 움직이는 기체 뒤에 남는 잔상. */
export function afterimage(show: Show, source: Sprite): void {
  const ghost = new Sprite(source.image, source.height);
  Object.assign(ghost, { x: source.x, y: source.y, anchorX: source.anchorX, anchorY: source.anchorY, flipX: source.flipX, rotation: source.rotation, alpha: 0.45, blend: 'lighter', z: source.z - 1 });
  spawn(show, show.stage.world, ghost, n => tween(n, { alpha: 0 }, 0.22));
}

/** 타격 글자("기!")나 피해 숫자를 튀어나오게 한다. */
export function pop(show: Show, text: string, x: number, y: number, size: number, fill: string, stroke: string, hold = 0.35): void {
  const node = bigText(text, size, fill, stroke);
  Object.assign(node, { x, y, z: 40, scale: 0.2, rotation: -0.08 });
  spawn(show, show.stage.fx, node, function* (n) {
    yield* tween(n, { scaleX: 1, scaleY: 1 }, 0.14, ease.back);
    yield* wait(hold);
    yield* all(tween(n, { alpha: 0 }, 0.2), tween(n, { y: y - 40 }, 0.2, ease.in));
  });
}

/** 총알 줄기. from에서 to까지 밝은 토막들이 달려간다. */
export function tracer(show: Show, from: { x: number; y: number }, to: { x: number; y: number }, color: string, seconds: number): void {
  const dx = to.x - from.x, dy = to.y - from.y, distance = Math.hypot(dx, dy);
  const node = new Shape({ t: 0 }, (ctx, s) => {
    ctx.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const head = s.t * 1.5 - i * 0.09;
      if (head <= 0 || head >= 1) continue;
      const tail = Math.max(0, head - 0.1);
      for (const [stroke, width] of [[color, 11], ['#ffffff', 4]] as const) {
        ctx.strokeStyle = stroke; ctx.lineWidth = width;
        ctx.beginPath(); ctx.moveTo(distance * tail, 0); ctx.lineTo(distance * head, 0); ctx.stroke();
      }
    }
  });
  Object.assign(node, { x: from.x, y: from.y, rotation: Math.atan2(dy, dx), blend: 'lighter', z: 12 });
  show.sound?.play('shot', 0.7);
  spawn(show, show.stage.fx, node, n => tween(n.state, { t: 1 }, seconds, ease.linear));
}

/**
 * 게이지를 줄인다. 값은 빠르게 떨어지고, 정보창이 떨리며 번쩍이고, 잃은 만큼의 잔상이 한 박자 늦게 따라 내려온다.
 * 체력은 세게, EN은 가볍게 떤다.
 */
export function* drainGauge(show: Show, hud: HudState, what: 'hp' | 'en', to: number): Step {
  const hp = what === 'hp';
  hud.flash = hp ? 1 : 0.45; hud.jolt = hp ? 10 : 3;
  show.sound?.play('gauge', hp ? 1 : 0.6);
  yield* all(tween(hud, hp ? { hp: to } : { en: to }, 0.24), tween(hud, { flash: 0, jolt: 0 }, 0.5));
  yield* wait(0.18);
  yield* tween(hud, hp ? { hpGhost: to } : { enGhost: to }, 0.45, ease.inOut);
}

/** 화면 위아래 검은 띠. 삽화·컷인처럼 "지금은 보는 장면"일 때 닫는다. */
export function letterbox(show: Show): { open: () => Step; close: () => Step } {
  const size = 58, top = cover('#000', 0, size), bottom = cover('#000', H - size, size);
  top.y = -size; bottom.y = size; top.z = bottom.z = 60;
  show.stage.ui.add(top); show.stage.ui.add(bottom);
  return {
    close: () => all(tween(top, { y: 0 }, 0.25), tween(bottom, { y: 0 }, 0.25)),
    open: function* () { yield* all(tween(top, { y: -size }, 0.25), tween(bottom, { y: size }, 0.25)); top.remove(); bottom.remove(); },
  };
}

/** 조준선. 돌려받은 노드는 쏜 뒤 remove()한다. */
export function reticle(show: Show, x: number, y: number, color: string): Shape<{ radius: number }> {
  const node = new Shape({ radius: 150 }, (ctx, s) => {
    ctx.strokeStyle = color; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, s.radius, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 4; i++) {
      ctx.save(); ctx.rotate(i * Math.PI / 2);
      ctx.beginPath(); ctx.moveTo(s.radius - 24, 0); ctx.lineTo(s.radius + 30, 0); ctx.stroke(); ctx.restore();
    }
  });
  Object.assign(node, { x, y, z: 20, blend: 'lighter' });
  return show.stage.fx.add(node);
}

/** 포탄 한 발. 꼬리를 끌며 직선으로 날아가고 스스로 치운다. */
export function* shell(show: Show, from: { x: number; y: number }, to: { x: number; y: number }, seconds: number, color: string, size = 22): Step {
  const node = new Shape({}, ctx => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(0, 0, size * 1.6, size * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(-size * 3, -3, size * 3, 6);
  });
  Object.assign(node, { x: from.x, y: from.y, rotation: Math.atan2(to.y - from.y, to.x - from.x), z: 18, blend: 'lighter' });
  show.stage.fx.add(node);
  yield* tween(node, to, seconds, ease.in);
  node.remove();
}

/** 원격 병기 하나. 위치를 tween으로 옮긴 뒤 remove()한다. */
export function bit(show: Show, x: number, y: number, dir: 1 | -1, color: string): Shape {
  const node = new Shape({}, ctx => {
    ctx.fillStyle = '#e9f2ff'; ctx.beginPath(); ctx.moveTo(-22, -12); ctx.lineTo(24, 0); ctx.lineTo(-22, 12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = color; ctx.fillRect(-16, -5, 25, 10);
  });
  Object.assign(node, { x, y, scaleX: dir, z: 18 });
  return show.stage.fx.add(node);
}

/** 낙하 예고 그림자. radius를 키우고 포탄이 닿을 때 remove()한다. */
export function groundShadow(show: Show, x: number, y: number): Shape<{ radius: number }> {
  const node = new Shape({ radius: 12 }, (ctx, s) => {
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.beginPath(); ctx.ellipse(0, 0, s.radius, s.radius * 0.25, 0, 0, Math.PI * 2); ctx.fill();
  });
  Object.assign(node, { x, y, z: -1 });
  return show.stage.fx.add(node);
}

/** 낙하 글자. 떨어지는 동안은 호출자가 움직이고, 다 쓰면 remove()한다. */
export function fallingText(show: Show, text: string, x: number, size: number, color: string): Node {
  const node = bigText(text, size, '#fff', color);
  Object.assign(node, { x, y: -180, z: 35 });
  return show.stage.fx.add(node);
}

/** 주먹 타격 자국. 좌우 교대 각도는 호출자가 정한다. */
export function fist(show: Show, x: number, y: number, angle: number, color: string): void {
  const node = new Shape({}, ctx => {
    ctx.fillStyle = color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.roundRect(-45, -28, 90, 56, 12); ctx.fill(); ctx.stroke();
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-25 + i * 22, -26); ctx.lineTo(-25 + i * 22, -4); ctx.stroke(); }
  });
  Object.assign(node, { x, y, rotation: angle, z: 22, scale: 0.5, blend: 'lighter' });
  spawn(show, show.stage.fx, node, n => all(tween(n, { scaleX: 1.6, scaleY: 1.6 }, 0.16), tween(n, { alpha: 0 }, 0.26)));
}
