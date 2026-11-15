import { preloadImages } from '../pack/images';
import { term } from '../terms';
import { Button, MenuList, label, windowFrame } from '../kit';
import { all,tween } from '../flow';
import { Shape } from '../stage';
import { FONT, COLOR } from '../ui';
import { Screen } from '../screen';
import { menuFrame } from './screens';
import type { MenuModel } from './model';
import { at, type MenuLook } from './common';
export class ResultScreen extends Screen {
  constructor(private readonly model: MenuModel, private readonly next: () => void, private readonly look: MenuLook = {}, private readonly title?:()=>void) { super();this.music=look.music; }
  prepare():Promise<void>|void{return preloadImages([this.look.background]);}
  enter(): void {
    const r = this.model.result(),retry=!r.won&&!!this.model.canRetry?.();
    if(r.levels.length)this.app.sound.play('levelup',.7);
    menuFrame(this, { title: r.won ? '스테이지 결과' : '작전 실패', hint: retry?(this.model.retryDescription?.()??'출격 준비로 돌아갑니다.'):'획득 내역을 확인하고 계속합니다', background: this.look.background });
    this.stage.ui.add(at(windowFrame(r.title, 1080, 450), 100, 150));
    const numbers = this.stage.ui.add(at(new Shape({ credits: 0, exp: 0, kills: 0 }, (ctx, s) => {
      const items = [[term('funds'), s.credits], [term('resultExperience'), s.exp], ['격추 수', s.kills]] as const;
      items.forEach(([name, n], i) => { ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = `700 23px ${FONT.body}`; ctx.fillStyle = COLOR.dim; ctx.fillText(name, 0, i * 86); ctx.font = `700 46px ${FONT.num}`; ctx.fillStyle = COLOR.gold; ctx.textAlign = 'right'; ctx.fillText(Math.round(n).toLocaleString(), 370, i * 86); });
    }), 150, 240));
    this.run(tween(numbers.state, { credits: r.credits, exp: r.exp, kills: r.kills }, 1.1));
    this.stage.ui.add(at(label(retry?'레벨 업':`${term('trainingShort')} · ${term('parts')} · 레벨 업`, 23, { weight: 900 }), 650, 200));
    const progress={value:0},earned=retry?[]:r.training??[],rows=()=>[...earned.map(p=>({label:p.name,description:p.clear?`클리어 공통 +${p.clear}`:undefined,value:`+${Math.round(p.amount*progress.value)} ${term('trainingShort')}`,labelSize:22})),...[...(retry?[]:r.parts),...r.levels].map(label=>({label,labelSize:21})),...(!earned.length&&!r.parts.length&&!r.levels.length?[{label:'획득 내역 없음'}]:[])];
    const list=this.ui.add(at(new MenuList(rows(),()=>undefined,{w:470,rows:4,rowHeight:62}),630,250));
    this.run(all(tween(progress,{value:1},1.1),(function*(){while(progress.value<1){list.setItems(rows());yield;}list.setItems(rows());})()));
    const go = this.ui.add(at(new Button(!r.won&&this.model.canRetry?.()?'인터미션으로 돌아가기':'계속', this.next, { kind: 'main', w: 600,h:72 }), 340, 610));
    if(!r.won&&this.title)this.ui.add(at(new Button('타이틀로',this.title,{w:210,h:72,kind:'back'}),960,610));
    this.ui.focusOn(go, true);
  }
}
