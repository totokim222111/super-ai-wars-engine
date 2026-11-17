import {term} from '../terms';
import { AssetBookScreen } from './assets';
import { preloadImages } from '../pack/images';
import { cueImages } from '../pack/preload';
import { portraitImages } from '../portrait';
import {templateLabel} from '../battle/labels';
import { activePack } from '../pack/browser';
import { StoryPreviewScreen,PackCheckScreen,AnchorsScreen } from './pack-screens';
/**
 * 진열장의 화면들.
 * 엔진의 부품을 하나씩 따로 틀어 보는 곳이자, "화면은 이렇게 짠다"의 기준작이다.
 * 여기 있는 화면은 모두 kit.ts의 부품만으로 만들었다.
 */
import { startGame } from '../game/start';
import { BattleScreen } from '../battle/screen';
import { BattleScene, GROUND, HOME } from '../battle/scene';
import type { Exchange } from '../battle/types';
import { ConfirmScreen } from '../dialogs';
import { Director, Taps, type Cue } from '../director';
import { tween, wait, type Step } from '../flow';
import { burst, drainGauge, flash, impactLines, pop, ring, shake, slash, sparks, speedLines, tracer } from '../fx';
import type { InputEvent } from '../input';
import { Button, hintBar, label, MenuList, statTable, Tabs, toast, windowFrame, type MenuItem } from '../kit';
import { Screen } from '../screen';
import { SFX_NAMES, type Sfx } from '../sound';
import { castSpirit } from '../spirit';
import { H, Sprite, W, type Node } from '../stage';
import { COLOR, cover, hudState, unitHud } from '../ui';
import { TitleScreen } from '../menus/screens';


import {StagePreviewScreen} from './stage-preview';
import { type Sample } from './sample';

/** 진열장 화면의 공통: 배경, 제목, 뒤로 가기, 조작 안내. */
abstract class Page extends Screen {
  constructor(protected readonly sample: Sample) { super(); }
  prepare():Promise<void>|void{return preloadImages([this.sample.images[this.sample.pack.game.titleArt.background]]);}
  protected frame(title: string, hint: string): void {
    const { stage, ui } = this;
    stage.back.add(Object.assign(new Sprite(this.sample.images[this.sample.pack.game.titleArt.background], H * 1.12), { x: W / 2, y: H / 2 }));
    stage.back.add(cover('rgba(5,8,22,.82)'));
    stage.ui.add(Object.assign(label(title, 40, { display: true }), { x: 40, y: 18 }));
    stage.ui.add(hintBar(hint));
    ui.setNavigation({kind:'back',onBack:()=>this.app.pop()});
  }
}

export {HomeScreen} from './home';
import {HomeScreen} from './home';
export function openGallery(index:number,app:import('../screen').App,sample:Sample):void {
    const MOVES=sample.gallery.moves??[],OPENING=sample.gallery.opening??[],SITUATIONS=sample.gallery.situations??[];
    const hasEnemy=sample.exchange([]).fighters.some(f=>f.side==='enemy');
    if(index===5&&MOVES.length<2||index===12&&!hasEnemy||index===14&&!sample.faces.length){toast(app.top!,'이 팩에는 해당 견본이 없습니다.');return;}
    const battle = (index: number, then: () => void): BattleScreen => new BattleScreen(sample.exchange(MOVES[index].strikes, MOVES[index].enemyHp, MOVES[index].allyEnergy), then);
    const open: (() => void)[] = [
      ()=>{void activePack().then(p=>app.push(new AssetBookScreen(p,sample)));},
      ()=>{void activePack().then(p=>app.push(new StoryPreviewScreen(p,sample)));},
      ()=>{void activePack().then(p=>app.push(new PackCheckScreen(p,sample)));},
      ()=>{void activePack().then(p=>app.push(new AnchorsScreen(p,sample)));},
      () => { void startGame(app, sample, () => app.replace(new HomeScreen(sample), 'none')); },
      () => app.push(new StoryScreen(sample, OPENING, () => app.replace(battle(0, () => app.replace(battle(1, () => app.pop())))))),
      () => {void activePack().then(p=>app.push(new StagePreviewScreen(p,sample,()=>app.replace(new HomeScreen(sample),'none'))));},
      () => app.push(new StagePreviewScreen(sample.pack,sample,()=>app.pop())),
      () => app.push(new StoryScreen(sample, OPENING, () => app.pop())),
      () => app.push(new ListScreen(sample, '무기 연출 틀', MOVES.map(m => ({ label: m.label, value: templateLabel(m.strikes[0].weapon.anim.template), about: '공격하는 쪽 화면에서 시작해 맞는 쪽 화면으로 넘어갑니다.', exchange: () => sample.exchange(m.strikes) })))),
      () => app.push(new ListScreen(sample, '전투 상황', SITUATIONS.map(s => ({ label: s.label, about: s.about, exchange: () => sample.exchange(s.strikes, s.spamHp) })))),
      () => app.push(new SpiritScreen(sample)),
      () => app.push(new FxScreen(sample)),
      () => app.push(new KitScreen(sample)),
      () => app.push(new FaceScreen(sample)),
      () => app.push(new SoundScreen(sample)),
      () => app.push(new TitleScreen({ title: sample.pack.game.title, subtitle: sample.pack.game.subtitle, footer:sample.pack.game.titleFooter, background: sample.images[sample.pack.game.titleArt.background], art: sample.images[sample.pack.game.titleArt.character],
        items: [{ label: '새 게임', run: () => app.pop() }, { label: '이어하기', disabled: true, run: () => undefined }, { label: '불러오기', disabled: true, run: () => undefined }, { label: '설정', disabled: true, run: () => undefined }, { label: '진열장으로', run: () => app.pop() }] })),
      () => {void startGame(app,sample,()=>app.pop(),sample.pack,true).then(flow=>{flow.model.newGame({name:sample.pack.players.name.default,preset:0,line:sample.pack.players.lines[0].id});flow.model.session.screen='intermission';flow.show();});},
    ];
    open[index]?.();
}

/** 대화 장면을 튼다. 화면 아무 데나 누르면 다음으로 넘어간다. */
export class StoryScreen extends Screen {
  prepare():Promise<void>|void{return preloadImages(cueImages(this.cues,this.sample.cast,this.sample.images));}
  private readonly taps = new Taps();
  constructor(private readonly sample: Sample, private readonly cues: readonly Cue[], private readonly onDone: () => void) { super(); }
  enter(): void {
    const { sample, taps, cues, onDone } = this, director = new Director(this.show, sample.cast, sample.images, taps);
    this.ui.onCancel=()=>this.app.pop();
    this.run((function* (): Step { yield* director.play(cues); onDone(); })());
  }
  input(event: InputEvent): void {
    if (this.ui.input(event)) return;
    if ((event.kind === 'pointer' && event.phase === 'down') || (event.kind === 'action' && event.action === 'confirm')) this.taps.press();
    if (event.kind === 'action' && event.action === 'skip') this.runner.speed = this.runner.speed === 1 ? 3 : 1;
  }
}

/** 전투 예시를 목록에서 골라 튼다(무기 연출 틀, 전투 상황). */
class ListScreen extends Page {
  constructor(sample: Sample, private readonly title: string, private readonly entries: { label: string; value?: string; about: string; exchange: () => Exchange }[]) { super(sample); }
  enter(): void {
    this.frame(this.title, '↑↓ 선택 · Enter 재생 · 재생 중 Enter는 빨리 감기 · Esc 뒤로');
    const { entries } = this, about = this.stage.ui.add(Object.assign(label(entries[0]?.about??'이 팩에는 견본이 없습니다.', 22, { color: COLOR.dim, width: 520 }), { x: 680, y: 124 }));
    this.ui.add(Object.assign(new MenuList(entries, index => this.app.push(new BattleScreen(entries[index].exchange(), () => this.app.pop())),
      { w: 560, rows: 8, rowHeight: 56, onMove: index => { about.state.text = entries[index].about; } }), { x: 60, y: 110 }));
  }
}

/** 정신기 효과. 가운데 선 기체에 건다. */
class SpiritScreen extends Screen {
  prepare():Promise<void>|void{return preloadImages([this.sample.images[this.sample.roles.battleBackground??this.sample.pack.game.fallbacks.background],this.sample.images[this.sample.roles.partnerArt??''],...portraitImages(this.sample.leadPortrait)]);}
  constructor(private readonly sample: Sample) { super(); }
  enter(): void {
    const { stage, sample } = this, unit = { x: 470, y: GROUND, height: 400 };
    stage.back.add(Object.assign(new Sprite(sample.images[sample.roles.battleBackground??sample.pack.game.fallbacks.background], H * 1.3), { x: W / 2, y: H / 2 }));
    stage.world.add(Object.assign(new Sprite(sample.images[sample.roles.partnerArt??''], unit.height).trimToContent(), { anchorY: 1, x: unit.x, y: unit.y }));
    stage.ui.add(Object.assign(label('정신기', 40, { display: true }), { x: 40, y: 18 }));
    this.ui.add(Object.assign(new MenuList((sample.gallery.spirits??[]).map(s => ({ label: s.name })), index => this.run(castSpirit(this.show, unit, sample.gallery.spirits![index], sample.leadPortrait)), { w: 320, rowHeight: 56 }), { x: W - 360, y: 250 }));
    this.ui.setNavigation({kind:'back',onBack:()=>this.app.pop()});
    stage.ui.add(hintBar('↑↓ 선택 · Enter로 발동 · Esc 뒤로'));
  }
}

/** 현재 팩의 적 견본에 효과 부품을 하나씩 눌러 본다. */
class FxScreen extends Screen {
  prepare():Promise<void>|void{const e=this.sample.exchange([]);return preloadImages([e.background,...e.fighters.flatMap(f=>[f.image,...portraitImages(f.portrait)])]);}
  constructor(private readonly sample: Sample) { super(); }
  enter(): void {
    const destroyLine=this.sample.gallery.fx?.destroyLine??'',show = this.show, scene = new BattleScene(show, this.sample.exchange([])), target = scene.actor(this.sample.roles.enemy??this.sample.exchange([]).fighters.find(f=>f.side==='enemy')!.id), { sprite, hud } = target;
    this.run(scene.focus(target));
    const x = HOME.enemy + 30, y = GROUND - 190, run = (step: Step): void => this.run(step), dir = -1 as const;
    const revive = function* (): Step { yield* wait(0.8); target.dead = false; Object.assign(sprite, { visible: true, alpha: 1, y: GROUND, rotation: 0 }); hud.hp = hud.hpGhost = hud.hpMax; };
    const effects: [string, () => void][] = [
      ['베기', () => slash(show, x, y, -0.7, 480, '#6fc4ff')],
      ['큰 베기', () => slash(show, x, y, -0.14, 1100, '#bfe6ff')],
      ['빛 덩어리', () => burst(show, x, y, 220, '#6fc4ff')],
      ['불티', () => sparks(show, x, y, 22, 360, '#fff3c4')],
      ['집중선', () => impactLines(show, x, y)],
      ['충격파', () => ring(show, x, y, 420, '#bfe6ff')],
      ['화면 번쩍임', () => flash(show, 0.9, 0.4)],
      ['흔들림', () => run(shake(show, 30, 0.5))],
      ['속도선', () => { const lines = speedLines(show, 1); lines.alpha = 1; run((function* (): Step { yield* wait(0.8); yield* tween(lines, { alpha: 0 }, 0.2); lines.remove(); })()); }],
      ['총알 줄기', () => tracer(show, { x: W + 100, y }, { x, y }, '#ffd23f', 0.14)],
      ['타격 글자', () => pop(show, '결', x + 200, y - 120, 200, '#ffffff', '#ff5a1f', 0.4)],
      ['약한 타격 (세기 4)', () => run(scene.hit(target, dir, 4, 0.02))],
      ['보통 타격 (세기 10)', () => run(scene.hit(target, dir, 10, 0.07))],
      ['결정타 (세기 26)', () => run(scene.hit(target, dir, 26, 0.34))],
      ['빗나감', () => { scene.begin(); run(scene.dodge(target, dir)); }],
      ['방어', () => { scene.begin(); run(scene.guard(target, dir, 12)); }],
      ['체력 감소', () => run(drainGauge(show, hud, 'hp', Math.max(0, hud.hp - 900)))],
      ['격파', () => run((function* (): Step { yield* scene.destroy(target, destroyLine); yield* revive(); })())],
    ];
    this.ui.add(Object.assign(new MenuList(effects.map(([name]) => ({ label: name })), index => effects[index][1](), { w: 360, rows: 9, rowHeight: 46 }), { x: W - 390, y: 130 }));
    this.ui.setNavigation({kind:'back',onBack:()=>this.app.pop()});
    this.stage.ui.add(hintBar('↑↓ 선택 · Enter로 효과 실행 · Esc 뒤로'));
  }
}

/** UI 부품 진열. 새 메뉴 화면을 만들 때 여기서 골라 쓴다. */
class KitScreen extends Page {
  enter(): void {
    this.frame('UI 부품', '방향키로 부품 사이를 오갑니다 · Enter 결정 · Esc 뒤로');
    const { stage, ui } = this, add = <T extends Node>(node: T, x: number, y: number): T => stage.ui.add(Object.assign(node, { x, y }));

    // 버튼
    add(windowFrame('버튼', 360, 250), 40, 110);
    ui.add(Object.assign(new Button('전투 개시', () => toast(this, '전투를 시작합니다'), { kind: 'main', w: 300 }), { x: 70, y: 140 }));
    ui.add(Object.assign(new Button('무기 변경', () => toast(this, '무기를 바꿉니다'), { w: 300 }), { x: 70, y: 208 }));
    ui.add(Object.assign(new Button('사용 불가', () => undefined, { w: 300 }), { x: 70, y: 276, enabled: false }));

    // 확인창과 알림
    add(windowFrame('확인창 · 알림', 360, 180), 40, 420);
    ui.add(Object.assign(new Button('덮어쓰기…', () => this.app.push(new ConfirmScreen('1번 칸에 덮어쓸까요?\n이전 기록은 사라집니다.', () => toast(this, '저장했습니다')), 'none'), { w: 300 }), { x: 70, y: 450 }));
    ui.add(Object.assign(new Button('알림 띄우기', () => toast(this, '강화 파츠를 얻었습니다'), { w: 300 }), { x: 70, y: 518 }));

    // 탭과 표
    const text=(s:string)=>s.replace(/\{(\w+)\}/g,(_,key:string)=>term(key));
    const pages: (readonly [string,string])[][]=(this.sample.gallery.kit?.pages??[[['HP','0']],[['파일럿','없음']],[['무기','없음']]]).map(page=>page.map(([name,value])=>[text(name),value] as const));
    add(windowFrame('탭 · 표', 400, 330), 440, 110);
    let table = add(statTable(pages[0], 360), 460, 200);
    ui.add(Object.assign(new Tabs(['기체', '파일럿', '무장'], index => { table.remove(); table = add(statTable(pages[index], 360), 460, 200); }, { w: 360 }), { x: 460, y: 140 }));

    // 게이지
    add(windowFrame('게이지', 400, 140), 440, 460);
    const fighter=this.sample.exchange([]).fighters[0];
    const gauges = hudState({...this.sample.gallery.kit?.gauge??fighter??{name:'견본',pilot:'',hp:1,hpMax:1,en:0,enMax:0},color:COLOR.ally,side:'left'});
    // 정보창은 전투 화면 기준 자리에 그려지므로, 이 진열에서는 창 안으로 옮기고 줄여서 보여 준다.
    Object.assign(stage.ui.add(unitHud(gauges)), { x: 448, y: 470, scale: 0.68 });
    const change = (what: 'hp' | 'en', by: number): void => {
      const max = what === 'hp' ? gauges.hpMax : gauges.enMax, to = Math.max(0, Math.min(max, gauges[what] + by));
      if (by > 0) { gauges[what] = to; gauges[what === 'hp' ? 'hpGhost' : 'enGhost'] = to; this.app.sound.play('confirm', 0.5); } else this.run(drainGauge(this.show, gauges, what, to));
    };
    ui.add(Object.assign(new Button('피해', () => change('hp', -1300), { w: 84, h: 40 }), { x: 460, y: 552 }));
    ui.add(Object.assign(new Button('소모', () => change('en', -20), { w: 84, h: 40 }), { x: 552, y: 552 }));
    ui.add(Object.assign(new Button('회복', () => { change('hp', 9999); change('en', 999); }, { w: 84, h: 40 }), { x: 644, y: 552 }));

    // 메뉴
    add(windowFrame('메뉴 (스크롤)', 380, 550), 870, 110);
    const parts:MenuItem[]=(this.sample.gallery.kit?.parts??this.sample.pack.rules.parts?.map(p=>({label:p.name}))??[]).map(p=>({...p,label:text(p.label)}));
    ui.add(Object.assign(new MenuList(parts, (_i, item) => toast(this, `${item.label} 장착`), { w: 340, rows: 7, rowHeight: 58 }), { x: 890, y: 140 }));
  }
}

class FaceScreen extends Page {
  prepare():Promise<void>|void{const f=this.sample.faces[0];return preloadImages([this.sample.images[this.sample.pack.game.titleArt.background],...portraitImages(f)]);}
  private people?:MenuList;
  private moods?:MenuList;
  /** 좌우로 인물 목록과 표정 목록의 포커스를 옮긴다. 터치로도 두 목록을 직접 고를 수 있다. */
  input(event: InputEvent): void {
    if(event.kind==='action'&&event.action==='left'&&this.people){this.ui.focusOn(this.people);return;}
    if(event.kind==='action'&&event.action==='right'&&this.moods){this.ui.focusOn(this.moods);return;}
    super.input(event);
  }
  enter(): void {
    this.frame('표정', '인물과 표정을 눌러 선택 · ← 인물 / → 표정 · Esc 뒤로');
    const { stage, ui, sample } = this;
    let who = sample.faces[0], bust: Sprite | undefined;
    const names: Record<string, string> = { default: '기본', attack: '공격', smile: '미소', hit: '당황·피격', shock: '경악', serious: '진지',laugh:'웃음',sad:'슬픔',angry:'분노',shy:'부끄러움',normal:'기본' };
    const show = (mood: string): void => {
      bust?.remove();
      const task=preloadImages(portraitImages(who));if(task){this.app.preload(portraitImages(who),()=>show(mood));return;}
      const image = who.faces[mood] ?? who.faces.default;
      // 표정을 바꿔도 자리가 어긋나지 않도록, 잘라 낼 영역은 기본 그림에서 한 번만 구한다.
      bust = new Sprite(who.faces.default, who.square ? 440 : 640).trimToContent();
      bust.image = image;bust.portrait={faces:who.faces,moodSheet:who.moodSheet,crop:{x:0,y:0,w:1,h:1}};bust.mood=mood;
      stage.world.add(Object.assign(bust, { anchorY: 1, x: 880, y: who.square ? 600 : H + 8 }));
    };
    const moods = (): MenuItem[] => keys().map(mood => ({ label: who.moodNames?.[mood] ?? names[mood.toLowerCase()] ?? '추가 표정', value: who.faces[mood]||who.moodSheet?.order.includes(mood) ? '' : '그림 없음', disabled: !who.faces[mood]&&!who.moodSheet?.order.includes(mood) }));
    const keys = (): string[] => [...new Set([...Object.keys(who.faces),...(who.moodSheet?.order??[])])];
    const list = this.moods = new MenuList(moods(), () => undefined, { w: 380, rowHeight: 48, rows: 3, onMove: index => show(keys()[index]) });
    this.people=ui.add(Object.assign(new MenuList(sample.faces.map(f=>({label:f.name})),()=>ui.focusOn(list),{w:380,rows:3,rowHeight:48,onMove:index=>{who=sample.faces[index];list.index=0;list.setItems(moods());show('default');}}),{x:60,y:110}));
    ui.add(Object.assign(list, { x: 60, y: 375 }));
    ui.focusOn(list, true);

    show('default');
  }
}

class SoundScreen extends Page {
  prepare():Promise<void>{return Promise.all([super.prepare(),this.app.sound.ready?.()]).then(()=>undefined);}
  enter(): void {
    this.frame('소리', '↑↓ 선택 · Enter로 듣기 · Esc 뒤로');
    const { sound } = this.app;
    const about: Record<Sfx, string> = {
      'ground-thud':'착지 충격', 'shield-clang':'방벽 반동', whip:'채찍', 'ice-break':'얼음 깨짐',electric:'방전',splash:'물보라',popup:'창 열림',stamp:'도장 타격',
      'cg-cold':'섬뜩한 삽화 · 저음',
      cursor: '메뉴 이동', confirm: '일반 결정', important:'중요 선택', cancel: '취소', deny: '안 됨', text: '대사 글자', whoosh: '화면 전환·돌진', slash: '베기',
      shot: '사격', hit: '타격', heavy: '결정타', explode: '격파', charge: '모으기', flash: '컷인·번쩍임', gauge: '게이지 감소', beam:'빔',missile:'미사일',transform:'변형·합체',servo:'서보',alarm:'경보',levelup:'레벨 업',
    };
    const items: { item: MenuItem; play: () => void }[] = [
      ...SFX_NAMES.map(id => ({ item: { label: about[id], value: sound.hasFile(id) ? '파일' : '합성음' }, play: () => sound.play(id) })),
      ...sound.musicIds().map(id => ({ item: { label: ({title:'타이틀',map:'아군 맵','enemy-phase':'적 턴',battle:'일반 전투',boss:'보스 전투',lastboss:'최종 보스',intermission:'인터미션',comedy:'병맛',tension:'긴장',sad:'슬픔',hope:'반격·희망',victory:'승리',gameover:'패배'} as Record<string,string>)[id]??id, value: '파일' }, play: () => sound.music(id) })),
      { item: { label: '음악 끄기' }, play: () => sound.music(undefined) },
    ];
    this.ui.add(Object.assign(new MenuList(items.map(i => i.item), index => items[index].play(), { w: 520, rows: 8, rowHeight: 52 }), { x: 60, y: 110 }));
    const credits = sound.credits();
    this.stage.ui.add(Object.assign(windowFrame(credits.length ? '소리 팩 크레딧' : '소리 팩', 580, 500), { x: 640, y: 130 }));
    if(credits.length)this.ui.add(Object.assign(new MenuList(credits.map(c=>({label:c.title.length>24?c.title.slice(0,23)+'…':c.title,labelSize:19,description:`${c.credit??c.author} · ${c.license}`})),()=>undefined,{w:550,rows:4,rowHeight:86}),{x:654,y:174}));
    else this.stage.ui.add(Object.assign(label('소리 팩이 없습니다. 효과음은 합성음으로 나옵니다.',19,{color:COLOR.dim,width:520}),{x:664,y:180}));
    const problems = sound.problems();
    if (problems.length) this.stage.ui.add(Object.assign(label(`건너뛴 항목: ${problems.join(', ')}`, 17, { color: COLOR.enemy, width: 530 }), { x: 664, y: 560 }));
  }
}
