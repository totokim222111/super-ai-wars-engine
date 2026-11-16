import{SaveCodeScreen}from'./save-code';
import { preloadImages } from '../pack/images';
import { MenuList,Button,label,toast } from '../kit';
import { ConfirmScreen } from '../dialogs';
import { Screen } from '../screen';
import { menuFrame } from './screens';
import type { MenuModel } from './model';
import { at, notify, type MenuLook } from './common';
export class SaveScreen extends Screen {
  constructor(private readonly model: MenuModel, private readonly mode: 'save' | 'load', private readonly done: () => void = () => {}, private readonly look: MenuLook = {}) { super();this.music=look.music; }
  prepare():Promise<void>|void{return preloadImages([this.look.background]);}
  enter(): void {
    menuFrame(this, { title: this.mode === 'save' ? '저장' : '불러오기', navigation:'close', hint: '칸 선택 · Enter 결정 · Esc 뒤로', background: this.look.background, onBack: () => this.app.pop() });
    const rows = () => this.model.slots().map(s => ({ label: s.label, labelSize: 27, description: s.detail, disabled: this.mode === 'load' && !s.available }));
    const list = this.ui.add(at(new MenuList(rows(), index => {
      const s = this.model.slots()[index];
      this.app.push(new ConfirmScreen(this.mode === 'load' ? `${s.label}의 진행을 불러올까요?` : `${s.label}에 저장할까요?${s.available ? '\n기존 저장을 덮어씁니다.' : ''}`, () => {
        notify(this, this.mode === 'save' ? this.model.save(s.id) : this.model.load(s.id), () => { list.setItems(rows()); if (this.mode === 'load') this.done(); });
      }), 'none');
    }, { w: 1100, rows: 5, rowHeight: 72 }), 90, 190));
    if(this.model.storageNotice)this.stage.ui.add(at(label(this.model.storageNotice,19,{width:1080}),100,148));
    if(this.model.saveCode)this.ui.add(at(new Button('저장 코드 복사',()=>{void this.model.saveCode!().then(async code=>{try{await navigator.clipboard.writeText(code);toast(this,'저장 코드를 복사했습니다.');}catch{this.app.push(new SaveCodeScreen('copy',code),'none');}}).catch(e=>toast(this,String(e instanceof Error?e.message:e)));},{w:440,h:64}),100,584));
    if(this.model.importSaveCode)this.ui.add(at(new Button('저장 코드 붙여넣기',()=>{const open=(code='')=>this.app.push(new SaveCodeScreen('paste',code,async text=>{await this.model.importSaveCode!(text);list.setItems(rows());toast(this,'저장 코드를 가져왔습니다. 슬롯을 골라 불러오세요.');}),'none');try{void navigator.clipboard.readText().then(open).catch(()=>open());}catch{open();}},{w:440,h:64}),560,584));
    if (this.mode === 'load') list.index = Math.max(0, this.model.slots().findIndex(s => s.available));
    if (!this.model.slots().length) toast(this, '저장소가 없습니다');
  }
}
