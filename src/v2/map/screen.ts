import { battleProgress } from '../battle/progress';
import { preloadImages } from '../pack/images';
import { waitForAudio,waitForImages } from '../pack/preload';
import { portraitImages } from '../portrait';
import { resolveUiSize,touchInput } from '../presentation';
import { Shape as HintShape } from '../stage';
import { term } from '../terms';
import { Tooltip,spiritTip } from '../tooltip';
import { FONT,battleLine,panel } from '../ui';
import { playBrief,type BriefControl } from './brief';
import { RosterScreen,UnitDetailsScreen } from './details';
import { hintLabel,hintOrder,type HintOptions,type MapHint } from './hints';
import { ObjectivesScreen,type Objectives } from './objectives';
import { FirstGuide } from './tutorial';
/**
 * 맵 화면: 기체를 고르고, 움직이고, 명령을 내리는 곳.
 *
 * 조작의 흐름(원작과 같다). 취소(Esc, 오른쪽 버튼)는 언제나 한 단계 앞으로 돌아간다.
 *   대기 → 기체 선택 → 목적지 → 무기 → 대상 → 예측 → 전투
 *     · 다른 명령: 정신기·장치·대기 등의 명령 메뉴로
 *     · 정신기: 목록에서 골라 발동, 다시 명령 메뉴로
 *     · 대기: 그 자리에서 행동을 마친다
 *   빈 칸 한 번은 커서, 길게 누르기/두 번 클릭 또는 메뉴/M은 맵 메뉴.
 *
 * 이 화면은 규칙을 모른다. 갈 수 있는 칸, 칠 수 있는 적, 행동의 결과는 모두 MapModel이 알려 준다.
 * 화면이 하는 일은 묻고, 보여 주고, 돌려받은 "일어난 일"을 순서대로 트는 것뿐이다.
 */
import { BattleScreen } from '../battle/screen';
import { ConfirmScreen } from '../dialogs';
import { until,wait,type Step } from '../flow';
import { flash } from '../fx';
import { Button,HoldButton,MenuList,hintBar,toast,windowFrame,type MenuItem,type Widget } from '../kit';
import { Screen } from '../screen';
import { castSpirit } from '../spirit';
import { H,Shape,W,type Node } from '../stage';
import { COLOR } from '../ui';
import { Board } from './board';
import { sameCell,type Cell,type MapAim,type MapEvent,type MapModel,type ResponsePrompt,type Team,type UnitView } from './model';
import { bigBanner,forecastPanel,phaseChip,terrainChip,unitCard,type ForecastInfo } from './panels';
type Mode = {
    kind: 'inspectMenu';
    unit: UnitView;
} | {
    kind: 'response';
    prompt: ResponsePrompt;
} | {
    kind: 'responseForecast';
    prompt: ResponsePrompt;
    choiceId: string;
} | {
    kind: 'idle';
} | {
    kind: 'busy';
} | {
    kind: 'menu';
} | {
    kind: 'move';
    unit: UnitView;
    reach: Cell[];
} | {
    kind: 'command';
    unit: UnitView;
    at: Cell;
} | {
    kind: 'ability';
    unit: UnitView;
    at: Cell;
    ability: 'transform' | 'combine';
} | {
    kind: 'persuadeTarget';
    unit: UnitView;
    at: Cell;
    targets: string[];
} | {
    kind: 'mapWeapons';
    unit: UnitView;
    at: Cell;
} | {
    kind: 'mapAim';
    unit: UnitView;
    at: Cell;
    weaponId: string;
    aims: MapAim[];
} | {
    kind: 'mapConfirm';
    unit: UnitView;
    at: Cell;
    weaponId: string;
    aimId: string;
} | {
    kind: 'spiritTarget';
    unit: UnitView;
    at: Cell;
    spiritId: string;
    targets: string[];
} | {
    kind: 'spirit';
    unit: UnitView;
    at: Cell;
} | {
    kind: 'target';
    unit: UnitView;
    at: Cell;
    targets: string[];
    weaponId?: string;
} | {
    kind: 'weapon';
    unit: UnitView;
    at: Cell;
    targetId: string;
} | {
    kind: 'forecast';
    unit: UnitView;
    at: Cell;
    targetId: string;
    weaponId?: string;
    fromTarget?: boolean;
};
const HINTS: Record<Mode['kind'], string> = {
    inspectMenu: '능력 보기 · 빈 곳을 누르면 닫기',
    ability: '변형 또는 합체 형태를 고릅니다 · 뒤로는 명령',
    persuadeTarget: '설득할 기체를 고릅니다 · 뒤로는 명령',
    mapWeapons: '맵 병기를 고릅니다 · 뒤로는 명령', mapAim: '중심점 또는 방향을 고릅니다 · 뒤로는 무기 목록', mapConfirm: '범위와 대상을 확인합니다 · 뒤로는 조준',
    response: '반격·방어·회피를 고릅니다', responseForecast: '대응을 눌러 고르고, 대응 확정 버튼으로 결정합니다',
    idle: '빈 칸 두 번 · 메뉴/M으로 맵 메뉴 · 방향키와 Enter로 선택',
    busy: '', menu: '↑↓ 선택 · Enter 결정 · Esc 닫기',
    move: '파란 칸 중 갈 곳을 고릅니다 · Esc 선택 취소',
    command: '↑↓ 명령 선택 · Enter 결정 · 빈 곳 또는 Esc는 뒤로',
    spiritTarget: '효과를 받을 기체를 고릅니다 · 뒤로는 정신기 목록',
    spirit: '↑↓ 정신기 선택 · Enter 발동 · Esc 뒤로',
    target: '빨간 범위 안의 적을 고릅니다 · Esc 뒤로',
    weapon: '↑↓ 무기 선택 · Enter 결정 · Esc 뒤로',
    forecast: 'Enter 전투 개시 · Esc 뒤로',
};
export interface MapOptions {
    tutorial?: () => boolean;
    onTutorialDone?: () => void;
    speed?: () => number;
    hints?: () => MapHint[];
    hintOptions?: HintOptions;
    animation?: () => 'on' | 'off' | 'allies';
    setAnimation?: (value: 'on' | 'off') => void;
    objectives?: Objectives;
    opening?: boolean;
    story?: (scene: string, screen: MapScreen, board: Board) => Step;
    storyInput?: (event: import('../input').InputEvent) => boolean;
    battle?: (exchange: import('../battle/types').Exchange) => {
        animation: 'on' | 'off' | 'allies';
        speed: number;
        shake: number;
        enemyBattle?: 'full' | 'brief';
        setSpeed?: (speed: number) => void;
        music?: string;
        opening?: {
            slot: string;
            seconds?: number;
        };
    };
    eventMusic?: (event: MapEvent) => string | undefined;
    phaseMusic?: (team: Team) => string | undefined;
    menu?: {
        label: string;
        run: () => void;
    }[];
    /** 스테이지가 끝났을 때(이겼는지). */
    onEnd?: (won: boolean) => void;
    /** 대기 상태에서 취소를 눌렀을 때. 없으면 아무 일도 없다. */
    onExit?: () => void;
}
export class MapScreen extends Screen {
    private board!: Board;
    private tutorial?: FirstGuide;
    private tutorialHide?: Button;
    private tutorialMark?: Shape;
    private tutorialStarted = false;
    private emptyHold?: {
        time: number;
        cell: Cell;
    };
    private brief?: BriefControl;
    private guidance?: {
        next: boolean;
        skip: boolean;
        down?: number;
        current?: MapHint;
    };
    private markers?: HintShape<object>;
    private objectiveButton?: Button;
    private mapButton!: Button;
    private fastButton?: HoldButton;
    private clock = 0;
    private lastEmpty?: {
        cell: Cell;
        time: number;
    };
    private outsidePopup?: {
        x: number;
        y: number;
    };
    private card!: Shape<{
        unit?: UnitView;
    }>;
    private land!: ReturnType<typeof terrainChip>;
    private phase!: ReturnType<typeof phaseChip>;
    private hint!: Shape<{
        text: string;
    }>;
    private mode: Mode = { kind: 'idle' };
    /** 메뉴와 예측 창처럼 잠깐 떠 있는 것들. 단계가 바뀔 때 한꺼번에 치운다. */
    private floating: (Widget | Node)[] = [];
    private returned = true;
    private responseDone?: (id: string) => void;
    private pendingPresent: MapEvent[][] = [];
    private speechControl?: {
        fast: boolean;
    };
    get guiding(): boolean { return !!this.guidance; }
    prepare(): Promise<void> | void { return preloadImages(this.model.images?.() ?? [this.model.terrain, ...this.model.units().flatMap(u => [u.icon, ...portraitImages(u.portrait)])]); }
    constructor(private readonly model: MapModel, private readonly options: MapOptions = {}) { super(); }
    update(dt: number): void { this.clock += dt; super.update(dt); if (this.floating.length)
        for (const n of this.stage.ui.nodes)
            if ((n as Shape<any>).state?.phaseBanner)
                n.alpha = Math.max(0, n.alpha - dt / .15); if (this.objectiveButton)
        this.objectiveButton.visible = !!this.options.objectives && !this.floating.length && (!this.tutorial || this.tutorial.finished || this.mode.kind === 'busy'); if (this.fastButton) {
        this.fastButton.visible = this.phase?.state.team !== 'ally' && this.mode.kind === 'busy';
        if (this.fastButton.visible)
            this.land.visible = false;
    } if (this.emptyHold && this.clock - this.emptyHold.time > .5) {
        const cell = this.emptyHold.cell;
        this.emptyHold = undefined;
        this.lastEmpty = undefined;
        this.mapMenu(cell);
    } if (this.tutorialHide) {
        const visible = this.guideVisible();if(this.phase)this.phase.visible=!visible;if(this.objectiveButton&&visible)this.objectiveButton.visible=false;
        this.tutorialHide.visible = visible;this.hint.visible=!visible;

        if (this.tutorialMark)
            this.tutorialMark.visible = visible;
    } if (this.guidance?.down !== undefined && this.clock - this.guidance.down >= .55)
        this.guidance.skip = true; }
    input(event: import('../input').InputEvent): void {
        if (event.kind === 'action' && event.wheel && !this.floating.some(w => w instanceof MenuList)) {
            if (this.mode.kind !== 'busy')
                this.board.pan(event.shift ? (event.action === 'down' ? 80 : -80) : 0, event.shift ? 0 : event.action === 'down' ? 80 : -80);
            return;
        }
        if (event.kind === 'pointer' && touchInput() && this.mode.kind === 'idle') {
            const cell = this.board.cellAt(event.x, event.y);
            if (event.phase === 'down' && cell && !this.board.unitAt(cell))
                this.emptyHold = { time: this.clock, cell };
            if (event.phase === 'move' && this.emptyHold && cell && !sameCell(this.emptyHold.cell, cell))
                this.emptyHold = undefined;
            if (event.phase === 'up')
                this.emptyHold = undefined;
        }
        if (this.speechControl) {
            if (event.kind === 'action' || event.phase === 'down')
                this.speechControl.fast = true;
            return;
        }
        if (this.guidance) {
            const g = this.guidance;
            if (event.kind === 'pointer') {
                if (event.phase === 'down')
                    g.down = this.clock;
                if (event.phase === 'up') {
                    if (g.down !== undefined && this.clock - g.down >= .55)
                        g.skip = true;
                    else
                        g.next = true;
                    g.down = undefined;
                }
            }
            else if (event.action === 'cancel')
                g.skip = true;
            else if (event.action === 'confirm')
                g.next = true;
            this.ui.input(event);
            return;
        }
        if (this.options.storyInput?.(event))
            return;
        if (this.brief) {
            if (event.kind === 'action' || event.phase === 'down')
                this.brief.fast = true;
            return;
        }
        if (event.kind === 'action' && event.action === 'menu') {
            if (this.mode.kind === 'idle')
                this.mapMenu(this.board.cursor);
            return;
        }
        if (event.kind === 'pointer') {
            const list = this.floating.find((w): w is MenuList => w instanceof MenuList);
            const back = this.ui.navigationContains(event.x, event.y) || this.floating.some(w => w instanceof Button && w.visible && w.contains(event.x, event.y));
            const menuButton = this.mapButton?.visible && this.mapButton.contains(event.x, event.y);
            if (list && ['command', 'weapon', 'spirit', 'menu', 'inspectMenu', 'ability', 'mapWeapons', 'mapAim'].includes(this.mode.kind) && !back && !menuButton && !list.contains(event.x, event.y)) {
                if (event.phase === 'down')
                    this.outsidePopup = { x: event.x, y: event.y };
                if (event.phase === 'up') {
                    const down = this.outsidePopup;
                    this.outsidePopup = undefined;
                    if (!down) {
                        super.input(event);
                        return;
                    }
                    if (down && Math.hypot(event.x - down.x, event.y - down.y) < 14) {
                        this.lastEmpty = undefined;
                        this.back();
                        const cell = this.board.cellAt(event.x, event.y);
                        if (cell) {
                            this.board.moveCursor(cell);
                            if (this.mode.kind === 'idle' && !this.board.unitAt(cell))
                                this.lastEmpty = { cell: { ...cell }, time: this.clock };
                        }
                    }
                }
                return;
            }
        }
        if (event.kind === 'pointer' && event.phase === 'up')
            this.outsidePopup = undefined;
        super.input(event);
    }
    private guideVisible(): boolean { const g = this.tutorial, k = this.mode.kind; return this.app.top === this && !!g && !g.finished && this.model.turn().team === 'ally' && !this.guidance && ((k === 'idle' && (g.step === 0 || g.step === 4)) || (k === 'move' && g.step === 1) || (['weapon', 'target'].includes(k) && g.step === 2) || (k === 'forecast' && g.step === 3)); }
    private startTutorial(force = false): void {
        if (this.tutorialStarted || !force && !this.options.tutorial?.() || this.model.turn().team !== 'ally')
            return;
        this.tutorialStarted = true;
        this.tutorial = new FirstGuide();
        const guide = this.tutorial;
        this.tutorialMark=this.stage.ui.add(new Shape({},ctx=>{
          if(!this.guideVisible())return;
          const r=this.tutorialTarget(),y=guide.step===3?656:8;
          this.tutorialBounds={x:24,y,w:900,h:56};
          panel(ctx,24,y,900,56,COLOR.gold);ctx.font=`900 20px ${FONT.body}`;ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillStyle=COLOR.ink;ctx.fillText(guide.text(touchInput()),40,y+28,730);
          this.tutorialHide!.y=y;
          if(r){ctx.save();ctx.strokeStyle=COLOR.gold;ctx.lineWidth=2;ctx.globalAlpha=.45+.55*(.5+.5*Math.sin(this.clock*Math.PI*2/.8));ctx.strokeRect(r.x-2,r.y-2,r.w+4,r.h+4);ctx.globalAlpha=1;ctx.fillStyle=COLOR.gold;ctx.beginPath();const x=r.x+r.w/2,top=r.y,bob=6*Math.sin(this.clock*3);if(top<80){const yy=r.y+r.h/2;ctx.moveTo(r.x-34-bob,yy-14);ctx.lineTo(r.x-34-bob,yy+14);ctx.lineTo(r.x-6-bob,yy);}else{ctx.moveTo(x-14,top-34-bob);ctx.lineTo(x+14,top-34-bob);ctx.lineTo(x,top-6-bob);}ctx.closePath();ctx.fill();ctx.restore();}
        }));this.tutorialMark.z=94;
        this.tutorialHide=this.ui.add(Object.assign(new Button('안내 끄기',()=>{guide.finished=true;this.options.onTutorialDone?.();},{w:124,h:56}),{x:788,y:8,z:96,canFocus:false}));
    }
    tutorialBounds?:{x:number;y:number;w:number;h:number};
    private tutorialTarget():{x:number;y:number;w:number;h:number}|undefined{
      const g=this.tutorial;if(!g)return;
      const point=(cell:Cell)=>{const p=this.board.onScreen(cell);return{x:p.x-24,y:p.y-24,w:48,h:48};};
      if(g.step===4)return{x:this.mapButton.x,y:this.mapButton.y,w:this.mapButton.w,h:this.mapButton.h};
      if(g.step===3){const b=this.floating.find(w=>w instanceof Button&&w.label==='전투 개시')as Button|undefined;return b?{x:b.x,y:b.y,w:b.w,h:b.h}:undefined;}
      const u='unit'in this.mode?this.mode.unit:this.model.units().find(u=>u.team==='ally');
      if(g.step===2){const list=this.floating.find(w=>w instanceof MenuList)as MenuList|undefined;if(list){const p=list.selectionPoint();return{x:list.x+8,y:p.y-31,w:list.w-16,h:56};}if(this.mode.kind==='target'){const m=this.mode,t=this.model.units().find(u=>this.model.targets(m.unit.id,m.at).includes(u.id));if(t)return point(t.cell);}}
      if(g.step===1&&this.mode.kind==='move'){const c=this.mode.reach.find(c=>{const p=this.board.onScreen(c);return !this.board.unitAt(c)&&p.x>24&&p.x<W-24&&p.y>150&&p.y<H-90;});if(c)return point(c);}
      return u?point(u.cell):undefined;
    }

    replayTutorial(): void { this.tutorialMark?.remove(); if (this.tutorialHide)
        this.ui.remove(this.tutorialHide); this.tutorialStarted = false; this.startTutorial(true); }
    private pointerPick(cell: Cell, confirmed: boolean): void {
        const unit = this.board.unitAt(cell);
        if (this.mode.kind === 'idle') {
            if (unit) {
                this.lastEmpty = undefined;
                this.pick(cell);
                return;
            }
            const last = this.lastEmpty;
            if (last && sameCell(last.cell, cell) && this.clock - last.time <= .45) {
                this.lastEmpty = undefined;
                this.mapMenu(cell);
            }
            else
                this.lastEmpty = { cell: { ...cell }, time: this.clock };
            return;
        }
        if (this.mode.kind === 'move' && !unit && !this.mode.reach.some(c => sameCell(c, cell))) {
            this.back();
            return;
        }
        if (confirmed || touchInput() || this.mode.kind === 'move' || this.mode.kind === 'target')
            this.pick(cell);
    }
    /** 화면 위 연극. 메뉴 입력은 연극이 끝날 때까지 멈춘다. */
    present(events: MapEvent[]): void { if (!this.board) {
        this.pendingPresent.push(events);
        return;
    } this.run(this.presentSteps(events)); }
    private *presentSteps(events: MapEvent[]): Step { yield* this.play(events); this.settle(); }
    enter(): void {
        const { model, stage, ui } = this, turn = model.turn();
        if (this.options.phaseMusic)
            this.music = this.options.phaseMusic(turn.team);
        const board = this.board = ui.add(new Board(this.show, model.cols, model.rows, model.terrain, model.terrainPaint?.()), stage.world);
        board.onHover = cell => this.hover(cell);
        board.onPick = cell => this.pick(cell);
        board.onTap = (cell, confirmed) => this.pointerPick(cell, confirmed);
        this.markers = stage.ui.add(new HintShape({}, ctx => { if (this.mode.kind === 'busy' && !this.guidance)
            return; for (const h of this.options.hints?.() ?? [])
            if (h.marker !== false && h.kind !== 'victory' && this.options.hintOptions?.persistent !== false) {
                const p = board.onScreen(h.cell);
                if (p.x < 0 || p.x > W || p.y < 150 || p.y > H - 70)
                    continue;
                ctx.globalAlpha = .65 + .25 * Math.sin(this.clock * 3);
                ctx.fillStyle = h.kind === 'danger' ? COLOR.enemy : COLOR.gold;
                ctx.beginPath();
                ctx.arc(p.x, p.y - 26, 14, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
                ctx.font = `900 22px ${FONT.body}`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#08122a';
                ctx.fillText('!', p.x, p.y - 25);
            } }));
        this.markers.z = 35;
        board.sync(model.units());
        board.blockedCells = model.blockedCells?.() ?? [];
        this.card = stage.ui.add(unitCard());
        this.land = stage.ui.add(terrainChip());
        this.phase = stage.ui.add(phaseChip(turn.team, turn.number));
        this.hint = stage.ui.add(hintBar(HINTS.idle));
        this.mapButton = ui.add(Object.assign(new Button('메뉴', () => { if (this.mode.kind === 'idle')
            this.mapMenu(board.cursor);
        else if (this.mode.kind === 'menu')
            this.back(); }, { w: 128, h: 64, kind: 'main' }), { x: W - 232, y: 8, z: 90, canFocus: false }));
        this.fastButton = ui.add(Object.assign(new HoldButton('빨리 ▶▶', held => { this.app.fastHeld = held; }, { w: 180, h: 82 }), { x: W - 204, y: H - 140, z: 90, canFocus: false, visible: false }));
        this.navigation();
        const first = model.units().find(u => u.team === 'ally') ?? model.units()[0];
        if (first) {
            board.cursor = first.cell;
            board.snap(first.cell);
        }
        this.hover(board.cursor);
        if (this.options.opening)
            this.set({ kind: 'busy' });
        else
            this.run(bigBanner(this.show, turn.team === 'ally' ? '아군 페이즈' : turn.team === 'enemy' ? '적 페이즈' : '제3세력 페이즈', turn.team === 'ally' ? COLOR.ally : COLOR.enemy));
        this.startTutorial();
        for (const events of this.pendingPresent)
            this.present(events);
        this.pendingPresent = [];
    }
    private menuSize = resolveUiSize();
    resume(): void { this.returned = true; const size = resolveUiSize(); if (this.menuSize !== size) {
        this.menuSize = size;
        if (this.mode.kind === 'menu')
            this.mapMenu(this.board.cursor);
    } if (this.tutorial?.finished && this.options.tutorial?.()) {
        this.tutorialMark?.remove();
        if (this.tutorialHide)
            this.ui.remove(this.tutorialHide);
        this.tutorialStarted = false;
        this.startTutorial();
    } }
    // ── 단계 바꾸기 ──
    private set(mode: Mode): void { this.mode = mode; if (mode.kind === 'move')
        this.tutorial?.event('select'); if (mode.kind === 'forecast')
        this.tutorial?.event('forecast'); this.hint.state.text = HINTS[mode.kind]; this.mapButton.enabled = true; this.mapButton.visible = mode.kind === 'idle'||mode.kind==='menu'; this.navigation(); }
    /** Screen states declare their local return control; busy/mandatory response have no Esc. */
    private navigation():void {
    const kind=this.mode.kind;
    if(['busy','response','responseForecast'].includes(kind)){this.ui.setNavigation({kind:'none'});return;}
    const onBack=()=>this.back();
    if(kind==='idle'){this.ui.setNavigation(this.options.onExit||this.board?.attackCells.length?{kind:'escape',onBack}:{kind:'none'});return;}
    if(kind==='forecast'){this.ui.setNavigation({kind:'close',bounds:{x:40,y:80,w:1200,h:510},cancelInContent:true,onBack});return;}
    if(this.land)this.land.visible=false;
    this.ui.setNavigation({kind:'back',onBack});
  }
    /** 떠 있던 메뉴·창을 치우고 포커스를 판으로 돌린다. */
    private clear(): void {
        for (const item of this.floating) {
            if ('ui' in item)
                this.ui.remove(item);
            else
                item.remove();
        }
        this.floating = [];
        this.card.visible = this.land.visible = true;
        this.ui.focusOn(this.board, true);
    }
    /** 칸 옆에 메뉴를 띄운다. 화면 밖으로 나가지 않게 자리를 잡는다. */
    private menu(items: MenuItem[], near: Cell, choose: (index: number) => void, width = 250,onMove?:(index:number)=>void,previewFirst=false,title?:string): MenuList {
    const wrapped=items.some(i=>i.wrapLabel),detailed=items.some(i=>i.description);
    const close=this.mode.kind==='spirit'||this.mode.kind==='inspectMenu'||this.mode.kind==='menu';
    const header=close?104:0,footer=close?0:104;
    const list=new MenuList(items,choose,{w:width,rows:Math.min(items.length,detailed?4:wrapped?5:7),rowHeight:detailed?100:wrapped?68:50,onMove,previewFirst}),spot=this.board.onScreen(near);
    const height=list.h+header+footer;
    list.x=Math.max(20,Math.min(W-width-20,spot.x+60+width>W-20?spot.x-60-width:spot.x+60));
    const y=Math.max(96,Math.min(H-48-height,spot.y>H/2?spot.y-60-height:spot.y-50));
    list.y=y+header;
    const heading=title??({menu:'맵 메뉴',spirit:'정신기',inspectMenu:'유닛 메뉴'} as Record<string,string>)[this.mode.kind]??'';
    const frame=this.stage.ui.add(Object.assign(windowFrame(heading,width,height,{inside:close}),{x:list.x,y,z:61}));this.floating.push(frame);
    this.ui.setNavigation({kind:close?'close':'back',bounds:{x:list.x,y,w:width,h:height},onBack:()=>this.back()});
    this.card.visible=this.land.visible=false;
    list.index=Math.max(0,items.findIndex(i=>!i.disabled));
    list.z = 62;
    this.floating.push(this.ui.add(list));
    this.ui.focusOn(list, true);return list;
  }
    private deny(): void { this.app.sound.play('deny'); }
    // ── 커서가 옮겨졌을 때 ──
    private hover(cell: Cell): void {
        this.card.state.unit = this.board.unitAt(cell);
        this.land.state.terrain = this.model.terrainAt(cell);
        if (this.mode.kind === 'mapAim') {
            const m = this.mode, aim = m.aims.find(a => a.cell && sameCell(a.cell, cell));
            if (aim)
                this.board.attackCells = this.model.mapPreview!(m.unit.id, m.at, m.weaponId, aim.id).cells;
        }
        if (this.mode.kind === 'move') {
            const { unit, reach } = this.mode;
            this.board.path = reach.some(c => sameCell(c, cell)) && !sameCell(cell, unit.cell) ? this.model.route(unit.id, cell) : [];
        }
    }
    // ── 칸을 골랐을 때 ──
    private pick(cell: Cell): void {
        const { model, board, mode } = this, unit = board.unitAt(cell);
        if (mode.kind === 'idle') {
            if (unit && unit.team === 'ally' && model.turn().team === 'ally' && (!unit.acted || model.commands(unit.id, unit.cell).some(c => !c.disabled))) {
                this.app.sound.play('confirm');
                if (unit.acted) {
                    this.commands(unit, unit.cell);
                    return;
                }
                const reach = model.reach(unit.id);
                board.clearMarks();
                board.moveCells = reach;
                this.set({ kind: 'move', unit, reach });
            }
            else if (unit) {
                // 지금 움직일 수 없는 기체: 어디까지 올 수 있는지만 빨갛게 보여 준다.
                this.app.sound.play('confirm', 0.5);
                this.clear();
                board.clearMarks();
                board.attackCells = model.reach(unit.id);
                this.set({ kind: 'inspectMenu', unit });
                this.menu([{ label: '능력 보기' }], unit.cell, () => this.inspect(unit.id));
            }
            else
                this.mapMenu(cell);
        }
        else if (mode.kind === 'move') {
            const blocked = unit && unit.id !== mode.unit.id;
            if (blocked || !mode.reach.some(c => sameCell(c, cell))) {
                if (!unit)
                    this.back();
                else
                    this.deny();
                return;
            }
            this.goTo(mode.unit, cell);
        }
        else if (mode.kind === 'persuadeTarget') {
            if (unit && mode.targets.includes(unit.id))
                this.app.push(new ConfirmScreen(`${unit.pilot}에게 설득을 시도할까요?`, () => this.commit(model.persuade!(mode.unit.id, mode.at, unit.id))), 'none');
            else
                this.deny();
        }
        else if (mode.kind === 'mapAim') {
            const aim = mode.aims.find(a => a.cell && sameCell(a.cell, cell));
            if (aim)
                this.mapConfirm(mode.unit, mode.at, mode.weaponId, aim.id);
            else
                this.deny();
        }
        else if (mode.kind === 'spiritTarget') {
            if (unit && mode.targets.includes(unit.id))
                this.cast(mode.unit, mode.at, mode.spiritId, unit.id);
            else
                this.deny();
        }
        else if (mode.kind === 'target') {
            if (unit && mode.targets.includes(unit.id)) {
                this.app.sound.play('confirm');
                if (mode.weaponId)
                    this.forecast(mode.unit, mode.at, unit.id, mode.weaponId, true);
                else
                    this.weapons(mode.unit, mode.at, unit.id);
            }
            else
                this.deny();
        }
    }
    /** 목적지로 가 본다. 아직 확정이 아니다(명령을 고르기 전까지는 취소할 수 있다). */
    private goTo(unit: UnitView, at: Cell): void {
        // Keep the cancel origin separate from the board's moving presentation view.
        unit = { ...unit, cell: { ...unit.cell } };
        const { board, model } = this, path = sameCell(at, unit.cell) ? [] : model.route(unit.id, at), screen = this;
        this.app.sound.play('confirm');
        board.clearMarks();
        this.set({ kind: 'busy' });
        this.run((function* (): Step { yield* board.moveAlong(unit.id, path, () => screen.movementRate()); screen.tutorial?.event('move'); if (model.targets(unit.id, at).length)
            screen.weapons(unit, at);
        else
            screen.commands(unit, at); })());
    }
    private commands(unit: UnitView, at: Cell): void {
    const list = this.model.commands(unit.id, at);
    this.clear(); this.board.clearMarks();
    this.set({ kind: 'command', unit, at });
    this.menu(list, at, index => {
      const id = list[index].id;
      if(id==='inspect')this.inspect(unit.id);
      else if (id === 'attack') this.target(unit, at);
      else if(id==='transform'||id==='combine')this.ability(unit,at,id);
      else if(id==='split')this.app.push(new ConfirmScreen('합체를 풀고 분리할까요?',()=>this.commit(this.model.split!(unit.id,at))),'none');
      else if(id==='persuade')this.persuadeTarget(unit,at);
      else if(id==='mapAttack')this.mapWeapons(unit,at);
      else if (id === 'spirit') this.spirits(unit, at);
      else if(id.startsWith('weaponSkill:'))this.app.push(new ConfirmScreen('특수 무장을 사용할까요?',()=>this.commit(this.model.weaponSkill!(unit.id,at,id.slice(12)))),'none');
      else if(id.startsWith('device:'))this.deviceTarget(unit,at,id.slice(7));
      else if(id.startsWith('item:'))this.app.push(new ConfirmScreen('회복 파츠를 사용할까요?',()=>this.commit(this.model.item!(unit.id,at,Number(id.slice(5))))),'none');
      else if (id === 'wait') this.commit(this.model.wait(unit.id, at));
    });
  }
    private spirits(unit: UnitView, at: Cell,pilotId?:string): void {
    const all=this.model.spirits(unit.id),crew=[...new Map(all.map(s=>[s.pilotId,s])).values()];
    if(!pilotId&&crew.length>1){this.clear();this.set({kind:'spirit',unit,at});this.menu(crew.map(s=>({label:s.pilot??unit.pilot,value:`${term('sp')} ${s.sp}/${s.spMax}`})),at,i=>this.spirits(unit,at,crew[i].pilotId),440,undefined,false,'정신기 · 파일럿');return;}
    const list=pilotId?all.filter(s=>s.pilotId===pilotId):all;
    this.clear();
    this.set({ kind: 'spirit', unit, at });
    const tip=this.stage.ui.add(new Tooltip());
    const show=(i:number)=>{tip.show(spiritTip(list[i]),menu);};
    const menu=this.menu(list.map(s => ({ label: s.name, value: String(s.cost), disabled: !s.usable })), at, index => {
      const spirit=list[index];if(spirit.targeted)this.spiritTarget(unit,at,spirit.id);else this.cast(unit,at,spirit.id);
    },300,show,true,`정신기 · ${list[0]?.pilot??unit.pilot}`);this.floating.push(tip);show(menu.index);
  }
    private ability(unit:UnitView,at:Cell,ability:'transform'|'combine'):void{const list=ability==='transform'?this.model.transformations?.(unit.id,at)??[]:this.model.combinations?.(unit.id,at)??[];this.clear();this.set({kind:'ability',unit,at,ability});this.menu(list.map(a=>({label:a.label})),at,i=>this.app.push(new ConfirmScreen(`${list[i].label}${ability==='transform'?' 형태로 변형':'로 합체'}할까요?`,()=>this.commit(ability==='transform'?this.model.transform!(unit.id,at,list[i].id):this.model.combine!(unit.id,at,list[i].id))),'none'),470);}
    private persuadeTarget(unit: UnitView, at: Cell): void { const targets = this.model.persuadeTargets?.(unit.id, at) ?? []; this.clear(); this.board.clearMarks(); this.board.attackCells = this.model.units().filter(u => targets.includes(u.id)).map(u => u.cell); this.set({ kind: 'persuadeTarget', unit, at, targets }); const first = this.model.units().find(u => u.id === targets[0]); if (first)
        this.board.moveCursor(first.cell, true); }
    private mapWeapons(unit:UnitView,at:Cell):void{const list=this.model.mapWeapons?.(unit.id,at)??[];this.clear();this.board.clearMarks();this.set({kind:'mapWeapons',unit,at});this.menu(list.map(w=>({label:w.name,labelSize:22,singleDescription:true,badge:w.reason,description:`위력 ${w.power} · 사거리 ${w.range} · ${w.resources??`${term('en')} ${w.cost}`}`,disabled:!w.usable})),at,i=>this.mapAim(unit,at,list[i].id),510);}
    private mapAim(unit:UnitView,at:Cell,weaponId:string):void{const aims=this.model.mapAims?.(unit.id,at,weaponId)??[];this.clear();this.board.clearMarks();this.set({kind:'mapAim',unit,at,weaponId,aims});const mark=(i:number)=>{this.board.attackCells=this.model.mapPreview!(unit.id,at,weaponId,aims[i].id).cells;};if(!aims.length)return;if(aims[0].cell){this.board.moveCells=aims.flatMap(a=>a.cell?[a.cell]:[]);this.board.moveCursor(aims[0].cell,true);mark(0);}else {this.menu(aims.map(a=>({label:a.label})),at,i=>this.mapConfirm(unit,at,weaponId,aims[i].id),300,mark);mark(0);}}
    private mapConfirm(unit:UnitView,at:Cell,weaponId:string,aimId:string):void{const p=this.model.mapPreview!(unit.id,at,weaponId,aimId);this.clear();this.set({kind:'mapConfirm',unit,at,weaponId,aimId});this.board.attackCells=p.cells;this.card.visible=this.land.visible=false;this.floating.push(this.stage.ui.add(Object.assign(windowFrame('맵 병기 확인',800,400),{x:240,y:145,z:60})));const lines=p.targets.map(t=>({label:this.model.units().find(u=>u.id===t.unitId)?.name??'대상',value:`${t.friendly?'아군 피해 · ':''}${t.hit}% · ${t.damage}`}));const list=this.ui.add(Object.assign(new MenuList(lines,()=>undefined,{w:730,rows:3,rowHeight:55}),{x:275,y:205,z:62}));const go=this.ui.add(Object.assign(new Button('공격 확정',()=>{const attack=()=>this.commit(this.model.mapAttack!(unit.id,at,weaponId,aimId));if(p.friendlyFire)this.app.push(new ConfirmScreen('범위 안 아군도 피해를 받습니다. 공격할까요?',attack),'none');else attack();},{kind:'main',w:360}),{x:460,y:560,z:62}));this.floating.push(list,go);this.ui.focusOn(go,true);}
    private deviceTarget(unit:UnitView,at:Cell,deviceId:string):void{const targets=this.model.deviceTargets?.(unit.id,at,deviceId)??[],units=this.model.units().filter(u=>targets.includes(u.id));this.clear();this.set({kind:'spirit',unit,at});this.menu(units.map(u=>({label:u.name,value:`HP ${u.hp}/${u.hpMax} · ${term('en')} ${u.en}/${u.enMax}`})),at,i=>this.app.push(new ConfirmScreen(`${units[i].name} 지원을 실행할까요?`,()=>this.commit(this.model.device!(unit.id,at,deviceId,units[i].id))),'none'),570);}
    private spiritTarget(unit:UnitView,at:Cell,spiritId:string):void{const targets=this.model.spiritTargets?.(unit.id,spiritId)??[];this.clear();this.board.clearMarks();const views=this.model.units().filter(u=>targets.includes(u.id));this.board.moveCells=views.filter(u=>u.team==='ally').map(u=>u.cell);this.board.attackCells=views.filter(u=>u.team!=='ally').map(u=>u.cell);this.set({kind:'spiritTarget',unit,at,spiritId,targets});if(views[0])this.board.moveCursor(views[0].cell,true);}
    private cast(unit: UnitView, at: Cell, spiritId: string, targetId?: string): void { const events = this.model.cast(unit.id, spiritId, targetId), screen = this; this.clear(); this.board.clearMarks(); this.set({ kind: 'busy' }); this.run((function* (): Step { yield* screen.play(events); screen.board.sync(screen.model.units()); screen.board.place(unit.id, at); screen.commands({ ...unit, ...screen.model.units().find(u => u.id === unit.id), cell: unit.cell }, at); })()); }
    private target(unit: UnitView, at: Cell, weaponId?: string): void {
        const { model, board } = this, targets = model.targets(unit.id, at).filter(id => !weaponId || model.weapons(unit.id, at, id).some(w => w.id === weaponId && w.usable));
        this.clear();
        board.clearMarks();
        board.attackCells = model.range(unit.id, at);
        this.set({ kind: 'target', unit, at, targets, weaponId });
        // 커서를 가장 가까운 적에게 옮겨 준다.
        const first = model.units().find(u => u.id === targets[0]);
        if (first)
            board.moveCursor(first.cell, true);
        this.hover(board.cursor);
    }
    private weapons(unit: UnitView, at: Cell, targetId?: string): void {
        const targets = this.model.targets(unit.id, at), first = targetId ?? targets[0];
        if (!first) {
            this.commands(unit, at);
            return;
        }
        const initial = this.model.weapons(unit.id, at, first), list = targetId ? initial : initial.map(w => targets.flatMap(id => this.model.weapons(unit.id, at, id)).find(v => v.id === w.id && v.usable) ?? w);
        this.clear();
        this.set({ kind: 'weapon', unit, at, targetId: targetId ?? '' });
        const items = list.map(w => ({ label: w.name, labelSize: 22, description: [`위력 ${w.power} · 사거리 ${w.range}`, w.resources ?? `${term('en')} ${w.cost}`].filter(Boolean).join(' · '), singleDescription: true, badge: w.reason, disabled: !w.usable }));
        this.menu(items, at, index => targetId ? this.forecast(unit, at, targetId, list[index].id) : this.target(unit, at, list[index].id), 760);
    }
    private animationToggle():void{if(!this.options.animation||!this.options.setAnimation)return;const label=()=>`전투 연출 · ${this.options.animation!()==='off'?'꺼짐':this.options.animation!()==='allies'?'아군만':'켜짐'}`;const toggle=this.ui.add(Object.assign(new Button(label(),()=>{this.options.setAnimation!(this.options.animation!()==='off'?'on':'off');toggle.label=label();},{w:260,h:64}),{x:W-520,y:30,z:65,canFocus:false}));this.floating.push(toggle);}
    private forecast(unit: UnitView, at: Cell, targetId: string, weaponId: string, fromTarget=false): void {
    const { model, stage, ui } = this, f = model.forecast(unit.id, at, weaponId, targetId), target = model.units().find(u => u.id === targetId)!;
    const side = (view: UnitView, data: typeof f.attacker, role: string): ForecastInfo => ({ unit: view, role, weapon: data.weapon, hit: data.hit, damage: data.damage, critical: data.critical,resources:data.resources });
    const mine = side(unit, f.attacker, '공격'), theirs = side(target, f.defender, f.defender.weapon ? '반격' : '반격 불가');
    this.clear();
    this.set({ kind: 'forecast', unit, at, targetId,weaponId,fromTarget });this.tutorial?.event('forecast');
    this.card.visible = this.land.visible = false;   // 예측 창이 뜨는 동안 아래 정보는 가린다
    // 전투 장면과 좌우를 맞춘다: 적이 왼쪽, 아군이 오른쪽.
    const [left, right] = unit.team === 'ally' ? [theirs, mine] : [mine, theirs];
    this.floating.push(stage.ui.add(Object.assign(windowFrame('',1200,510),{x:40,y:80,z:59})),stage.ui.add(forecastPanel(left, right)));this.animationToggle();
    const go = ui.add(Object.assign(new Button('전투 개시', () => this.commit(model.attack(unit.id, at, weaponId, targetId)), { kind: 'main', w: 240 }), { x: W / 2 - 380, y: 520, z: 62 }));
    const change = ui.add(Object.assign(new Button('무기 변경', () => this.weapons(unit, at, targetId), { w: 240 }), { x: W / 2 - 120, y: 520, z: 62 }));
    const cancel = ui.add(Object.assign(new Button('취소', () => this.back(), { w: 240 }), { x: W / 2 + 140, y: 520, z: 62 }));
    this.floating.push(go, change, cancel);
    ui.focusOn(go, true);
  }
    private inspect(id:string):void {const data=this.model.details?.(id);if(data)this.app.push(new UnitDetailsScreen(data,()=>this.app.pop('none')),'none');else toast(this,'능력 정보가 없습니다');}
    private roster():void {this.clear();this.set({kind:'idle'});this.app.push(new RosterScreen(this.model,()=>this.app.pop('none')),'none');}
    private mapMenu(cell: Cell): void {
    this.clear();this.board.clearMarks();this.lastEmpty=undefined;
    const waiting = this.model.units().some(u => u.team === 'ally' && !u.acted), end = (): void => this.commit(this.model.endTurn());
    const items: { item: MenuItem; run: () => void }[] = [
      ...(this.options.objectives?[{item:{label:'작전 목표'},run:()=>{const screen=this;this.run((function*():Step{screen.clear();screen.set({kind:'idle'});yield*screen.objectives('누르면 닫기');})());}}]:[]),
      {item:{label:'부대 현황'},run:()=>this.roster()},
      { item: { label: '턴 종료',disabled:this.model.turn().team!=='ally' }, run: () => { if (waiting) this.app.push(new ConfirmScreen('아직 움직이지 않은 기체가 있습니다.\n턴을 끝낼까요?', end), 'none'); else end(); } },
      ...(this.options.menu ?? []).map(item => ({ item: { label: item.label }, run: item.run })),
      ...(this.options.onExit ? [{ item: { label: '나가기' }, run: this.options.onExit }] : []),
    ];
    this.app.sound.play('confirm', 0.5);
    this.set({ kind: 'menu' });
    this.menu(items.map(i => i.item), cell, index => items[index].run());
  }
    /** 취소: 한 단계 앞으로. */
    private back(): void {
        const { mode, board } = this;
        switch (mode.kind) {
            case 'response':
                this.deny();
                return;
            case 'responseForecast':
                this.deny();
                return;
            case 'busy': return;
            case 'idle':
                if (board.attackCells.length)
                    board.clearMarks();
                else
                    this.options.onExit?.();
                return;
            case 'inspectMenu':
            case 'menu':
            case 'move':
                this.clear();
                board.clearMarks();
                this.set({ kind: 'idle' });
                return;
            case 'command': {
                if (mode.unit.acted || this.model.turn().team !== 'ally') {
                    this.clear();
                    board.clearMarks();
                    this.set({ kind: 'idle' });
                    return;
                }
                // 가 봤던 기체를 원래 자리로 돌려놓고, 다시 목적지를 고르게 한다.
                const reach = this.model.reach(mode.unit.id);
                this.clear();
                board.place(mode.unit.id, mode.unit.cell);
                board.moveCells = reach;
                board.moveCursor(mode.unit.cell, true);
                this.set({ kind: 'move', unit: mode.unit, reach });
                return;
            }
            case 'ability':
                this.commands(mode.unit, mode.at);
                return;
            case 'persuadeTarget':
                this.commands(mode.unit, mode.at);
                return;
            case 'mapWeapons':
                this.commands(mode.unit, mode.at);
                return;
            case 'mapAim':
                this.mapWeapons(mode.unit, mode.at);
                return;
            case 'mapConfirm':
                this.mapAim(mode.unit, mode.at, mode.weaponId);
                return;
            case 'spiritTarget':
                this.spirits(mode.unit, mode.at);
                return;
            case 'spirit':
                this.commands(mode.unit, mode.at);
                return;
            case 'target':
                if (mode.weaponId)
                    this.weapons(mode.unit, mode.at);
                else
                    this.commands(mode.unit, mode.at);
                return;
            case 'weapon':
                this.commands(mode.unit, mode.at);
                return;
            case 'forecast':
                if (mode.fromTarget)
                    this.target(mode.unit, mode.at, mode.weaponId);
                else
                    this.weapons(mode.unit, mode.at, mode.targetId);
                return;
        }
    }
    // ── 일어난 일을 튼다 ──
    private commit(events: MapEvent[]): void {
        if (events.some(e => e.type === 'battle'))
            this.tutorial?.event('battle');
        this.clear();
        this.board.clearMarks();
        const screen = this;
        this.run((function* (): Step { yield* screen.play(events); screen.settle(); })());
    }
    /** 다 틀고 난 뒤: 판을 지금 상태에 맞추고 대기로 돌아간다. */
    private settle(): void {
        const turn = this.model.turn();
        this.board.sync(this.model.units());
        this.board.blockedCells = this.model.blockedCells?.() ?? [];
        Object.assign(this.phase.state, { team: turn.team, turn: turn.number });
        this.set({ kind: 'idle' });
        this.hover(this.board.cursor);
        this.startTutorial();
    }
    /** 적의 공격을 받을 때: 예상 창을 바로 띄우고, 그 아래에 대응(반격 무기·방어·회피)을 고르는 줄과 확정 버튼을 둔다.
     *  대응을 누르면 고르기만 하고 예상 수치가 바뀐다. 확정은 '대응 확정' 버튼으로만 한다. */
    private responseMenu(prompt:ResponsePrompt):void {const first=prompt.choices.find(c=>c.id.startsWith('counter:'))??prompt.choices[0];this.responseForecast(prompt,first.id);}
    private responseForecast(prompt:ResponsePrompt,id:string,page=Math.floor(prompt.choices.findIndex(c=>c.id===id)/8)):void {
    const choice=prompt.choices.find(c=>c.id===id)!,f=choice.forecast;
    this.clear();this.set({kind:'responseForecast',prompt,choiceId:id});this.card.visible=this.land.visible=false;
    const side=(unit:UnitView,data:typeof f.attacker,role:string):ForecastInfo=>({unit,role,weapon:data.weapon,hit:data.hit,damage:data.damage,critical:data.critical,resources:data.resources});
    this.floating.push(this.stage.ui.add(forecastPanel(side(prompt.attacker,f.attacker,'공격'),side(prompt.defender,id.startsWith('counter:')?f.defender:{...f.defender,weapon:id==='defend'?'방어 태세 · 받는 피해를 줄입니다':id==='evade'?'회피 기동 · 맞을 확률을 낮춥니다':f.defender.weapon},id.startsWith('counter:')?'반격':choice.label))));
    this.animationToggle();
    // At most two rows stay between the forecast (ends at 482) and the hint (starts at 680).
    const choices=prompt.choices.slice(page*8,page*8+8),perRow=Math.min(4,choices.length),gap=12,bw=Math.floor((W-120-gap*(perRow-1))/perRow),bh=48,top=490;
    choices.forEach((c,i)=>{const row=Math.floor(i/perRow),col=i%perRow,inRow=Math.min(perRow,choices.length-row*perRow),left=(W-(inRow*bw+(inRow-1)*gap))/2;
      const b=this.ui.add(Object.assign(new Button((c.id===id?'✔ ':'')+c.label,()=>{if(c.id!==id)this.responseForecast(prompt,c.id);},{w:bw,h:bh,wrapLabel:true,kind:c.id===id?'main':'plain'}),{x:left+col*(bw+gap),y:top+row*(bh+8),z:62}));this.floating.push(b);});
    const rows=Math.ceil(choices.length/perRow),y=top+rows*(bh+8)+8;
    if(prompt.choices.length>8){
      const pages=Math.ceil(prompt.choices.length/8);
      for(const [label,delta,x] of [['◀ 이전',-1,70],['다음 ▶',1,W-290]] as const){
        const b=this.ui.add(Object.assign(new Button(label,()=>this.responseForecast(prompt,id,(page+delta+pages)%pages),{w:220,h:54}),{x,y,z:62}));this.floating.push(b);
      }
    }
    const go=this.ui.add(Object.assign(new Button('대응 확정',()=>this.responseDone?.(id),{kind:'main',w:360,h:54}),{x:(W-360)/2,y,z:62}));this.floating.push(go);this.ui.focusOn(go,true);
  }
    private *chooseResponse(): Step { const prompt = this.model.response?.(); if (!prompt || !this.model.respond)
        return; let chosen: string | undefined; this.responseDone = id => { chosen = id; }; this.responseMenu(prompt); yield* until(() => !!chosen); this.responseDone = undefined; this.clear(); yield* this.play(this.model.respond(chosen!)); if (this.model.turn().team !== 'ally' && this.model.continueTurn)
        yield* this.play(this.model.continueTurn()); }
    private *objectives(hint?: string): Step { if (!this.options.objectives)
        return; this.returned = false; this.app.push(new ObjectivesScreen({ ...this.options.objectives, optional: hintOrder(this.options.hints?.() ?? [], { order: ['optional', 'danger'] }) }, () => this.app.pop('none'), hint, h => { this.app.pop('none'); this.board.snap(h.cell); this.board.moveCursor(h.cell); }), 'none'); yield* until(() => this.returned); }
    private *guide(): Step {
        const hints = hintOrder(this.options.hints?.() ?? [], this.options.hintOptions);
        if (!hints.length)
            return;
        const g = this.guidance = { next: false, skip: false } as NonNullable<MapScreen['guidance']>, start = { ...this.board.cursor };
        const nodes = [this.card, this.land, this.phase, this.hint, this.mapButton], visible = nodes.map(n => n.visible);
        nodes.forEach(n => n.visible = false);
        const skip = this.ui.add(Object.assign(new Button('건너뛰기', () => { g.skip = true; }, { w: 160, h: 64 }), { x: W - 280, y: 8, z: 90, canFocus: false }));
        const mark = this.stage.ui.add(new HintShape({}, ctx => { const h = g.current; if (!h)
            return; const p = this.board.onScreen(h.cell); ctx.strokeStyle = h.kind === 'danger' ? COLOR.enemy : COLOR.gold; ctx.lineWidth = 4; ctx.globalAlpha = .5 + .5 * Math.abs(Math.sin(this.clock * 5)); ctx.strokeRect(p.x - 40, p.y - 40, 80, 80); ctx.globalAlpha = 1; const label = hintLabel(h); ctx.font = `900 23px ${FONT.body}`; const width = Math.min(600, ctx.measureText(label).width + 40), x = Math.max(24, Math.min(W - width - 24, p.x - width / 2)), y = Math.max(80, Math.min(H - 130, p.y - 100)); panel(ctx, x, y, width, 48, COLOR.gold); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = COLOR.ink; ctx.fillText(label, x + width / 2, y + 24, width - 24); }));
        mark.z = 60;
        try {
            for (const h of hints) {
                if (g.skip)
                    break;
                g.current = h;
                g.next = false;
                yield* this.board.look(h.cell);
                yield* until(() => g.next || g.skip);
            }
        }
        finally {
            mark.remove();
            this.ui.remove(skip);
            nodes.forEach((n, i) => n.visible = visible[i]);
            this.guidance = undefined;
            yield* this.board.look(start);
        }
    }
    private movementRate(): number { return this.app.fastHeld ? 3 : this.options.speed?.() ?? 1; }
    private *play(events: MapEvent[]): Step {
        // 규칙 쪽의 상태는 이미 끝까지 진행돼 있다. 그래서 트는 동안에는 model.units()로 판을 맞추지 않고,
        // 사건이 말해 주는 만큼만 판을 바꾼다(다 튼 뒤 settle에서 한 번 맞춘다).
        const { board, model } = this;
        this.set({ kind: 'busy' });
        yield* waitForImages(this.show, [...(model.images?.() ?? []), ...events.flatMap(e => e.type === 'spawn' ? [e.unit.icon, ...portraitImages(e.unit.portrait)] : e.type === 'change' ? e.units.flatMap(u => [u.icon, ...portraitImages(u.portrait)]) : [])]);
        const shownDefeats = new Set<string>();
        for (const event of events) {
            const eventMusic = this.options.eventMusic?.(event);
            if (eventMusic) {
                this.music = eventMusic;
                yield* waitForAudio(this.show, [eventMusic]);
                this.app.sound.music(eventMusic);
            }
            switch (event.type) {
                case 'speech': {
                    if ((this.options.speed?.() ?? 1) > 1)
                        break;
                    const control = this.speechControl = { fast: false }, node = this.stage.ui.add(battleLine({ side: 'left', portrait: event.portrait, mood: event.mood, name: event.name, color: COLOR.ally, text: event.text, shown: event.text.length }));
                    node.z = 85;
                    try {
                        let time = 0;
                        while (time < Math.max(1.2, event.text.length / 22) && !control.fast) {
                            yield* wait(.1);
                            time += .1;
                        }
                    }
                    finally {
                        node.remove();
                        this.speechControl = undefined;
                    }
                    break;
                }
                case 'passage':
                    board.blockedCells = event.cells;
                    break;
                case 'notice':
                    if (event.sound)
                        this.app.sound.play(event.sound);
                    toast(this, event.text);
                    if (event.unitId && board.unitAt(model.units().find(u => u.id === event.unitId)?.cell ?? board.cursor)) {
                        this.app.sound.play('confirm');
                        flash(this.show, .25, .12);
                    }
                    yield* wait(.35);
                    break;
                case 'change':
                    yield* board.look(event.focus);
                    this.app.sound.play('transform');
                    flash(this.show, .7, .25);
                    yield* wait(.08);
                    board.sync(event.units);
                    this.hover(board.cursor);
                    yield* wait(.25);
                    break;
                case 'status': {
                    board.status(event.units);
                    this.hover(board.cursor);
                    const labels = event.gains.flatMap(g => { if (!board.unit(g.unitId))
                        return []; const p = board.feet(g.unitId), text = [g.hp ? `HP +${g.hp}` : '', g.en ? `${term('en')} +${g.en}` : '', g.ammo ? '탄수 회복' : ''].filter(Boolean).join(' · '); const node = this.stage.world.add(new Shape({}, ctx => { ctx.font = `900 22px ${FONT.body}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.lineWidth = 4; ctx.strokeStyle = '#050816'; ctx.fillStyle = '#a5ffc8'; ctx.strokeText(text, p.x, p.y - 105, 500); ctx.fillText(text, p.x, p.y - 105, 500); })); node.z = 45; return [node]; });
                    if (labels.length) {
                        this.app.sound.play('gauge', .45);
                        yield* wait(.3 / Math.max(1, this.options.speed?.() ?? 1));
                        labels.forEach(n => n.remove());
                    }
                    break;
                }
                case 'response':
                    yield* this.chooseResponse();
                    break;
                case 'objectives':
                    yield* this.objectives();
                    break;
                case 'hints':
                    yield* this.guide();
                    break;
                case 'story':
                    if (this.options.story) {
                        const nodes = [this.card, this.land, this.phase, this.hint], visible = nodes.map(n => n.visible);
                        nodes.forEach(n => n.visible = false);
                        try {
                            yield* this.options.story(event.scene, this, board);
                        }
                        finally {
                            nodes.forEach((n, i) => n.visible = visible[i]);
                        }
                        if (this.app.top === this && this.music) {
                            yield* waitForAudio(this.show, [this.music]);
                            this.app.sound.music(this.music);
                        }
                    }
                    break;
                case 'move':
                    yield* board.moveAlong(event.unitId, event.path, () => this.movementRate());
                    this.hover(board.cursor);
                    break;
                case 'look':
                    yield* board.look(event.cell);
                    break;
                case 'battle': {
                    const settings = this.options.battle?.(event.exchange) ?? { animation: 'on', speed: 1, shake: 1, enemyBattle: 'full' };
                    const ally = event.exchange.fighters.find(f => f.id === event.exchange.strikes[0]?.attacker)?.side === 'ally';
                    const animate = (settings.animation === 'on' || settings.animation === 'allies' && ally) && (ally || settings.enemyBattle !== 'brief');
                    this.stage.camera.shakeScale = settings.shake;
                    let progress = battleProgress(event.exchange), skipped = !animate;
                    if (animate) {
                        this.returned = false;
                        this.app.push(new BattleScreen(event.exchange, result => { progress = result.progress; skipped = result.skipped; this.app.pop(); }, { ...settings, enemyPhase: !ally, deferRewards: false }));
                        yield* until(() => this.returned);
                    }
                    // Bring the map up to the already displayed result before resuming any unfinished steps.
                    event.exchange.strikes.forEach((strike, i) => { if (progress.strikes[i].result)
                        for (const f of event.exchange.fighters)
                            if (f.revealed)
                                board.reveal(f.id); if (progress.strikes[i].result && strike.outcome.hit)
                        board.harm(strike.cover ?? strike.target, strike.outcome.damage); if (progress.strikes[i].defeated) {
                        const id = strike.cover ?? strike.target;
                        board.removeUnit(id);
                        shownDefeats.add(id);
                    } });
                    if (skipped) {
                        this.card.visible = this.land.visible = false;
                        const control = this.brief = { fast: false, history: [] };
                        try {
                            yield* playBrief(this.show, board, event.exchange, progress, control, shownDefeats, settings.speed);
                        }
                        finally {
                            this.brief = undefined;
                            this.card.visible = this.land.visible = true;
                        }
                    }
                    break;
                }
                case 'spirit': {
                    const feet = board.feet(event.unitId), unit = model.units().find(u => u.id === event.unitId);
                    yield* board.look(unit?.cell ?? board.cursor);
                    yield* castSpirit(this.show, { x: feet.x, y: feet.y, height: 96 }, event.spirit, unit?.portrait);
                    break;
                }
                case 'defeat':
                    if (!shownDefeats.has(event.unitId))
                        yield* board.defeat(event.unitId);
                    if (event.reward)
                        toast(this, `${event.reward.name} · ${term('trainingShort')} +${event.reward.amount}`);
                    break;
                case 'spawn': {
                    const visible = [this.card.visible, this.land.visible];
                    if (this.options.story) {
                        this.card.visible = false;
                        this.land.visible = false;
                    }
                    yield* board.spawn(event.unit);
                    [this.card.visible, this.land.visible] = visible;
                    break;
                }
                case 'phase':
                    if (event.team !== 'ally' && this.tutorial && !this.tutorial.finished) {
                        this.tutorial.finished = true;
                        this.options.onTutorialDone?.();
                    }
                    if (this.options.phaseMusic) {
                        this.music = this.options.phaseMusic(event.team);
                        if (this.music)
                            yield* waitForAudio(this.show, [this.music]);
                        this.app.sound.music(this.music ?? undefined);
                    }
                    if (event.team === 'enemy')
                        this.app.sound.play('alarm', .55);
                    board.wake();
                    Object.assign(this.phase.state, { team: event.team, turn: event.turn });
                    yield* bigBanner(this.show, event.team === 'ally' ? '아군 페이즈' : event.team === 'third' ? '제3세력 페이즈' : '적 페이즈', event.team === 'ally' ? COLOR.ally : event.team === 'third' ? '#ffad4a' : COLOR.enemy);
                    break;
                case 'end':
                    yield* bigBanner(this.show, event.won ? '스테이지 클리어' : '게임 오버', event.won ? COLOR.gold : COLOR.enemy, 1.6);
                    this.options.onEnd?.(event.won);
                    return;
            }
        }
    }
}
