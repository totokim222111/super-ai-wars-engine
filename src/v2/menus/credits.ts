import {Button} from '../kit';
import {Shape} from '../stage';
import {panel,COLOR,FONT,wrap} from '../ui';
import {uiMetrics} from '../presentation';
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
    const sounds=this.app.sound.credits().map(c=>({label:c.title,descriptionOffset:6,description:`${c.credit??c.author} · ${c.license} · ${(()=>{try{return new URL(c.source).hostname}catch{return c.source}})()}`,href:c.source}));
    const items = [...sounds, ...this.model.credits().map(c => ({ label: c.title, description: c.detail, href: '' })),
      {label:'PLEASE License',description:'프로젝트 라이선스 전문: LICENSE',href:'LICENSE'},
      {label:'THIRD_PARTY_NOTICES.md',description:'제3자 저작물은 원저작자의 라이선스를 따릅니다. 고지 문서를 확인하세요.',href:'THIRD_PARTY_NOTICES.md'},
    ];
    this.ui.add(at(new MenuList(items, i => { const url = items[i]?.href; if(url && (/^https?:\/\//.test(url)||['LICENSE','THIRD_PARTY_NOTICES.md'].includes(url))) window.open(url, '_blank', 'noopener,noreferrer'); }, { w: 1100, rows: 4, rowHeight: 90 }), 90, 190));
  }
}

export interface DisplayCredit {
    group: string;
    title: string;
    author: string;
    license: string;
    source: string;
    licenseUrl?: string;
}
export function displayCredits(sounds: {
    kind: string;
    title: string;
    author: string;
    credit?: string;
    license: string;
    source: string;
    licenseUrl?: string;
}[], project: {
    title: string;
    detail: string;
}[]): DisplayCredit[] {
    return [...sounds.map(c => ({ group: c.kind === 'bgm' ? '음악' : '효과음', title: c.title, author: c.credit ?? c.author, license: c.license, source: c.source, licenseUrl: c.licenseUrl })), ...project.map(c => ({ group: '그림·글꼴·프로젝트', title: c.title, author: c.detail, license: '', source: '' }))];
}

/** Full source URLs remain reachable without crowding the overview. */
export class CreditSourcesScreen extends Screen {
    constructor(private readonly entries: DisplayCredit[]) { super(); }
    enter(): void {
        menuFrame(this, { title: '출처·라이선스', navigation: 'back', hint: '↑↓ 선택 · Enter 결정 · Esc 뒤로', onBack: () => this.app.pop() });
        const rows = this.entries.filter(e => e.source), current = { index: 0 };
        let license: Button | undefined;
        const select = (i: number) => { current.index = i; if (license)
            license.enabled = !!rows[i]?.licenseUrl; };
        this.ui.add(at(new MenuList(rows.map(e => ({ label: e.title, labelSize: 24 })), select, { w: 500, rows: 4, rowHeight: 84, maxHeight: 450, onMove: select }), 40, 150));
        this.stage.ui.add(new Shape({}, ctx => { panel(ctx, 570, 150, 670, 460); const row = rows[current.index]; if (!row)
            return; ctx.fillStyle = COLOR.ink; ctx.font = `700 24px ${FONT.body}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; let y = 178; for (const value of [row.title, row.author, row.license, row.source, row.licenseUrl ?? '']) {
            for (const line of wrap(ctx, value, 620)) {
                if (y > 500)
                    break;
                ctx.fillText(line, 594, y, 620);
                y += 31;
            }
            y += 10;
        } }));
        const link = (license = false) => { const row = rows[current.index], url = license ? row?.licenseUrl : row?.source; if (url && /^https?:\/\//.test(url))
            globalThis.open?.(url, '_blank', 'noopener,noreferrer'); };
        this.ui.add(at(new Button('출처 열기', () => link(), { w: 260, h: uiMetrics().button }), 580, 524));
        license = this.ui.add(at(new Button('라이선스 열기', () => link(true), { w: 260, h: uiMetrics().button }), 880, 524));
        license.enabled = !!rows[0]?.licenseUrl;
    }
}
