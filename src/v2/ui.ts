import { drawPortrait, faceOf, type Portrait } from './portrait';
export { faceOf, drawPortrait, type Portrait, type Rect } from './portrait';
import { term } from './terms';
/**
 * 화면 위에 얹는 것들: 창, 이름표, 게이지, 대사, 큰 글자.
 * 모두 Shape 노드라서 다른 그림처럼 움직이고 사라질 수 있다.
 * 모양의 약속: 남색 바탕, 위쪽에 밝은 선, 모서리 두 곳을 비스듬히 자른다. 둥근 모서리는 쓰지 않는다.
 */
import { H, Shape, W } from './stage';

type Ctx = CanvasRenderingContext2D;
export const FONT = {
  display: '"Black Han Sans","Noto Sans KR","Malgun Gothic",sans-serif',
  body: '"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif',
  num: '"Chakra Petch","Noto Sans KR",monospace',
};
export const COLOR = { ally: '#2f8cff', enemy: '#ff4458', gold: '#ffd23f', edge: '#9fd0ff', ink: '#f2f6ff', dim: '#b9c7e6', hp: '#49d17d' };
export type Side = 'left' | 'right';

/** 왼쪽 위와 오른쪽 아래를 자른 창. */
export function panel(ctx: Ctx, x: number, y: number, w: number, h: number, edge: string = COLOR.edge, cut = 18): void {
  ctx.beginPath();
  ctx.moveTo(x + cut, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h - cut);
  ctx.lineTo(x + w - cut, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + cut); ctx.closePath();
  const fill = ctx.createLinearGradient(0, y, 0, y + h);
  fill.addColorStop(0, 'rgba(14,22,48,.96)'); fill.addColorStop(1, 'rgba(7,11,26,.97)');
  ctx.fillStyle = fill; ctx.fill();
  ctx.fillStyle = edge; ctx.fillRect(x + cut, y, w - cut, 2);
}

/** 한쪽 끝이 비스듬한 띠. 이름표와 무기 이름에 쓴다. slant는 비스듬한 쪽. */
export function plate(ctx: Ctx, x: number, y: number, w: number, h: number, color: string, slant: Side): void {
  const d = h * 0.45;
  ctx.beginPath();
  if (slant === 'right') { ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w - d, y + h); ctx.lineTo(x, y + h); }
  else { ctx.moveTo(x + d, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); }
  ctx.closePath(); ctx.fillStyle = color; ctx.fill();
}

/** 한글은 띄어쓰기에서 먼저 나누고, 한 어절이 줄보다 길 때만 글자에서 나눈다. */
export function wrap(ctx: Ctx, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const joined = line ? `${line} ${word}` : word;
    if (ctx.measureText(joined).width <= width) { line = joined; continue; }
    if (line) lines.push(line);
    line = '';
    for (const char of word) {
      if (ctx.measureText(line + char).width > width) { lines.push(line); line = ''; }
      line += char;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** 줄바꿈한 글에서 앞의 shown 글자만 그린다(타자 효과). 줄바꿈 위치는 전체 글 기준이라 글자가 늘어도 줄이 흔들리지 않는다. */
function typed(ctx: Ctx, lines: string[], shown: number, x: number, y: number, lineHeight: number, align: CanvasTextAlign): void {
  let left = Math.floor(shown);
  lines.forEach((line, row) => {
    if (left <= 0) return;
    const part = line.slice(0, left); left -= line.length + 1;
    // 오른쪽 정렬이어도 글자는 왼쪽부터 차오르게 한다.
    const start = align === 'right' ? x - ctx.measureText(line).width : x;
    ctx.textAlign = 'left'; ctx.fillText(part, start, y + row * lineHeight);
  });
}

export function drawFace(ctx: Ctx, portrait: Portrait, mood: string, x: number, y: number, size: number): void {
  ctx.fillStyle = '#1a2a55'; ctx.fillRect(x, y, size, size);
  const image = faceOf(portrait, mood);
  if (!image?.naturalWidth) return;
  drawPortrait(ctx, portrait, mood, portrait.crop, x, y, size, size);
}

export interface LineState { name: string; text: string; shown: number; color: string }

/** 대화 장면의 대사창. 화면 아래 넓게 깔리고 이름표가 왼쪽 위에 얹힌다. */
export function storyLine(state: LineState): Shape<LineState> {
  return new Shape(state, (ctx, s) => {
    const x = 110, w = W - 220, h = 186, y = H - 26 - h;
    panel(ctx, x, y, w, h, s.color);
    if (s.name) {
      ctx.font = `30px ${FONT.display}`;
      const nameWidth = ctx.measureText(s.name).width + 70;
      plate(ctx, x + 22, y - 26, nameWidth, 46, s.color, 'right');
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(s.name, x + 46, y - 1);
    }
    ctx.font = `500 29px ${FONT.body}`; ctx.textBaseline = 'top'; ctx.fillStyle = COLOR.ink;
    ctx.shadowColor = '#000'; ctx.shadowOffsetY = 2;
    typed(ctx, wrap(ctx, s.text, w - 88), s.shown, x + 44, y + 44, 44, 'left');
    ctx.shadowColor = 'transparent';
    if (s.shown >= s.text.length) {
      // 다 나왔으면 "누르면 다음" 표시
      ctx.fillStyle = COLOR.gold; ctx.beginPath();
      ctx.moveTo(x + w - 52, y + h - 36); ctx.lineTo(x + w - 30, y + h - 36); ctx.lineTo(x + w - 41, y + h - 20); ctx.closePath(); ctx.fill();
    }
  });
}

export type BattleLineState = LineState & { side: Side; portrait: Portrait; mood: string };
/** 전투 장면의 대사창. 말하는 쪽(side)에 얼굴이 붙고, mood에 따라 표정이 바뀐다. */
export function battleLine(state: BattleLineState): Shape<BattleLineState> {
  return new Shape(state, (ctx, s) => {
    const x = 16, w = W - 32, h = 128, y = H - 14 - h, right = s.side === 'right';
    panel(ctx, x, y, w, h, s.color);
    drawFace(ctx, s.portrait, s.mood, right ? x + w - 126 : x, y + 2, 126);
    const tx = right ? x + w - 150 : x + 150;
    ctx.textBaseline = 'top'; ctx.textAlign = right ? 'right' : 'left';
    ctx.font = `24px ${FONT.display}`; ctx.fillStyle = s.color === COLOR.enemy ? '#ff9aa5' : '#8cc2ff';
    ctx.fillText(s.name, tx, y + 14);
    let size=27;ctx.font=`500 ${size}px ${FONT.body}`;while(size>18&&wrap(ctx,s.text,w-330).length>2){size--;ctx.font=`500 ${size}px ${FONT.body}`;}ctx.fillStyle=COLOR.ink;
    typed(ctx,wrap(ctx,s.text,w-330),s.shown,tx,y+48,Math.min(38,size+8),right?'right':'left');
  });
}

/**
 * 게이지 하나. 양 끝이 비스듬하고, 위는 밝고 아래는 어두워 볼록해 보이며, 10칸 눈금이 있다.
 * 줄어들 때는 방금 잃은 만큼(ghost와 value 사이)이 밝게 남았다가 뒤따라 줄어든다.
 * @param tones 위·가운데·아래 색.
 */
export function gauge(ctx: Ctx, x: number, y: number, w: number, h: number, value: number, ghost: number, max: number, tones: readonly [string, string, string]): void {
  const slant = h * 0.55, clamp = (n: number) => Math.max(0, Math.min(1, n / max)), ratio = clamp(value), trail = clamp(ghost);
  const slice = (from: number, to: number): void => {
    ctx.beginPath();
    ctx.moveTo(x + w * from + slant, y); ctx.lineTo(x + w * to + slant, y); ctx.lineTo(x + w * to, y + h); ctx.lineTo(x + w * from, y + h); ctx.closePath();
  };
  // 바닥에 떨어지는 그림자: 게이지가 창에서 떠 보이게 한다.
  ctx.save(); ctx.translate(2, 3); slice(0, 1); ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fill(); ctx.restore();
  ctx.save();
  slice(0, 1); ctx.fillStyle = '#060a18'; ctx.fill(); ctx.clip();
  if (trail > ratio) { slice(ratio, trail); ctx.fillStyle = '#fff1c2'; ctx.fill(); }
  if (ratio > 0) {
    const body = ctx.createLinearGradient(0, y, 0, y + h);
    body.addColorStop(0, tones[0]); body.addColorStop(0.42, tones[1]); body.addColorStop(1, tones[2]);
    slice(0, ratio); ctx.fillStyle = body; ctx.fill();
    // 윗면의 광택 한 줄
    ctx.save(); slice(0, ratio); ctx.clip(); ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(x, y + 2, w + slant, Math.max(2, h * 0.24)); ctx.restore();
    // 줄어드는 중이면 끝이 하얗게 탄다.
    if (trail > ratio) { slice(Math.max(0, ratio - 5 / w), ratio); ctx.fillStyle = '#ffffff'; ctx.fill(); }
  }
  // 안쪽 위 그림자: 홈이 파인 느낌
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x, y, w + slant, 2);
  // 10칸 눈금: 어두운 선 옆에 밝은 선을 붙여 칸이 볼록해 보이게 한다.
  for (let i = 1; i < 10; i++) {
    const tick = x + w * i / 10;
    for (const [offset, color, width] of [[0, 'rgba(3,6,16,.8)', 2], [2, 'rgba(255,255,255,.2)', 1]] as const) {
      ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.beginPath(); ctx.moveTo(tick + slant + offset, y); ctx.lineTo(tick + offset, y + h); ctx.stroke();
    }
  }
  ctx.restore();
  slice(0, 1); ctx.strokeStyle = 'rgba(190,220,255,.65)'; ctx.lineWidth = 1.5; ctx.stroke();
}

/** 체력이 많이 남았으면 초록, 절반 아래는 노랑, 4분의 1 아래는 빨강. */
export function hpTones(ratio: number): readonly [string, string, string] {
  if (ratio > 0.5) return ['#c2ffd6', '#2fd46d', '#0c6e33'];
  if (ratio > 0.25) return ['#fff4b8', '#ffc61a', '#9a6100'];
  return ['#ffc6cb', '#ff4458', '#8a0d1d'];
}
export const EN_TONES = ['#c4f8ff', '#22c8e6', '#0a5a80'] as const;

/** 테두리가 있어 어떤 배경에서도 읽히는 숫자. 현재값은 크게, 최대값은 작게. 오른쪽 끝이 x다. */
function statNumber(ctx: Ctx, value: number, max: number, x: number, y: number, size: number): void {
  ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
  ctx.font = `700 ${Math.round(size * 0.6)}px ${FONT.num}`;
  const tail = ` / ${max}`, tailWidth = ctx.measureText(tail).width;
  ctx.lineWidth = 3; ctx.strokeStyle = '#040816'; ctx.strokeText(tail, x, y);
  ctx.fillStyle = COLOR.dim; ctx.fillText(tail, x, y);
  ctx.font = `700 ${size}px ${FONT.num}`;
  const shine = ctx.createLinearGradient(0, y - size, 0, y);
  shine.addColorStop(0, '#ffffff'); shine.addColorStop(1, '#bcd0f5');
  ctx.lineWidth = 4; ctx.strokeText(String(value), x - tailWidth, y);
  ctx.fillStyle = shine; ctx.fillText(String(value), x - tailWidth, y);
}

export interface HudState {
  name: string; pilot: string; color: string; side: Side;
  hp: number; hpMax: number; en: number; enMax: number;
  /** 줄어들기 전의 값. hp/en보다 늦게 따라 내려오며 "방금 잃은 만큼"을 보여 준다. */
  hpGhost: number; enGhost: number;
  /** 맞았을 때 창이 떨리는 세기(픽셀)와 하얗게 번쩍이는 정도(0~1). */
  jolt: number; flash: number;
}
export type HudInit = Pick<HudState, 'name' | 'pilot' | 'color' | 'side' | 'hp' | 'hpMax' | 'en' | 'enMax'>;
/** 정보창이 보여 줄 값 묶음을 만든다. 기체마다 하나씩 두고, 정보창(unitHud)의 state로 갈아 끼운다. */
export function hudState(init: HudInit): HudState { return { ...init, hpGhost: init.hp, enGhost: init.en, jolt: 0, flash: 0 }; }
/** 전투 장면 위쪽의 기체 정보창. state의 hp·en을 tween하면 게이지와 숫자가 함께 움직인다. */
export function unitHud(state: HudState): Shape<HudState> {
  return new Shape(state, (ctx, s) => {
    const w = 560, h = 106, x = s.side === 'left' ? 16 : W - 16 - w, y = 12, now = performance.now();
    if (s.jolt > 0.1) ctx.translate(Math.sin(now / 11) * s.jolt, Math.cos(now / 7) * s.jolt * 0.6);
    panel(ctx, x, y, w, h, s.color);
    ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    ctx.font = `900 23px ${FONT.body}`; ctx.fillStyle = COLOR.ink; ctx.fillText(s.name, x + 24, y + 9);
    // 무인기처럼 파일럿 이름이 기체 이름과 같으면 한 번만 쓴다.
    ctx.textAlign = 'right'; ctx.font = `500 15px ${FONT.body}`; ctx.fillStyle = COLOR.dim;
    if (s.pilot !== s.name) ctx.fillText(s.pilot, x + w - 24, y + 15);
    const hp = Math.max(0, Math.round(s.hp)), en = Math.max(0, Math.round(s.en)), left = x + 92, barWidth = 286;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = `700 16px ${FONT.num}`;
    ctx.fillStyle = COLOR.gold; ctx.fillText('HP', x + 24, y + 54);
    ctx.fillStyle = '#7fe9f7'; ctx.fillText(term('en'), x + 24, y + 84);
    gauge(ctx, left, y + 45, barWidth, 18, s.hp, s.hpGhost, s.hpMax, hpTones(hp / s.hpMax));
    gauge(ctx, left, y + 79, barWidth, 11, s.en, s.enGhost, s.enMax, EN_TONES);
    statNumber(ctx, hp, s.hpMax, x + w - 22, y + 64, 27);
    statNumber(ctx, en, s.enMax, x + w - 22, y + 92, 19);
    if (s.flash > 0.01) { ctx.globalAlpha *= s.flash * 0.55; ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, w, h); }
  });
}

/** 무기 이름 띠. 노드의 x가 띠의 바깥쪽 끝이다. */
export function weaponPlate(text: string, color: string, side: Side): Shape<{ text: string }> {
  return new Shape({ text }, (ctx, s) => {
    ctx.font = `30px ${FONT.display}`;
    const w = ctx.measureText(s.text).width + 84, h = 50, x = side === 'right' ? -w : 0;
    const fill = ctx.createLinearGradient(x, 0, x + w, 0);
    fill.addColorStop(side === 'right' ? 0 : 1, '#06112e'); fill.addColorStop(side === 'right' ? 1 : 0, color);
    ctx.save(); plate(ctx, x, 0, w, h, '#000', side === 'right' ? 'left' : 'right'); ctx.clip(); ctx.fillStyle = fill; ctx.fillRect(x, 0, w, h); ctx.restore();
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.fillText(s.text, x + w / 2, h / 2 + 2);
  });
}

/** 화면 왼쪽 위의 장소 표시. 지문으로 쓰던 "장면: ○○"을 대신한다. */
export function placeChip(text: string): Shape<{ text: string }> {
  return new Shape({ text }, (ctx, s) => {
    ctx.font = `700 20px ${FONT.body}`;
    const w = ctx.measureText(s.text).width + 62;
    plate(ctx, 0, 0, w, 40, 'rgba(7,11,26,.82)', 'right');
    ctx.fillStyle = COLOR.gold; ctx.fillRect(0, 0, 6, 40);
    ctx.fillStyle = COLOR.ink; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(s.text, 28, 21);
  });
}

/** 등장 삽화에 꽂히는 이름 카드. */
/** A small two-line card for quiet CGs. Never receives a scene description. */
export function quietCgCard(name:string,title:string,color:string):Shape<{name:string;title:string}> {
  return new Shape({name,title},(ctx,s)=>{
    ctx.textAlign='left';ctx.textBaseline='middle';ctx.font=`24px ${FONT.body}`;
    const width=Math.min(W-84,Math.max(ctx.measureText(s.title).width,ctx.measureText(s.name).width)+36);
    ctx.fillStyle='rgba(5,12,29,.72)';ctx.fillRect(0,0,width,82);
    ctx.fillStyle=color;ctx.font=`20px ${FONT.body}`;ctx.fillText(s.name,18,24,width-36);
    ctx.font=`24px ${FONT.body}`;ctx.fillText(s.title,18,56,width-36);
  });
}
export function nameCard(name: string, sub: string, color: string, maxWidth=W-80): Shape<{ name: string; sub: string }> {
  return new Shape({ name, sub }, (ctx, s) => {
    let size=104;ctx.font = `${size}px ${FONT.display}`;while(size>24&&ctx.measureText(s.name).width+126>maxWidth)ctx.font = `${--size}px ${FONT.display}`;
    const w = Math.min(maxWidth,ctx.measureText(s.name).width + 126);
    const fill = ctx.createLinearGradient(0, 0, w, 0); fill.addColorStop(0, color); fill.addColorStop(1, '#12224f');
    ctx.save(); plate(ctx, 0, 0, w, 128, '#000', 'right'); ctx.clip(); ctx.fillStyle = fill; ctx.fillRect(0, 0, w, 128); ctx.restore();
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillStyle = '#06112e'; ctx.fillText(s.name, 56, 73,maxWidth-112);
    ctx.fillStyle = '#fff'; ctx.fillText(s.name, 56, 68,maxWidth-112);
    ctx.font = `700 24px ${FONT.body}`;
    const subWidth = Math.min(maxWidth-56,ctx.measureText(s.sub).width + 46);
    ctx.fillStyle = '#06112e'; ctx.fillRect(56, 138, subWidth, 42);
    ctx.fillStyle = COLOR.gold; ctx.fillRect(56, 138, 6, 42);
    ctx.fillStyle = COLOR.ink; ctx.fillText(s.sub, 78, 160,subWidth-44);
  });
}

/** 화면 전체를 덮는 색. 번쩍임(흰색), 암전(검정), 위아래 띠(letterbox)에 쓴다. */
export function cover(color: string, top = 0, height = H): Shape {
  return new Shape<object>({}, ctx => { ctx.fillStyle = color; ctx.fillRect(0, top, W, height); });
}

/** 테두리 있는 큰 글자. 피해 숫자와 "기!" "승!" 같은 타격 글자. 노드 위치가 글자의 가운데다. */
export function bigText(text: string, size: number, fill: string, stroke: string): Shape<{ text: string }> {
  return new Shape({ text }, (ctx, s) => {
    ctx.font = `${size}px ${FONT.display}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = size * 0.11;
    ctx.strokeStyle = '#000'; ctx.strokeText(s.text, 0, size * 0.07);
    ctx.strokeStyle = stroke; ctx.strokeText(s.text, 0, 0);
    ctx.fillStyle = fill; ctx.fillText(s.text, 0, 0);
  });
}
