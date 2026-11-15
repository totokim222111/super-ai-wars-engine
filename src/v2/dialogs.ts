/**
 * 다른 화면 위에 잠깐 뜨는 화면들.
 * 되돌릴 수 없는 일(덮어쓰기, 구매, 종료) 앞에는 ConfirmScreen을 띄운다.
 */
import { ease, tween } from './flow';
import { Button, label, windowFrame } from './kit';
import { Screen } from './screen';
import { H, W } from './stage';
import { cover } from './ui';

export class ConfirmScreen extends Screen {
  opaque = false;
  /** @param onYes "예"를 골랐을 때. 창은 스스로 닫힌다. */
  constructor(private readonly message: string, private readonly onYes: () => void, private readonly labels: { yes: string; no: string; important?:boolean } = { yes: '예', no: '아니오' }) { super(); }
  enter(): void {
    const { stage, ui } = this, w = 620, h = 250, x = (W - w) / 2, y = (H - h) / 2;
    const dim = stage.ui.add(cover('#020510')); dim.alpha = 0;
    const frame = stage.ui.add(Object.assign(windowFrame('확인', w, h), { x, y: y + 30, alpha: 0 }));
    const text = stage.ui.add(Object.assign(label(this.message, 26, { width: w - 80, align: 'center' }), { x: W / 2, y: y + 62, alpha: 0 }));
    const close = (): void => this.app.pop('none');
    const yes = ui.add(Object.assign(new Button(this.labels.yes, () => { close(); this.onYes(); }, { kind: 'main', w: 220, sound:this.labels.important?'important':'confirm' }), { x: W / 2 - 240, y: y + h - 86 }));
    const no = ui.add(Object.assign(new Button(this.labels.no, close, { w: 220 }), { x: W / 2 + 20, y: y + h - 86 }));
    // 실수로 누르지 않게 "아니오"에서 시작한다.
    ui.focusOn(no, true);
    ui.setNavigation({kind:'close',cancelInContent:true,bounds:{x,y,w,h},onBack:close});
    this.app.sound.play('confirm', 0.5);
    this.run(tween(dim, { alpha: 0.62 }, 0.15));
    for (const node of [frame, text, yes, no]) { node.alpha = 0; this.run(tween(node, { alpha: 1 }, 0.15)); }
    this.run(tween(frame, { y }, 0.2, ease.back));
  }
}
