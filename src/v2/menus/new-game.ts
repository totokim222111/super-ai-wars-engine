import {touchInput,uiMetrics,largeUi} from '../presentation';
import { preloadImages } from '../pack/images';
import {defaultPlayers} from '../../campaign/player';
import { Button, MenuList, TextField, label, toast } from '../kit';
import { ConfirmScreen } from '../dialogs';
import { Screen } from '../screen';
import { Sprite, type Node } from '../stage';
import { menuFrame } from './screens';
import type { MenuModel, NewGameDraft } from './model';
import { at, temporary, type MenuLook } from './common';

export class NewGameScreen extends Screen {
  private step = 0;
  private draft:NewGameDraft={name:'',preset:0,line:''};
  private get config(){return this.model.playerConfig?.()??defaultPlayers;}
  private get presets(){return this.config.presets;}
  private page: (Node | import('../kit').Widget)[] = [];
  constructor(private readonly model: MenuModel, private readonly start: () => void, private readonly look: MenuLook = {}) { super();this.draft={name:this.config.name.default,preset:0,line:this.config.lines[0].id}; }
  prepare():Promise<void>|void{return preloadImages([this.look.background,...(this.look.portraits??[])]);}
  enter(): void {
    menuFrame(this, { title: '새 게임', hint: touchInput()?'눌러 이름과 타입·계열을 고릅니다':'클릭해 이름과 타입·계열을 고릅니다 · Enter 다음', background: this.look.background, onBack: () => this.back() }); temporary(this, this.look); this.drawPage();
  }
  private back(): void { if (this.step) { this.step--; this.drawPage(); } else this.app.pop(); }
  private drawPage(): void {
    for (const node of this.page) { if ('ui' in node) this.ui.remove(node); else node.remove(); } this.page = [];
    const add = <T extends Node>(node: T): T => { this.page.push(node); return this.stage.ui.add(node); };
    const control = <T extends import('../kit').Widget>(node: T): T => { this.page.push(node); return this.ui.add(node); };
    if (this.step === 0) {
      add(at(label('플레이어 이름',28),320,210));
      const field = control(at(new TextField(this,this.draft.name,name=>{this.draft.name=name;},`이름 (${this.config.name.min}~${this.config.name.max}자)`), 320, 260)); this.ui.focusOn(field, true);
      add(at(label(`지원하는 글자 ${this.config.name.min}~${this.config.name.max}자 · ${touchInput()?'칸을 눌러 입력':'클릭해서 입력 · Enter 다음'}`, 23, { width: 900, align: 'center' }), 640, 380));
    } else if (this.step === 1) {
      const show = (index: number): void => { this.draft.preset = index; description.state.text = this.presets[index].description; art.image = this.look.portraits?.[index]; };
      const art = add(at(new Sprite(this.look.portraits?.[this.draft.preset], 330).trimToContent(), 1010, 380));
      const description = add(at(label(this.presets[this.draft.preset].description, 26, { width: 590 }), 140, largeUi()?392:330));
      const list = control(at(new MenuList(this.presets.map(p => ({ label: p.name })), index => { show(index); this.next(); }, { w: 600, rows: Math.min(6,this.presets.length), rowHeight: 64, onMove: show, tap: 'select' }), 100, 150));
      list.index = this.draft.preset; this.ui.focusOn(list, true);
    } else if (this.step === 2) {
      const art=add(at(new Sprite(this.look.lineImages?.[this.draft.line],350).trimToContent(),1020,390));
      const list=control(at(new MenuList(this.config.lines.map(l=>({label:l.name,labelSize:30,description:l.description})),index=>{this.draft.line=this.config.lines[index].id;this.next();},{w:700,rows:Math.min(3,this.config.lines.length),rowHeight:110,maxHeight:370,tap:'select',onMove:index=>{this.draft.line=this.config.lines[index].id;art.image=this.look.lineImages?.[this.draft.line];}}),60,180));
      list.index=this.config.lines.findIndex(l=>l.id===this.draft.line);this.ui.focusOn(list,true);
    } else {
      add(at(new Sprite(this.look.lineImages?.[this.draft.line],260).trimToContent(),1010,370));add(at(new Sprite(this.look.portraits?.[this.draft.preset],260).trimToContent(),230,370));
      add(at(label(`${this.draft.name} · ${this.presets[this.draft.preset].name} · ${this.config.lines.find(l=>l.id===this.draft.line)!.name.split(' · ')[0]} 계열`, 36, { weight: 900, width: 960, align: 'center' }),640,300));
      const go = control(at(new Button(this.config.startLabel??'시작', () => this.next(), {kind:'main',w:480,h:uiMetrics().button}), 400, 590)); this.ui.focusOn(go, true);
    }
    if (this.step < 3) control(at(new Button('다음', () => this.next(), {kind:'main',w:620,h:uiMetrics().button}), 330, 590));
  }
  private next(): void {
    if (this.step < 3) { this.step++; this.drawPage(); return; }
    this.app.push(new ConfirmScreen(`${this.draft.name} · ${this.presets[this.draft.preset].name}
${this.config.lines.find(l=>l.id===this.draft.line)!.name.split(' · ')[0]} 계열로 시작할까요?`, () => {
      try { this.model.newGame(this.draft); this.start(); } catch (error) { this.step = 0; this.drawPage(); toast(this, String((error as Error).message)); }
    }, {yes:'예',no:'아니오',important:true}), 'none');
  }
}
