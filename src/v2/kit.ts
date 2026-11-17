import {touchInput} from './presentation';
/**
 * UI 부품. 모든 메뉴 화면은 여기 있는 부품의 조합으로만 만든다.
 *
 * 부품이 스스로 책임지는 것: 포커스 표시, 눌리는 느낌, 효과음, 키보드·마우스·터치 조작.
 * 화면이 하는 일: 부품을 어디에 놓을지와, 골랐을 때 무슨 일이 일어날지뿐이다.
 *
 * 조작의 약속
 *   - 포커스는 하나다. 키보드로 옮기든 마우스를 올리든 같은 포커스가 움직인다.
 *   - 결정 = Enter / 누르기, 취소 = Esc / 오른쪽 버튼. 취소는 Ui.onCancel이 받는다.
 *   - 고를 수 없는 항목을 누르면 "안 됨" 소리가 나고 아무 일도 일어나지 않는다.
 */
import { ease, tween, wait, type Step } from './flow';
import type { Action, InputEvent } from './input';
import type { Screen } from './screen';
import type { Sfx } from './sound';
import { H, Node, Shape, W, type Layer } from './stage';
import { COLOR, FONT, panel, plate, wrap, drawFace, type Portrait } from './ui';

type Ctx = CanvasRenderingContext2D;

/** 모서리 두 곳을 자른 모양의 길. 버튼과 탭의 몸통. */
function cutPath(ctx: Ctx, x: number, y: number, w: number, h: number, cut: number): void {
  ctx.beginPath();
  ctx.moveTo(x + cut, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h - cut);
  ctx.lineTo(x + w - cut, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + cut); ctx.closePath();
}

export abstract class Widget extends Node {
  w = 0; h = 0;
  ui!: Ui;
  /** false면 흐리게 보이고 고를 수 없다. */
  enabled = true;
  /** 포커스를 받을 수 있는가. */
  canFocus = true;
  focused = false;
  /** 포커스 쪽으로 부드럽게 따라가는 값(0~1)과, 눌린 직후 1에서 0으로 줄어드는 값. 그릴 때 쓴다. */
  protected glow = 0;
  protected press = 0;
  protected clock = 0;
  contains(x: number, y: number): boolean { return x >= this.x && x <= this.x + this.w && y >= this.y && y <= this.y + this.h; }
  /** 포커스가 있을 때 들어온 조작. 처리했으면 true를 돌려준다(아니면 Ui가 포커스 이동에 쓴다). */
  act(_action: Action): boolean { return false; }
  /** 이 부품 위에서 일어난 누름·움직임·뗌. 좌표는 논리 좌표. */
  point(_phase: 'down' | 'move' | 'up', _x: number, _y: number): void {}
  tick(dt: number): void {
    this.clock += dt;
    this.glow += ((this.focused ? 1 : 0) - this.glow) * Math.min(1, dt * 16);
    this.press = Math.max(0, this.press - dt * 6);
  }
}

/** 한 화면의 부품들과 포커스를 맡는다. Screen마다 하나씩 있다(screen.ui). */
export class Ui {
  focus?: Widget;
  /** 취소했을 때 할 일. 보통 화면을 닫는다. */
  onCancel?: () => void;
  private widgets: Widget[] = [];
  private captured?: Widget;
  private navigation: Widget[] = [];
  /** Local navigation is declared by the screen; the fallback delivers the very same Esc input. */
  setNavigation(options: Navigation): void {
    for (const w of this.navigation) this.remove(w);
    this.navigation = [];
    this.onCancel = options.kind === 'none' ? undefined : options.onBack;
    if (options.kind === 'none') return;
    const run = (): void => this.screen.input({kind:'action',action:'cancel'});
    const r = options.bounds ?? {x:24,y:80,w:1232,h:584};
    if (options.kind !== 'escape' && !options.cancelInContent) {
      const close = options.kind === 'close';
      const button = new Button(close ? '✕' : '뒤로', run, {w:close?88:152,h:88});
      Object.assign(button,{x:r.x+r.w-button.w-8,y:close?r.y+8:r.y+r.h-96,z:110,canFocus:false});
      this.navigation.push(this.add(button));
    }
    if (options.esc !== false) {
      const button = Object.assign(new EscapeButton(run),{x:W-80,y:8,z:120,canFocus:false});
      this.navigation.push(this.add(button));
    }
  }
  textWidthFor(widget:Widget,localY:number,height:number):number {let width=widget.w;for(const b of this.navigation)if(b.visible&&b.x>widget.x&&b.y<widget.y+localY+height&&b.y+b.h>widget.y+localY)width=Math.min(width,b.x-widget.x-8);return width;}
  /** Popups must not mistake a local close/back press for a tap on the map underneath. */
  navigationContains(x:number,y:number):boolean {return this.navigation.some(w=>w.visible&&w.contains(x,y));}
  constructor(private readonly screen: Screen) {}
  clear():void{for(const w of [...this.widgets])this.remove(w);this.navigation=[];this.onCancel=undefined;this.captured=undefined;}

  /** @param layer 올릴 레이어. 기본은 ui(카메라를 따라가지 않음). 맵 판처럼 스크롤되는 부품은 world에 올린다. */
  add<T extends Widget>(widget: T, layer: Layer = this.screen.stage.ui): T {
    layer.add(widget);
    widget.ui = this; this.widgets.push(widget);
    if (!this.focus && widget.canFocus && widget.enabled && (!(widget instanceof MenuList)||widget.items.some(i=>!i.disabled))) this.focusOn(widget, true);
    return widget;
  }
  remove(widget: Widget): void {
    widget.remove(); this.widgets = this.widgets.filter(w => w !== widget);
    if (this.focus === widget) { this.focus = undefined; const next = this.widgets.find(w => w.canFocus && w.enabled); if (next) this.focusOn(next, true); }
  }
  focusOn(widget: Widget, silent = false): void {
    if (this.focus === widget) return;
    if (this.focus) this.focus.focused = false;
    this.focus = widget; widget.focused = true;
    if (!silent) this.play('cursor');
  }
  play(id: Sfx, gain = 1): void { this.screen.app.sound.play(id, gain); }
  tick(dt: number): void { for (const widget of this.widgets) widget.tick(dt); }

  /** @returns 부품이 이 입력을 가져갔으면 true. 화면이 남은 입력(빈 곳 누르기 등)을 따로 쓸 때 본다. */
  input(event: InputEvent, only?: readonly Widget[]): boolean {
    if (event.kind === 'pointer') {
      const { phase, x, y } = event;
      // 나중에 올린 부품이 위에 있다.
      const hit = [...this.widgets].sort((a,b)=>a.z-b.z).reverse().find(w => (!only || only.includes(w)) && w.visible && w.contains(x, y));
      if (phase === 'down') {
        this.captured = hit;
        if (hit?.canFocus && hit.enabled) this.focusOn(hit, true);
        hit?.point('down', x, y);
      } else if (phase === 'move') {
        if (this.captured) this.captured.point('move', x, y);
        else if (hit) { if (hit.canFocus && hit.enabled) this.focusOn(hit); hit.point('move', x, y); }
      } else { const target = this.captured; this.captured = undefined; target?.point('up', x, y); return !!target; }
      return !!(this.captured ?? hit);
    }
    const { action } = event;
    if(event.wheel&&this.focus instanceof MenuList)return this.focus.act(action);
    if (this.focus && (!only || only.includes(this.focus)) && this.focus.act(action)) return true;
    if (action === 'cancel') { if (this.onCancel) { this.play('cancel'); this.onCancel(); return true; } return false; }
    if (action === 'up' || action === 'down' || action === 'left' || action === 'right') {
      const next = this.neighbor(action);
      if (next) { this.focusOn(next); return true; }
    }
    return false;
  }

  /** 포커스에서 그 방향으로 가장 가까운 부품. 축에서 벗어난 만큼 불리하게 쳐서 "바로 옆"을 고른다. */
  private neighbor(direction: 'up' | 'down' | 'left' | 'right'): Widget | undefined {
    const from = this.focus;
    if (!from) return this.widgets.find(w => w.canFocus && w.enabled);
    const cx = from.x + from.w / 2, cy = from.y + from.h / 2, horizontal = direction === 'left' || direction === 'right', sign = direction === 'left' || direction === 'up' ? -1 : 1;
    let best: Widget | undefined, bestScore = Infinity;
    for (const w of this.widgets) {
      if (w === from || !w.canFocus || !w.enabled || !w.visible) continue;
      const dx = w.x + w.w / 2 - cx, dy = w.y + w.h / 2 - cy, along = (horizontal ? dx : dy) * sign, across = Math.abs(horizontal ? dy : dx);
      if (along < 8) continue;
      const score = along + across * 2.5;
      if (score < bestScore) { best = w; bestScore = score; }
    }
    return best;
  }
}

/** 누르는 버튼. kind가 main이면 그 화면의 주된 행동(파란색)이다. */
export class Button extends Widget {
  toggled=false;
  /** 비활성 버튼을 눌렀을 때 이유를 알려야 하는 화면에서만 지정한다. */
  onDenied?:()=>void;
  private armed = false;
  constructor(public label: string, private readonly onPress: () => void, options: { w?: number; h?: number; kind?: 'main' | 'plain' | 'back'; sound?:'confirm'|'important'|'cancel'; wrapLabel?: boolean } = {}) {
    super();
    this.w = options.w ?? 220; this.h = options.h ?? 54; this.kind = options.kind ?? 'plain'; this.wrapLabel = options.wrapLabel ?? false;this.sound=options.sound??'confirm';
  }
  private readonly kind: 'main' | 'plain' | 'back';
  private readonly wrapLabel: boolean;
  private readonly sound:'confirm'|'important'|'cancel';
  act(action: Action): boolean {
    if (action !== 'confirm') return false;
    this.fire(); return true;
  }
  point(phase: 'down' | 'move' | 'up', x: number, y: number): void {
    if (phase === 'down') this.armed = true;
    if (phase === 'up') { if (this.armed && this.contains(x, y)) this.fire(); this.armed = false; }
  }
  private fire(): void {
    if (!this.enabled) { this.ui.play('deny'); this.onDenied?.(); return; }
    this.press = 1; this.ui.play(this.sound); this.onPress();
  }
  protected paint(ctx: Ctx): void {
    const { w, h, glow, press } = this, squeeze = 1 - press * 0.05;
    if (!this.enabled) ctx.globalAlpha *= 0.4;
    ctx.translate(w / 2, h / 2); ctx.scale(squeeze, squeeze); ctx.translate(-w / 2, -h / 2);
    // 바닥 그림자: 눌리면 가라앉아 줄어든다.
    cutPath(ctx, 4 - press * 3, 5 - press * 4, w, h, 12); ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fill();
    const body = ctx.createLinearGradient(0, 0, 0, h);
    if (this.kind === 'main') { body.addColorStop(0, '#4aa3ff'); body.addColorStop(1, '#1556b8'); }
    else if (this.kind === 'back') { body.addColorStop(0, '#b3263c'); body.addColorStop(1, '#5a0e1c'); }
    else { body.addColorStop(0, '#1b2b5c'); body.addColorStop(1, '#0a1230'); }
    cutPath(ctx, 0, 0, w, h, 12); ctx.fillStyle = body; ctx.fill();
    if (this.kind === 'back') {
      // 뒤로 가기는 어디서든 눈에 띄어야 한다: 테두리가 천천히 숨 쉬듯 빛난다.
      ctx.save(); ctx.globalAlpha *= 0.45 + Math.sin(this.clock * 3.2) * 0.3;
      cutPath(ctx, -2, -2, w + 4, h + 4, 13); ctx.strokeStyle = '#ffd6dc'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    }
    if (glow > 0.01) {
      const lit = ctx.createLinearGradient(0, 0, 0, h);
      lit.addColorStop(0, '#fff0a8'); lit.addColorStop(1, '#f2b300');
      ctx.save(); ctx.globalAlpha *= glow; cutPath(ctx, 0, 0, w, h, 12); ctx.fillStyle = lit; ctx.fill();
      cutPath(ctx, -3, -3, w + 6, h + 6, 14); ctx.strokeStyle = '#fff6c9'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    }
    // 윗면의 밝은 선과 광택
    ctx.fillStyle = `rgba(255,255,255,${0.35 + glow * 0.4})`; ctx.fillRect(12, 0, w - 12, 2);
    ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(4, 3, w - 8, h * 0.38);
    if(!this.enabled)ctx.globalAlpha/=.4;
    let size = Math.round(h * 0.42);
    ctx.font = `700 ${size}px ${FONT.body}`;
    const width = w - 32;
    let lines = this.wrapLabel ? wrap(ctx, this.label, width) : [this.label];
    while (size > 13 && (this.wrapLabel ? lines.length > 2 : ctx.measureText(this.label).width > width)) {
      ctx.font = `700 ${--size}px ${FONT.body}`;
      lines = this.wrapLabel ? wrap(ctx, this.label, width) : [this.label];
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = glow > 0.5 ? '#0a1024' : !this.enabled ? '#aab6d0' : COLOR.ink;
    // Extremely long labels still remain within the button; ordinary labels retain their size.
    if (lines.length > 2) lines = [lines[0], lines.slice(1).join('')];
    lines.forEach((line, i) => ctx.fillText(line, w / 2, h / 2 + 1 + (i - (lines.length - 1) / 2) * (size + 2), width));
  }
}

export interface NavigationRect {x:number;y:number;w:number;h:number}
export type Navigation = {kind:'none'} | {kind:'close'|'back'|'escape';onBack:()=>void;bounds?:NavigationRect;esc?:boolean;cancelInContent?:boolean};
/** Reserved corner: 88×72. Subtle fallback, deliberately separate from local navigation. */
class EscapeButton extends Button {
  constructor(run:()=>void){super('ESC',run,{w:72,h:56});}
  protected paint(ctx:Ctx):void {cutPath(ctx,0,0,this.w,this.h,8);ctx.fillStyle='rgba(4,8,20,.65)';ctx.fill();ctx.strokeStyle='rgba(185,199,230,.45)';ctx.lineWidth=1;ctx.stroke();ctx.font=`700 19px ${FONT.body}`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=COLOR.dim;ctx.fillText('ESC',this.w/2,this.h/2);}
}

/** @property pips 단계 표시(개조 단계처럼 "10칸 중 3칸"). 값 글자 왼쪽에 칸으로 그려진다. */
export interface MenuItem { sound?:'confirm'|'important'; badge?:string; singleDescription?:boolean; wrapLabel?: boolean; labelSize?: number; valueSize?:number; portrait?: Portrait; description?: string; label: string; value?: string; disabled?: boolean; titleOffset?:number;descriptionOffset?:number; pips?: { level: number; max: number } }
/**
 * 세로 메뉴. 로봇대전 메뉴의 뼈대다: 금색 띠가 고른 줄로 미끄러지고, 왼쪽에 화살표가 까딱인다.
 *
 * 항목이 rows보다 많으면 저절로 쪽 넘김이 붙는다.
 *   - 위아래에 "▲ 이전" "▼ 다음" 줄이 생기고, 누르면 한 쪽씩 넘어간다(터치).
 *   - 목록을 끌어서 넘길 수도 있다.
 *   - 키보드는 그대로 위아래로 움직이면 따라 넘어간다.
 * 화면이 쪽 넘김을 따로 만들 필요는 없다.
 */
export class MenuList extends Widget {
  get readOnly(){return !this.canFocus;}
  selectionPoint(){return{x:this.x+this.w/2,y:this.y+10+this.pager+(this.index-this.top+.5)*this.rowHeight};}
  visibleItems(){return this.items.slice(this.top,this.top+this.rows);}
  index = 0;
  private bar = 0;       // 금색 띠의 현재 줄 위치(부드럽게 따라감)
  private top = 0;       // 맨 위에 보이는 줄
  private shownTop = 0;
  private downRow = -1;
  /** 누른 줄이 누르기 전에 이미 골라져 있었는가. 두 번 눌러 결정할 때 쓴다. */
  private downWasCurrent = false;
  /** 터치·클릭 방식. 'confirm-selected': 첫 탭은 고르기만, 골라진 줄을 다시 누르면 결정(기본).
   *  'select': 탭은 고르기만 하고 결정은 따로 둔 버튼이 맡는다. 'choose': 탭 한 번에 결정(메뉴 이동용). */
  private readonly tap: 'confirm-selected' | 'select' | 'choose';
  private drag?: { y: number; top: number; moved: boolean };
  private readonly rows: number;
  private readonly pagerHeight:number;
  private readonly rowHeight: number;
  /** 쪽 넘김 줄 하나의 높이. 넘길 것이 없는 목록에서는 0이다. */
  private pager: number;
  private readonly dynamic: boolean;
  private pointerPreview=-1;
  private readonly previewFirst:boolean;
  private readonly onMove?: (index: number, item: MenuItem) => void;
  constructor(public items: MenuItem[], private readonly onChoose: (index: number, item: MenuItem) => void,
    options: { w: number; rows?: number; rowHeight?: number; dynamic?: boolean; pagerHeight?:number; previewFirst?:boolean; onMove?: (index: number, item: MenuItem) => void; tap?: 'confirm-selected' | 'select' | 'choose';maxHeight?:number;readOnly?:boolean }) {
    super();
    this.pagerHeight=options.pagerHeight??38;this.previewFirst=options.previewFirst??false;this.dynamic = options.dynamic ?? false;
    this.rows = this.dynamic ? options.rows ?? items.length : Math.min(options.rows ?? items.length, items.length); this.rowHeight = options.rowHeight ?? 52;
    this.pager = items.length > this.rows ? this.pagerHeight : 0;
    this.index=Math.max(0,items.findIndex(i=>!i.disabled));this.bar=this.index;this.w = options.w; this.h = this.rows * this.rowHeight + 20 + this.pager * 2; this.onMove = options.onMove; this.tap = options.tap ?? 'choose';
  }
  /** 항목을 통째로 바꾼다(탭을 바꿨을 때 등). */
  setItems(items: MenuItem[]): void { if (this.dynamic) { this.pager = items.length > this.rows ? this.pagerHeight : 0; this.h = this.rows * this.rowHeight + 20 + this.pager * 2; } this.items = items; this.index = Math.min(this.index, Math.max(0, items.length - 1)); this.top = 0;if(items[this.index]?.disabled)this.index=Math.max(0,items.findIndex(i=>!i.disabled)); }
  private get last(): number { return Math.max(0, this.items.length - this.rows); }
  private move(to: number, silent = false): void {
    const count = this.items.length;
    if (!count) return;
    let next = (to + count) % count;const direction=to<this.index?-1:1;for(let n=0;n<count&&this.items[next]?.disabled;n++)next=(next+direction+count)%count;if(this.items[next]?.disabled)return;
    if (next === this.index) return;
    this.index = next;
    if (next < this.top) this.top = next;
    if (next >= this.top + this.rows) this.top = next - this.rows + 1;
    if (!silent) this.ui.play('cursor');
    this.onMove?.(next, this.items[next]);
  }
  /** 보이는 범위를 옮긴다. 고른 줄이 화면 밖으로 나가면 범위 안으로 데려온다. */
  private scrollTo(top: number): void {
    const next = Math.max(0, Math.min(this.last, top));
    if (next === this.top) return;
    this.top = next;
    const index = Math.max(next, Math.min(next + this.rows - 1, this.index));
    if (index !== this.index) { this.index = index; this.onMove?.(index, this.items[index]); }
  }
  private choose(): void {
    const item = this.items[this.index];
    if (!item || item.disabled) { this.ui.play('deny'); return; }
    this.press = 1; this.ui.play(item.sound??'confirm'); this.onChoose(this.index, item);
  }
  act(action: Action): boolean {
    if (action === 'up') { this.move(this.index - 1); return true; }
    if (action === 'down') { this.move(this.index + 1); return true; }
    if (action === 'confirm') { this.choose(); return true; }
    return false;
  }
  /** 누른 자리가 무엇인가: 줄 번호, 또는 쪽 넘김 줄('prev'·'next'). */
  private spot(y: number): number | 'prev' | 'next' | undefined {
    const local = y - this.y;
    if (this.pager) { if (local < this.pager + 6) return 'prev'; if (local > this.h - this.pager - 6) return 'next'; }
    const row = Math.floor((local - 10 - this.pager) / this.rowHeight) + this.top;
    return row >= this.top && row < Math.min(this.items.length, this.top + this.rows) ? row : undefined;
  }
  point(phase: 'down' | 'move' | 'up', x: number, y: number): void {
    const spot = this.spot(y), row = typeof spot === 'number'&&!this.items[spot]?.disabled ? spot : -1;
    if (phase === 'down') { this.downRow = row; this.downWasCurrent = row >= 0 && row === this.index&&(!this.previewFirst||this.pointerPreview===row);if(row>=0){this.pointerPreview=row;this.onMove?.(row,this.items[row]);} this.drag = { y, top: this.top, moved: false }; if (row >= 0) this.move(row); return; }
    if (phase === 'move') {
      const drag = this.drag;
      if (drag && this.pager && Math.abs(y - drag.y) > 14) { drag.moved = true; this.scrollTo(drag.top - Math.round((y - drag.y) / this.rowHeight)); }
      else if (!drag && row >= 0) {this.pointerPreview=row;this.move(row);this.onMove?.(row,this.items[row]);}   // 마우스를 올리기만 했을 때
      return;
    }
    const dragged = this.drag?.moved;
    this.drag = undefined;
    if (dragged) { this.downRow = -1; return; }
    if (spot === 'prev' || spot === 'next') {
      const before = this.top;
      this.scrollTo(this.top + (spot === 'next' ? this.rows : -this.rows));
      this.ui.play(before === this.top ? 'deny' : 'cursor');
    } else if (this.contains(x, y) && row >= 0 && row === this.downRow) { this.move(row, true); if (this.tap === 'choose' || (this.tap === 'confirm-selected' && this.downWasCurrent)) this.choose(); }
    this.downRow = -1;
  }
  tick(dt: number): void {
    super.tick(dt);
    const k = Math.min(1, dt * 22);
    this.bar += (this.index - this.bar) * k; this.shownTop += (this.top - this.shownTop) * k;
  }
  protected paint(ctx: Ctx): void {
    const { w, h, rowHeight, glow, pager } = this, pad = 10 + pager;
    panel(ctx, 0, 0, w, h, this.focused ? COLOR.gold : COLOR.edge);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, pad, w, h - pad * 2); ctx.clip();
    const offset = pad - this.shownTop * rowHeight;
    // 금색 띠: 포커스가 다른 부품에 있으면 흐려져 "여긴 지금 안 고르는 중"임을 알린다.
    const barY = offset + this.bar * rowHeight + 4, lit = ctx.createLinearGradient(0, 0, w, 0);
    lit.addColorStop(0, '#ffe27a'); lit.addColorStop(0.7, '#f2b300'); lit.addColorStop(1, 'rgba(242,179,0,.15)');
    ctx.save(); ctx.globalAlpha *= 0.28 + glow * 0.72; plate(ctx, 8, barY, w - 16, rowHeight - 8, '#000', 'right'); ctx.clip(); ctx.fillStyle = lit; ctx.fillRect(8, barY, w - 16, rowHeight - 8);
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(8, barY, w - 16, 3); ctx.restore();
    ctx.textBaseline = 'middle';
    this.items.forEach((item, i) => {
      const y = offset + i * rowHeight + rowHeight / 2 + 1, available=this.ui?.textWidthFor(this,y-rowHeight/2,rowHeight)??w, chosen = i === this.index && this.focused;
      if (y < -rowHeight || y > h + rowHeight) return;
      ctx.font = `700 ${item.labelSize ?? Math.round(rowHeight * 0.44)}px ${FONT.body}`; ctx.textAlign = 'left';
      ctx.fillStyle = chosen ? '#0a1024' : item.disabled ? '#aab6d0' : COLOR.ink;
      const left = item.portrait ? 108 : 50;
      if (item.portrait) {ctx.save();drawFace(ctx, item.portrait, 'default', 46, y - rowHeight * 0.4, rowHeight * 0.8);ctx.restore();}
      let badgeWidth=0;if(item.badge){ctx.save();ctx.font=`700 14px ${FONT.body}`;badgeWidth=ctx.measureText(item.badge).width+24;plate(ctx,w-28-badgeWidth,y-rowHeight*.2-13,badgeWidth,26,chosen?'#344265':'#243252','right');ctx.fillStyle='#ffe4aa';ctx.textAlign='center';ctx.fillText(item.badge,w-28-badgeWidth/2,y-rowHeight*.2);ctx.restore();}
      if(item.singleDescription){let size=item.labelSize??22;while(size>14&&ctx.measureText(item.label).width>w-left-44-badgeWidth)ctx.font=`700 ${--size}px ${FONT.body}`;ctx.fillText(item.label,left,y-rowHeight*.2,w-left-44-badgeWidth);}else if(item.wrapLabel){const lines=wrap(ctx,item.label,w-left-32);lines.slice(0,2).forEach((line,row)=>ctx.fillText(line,left,y+(item.description?-rowHeight*.27+row*24:(row-(Math.min(2,lines.length)-1)/2)*28)));}else ctx.fillText(item.label, left, item.description ? y - rowHeight * 0.2+(item.titleOffset??0) : y,available-left-32-(item.value?Math.min(240,ctx.measureText(item.value).width+18):0));
      if (item.description) {
        ctx.font = `500 ${Math.max(16, Math.round(rowHeight * 0.23))}px ${FONT.body}`;
        ctx.fillStyle = chosen ? '#172344' : COLOR.dim;
        if(item.singleDescription){let size=16;while(size>12&&ctx.measureText(item.description).width>w-left-32)ctx.font=`500 ${--size}px ${FONT.body}`;ctx.fillText(item.description,left,y+13,w-left-32);}
        const lines = item.singleDescription?[]:wrap(ctx, item.description, available - left - 32);
        lines.slice(0, 2).forEach((line, row) => ctx.fillText(line, left, y + 12 + row * 21+(item.descriptionOffset??0)));
      }
      let right = available - 26;
      if (item.value) { ctx.textAlign = 'right'; ctx.font = `700 ${item.valueSize??Math.round(rowHeight * 0.4)}px ${FONT.num}`; ctx.fillStyle=chosen?'#0a1024':item.disabled?'#aab6d0':COLOR.ink;ctx.fillText(item.value, right, y); right -= ctx.measureText(item.value).width + 18; }
      if (item.pips) {
        // 단계 칸: 채운 칸은 밝게, 빈 칸은 어둡게.
        const gap=2,size=Math.min(11,Math.max(3,(150-(item.pips.max-1)*gap)/item.pips.max)),total=item.pips.max*(size+gap)-gap;
        for (let k = 0; k < item.pips.max; k++) {
          ctx.fillStyle = k < item.pips.level ? (chosen ? '#0a1024' : COLOR.gold) : (chosen ? 'rgba(10,16,36,.28)' : 'rgba(255,255,255,.16)');
          ctx.fillRect(right - total + k * (size + gap), y - 8, size, 16);
        }
      }
    });
    // 까딱이는 화살표
    const arrowY = offset + this.bar * rowHeight + rowHeight / 2, nudge = Math.sin(this.clock * 9) * 3 * glow;
    ctx.fillStyle = glow > 0.5 ? '#0a1024' : COLOR.gold; ctx.beginPath();
    ctx.moveTo(22 + nudge, arrowY - 9); ctx.lineTo(38 + nudge, arrowY); ctx.lineTo(22 + nudge, arrowY + 9); ctx.closePath(); ctx.fill();
    ctx.restore();
    if (!pager) return;
    // 쪽 넘김 줄: 넘길 쪽이 있으면 밝게 까딱이고, 없으면 흐리다. 가운데에는 지금 몇 번째를 보고 있는지 적는다.
    const more = [this.top > 0, this.top < this.last], bob = Math.sin(this.clock * 5) * 2.5;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `700 17px ${FONT.body}`;
    [[6, '▲ 이전'], [h - pager - 6, '▼ 다음']].forEach(([y, text], i) => {
      const top = y as number, on = more[i],width=this.ui?.textWidthFor(this,top,pager)??w;
      ctx.fillStyle = on ? 'rgba(255,210,63,.2)' : 'rgba(255,255,255,.05)'; ctx.fillRect(10, top, w - 20, pager);
      if (on) { ctx.fillStyle = COLOR.gold; ctx.fillRect(10, i ? top + pager - 2 : top, w - 20, 2); }
      ctx.fillStyle = on ? COLOR.gold : '#8390aa';
      ctx.fillText(text as string, width / 2, top + pager / 2 + 1 + (on ? (i ? bob : -bob) : 0));
    });
    ctx.textAlign = 'right'; ctx.font = `700 14px ${FONT.num}`; ctx.fillStyle = COLOR.dim;
    ctx.fillText(`${this.top + 1}-${Math.min(this.items.length, this.top + this.rows)} / ${this.items.length}`, (this.ui?.textWidthFor(this,h-pager,pager)??w)-18, h - pager / 2 - 5);
  }
}

/** 가로 탭. 좌우로 바꾼다. */
export class Tabs extends Widget {
  index = 0;
  constructor(public labels: string[], private readonly onChange: (index: number) => void, options: { w: number; h?: number }) {
    super();
    this.w = options.w; this.h = options.h ?? 46;
  }
  private select(to: number): void {
    const next = (to + this.labels.length) % this.labels.length;
    if (next === this.index) return;
    this.index = next; this.ui.play('cursor'); this.onChange(next);
  }
  act(action: Action): boolean {
    if (action === 'left') { this.select(this.index - 1); return true; }
    if (action === 'right') { this.select(this.index + 1); return true; }
    return false;
  }
  point(phase: 'down' | 'move' | 'up', x: number): void {
    if (phase === 'up' && x >= this.x && x <= this.x + this.w) this.select(Math.floor((x - this.x) / (this.w / this.labels.length)));
  }
  protected paint(ctx: Ctx): void {
    const { w, h, glow } = this, each = w / this.labels.length;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `700 ${Math.round(h * 0.44)}px ${FONT.body}`;
    this.labels.forEach((label, i) => {
      const x = i * each, active = i === this.index;
      plate(ctx, x + 2, active ? 0 : 6, each - 4, active ? h : h - 6, active ? COLOR.gold : '#14204a', 'right');
      if (active && glow > 0.01) { ctx.save(); ctx.globalAlpha *= glow; ctx.strokeStyle = '#fff6c9'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore(); }
      ctx.fillStyle = active ? '#0a1024' : COLOR.dim; ctx.fillText(label, x + each / 2 - 6, (active ? h : h + 6) / 2 + 1);
    });
    ctx.fillStyle = COLOR.gold; ctx.fillRect(0, h - 2, w, 2);
  }
}

// ── 조작이 없는 꾸밈 부품 ─────────────────────────────────────────

/** 제목 띠가 달린 창. 노드의 위치가 창의 왼쪽 위다. */
export function windowFrame(title: string, w: number, h: number, options:{inside?:boolean}={}): Shape {
  return new Shape<object>({}, ctx => {
    panel(ctx, 0, 0, w, h);
    if(!title)return;
    ctx.font = `24px ${FONT.display}`;
    if(options.inside){ctx.fillStyle=COLOR.ink;ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(title,24,44,w-136);return;}
    const titleWidth = ctx.measureText(title).width + 64;
    plate(ctx, 18, -20, titleWidth, 38, COLOR.ally, 'right');
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(title, 38, 0);
  });
}

/** 글 한 덩어리. width를 주면 그 너비에서 줄을 바꾼다. state.text를 바꾸면 내용이 바뀐다. */
export function label(text: string, size: number, options: { color?: string; width?: number; weight?: number; align?: CanvasTextAlign; display?: boolean; lineHeight?:number } = {}): Shape<{ text: string }> {
  return new Shape({ text }, (ctx, s) => {
    ctx.font = options.display ? `${size}px ${FONT.display}` : `${options.weight ?? 500} ${size}px ${FONT.body}`;
    ctx.fillStyle = options.color ?? COLOR.ink; ctx.textAlign = options.align ?? 'left'; ctx.textBaseline = 'top';
    const lines = options.width ? s.text.split('\n').flatMap(part => wrap(ctx, part, options.width!)) : s.text.split('\n');
    lines.forEach((line, row) => ctx.fillText(line, 0, row * (options.lineHeight??size*1.5)));
  });
}

/** 이름과 값이 줄지어 있는 표(기체 능력치 등). */
export function statTable(rows: readonly (readonly [string, string])[], w: number, rowHeight = 34): Shape {
  return new Shape<object>({}, ctx => {
    ctx.textBaseline = 'middle';
    rows.forEach(([name, value], i) => {
      const y = i * rowHeight;
      if (i % 2 === 0) { ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fillRect(0, y, w, rowHeight); }
      ctx.font = `500 ${Math.round(rowHeight * 0.5)}px ${FONT.body}`; ctx.fillStyle = COLOR.dim; ctx.textAlign = 'left'; ctx.fillText(name, 12, y + rowHeight / 2 + 1);
      ctx.font = `700 ${Math.round(rowHeight * 0.58)}px ${FONT.num}`; ctx.fillStyle = COLOR.ink; ctx.textAlign = 'right'; ctx.fillText(value, w - 12, y + rowHeight / 2 + 1);
    });
  });
}

/** 화면 맨 아래의 조작 안내 한 줄. 모든 메뉴 화면에 둔다. */
export function hintBar(text: string): Shape<{ text: string }> {
  const node = new Shape({ text }, (ctx, s) => {
    if(touchInput())return;
    ctx.fillStyle = 'rgba(5,8,20,.86)'; ctx.fillRect(0, H - 40, W, 40);
    ctx.fillStyle = COLOR.gold; ctx.fillRect(0, H - 40, W, 2);
    ctx.font = `500 18px ${FONT.body}`; ctx.fillStyle = COLOR.dim; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(s.text, W / 2, H - 19,900);
  });
  node.z = 80;
  return node;
}

/** 잠깐 떴다 사라지는 알림. 저장 완료, 획득 같은 "알려만 주면 되는" 일에 쓴다. */
export function toast(screen: Screen, text: string): void {
  const node = new Shape({ text }, (ctx, s) => {
    ctx.font = `700 22px ${FONT.body}`;
    const lines=s.text.split('\n'),h=lines.length*28+20,w=Math.min(W-80,Math.max(...lines.map(line=>ctx.measureText(line).width))+80);
    plate(ctx, -w / 2 + 3, 4, w, h, 'rgba(0,0,0,.4)', 'right');
    plate(ctx, -w / 2, 0, w, h, '#0b1a44', 'right');
    ctx.fillStyle = COLOR.gold; ctx.fillRect(-w / 2, 0, 6, h);
    ctx.fillStyle = COLOR.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; lines.forEach((line,i)=>ctx.fillText(line,0,24+i*28,w-64));
  });
  Object.assign(node, { x: W / 2, y: -Math.max(60,text.split('\n').length*28+20), z: 95 });
  screen.stage.ui.add(node);
  screen.app.sound.play('confirm', 0.6);
  screen.run((function* (): Step {
    yield* tween(node, { y: 96 }, 0.25, ease.back);
    yield* wait(1.6);
    yield* tween(node, { y: -60, alpha: 0 }, 0.25, ease.in);
    node.remove();
  })());
}


/** 숫자 값. 좌우 키 또는 양쪽 −/+ 누르기로 조절한다. */
export class Slider extends Widget {
  constructor(public label: string, public value: number, readonly min: number, readonly max: number, private readonly change: (value: number) => void, options: { w?: number; step?: number; format?: (n: number) => string } = {}) {
    super(); this.w = options.w ?? 720; this.h = 60; this.options = options;
  }
  private readonly options: { step?: number; format?: (n: number) => string };
  private set(value: number): void {
    this.value = Math.max(this.min, Math.min(this.max, Math.round((value - this.min) / (this.options.step ?? 1)) * (this.options.step ?? 1) + this.min));
    this.change(this.value); this.ui.play('cursor');
  }
  act(action: Action): boolean {
    if (action === 'left' || action === 'right') { this.set(this.value + (action === 'left' ? -1 : 1) * (this.options.step ?? 1)); return true; }
    return false;
  }
  point(phase: 'down' | 'move' | 'up', x: number): void {
    if (phase !== 'up') return;
    const local = x - this.x;
    if (local < this.w - 150) this.set(this.value - (this.options.step ?? 1)); else this.set(this.value + (this.options.step ?? 1));
  }
  protected paint(ctx: Ctx): void {
    panel(ctx, 0, 0, this.w, this.h, this.focused ? COLOR.ally : undefined);
    ctx.font = `700 23px ${FONT.body}`; ctx.fillStyle = COLOR.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(this.label, 24, 30);
    ctx.textAlign = 'center'; ctx.fillStyle = COLOR.gold; ctx.fillText('−', this.w - 260, 30);
    ctx.fillStyle = COLOR.ink; ctx.fillText(this.options.format?.(this.value) ?? String(this.value), this.w - 150, 30);
    ctx.fillStyle = COLOR.gold; ctx.fillText('+', this.w - 40, 30);
  }
}

/** 켜기/끄기. 좌우 키 또는 누르기로 바꾼다. */
export class Toggle extends Widget {
  constructor(public label: string, public value: boolean, private readonly change: (value: boolean) => void, width = 720) { super(); this.w = width; this.h = 60; }
  private flip(): void { this.value = !this.value; this.change(this.value); this.ui.play('confirm'); }
  act(action: Action): boolean { if (['left', 'right', 'confirm'].includes(action)) { this.flip(); return true; } return false; }
  point(phase: 'down' | 'move' | 'up'): void { if (phase === 'up') this.flip(); }
  protected paint(ctx: Ctx): void {
    panel(ctx, 0, 0, this.w, this.h, this.focused ? COLOR.ally : undefined);
    ctx.font = `700 23px ${FONT.body}`; ctx.fillStyle = COLOR.ink; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(this.label, 24, 30);
    ctx.textAlign = 'right'; ctx.fillStyle = COLOR.gold; ctx.fillText(this.value ? '켜기' : '끄기', this.w - 32, 30);
  }
}

/** 한글 IME·휴대폰 키보드는 이 부품 안의 실제 input이 맡는다. 화면은 DOM을 다루지 않는다. */
export class TextField extends Widget {
  private input?: HTMLInputElement;
  private composing = false;
  private alignInput?: () => void;
  constructor(private readonly host: Screen, public value: string, private readonly changed: (value: string) => void, readonly caption = '이름') { super(); this.w = 640; this.h = 76; }
  accept(value: string): void { this.value = value; this.changed(value); }
  private close(): void { const input = this.input; this.input = undefined; this.alignInput = undefined; this.composing = false; input?.remove(); }
  private edit(): void {
    if (typeof document === 'undefined' || this.input) return;
    const input = this.input = document.createElement('input');
    input.value = this.value; input.autocomplete = 'off'; input.spellcheck = false; input.setAttribute('aria-label', this.caption);
    input.style.cssText = 'position:fixed;z-index:1000;box-sizing:border-box;background:#111d3b;color:#fff;border:2px solid #ffd23f;text-align:center;font-family:sans-serif;';
    const align = (): void => {
      const box = this.host.app.surface.canvas.getBoundingClientRect(), scale = box.width / W;
      Object.assign(input.style, { left: `${box.left + this.x * scale}px`, top: `${box.top + this.y * scale}px`, width: `${this.w * scale}px`, height: `${this.h * scale}px`, fontSize: `${Math.max(16, 30 * scale)}px` });
    };
    input.addEventListener('compositionstart', () => { this.composing = true; });
    input.addEventListener('compositionend', () => { this.composing = false; this.accept(input.value); });
    input.addEventListener('input', () => { if (!this.composing) this.accept(input.value); });
    input.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Enter' && !event.isComposing && !this.composing) { this.accept(input.value); this.close(); }
      if (event.key === 'Escape') this.close();
    });
    input.addEventListener('blur', () => { this.accept(input.value); this.close(); });
    this.alignInput = align;
    document.body.append(input); align(); input.focus({preventScroll:true}); input.select();
  }
  act(action: Action): boolean { if (action === 'confirm') { this.edit(); return true; } return false; }
  point(phase: 'down' | 'move' | 'up'): void { if (phase === 'up') this.edit(); }
  tick(dt: number): void { super.tick(dt); if (this.input && (!this.layer || this.host.app.top !== this.host)) this.close(); else this.alignInput?.(); }
  remove(): void { this.close(); super.remove(); }
  protected paint(ctx: Ctx): void {
    panel(ctx, 0, 0, this.w, this.h, COLOR.ally);
    ctx.font = `700 30px ${FONT.body}`; ctx.fillStyle = COLOR.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(this.value || this.caption, this.w / 2, this.h / 2);
  }
}

export class HoldButton extends Button {
    constructor(text: string, private readonly held: (value: boolean) => void, options: {
        w?: number;
        h?: number;
    } = {}) { super(text, () => { }, options); }
    point(phase: 'down' | 'move' | 'up', _x: number, _y: number): void { if (phase === 'down')
        this.held(true); if (phase === 'up')
        this.held(false); }
}
