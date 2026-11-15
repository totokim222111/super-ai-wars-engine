/**
 * 맵 판: 지형, 격자, 범위 표시, 기체 아이콘, 커서.
 *
 * UI 부품(Widget)이라서 포커스와 입력을 다른 부품과 같은 방식으로 받는다.
 * 메뉴가 열리면 포커스가 메뉴로 가고, 닫히면 판으로 돌아온다.
 * 판은 무대의 world 레이어에 올라가므로 카메라를 따라 스크롤된다. 효과(fx)도 같은 좌표를 쓴다.
 */
import { all, ease, tween, wait, type Step } from '../flow';
import { burst, flash, shake, sparks, type Show } from '../fx';
import type { Action } from '../input';
import { Widget } from '../kit';
import { H, Shape, Sprite, W } from '../stage';
import { COLOR } from '../ui';
import {terrainCanvas,type MapTerrain} from './terrain';
import { sameCell, type Cell, type Team, type UnitView } from './model';

/** 한 칸의 크기(논리 픽셀). */
export const CELL = 80;
const TEAM: Record<Team, string> = { ally: COLOR.ally, enemy: COLOR.enemy, third: '#ffad4a', neutral:'#a8b4c8' };

export class Board extends Widget {
  cursor: Cell = { col: 0, row: 0 };
  /** 이동 범위(파랑), 공격 범위(빨강), 지나갈 길(금색). 화면이 채우고 비운다. */
  moveCells: Cell[] = [];
  attackCells: Cell[] = [];
  path: Cell[] = [];
  blockedCells:Cell[]=[];
  /** 커서가 옮겨졌을 때와, 칸을 골랐을 때. */
  onHover?: (cell: Cell) => void;
  onPick?: (cell: Cell) => void;
  onTap?: (cell:Cell,confirmed:boolean)=>void;
  private readonly sprites = new Map<string, { sprite: Sprite; view: UnitView }>();
  private downCell?: Cell;
  private downWasCurrent = false;
  private readonly painted?:HTMLCanvasElement|OffscreenCanvas;

  constructor(private readonly show: Show, readonly cols: number, readonly rows: number, private readonly terrain?: HTMLImageElement,tiles?:MapTerrain) {
    super();
    if(tiles)this.painted=terrainCanvas(tiles,CELL);
    this.w = W; this.h = H;
    // 기체 위에 그려야 하는 것(체력 막대, 행동 완료 표시, 커서)은 따로 한 겹 올린다.
    const tops = new Shape({}, ctx => this.paintTops(ctx));
    tops.z = 20;
    show.stage.world.add(tops);
  }
  /** 판은 화면 전체를 차지한다. 위에 올라온 메뉴가 먼저 입력을 받는다. */
  contains(): boolean { return true; }

  /** 칸의 한가운데(world 좌표). */
  center(cell: Cell): { x: number; y: number } { return { x: cell.col * CELL + CELL / 2, y: cell.row * CELL + CELL / 2 }; }
  /** 그 기체가 지금 서 있는 자리의 발밑 한가운데(world 좌표). 효과를 걸 때 쓴다. */
  feet(unitId: string): { x: number; y: number } { const s = this.sprites.get(unitId)!.sprite; return { x: s.x, y: s.y }; }
  /** 칸이 화면의 어디에 보이는가(화면 좌표). 메뉴를 그 옆에 띄울 때 쓴다. */
  onScreen(cell: Cell): { x: number; y: number } {
    const c = this.center(cell), camera = this.show.stage.camera;
    return { x: c.x - camera.x + W / 2, y: c.y - camera.y + H / 2 };
  }
  cellAt(x: number, y: number): Cell | undefined {
    const camera = this.show.stage.camera, col = Math.floor((x - W / 2 + camera.x) / CELL), row = Math.floor((y - H / 2 + camera.y) / CELL);
    return col >= 0 && row >= 0 && col < this.cols && row < this.rows ? { col, row } : undefined;
  }
  unitAt(cell: Cell): UnitView | undefined { return [...this.sprites.values()].find(u => sameCell(u.view.cell, cell))?.view; }

  /** 기체 목록을 규칙 쪽의 지금 상태에 맞춘다. 사라진 기체는 치우고 새 기체는 세운다. */
  sync(units: UnitView[]): void {
    for (const [id, entry] of this.sprites) if (!units.some(u => u.id === id)) { entry.sprite.remove(); this.sprites.delete(id); }
    for (const view of units) {
      let entry = this.sprites.get(view.id);
      if (!entry) {
        const sprite = new Sprite(view.icon, 92).trimToContent();
        sprite.anchorY = 1; this.show.stage.world.add(sprite);
        this.sprites.set(view.id, entry = { sprite, view:{...view,cell:{...view.cell}} });
      }
      if(entry.sprite.image!==view.icon){entry.sprite.image=view.icon;entry.sprite.crop=undefined;entry.sprite.trimToContent();}
      if(view.iconCrop){const [x,y,w,h]=view.iconCrop;entry.sprite.crop={x,y,w,h};}else if(entry.view.iconCrop){entry.sprite.crop=undefined;entry.sprite.trimToContent();}
      entry.sprite.height=view.iconFit?72:92;if(view.iconFit)entry.sprite.height*=Math.min(1,72/entry.sprite.width);
      Object.assign(entry.view,view);
      const c = this.center(view.cell);
      // 행동을 마친 기체는 어둡게 가라앉는다.
      Object.assign(entry.sprite, { x: c.x, y: c.y + 34, z: 5 + view.cell.row * 0.01, shade: view.acted ? 0.5 : 0, alpha: 1 });
    }
  }
  /** Status changes never reposition a sprite or introduce a future unit. */
  status(units:UnitView[]):void {for(const view of units){const entry=this.sprites.get(view.id);if(!entry)continue;const cell=entry.view.cell;Object.assign(entry.view,view,{cell});entry.sprite.shade=view.acted?.5:0;}}
  clearMarks(): void { this.moveCells = []; this.attackCells = []; this.path = []; }
  unit(id:string):UnitView|undefined{return this.sprites.get(id)?.view;}
  reveal(id:string):void{const e=this.sprites.get(id);if(e)e.view.revealed=true;}
  removeUnit(id:string):void{this.sprites.get(id)?.sprite.remove();this.sprites.delete(id);}
  offset(id:string,x:number,y:number):void{const e=this.sprites.get(id);if(e){const p=this.center(e.view.cell);Object.assign(e.sprite,{x:p.x+x,y:p.y+34+y});}}
  /** 체력 막대만 깎는다(전투가 끝난 직후). */
  harm(unitId: string, amount: number): void {
    const entry = this.sprites.get(unitId);
    if (entry) entry.view.hp = Math.max(0, entry.view.hp - amount);
  }
  /** 페이즈가 바뀌었다: 행동 완료 표시를 모두 걷는다. */
  wake(): void {
    for (const entry of this.sprites.values()) { entry.view.acted=false; entry.sprite.shade = 0; }
  }

  // ── 입력 ──
  act(action: Action): boolean {
    const step: Partial<Record<Action, [number, number]>> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const move = step[action];
    if (move) { this.moveCursor({ col: this.cursor.col + move[0], row: this.cursor.row + move[1] }); return true; }
    if (action === 'confirm') { this.onPick?.(this.cursor); return true; }
    return false;
  }
  point(phase: 'down' | 'move' | 'up', x: number, y: number): void {
    const cell = this.cellAt(x, y);
    if (!cell) return;
    if (phase === 'down') { this.downWasCurrent = sameCell(this.cursor, cell); this.downCell = cell; }
    if (phase !== 'up') this.moveCursor(cell);
    else { if (this.downCell && sameCell(this.downCell, cell)) {if(this.onTap)this.onTap(cell,this.downWasCurrent);else if(this.downWasCurrent)this.onPick?.(cell);} this.downCell = undefined; }
  }
  /** 커서를 옮긴다(맵 밖으로는 나가지 않는다). 카메라가 따라온다. */
  moveCursor(to: Cell, silent = false): void {
    const cell = { col: Math.max(0, Math.min(this.cols - 1, to.col)), row: Math.max(0, Math.min(this.rows - 1, to.row)) };
    if (sameCell(cell, this.cursor)) return;
    this.cursor = cell;
    if (!silent) this.ui.play('cursor', 0.6);
    this.show.runner.run(this.look(cell, 0.18));
    this.onHover?.(cell);
  }

  // ── 카메라 ──
  private aim(cell: Cell): { x: number; y: number } {
    const c = this.center(cell), mapW = this.cols * CELL, mapH = this.rows * CELL;
    // 커서가 화면 가장자리에 붙지 않게 여유를 두고 따라간다. 맵 끝에서는 멈춘다.
    const clamp = (v: number, half: number, size: number): number => (size <= half * 2 ? size / 2 : Math.max(half, Math.min(size - half, v)));
    const camera = this.show.stage.camera, slackX = W / 2 - CELL * 3, slackY = H / 2 - CELL * 2.5;
    return {
      x: clamp(Math.max(c.x - slackX, Math.min(c.x + slackX, camera.x)), W / 2, mapW),
      y: clamp(Math.max(c.y - slackY, Math.min(c.y + slackY, camera.y)), H / 2, mapH),
    };
  }
  /** 그 칸이 보이도록 카메라를 옮긴다. */
  *look(cell: Cell, seconds = 0.3): Step { yield* tween(this.show.stage.camera, this.aim(cell), seconds, ease.out); }
  /** 그 칸을 화면 한가운데로 바로 맞춘다(처음 들어올 때). */
  snap(cell: Cell): void {
    const camera = this.show.stage.camera, c = this.center(cell);
    Object.assign(camera, { x: c.x, y: c.y });
    Object.assign(camera, this.aim(cell));
  }

  // ── 기체의 움직임 ──
  /** 길을 따라 한 칸씩 미끄러져 간다. */
  *moveAlong(unitId: string, path: Cell[],speed:number|(()=>number)=1): Step {
    const entry = this.sprites.get(unitId);
    if (!entry || path.length < 2) return;
    const { sprite } = entry;
    for (const cell of path.slice(1)) {
      const c = this.center(cell);
      this.show.sound?.play('cursor', 0.35);
      const rate=typeof speed==='function'?speed():speed,seconds=.075/Math.max(1,Number.isFinite(rate)?rate:1);
      yield* all(tween(sprite, { x: c.x, y: c.y + 34 }, seconds, ease.linear),this.look(cell,seconds));
      entry.view.cell={...cell};
    }
    sprite.z = 5 + path[path.length - 1].row * 0.01;
  }
  /** 기체를 그 칸에 바로 놓는다(이동을 취소했을 때). */
  place(unitId: string, cell: Cell): void {
    const entry = this.sprites.get(unitId), c = this.center(cell);
    if (entry) {entry.view.cell={...cell};Object.assign(entry.sprite, { x: c.x, y: c.y + 34 });}
  }
  /** 격파된 기체가 맵에서 터져 사라진다. */
  *defeat(unitId: string,seconds=.6,look=true): Step {
    const entry = this.sprites.get(unitId);
    if (!entry) return;
    const { sprite } = entry, { show } = this, y = sprite.y - 40;
    if(look)yield* this.look(entry.view.cell);
    show.sound?.play('explode', 0.8);
    burst(show, sprite.x, y, 150, '#ff7b2f'); sparks(show, sprite.x, y, 14, 170, '#ffd23f'); flash(show, 0.5, 0.3);
    show.runner.run(shake(show, 14, 0.4));
    sprite.flash = 1;
    yield* tween(sprite, { alpha: 0 }, seconds*7/12, ease.in);
    sprite.remove(); this.sprites.delete(unitId);
    yield* wait(seconds*5/12);
  }
  /** 증원: 번쩍이며 내려앉는다. */
  *spawn(view: UnitView): Step {
    this.sync([...[...this.sprites.values()].map(e => e.view), view]);
    const { sprite } = this.sprites.get(view.id)!, { show } = this, y = sprite.y;
    yield* this.look(view.cell);
    Object.assign(sprite, { alpha: 0, y: y - 120 });
    show.sound?.play('servo',.65);
    yield* all(tween(sprite, { alpha: 1 }, 0.15), tween(sprite, { y }, 0.25, ease.in));
    burst(show, sprite.x, y - 30, 110, TEAM[view.team]);
    show.sound?.play('hit', 0.6);
    show.runner.run(shake(show, 8, 0.25));
    yield* wait(0.3);
  }

  // ── 그리기 ──
  protected paint(ctx: CanvasRenderingContext2D): void {
    const mapW = this.cols * CELL, mapH = this.rows * CELL, pulse = 0.5 + Math.sin(this.clock * 4) * 0.5;
    if(this.painted)ctx.drawImage(this.painted,0,0);
    else if (this.terrain?.naturalWidth) ctx.drawImage(this.terrain, 0, 0, mapW, mapH);
    else { ctx.fillStyle = '#243046'; ctx.fillRect(0, 0, mapW, mapH); }
    // 격자: 지형을 가리지 않을 만큼만.
    ctx.strokeStyle = 'rgba(255,255,255,.13)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let c = 0; c <= this.cols; c++) { ctx.moveTo(c * CELL, 0); ctx.lineTo(c * CELL, mapH); }
    for (let r = 0; r <= this.rows; r++) { ctx.moveTo(0, r * CELL); ctx.lineTo(mapW, r * CELL); }
    ctx.stroke();
    const mark = (cells: Cell[], fill: string, edge: string): void => {
      for (const cell of cells) {
        const x = cell.col * CELL, y = cell.row * CELL;
        ctx.fillStyle = fill; ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
        ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.strokeRect(x + 3, y + 3, CELL - 6, CELL - 6);
      }
    };
    mark(this.moveCells, `rgba(47,140,255,${0.26 + pulse * 0.12})`, 'rgba(159,208,255,.75)');
    mark(this.attackCells, `rgba(255,68,88,${0.26 + pulse * 0.12})`, 'rgba(255,170,178,.8)');
    if (this.path.length > 1) {
      // 지나갈 길: 굵은 금색 선과 화살촉.
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const [color, width] of [['rgba(0,0,0,.5)', 14], [COLOR.gold, 8]] as const) {
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
        this.path.forEach((cell, i) => { const c = this.center(cell); if (i) ctx.lineTo(c.x, c.y); else ctx.moveTo(c.x, c.y); });
        ctx.stroke();
      }
      const end = this.center(this.path[this.path.length - 1]), before = this.center(this.path[this.path.length - 2]), angle = Math.atan2(end.y - before.y, end.x - before.x);
      ctx.save(); ctx.translate(end.x, end.y); ctx.rotate(angle); ctx.fillStyle = COLOR.gold;
      ctx.beginPath(); ctx.moveTo(22, 0); ctx.lineTo(-6, -17); ctx.lineTo(-6, 17); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    // 발밑의 진영 고리. 색으로 편을 가린다.
    for (const { sprite, view } of this.sprites.values()) {
      ctx.globalAlpha = sprite.alpha;
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.ellipse(sprite.x, sprite.y - 6, 30, 11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = view.acted ? '#6b7690' : TEAM[view.team]; ctx.lineWidth = 3; ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private paintTops(ctx: CanvasRenderingContext2D): void {
    for(const cell of this.blockedCells){const x=cell.col*CELL,y=cell.row*CELL;ctx.fillStyle="rgba(245,75,70,.3)";ctx.fillRect(x+3,y+3,CELL-6,CELL-6);ctx.strokeStyle="#ff6f68";ctx.lineWidth=4;ctx.strokeRect(x+5,y+5,CELL-10,CELL-10);ctx.beginPath();ctx.moveTo(x+15,y+15);ctx.lineTo(x+CELL-15,y+CELL-15);ctx.moveTo(x+CELL-15,y+15);ctx.lineTo(x+15,y+CELL-15);ctx.stroke();}
    for (const { sprite, view } of this.sprites.values()) {
      if (sprite.alpha < 0.5) continue;
      if(view.barrier){ctx.strokeStyle="#80f5ff";ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(sprite.x,sprite.y-38,37,45,0,0,Math.PI*2);ctx.stroke();ctx.font="bold 15px sans-serif";ctx.fillStyle="#b2faff";ctx.textAlign="center";ctx.fillText(view.barrier>=100?"무적":"방벽 "+view.barrier,sprite.x,sprite.y-87);}
      // 체력 막대
      if(view.revealed===false)continue;
      const x = sprite.x - 28, y = sprite.y + 2, ratio = Math.max(0, view.hp / view.hpMax);
      ctx.fillStyle = '#05070c'; ctx.fillRect(x - 1, y - 1, 58, 8);
      ctx.fillStyle = ratio > 0.5 ? COLOR.hp : ratio > 0.25 ? COLOR.gold : COLOR.enemy; ctx.fillRect(x, y, 56 * ratio, 6);
      if (view.acted) {
        // 행동 완료 표시
        ctx.fillStyle = '#0a1024'; ctx.fillRect(sprite.x + 14, sprite.y - 84, 22, 22);
        ctx.fillStyle = '#b9c7e6'; ctx.font = '700 16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('E', sprite.x + 25, sprite.y - 72);
      }
    }
    // 커서: 네 귀의 꺾쇠가 숨 쉬듯 벌어졌다 오므라든다.
    const x = this.cursor.col * CELL, y = this.cursor.row * CELL, gap = 3 + Math.sin(this.clock * 6) * 3, arm = 22;
    ctx.fillStyle = this.focused ? COLOR.gold : 'rgba(255,210,63,.45)';
    for (const [cx, cy, dx, dy] of [[x - gap, y - gap, 1, 1], [x + CELL + gap, y - gap, -1, 1], [x - gap, y + CELL + gap, 1, -1], [x + CELL + gap, y + CELL + gap, -1, -1]] as const) {
      ctx.fillRect(Math.min(cx, cx + dx * arm), Math.min(cy, cy + dy * 5), arm, 5);
      ctx.fillRect(Math.min(cx, cx + dx * 5), Math.min(cy, cy + dy * arm), 5, arm);
    }
  }
}
