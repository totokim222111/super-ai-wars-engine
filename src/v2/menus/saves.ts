import { preloadImages } from '../pack/images';
import { MenuList, toast } from '../kit';
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
    }, { w: 1100, rows: 5, rowHeight: 80 }), 90, 190));
    if (this.mode === 'load') list.index = Math.max(0, this.model.slots().findIndex(s => s.available));
    if (!this.model.slots().length) toast(this, '저장소가 없습니다');
  }
}
