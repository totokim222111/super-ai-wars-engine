import { preloadImages } from '../pack/images';
import { MenuList, label } from '../kit';
import { Screen } from '../screen';
import {term} from '../terms';
import { menuFrame } from './screens';
import type { MenuModel } from './model';
import { at, confirm, temporary, type MenuLook } from './common';
export class PartsScreen extends Screen {
  constructor(private readonly model: MenuModel, private readonly look: MenuLook = {}) { super(); }
  prepare():Promise<void>|void{return preloadImages([this.look.background]);}
  enter(): void {
    const { model, ui, stage } = this;
    menuFrame(this, { title: term('parts'), hint: `기체 → 장착 칸 → 보유 ${term('parts')} · Esc 뒤로`, background: this.look.background, onBack: () => this.app.pop() }); temporary(this, this.look);
    let unit = model.partUnits()[0], slot = 0;
    const description = stage.ui.add(at(label('', 22, { width: 580 }), 490, 610));
    const inventory = new MenuList([], index => {
      const parts = model.inventory().filter(p => p.owned > 0), item = index ? parts[index - 1] : null;
      confirm(this, `${unit.name}의 ${slot + 1}번 칸에
${item ? item.name + ' 장착' : '파츠 해제'}할까요?`, () => model.equip(unit.id, slot, item?.id ?? null), '파츠를 변경했습니다', refresh);
    }, { dynamic: true, w: 660, rows: 3, rowHeight: 50, onMove: index => { description.state.text = index ? model.inventory().filter(p => p.owned > 0)[index - 1]?.description ?? '' : '장착한 파츠를 보유 목록으로 돌려놓습니다.'; } });
    const slots = new MenuList([], index => {
      slot = index; const parts = model.inventory().filter(p => p.owned > 0);
      inventory.setItems([{ label: '해제', disabled: !unit.slots[slot] }, ...parts.map(p => ({ label: p.name, value: `×${p.owned}` }))]);
      ui.focusOn(inventory); description.state.text = unit.slots[slot]?.description ?? (parts.length?'보유한 플러그인을 골라 장착합니다':'보유한 플러그인이 없습니다 · 상점에서 살 수 있어요');
    }, { dynamic: true, w: 660, rows: 2, rowHeight: 52 });
    const refresh = (): void => { unit = model.partUnits().find(u => u.id === unit.id)!; slots.setItems(unit.slots.map((p, i) => ({ label: `${i + 1}번 칸`, value: p?.name ?? '비어 있음' }))); inventory.setItems([{ label: '해제', disabled: !unit.slots[slot] }, ...model.inventory().filter(p => p.owned > 0).map(p => ({ label: p.name, value: `×${p.owned}` }))]); };
    const units = model.partUnits();
    ui.add(at(new MenuList(units.map(u => ({ label: u.name })), index => { unit = model.partUnits()[index]; refresh(); ui.focusOn(slots); }, { w: 370, rows: 6, rowHeight: 58, onMove: index => { unit = model.partUnits()[index]; refresh(); } }), 56, 150));
    ui.add(at(slots, 470, 150)); ui.add(at(inventory, 470, 360)); refresh();
  }
}
