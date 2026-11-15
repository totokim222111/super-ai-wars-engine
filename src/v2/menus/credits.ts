import { preloadImages } from '../pack/images';
import { MenuList } from '../kit';
import { Screen } from '../screen';
import { menuFrame } from './screens';
import type { MenuModel } from './model';
import { at, type MenuLook } from './common';
export class CreditsScreen extends Screen {
  constructor(private readonly model: MenuModel, private readonly look: MenuLook = {}, private readonly done?: () => void) { super(); }
  prepare():Promise<void>{return Promise.all([preloadImages([this.look.background]),this.app.sound.ready?.()]).then(()=>undefined);}
  enter(): void {
    menuFrame(this, { title: '크레딧', navigation:'close', hint: this.done?'▲ 이전 / ▼ 다음 또는 끌어서 넘기기 · Esc 타이틀':'▲ 이전 / ▼ 다음 또는 끌어서 넘기기 · Esc 뒤로', background: this.look.background, onBack: () => this.done ? this.done() : this.app.pop() });
    const sounds = this.app.sound.credits().flatMap(c => [
      { label: c.title, description: `${c.credit??c.author} · ${c.license} · ${c.source}`, href: c.source },
      ...(c.licenseUrl ? [{label: c.licenseUrl, labelSize: 20, description: c.modifications ?? '', href: c.licenseUrl}] : c.modifications ? [{label: c.modifications, href: ''}] : []),
    ]);
    const items = [...sounds, ...this.model.credits().map(c => ({ label: c.title, description: c.detail, href: '' })),
      {label:'PLEASE License',description:'프로젝트 라이선스 전문: LICENSE',href:'LICENSE'},
      {label:'THIRD_PARTY_NOTICES.md',description:'제3자 저작물은 원저작자의 라이선스를 따릅니다. 고지 문서를 확인하세요.',href:'THIRD_PARTY_NOTICES.md'},
    ];
    this.ui.add(at(new MenuList(items, i => { const url = items[i]?.href; if(url && (/^https?:\/\//.test(url)||['LICENSE','THIRD_PARTY_NOTICES.md'].includes(url))) window.open(url, '_blank', 'noopener,noreferrer'); }, { w: 1100, rows: 4, rowHeight: 90 }), 90, 190));
  }
}
