import { drawPortrait, type Portrait } from './portrait';
/**
 * 무대: 1280×720 논리 좌표의 풀컬러 레이어 합성기.
 *
 * 그리는 것은 모두 "노드"다. 노드는 위치·크기·회전·투명도를 숫자 속성으로 갖고,
 * 연출(flow.ts의 tween)은 그 숫자만 움직인다. 그리기와 연출이 서로를 모른다.
 *
 * 레이어는 뒤에서 앞으로 back → world → talk → fx → ui 순서다.
 * 카메라(줌·이동·흔들림)는 back·world·fx에 걸리고, talk·ui는 화면 좌표를 쓴다.
 */
export const W = 1280, H = 720;
export type Blend = 'source-over' | 'lighter' | 'screen' | 'multiply';
type Ctx = CanvasRenderingContext2D;

export abstract class Node {
  x = 0; y = 0; scaleX = 1; scaleY = 1; rotation = 0; alpha = 1;
  /** 같은 레이어 안에서의 앞뒤. 클수록 앞. */
  z = 0;
  visible = true;
  blend: Blend = 'source-over';
  layer?: Layer;
  set scale(value: number) { this.scaleX = this.scaleY = value; }
  get scale(): number { return this.scaleX; }
  remove(): void { this.layer?.remove(this); }
  /** 원점(0,0)이 이 노드의 기준점이 되도록 변환이 걸린 상태에서 불린다. */
  protected abstract paint(ctx: Ctx): void;
  draw(ctx: Ctx): void {
    if (!this.visible || this.alpha <= 0) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.rotation) ctx.rotate(this.rotation);
    if (this.scaleX !== 1 || this.scaleY !== 1) ctx.scale(this.scaleX, this.scaleY);
    ctx.globalAlpha *= Math.min(1, this.alpha);
    ctx.globalCompositeOperation = this.blend;
    this.paint(ctx);
    ctx.restore();
  }
}

/** 한 색으로 칠한 실루엣. 피격 번쩍임(흰색)과 말하지 않는 인물 어둡게 하기(남색)에 쓴다. */
const silhouettes = new WeakMap<HTMLImageElement, Map<string, HTMLCanvasElement>>();
function silhouette(image: HTMLImageElement, color: string): HTMLCanvasElement {
  let byColor = silhouettes.get(image);
  if (!byColor) silhouettes.set(image, byColor = new Map());
  let canvas = byColor.get(color);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const c = canvas.getContext('2d')!;
    c.drawImage(image, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = color; c.fillRect(0, 0, canvas.width, canvas.height);
    byColor.set(color, canvas);
  }
  return canvas;
}

/**
 * 그림에서 실제로 뭔가 그려진 영역(투명하지 않은 부분)을 0~1 비율로 돌려준다.
 * 생성한 그림은 여백이 제각각이라, 여백째로 놓으면 인물마다 발밑 높이가 달라진다.
 */
const contentBounds = new WeakMap<HTMLImageElement, { x: number; y: number; w: number; h: number }>();
function contentOf(image: HTMLImageElement): { x: number; y: number; w: number; h: number } {
  let bounds = contentBounds.get(image);
  if (bounds) return bounds;
  const width = image.naturalWidth, height = image.naturalHeight, canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const c = canvas.getContext('2d', { willReadFrequently: true })!;
  c.drawImage(image, 0, 0);
  const alpha = c.getImageData(0, 0, width, height).data;
  let left = width, right = -1, top = height, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (alpha[(y * width + x) * 4 + 3] < 24) continue;
    if (x < left) left = x;
    if (x > right) right = x;
    if (y < top) top = y;
    if (y > bottom) bottom = y;
  }
  bounds = right < 0 ? { x: 0, y: 0, w: 1, h: 1 } : { x: left / width, y: top / height, w: (right - left + 1) / width, h: (bottom - top + 1) / height };
  contentBounds.set(image, bounds);
  return bounds;
}

export class Sprite extends Node {
  portrait?: Portrait;
  mood = 'default';
  /** 기준점. (0.5, 1)이면 발밑 가운데. */
  anchorX = 0.5; anchorY = 0.5;
  flipX = false;
  /** 0~1. 흰색으로 번쩍인다. */
  flash = 0;
  /** 0~1. 어둡게 가라앉힌다. */
  shade = 0;
  /** 그림의 일부만 쓸 때(컷인의 눈매 등). 원본 그림 비율(0~1) 기준. */
  crop?: { x: number; y: number; w: number; h: number };
  /** @param height 화면에 그릴 높이(논리 픽셀). 너비는 그림 비율을 따른다. */
  constructor(public image: HTMLImageElement | undefined, public height: number) { super(); }
  /**
   * 투명 여백을 잘라 낸다. 이후 height와 기준점은 "보이는 부분" 기준이 된다.
   * 여러 그림을 같은 바닥선에 세울 때(대화 장면의 인물, 전투의 기체) 반드시 부른다.
   */
  trimToContent(): this { if (this.image?.naturalWidth) this.crop = contentOf(this.image); return this; }
  get width(): number {
    const image = this.image;
    if (!image?.naturalWidth) return this.height * 0.8;
    const c = this.crop;
    return this.height * (image.naturalWidth * (c?.w ?? 1)) / (image.naturalHeight * (c?.h ?? 1));
  }
  protected paint(ctx: Ctx): void {
    const w = this.width, h = this.height, image = this.image;
    if (this.flipX) ctx.scale(-1, 1);
    const left = -w * this.anchorX, top = -h * this.anchorY;
    if (!image?.naturalWidth) {
      // 그림이 아직 없을 때의 자리표시. 완성 화면에 남아 있으면 안 된다.
      ctx.fillStyle = 'rgba(255,0,200,.35)'; ctx.fillRect(left, top, w, h);
      return;
    }
    const c = this.crop ?? { x: 0, y: 0, w: 1, h: 1 };
    const sx = c.x * image.naturalWidth, sy = c.y * image.naturalHeight, sw = c.w * image.naturalWidth, sh = c.h * image.naturalHeight;
    const base = ctx.globalAlpha;
    if(this.portrait)drawPortrait(ctx,this.portrait,this.mood,c,left,top,w,h);
    else ctx.drawImage(image, sx, sy, sw, sh, left, top, w, h);
    for (const [amount, color] of [[this.shade, '#060b1c'], [this.flash, '#ffffff']] as const) {
      if (amount <= 0) continue;
      ctx.globalAlpha = base * Math.min(1, amount);
      ctx.drawImage(silhouette(image, color), sx, sy, sw, sh, left, top, w, h);
    }
    ctx.globalAlpha = base;
  }
}

/** 직접 그리는 노드. 효과(베기 궤적, 폭발)와 UI(창, 게이지)에 쓴다. */
export class Shape<S extends object = object> extends Node {
  /** @param state 연출이 움직일 숫자들. painter가 읽어서 그린다. */
  constructor(public state: S, private readonly painter: (ctx: Ctx, state: S, self: Shape<S>) => void) { super(); }
  protected paint(ctx: Ctx): void { this.painter(ctx, this.state, this); }
}

export class Layer {
  nodes: Node[] = [];
  /** 카메라를 얼마나 따라가는가. 1이면 그대로, 0.3이면 먼 배경처럼 조금만. 0이면 고정(UI). */
  constructor(public parallax: number) {}
  add<T extends Node>(node: T): T { node.layer?.remove(node); node.layer = this; this.nodes.push(node); return node; }
  remove(node: Node): void { const i = this.nodes.indexOf(node); if (i >= 0) this.nodes.splice(i, 1); node.layer = undefined; }
  clear(): void { for (const node of this.nodes) node.layer = undefined; this.nodes = []; }
}

export class Camera {
  x = W / 2; y = H / 2; zoom = 1;
  /** 흔들림 세기(픽셀). 연출이 올렸다가 0으로 줄인다. */
  shake = 0;
  /** 설정에서 정하는 흔들림 배율. */
  shakeScale = 1;
}

/**
 * 무대 하나. 레이어 다섯과 카메라를 갖는다. 화면(Screen)마다 하나씩 있고, 캔버스는 갖지 않는다.
 * 실제로 그리는 것은 Surface가 준 ctx에 render()로 한다.
 */
export class Stage {
  readonly back = new Layer(0.35);
  readonly world = new Layer(1);
  /** Screen-space dialogue portraits, behind cinematic effects and UI. */
  readonly talk = new Layer(0);
  readonly fx = new Layer(1);
  readonly ui = new Layer(0);
  readonly camera = new Camera();
  private time = 0;
  clear(): void {
    for (const layer of this.layers) layer.clear();
    Object.assign(this.camera, { x: W / 2, y: H / 2, zoom: 1, shake: 0 });
  }
  get layers(): Layer[] { return [this.back, this.world, this.talk, this.fx, this.ui]; }
  /** @param dt 흔들림의 시간을 흘린다. 멈춰 있는 화면(아래에 깔린 화면)은 0을 준다. */
  render(ctx: Ctx, dt: number): void {
    this.time += dt;
    const { camera } = this;
    // 흔들림은 프레임마다 방향이 바뀌어야 흔들림으로 보인다. 난수 대신 시간의 사인값을 써서 재현 가능하게 한다.
    const shakeX = Math.sin(this.time * 97) * camera.shake * camera.shakeScale, shakeY = Math.cos(this.time * 131) * camera.shake * camera.shakeScale * 0.6;
    for (const layer of this.layers) {
      ctx.save();
      if (layer.parallax > 0) {
        const p = layer.parallax, zoom = 1 + (camera.zoom - 1) * p;
        ctx.translate(W / 2 + shakeX * p, H / 2 + shakeY * p);
        ctx.scale(zoom, zoom);
        ctx.translate(-W / 2 - (camera.x - W / 2) * p, -H / 2 - (camera.y - H / 2) * p);
      }
      for (const node of [...layer.nodes].sort((a, b) => a.z - b.z)) node.draw(ctx);
      ctx.restore();
    }
  }
}

/** 그림을 불러온다. 없는 그림은 undefined로 두고(자리표시로 그려짐) 이름을 돌려준다. */
export async function loadImages<K extends string>(base: string, names: readonly K[]): Promise<{ images: Record<K, HTMLImageElement | undefined>; missing: K[] }> {
  const images = {} as Record<K, HTMLImageElement | undefined>, missing: K[] = [];
  await Promise.all(names.map(name => new Promise<void>(resolve => {
    const image = new Image();
    image.onload = () => { images[name] = image; resolve(); };
    image.onerror = () => { images[name] = undefined; missing.push(name); resolve(); };
    image.src = `${base}${name}.webp`;
  })));
  return { images, missing };
}
