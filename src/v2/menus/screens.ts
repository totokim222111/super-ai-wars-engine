import { preloadImages } from '../pack/images';
import { term } from '../terms';
/**
 * 메뉴 화면의 기준작 셋: 타이틀, 인터미션, 기체 개조.
 *
 * 나머지 메뉴 화면(강화 파츠, 상점, 파일럿, 저장·불러오기, 설정, 결과)은 이 셋의 틀을 따른다.
 *   - 타이틀·인터미션: "큰 메뉴 하나 + 고른 항목의 설명" 틀.
 *   - 개조: "왼쪽 목록에서 대상을 고르고, 오른쪽 목록에서 할 일을 고른다"는 목록-상세 틀.
 *     파츠 장착, 상점, 파일럿 육성이 모두 이 틀이다.
 * 공통 약속
 *   - 머리말은 menuFrame()으로 만든다: 제목(왼쪽 위), 화면 안 뒤로 가기, 자금(제목 아래), 조작 안내(맨 아래).
 *   - 돈이 나가는 일은 ConfirmScreen으로 한 번 묻고, 끝나면 toast로 알린다. 모자라면 "안 됨" 소리와 toast.
 *   - 값이 바뀌면 목록을 setItems로 다시 채운다(화면을 다시 만들지 않는다).
 */
import { ConfirmScreen } from '../dialogs';
import { ease, tween, wait, type Step } from '../flow';
import { hintBar, label, MenuList, toast, windowFrame, type MenuItem } from '../kit';
import { Screen } from '../screen';
import { H, Shape, Sprite, W } from '../stage';
import { COLOR, cover, FONT, plate } from '../ui';
import type { CampaignModel, UpgradeUnit } from './model';

const money = (amount: number): string => amount.toLocaleString('ko-KR');

/** 자금 표시. state.amount를 바꾸면 숫자가 바뀐다. */
export function fundsChip(amount: number): Shape<{ amount: number }> {
  return new Shape({ amount }, (ctx, s) => {
    plate(ctx, 0, 0, 300, 40, 'rgba(7,11,26,.86)', 'right');
    ctx.fillStyle = COLOR.gold; ctx.fillRect(0, 0, 6, 40);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.font = `700 17px ${FONT.body}`; ctx.fillStyle = COLOR.dim; ctx.fillText(term('funds'), 22, 21);
    ctx.textAlign = 'right'; ctx.font = `700 24px ${FONT.num}`; ctx.fillStyle = COLOR.ink; ctx.fillText(money(Math.round(s.amount)), 262, 22);
  });
}

/** 메뉴 화면의 공통 머리말과 바닥을 올린다. 자금 표시를 돌려준다(쓰지 않는 화면은 funds를 비운다). */
export function menuFrame(screen: Screen, options: { title: string; hint: string; background?: HTMLImageElement; funds?: number; onBack?: () => void; navigation?:'close'|'back' }): Shape<{ amount: number }> | undefined {
  const { stage, ui } = screen;
  stage.back.add(Object.assign(new Sprite(options.background, H * 1.12), { x: W / 2, y: H / 2 }));
  stage.back.add(cover('rgba(5,8,22,.84)'));
  if(options.navigation==='close')stage.ui.add(Object.assign(windowFrame(options.title,1232,584,{inside:true}),{x:24,y:80}));
  if(options.navigation!=='close')stage.ui.add(Object.assign(label(options.title, 40, { display: true }), { x: 40, y: 18 }));
  stage.ui.add(hintBar(options.hint));
  if (options.onBack) { ui.setNavigation({kind:options.navigation??'back',onBack:options.onBack}); }
  if (options.funds === undefined) return undefined;
  return stage.ui.add(Object.assign(fundsChip(options.funds), { x: 40, y: 74 }));
}

// ── 타이틀 ─────────────────────────────────────────────────────

export interface TitleOptions {
  title: string;
  subtitle: string;
  footer?:string;
  background?: HTMLImageElement;
  /** 타이틀을 장식하는 인물 그림. */
  art?: HTMLImageElement;
  items: { label: string; disabled?: boolean; run: () => void }[];
  music?: string;
}

export class TitleScreen extends Screen {
  constructor(private readonly options: TitleOptions) { super(); this.music = options.music; }
  prepare():Promise<void>|void{return preloadImages([this.options.background,this.options.art]);}
  enter(): void {
    const { stage, ui, options } = this;
    const background = stage.back.add(Object.assign(new Sprite(options.background, H * 1.22), { x: W / 2 + 40, y: H / 2 }));
    stage.back.add(new Shape<object>({}, ctx => {
      // 글자가 얹히는 왼쪽을 어둡게 눌러 준다.
      const dark = ctx.createLinearGradient(0, 0, W, 0);
      dark.addColorStop(0, 'rgba(4,7,20,.92)'); dark.addColorStop(0.5, 'rgba(4,7,20,.55)'); dark.addColorStop(1, 'rgba(4,7,20,.1)');
      ctx.fillStyle = dark; ctx.fillRect(-200, -100, W + 400, H + 200);
    }));
    const art = stage.world.add(Object.assign(new Sprite(options.art, 700).trimToContent(), { anchorY: 1, x: 1010, y: H + 8, alpha: 0 }));
    // 제목: 글자 뒤에 비스듬한 띠, 위로 빛이 한 번 훑고 지나간다.
    const title = stage.ui.add(new Shape({ shine: -0.3 }, (ctx, s) => {
      ctx.font = `104px ${FONT.display}`;
      const width = ctx.measureText(options.title).width;
      ctx.save(); plate(ctx, -40, 16, width + 150, 116, COLOR.ally, 'right'); ctx.clip();
      const glint = ctx.createLinearGradient((width + 150) * s.shine - 90, 0, (width + 150) * s.shine + 90, 0);
      glint.addColorStop(0, 'rgba(255,255,255,0)'); glint.addColorStop(0.5, 'rgba(255,255,255,.55)'); glint.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glint; ctx.fillRect(-40, 16, width + 150, 116); ctx.restore();
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillStyle = '#06112e'; ctx.fillText(options.title, 30, 82);
      ctx.fillStyle = '#fff'; ctx.fillText(options.title, 30, 76);
      ctx.font = `700 24px ${FONT.body}`; ctx.fillStyle = COLOR.gold; ctx.fillText(options.subtitle, 34, 164);
    }));
    Object.assign(title, { x: -700, y: 70 });
    const menu = ui.add(Object.assign(new MenuList(options.items, index => options.items[index].run(), { w: 400, rowHeight: 58, tap: 'choose' }), { x: 70, y: 300, alpha: 0 }));
    stage.ui.add(hintBar('↑↓ 선택 · Enter 결정 · 화면을 눌러도 됩니다'));
    if(options.footer)stage.ui.add(new Shape({},ctx=>{
      ctx.font=`17px ${FONT.body}`;ctx.textAlign='right';ctx.textBaseline='middle';
      ctx.lineWidth=4;ctx.strokeStyle='rgba(3,7,18,.9)';
      ctx.strokeText(options.footer!,W-24,H-76);
      ctx.fillStyle='#c0c8d9';ctx.fillText(options.footer!,W-24,H-76);
    }));
    // 들어오는 순서: 배경이 천천히 흐르고 → 제목이 꽂히고 → 인물이 떠오르고 → 메뉴가 나타난다.
    this.run(tween(background, { x: W / 2 - 40 }, 40, ease.linear));
    const sound = this.app.sound;
    this.run((function* (): Step {
      yield* wait(0.2);
      sound.play('whoosh');
      yield* tween(title, { x: 40 }, 0.35, ease.back);
      sound.play('heavy', 0.5);
      yield* tween(art, { alpha: 1, x: 980 }, 0.5);
      yield* tween(menu, { alpha: 1 }, 0.3);
      for (;;) { yield* wait(3.2); title.state.shine = -0.3; yield* tween(title.state, { shine: 1.3 }, 0.9, ease.inOut); }
    })());
  }
}

// ── 인터미션 ───────────────────────────────────────────────────

export class IntermissionScreen extends Screen {
  /**
   * @param routes 항목 id → 골랐을 때 할 일. 없는 id는 "준비 중" 알림이 뜬다.
   * @param art 화면을 장식하는 인물 그림.
   */
  constructor(private readonly model: CampaignModel, private readonly routes: Record<string, () => void>,
    private readonly look: { background?: HTMLImageElement; art?: HTMLImageElement; music?: string } = {}) { super(); this.music = look.music; }
  private funds?: Shape<{ amount: number }>;
  prepare():Promise<void>|void{return preloadImages([this.look.background,this.look.art]);}
  enter(): void {
    const { stage, ui, model, look } = this, hub = model.hub(), entries = model.entries();
    this.funds = menuFrame(this, { title: '인터미션', hint: '↑↓ 선택 · Enter 결정', background: look.background, funds: hub.funds });
    stage.world.add(Object.assign(new Sprite(look.art, 660).trimToContent(), { anchorY: 1, x: 1100, y: H + 8 }));
    // 다음 화 안내
    stage.ui.add(Object.assign(windowFrame('다음 출격', 360, 150), { x: 500, y: 156 }));
    stage.ui.add(Object.assign(label(hub.next, 28, { weight: 900, width: 320 }), { x: 524, y: 184 }));
    stage.ui.add(Object.assign(label(`지난 화 · ${hub.chapter}`, 18, { color: COLOR.dim, width: 320 }), { x: 524, y: 278 }));
    const desc:Record<string,string>={sortie:'준비를 마치고 다음 이야기로 갑니다',upgrade:'크레딧으로 기체와 무기를 강화합니다',pilot:'RLHF로 파일럿의 능력과 기술을 올립니다',parts:'기체에 강화 부품을 끼웁니다',shop:'소모품과 플러그인을 삽니다',save:'지금 상태를 저장합니다',load:'저장한 진행을 불러옵니다',settings:'소리와 화면·연출 설정을 바꿉니다'};
    const about = stage.ui.add(Object.assign(label(desc[entries[0]?.id]??entries[0]?.about??'', 22, { color: COLOR.dim, width: 330 }), { x: 506, y: 336 }));
    const items: MenuItem[] = entries.map(e => ({ label: e.label, disabled: e.disabled }));
    ui.add(Object.assign(new MenuList(items, index => {
      const run = this.routes[entries[index].id];
      if (run) run(); else toast(this, '아직 준비 중입니다');
    }, { w: 410, rows: Math.min(entries.length, 9), rowHeight: 54, onMove: index => { about.state.text = desc[entries[index].id]??entries[index].about; } }), { x: 50, y: 136 }));
  }
  /** 다른 화면에서 돌아왔을 때 자금을 다시 읽는다. */
  resume(): void { if (this.funds) this.funds.state.amount = this.model.funds(); }
}

// ── 기체 개조 (목록-상세 틀의 기준작) ───────────────────────────

export class UpgradeScreen extends Screen {
  constructor(private readonly model: CampaignModel, private readonly look: { background?: HTMLImageElement; temporary?: boolean;music?:string } = {}) { super();this.music=look.music; }
  prepare():Promise<void>|void{return preloadImages([this.look.background,this.model.upgradeUnits()[0]?.image]);}
  enter(): void {
    const { stage, ui, model } = this, units = model.upgradeUnits();
    const funds = menuFrame(this, { title: '기체 개조', hint: '←→ 목록 이동 · ↑↓ 선택 · Enter로 한 단계 개조 · Esc 뒤로', background: this.look.background, funds: model.funds(), onBack: () => this.app.pop() })!;
    let unit: UpgradeUnit | undefined = units[0];let selectedStat=0;
    const weaponList=ui.add(Object.assign(new MenuList([],()=>undefined,{w:610,rows:3,rowHeight:28,pagerHeight:20,dynamic:true,tap:'select'}),{x:430,y:508,visible:false,canFocus:false}));
    const refreshWeapons=()=>{weaponList.visible=unit?.stats[selectedStat]?.id==='weapons';weaponList.setItems((unit?.weapons??[]).map(w=>({label:w.name,labelSize:17,valueSize:17,value:w.next===undefined?String(w.value):`${w.value} → ${w.next}`})));};
    // 고른 기체의 그림. 기체를 바꾸면 그림이 미끄러져 들어온다.
    const art = stage.world.add(Object.assign(new Sprite(unit?.image, 220).trimToContent(), { anchorY: 1, x: 1100, y: 397 }));
    const name = stage.ui.add(Object.assign(label('', 30, { weight: 900 }), { x: 440, y: 132 }));
    const rows = (target: UpgradeUnit): MenuItem[] => target.stats.map(s => ({
      label: s.label,labelSize:21,pips: { level: s.level, max: s.max },
      value:s.id==='weapons'?`전체 무장 · ${s.cost===undefined?'최대':money(s.cost)}`: s.cost === undefined ? `${s.value}  ·  최대` : `${s.value} → ${s.next}  ·  ${money(s.cost)}`,
      disabled: s.cost === undefined,
    }));
    const stats = new MenuList(unit ? rows(unit) : [], index => {
      const target = unit, stat = target?.stats[index];
      if (!target || !stat || stat.cost === undefined) return;
      if (stat.cost > model.funds()) { this.app.sound.play('deny'); toast(this, `${term('funds')}이 부족합니다`); return; }
      this.app.push(new ConfirmScreen(`${target.name}의 ${stat.label}을(를)\n${stat.level + 1}단계로 올릴까요?  (${money(stat.cost)})`, () => {
        if (!model.upgrade(target.id, stat.id)) { toast(this, '개조하지 못했습니다'); return; }
        // 값이 바뀌었다: 목록과 자금을 다시 읽는다. 자금은 숫자가 굴러 내려간다.
        unit = model.upgradeUnits().find(u => u.id === target.id);
        if (unit) stats.setItems(rows(unit));refreshWeapons();
        this.run(tween(funds.state, { amount: model.funds() }, 0.4));
        this.app.sound.play('gauge');
        toast(this, `${stat.label} ${stat.level + 1}단계`);
      }), 'none');
    }, { w: 520,rows:5,rowHeight:56,onMove:i=>{selectedStat=i;refreshWeapons();},previewFirst:true });
    const show = (target: UpgradeUnit | undefined): void => {
      unit = target;
      if (!target) return;
      const task=preloadImages([target.image]);if(task){this.app.preload([target.image],()=>show(target));return;}
      name.state.text = `${target.name}  ·  ${target.pilot}`;
      stats.index = 0;selectedStat=0;stats.setItems(rows(target));refreshWeapons();
      art.image = target.image; art.x = 1180; art.alpha = 0;
      this.run(tween(art, { x: 1120, alpha: 1 }, 0.22));
    };
    ui.add(Object.assign(new MenuList(units.map(u => ({ label: u.name, description: u.pilot, labelSize: 22 })), () => ui.focusOn(stats), { w: 370, rows: Math.min(units.length, 6), rowHeight: 76, onMove: index => show(model.upgradeUnits()[index]) }), { x: 40, y: 132 }));
    ui.add(Object.assign(stats, { x: 430, y: 180 }));
    show(unit);
  }
}
