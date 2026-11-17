/** 개조 화면과 같은 목록-상세. 가격·판매 가능 수량은 모델에서 받는다. */
import {preloadImages} from '../pack/images';
import {Button,MenuList,Slider,Tabs,label,toast} from '../kit';
import {tween} from '../flow';
import {Screen} from '../screen';
import {term} from '../terms';
import {menuFrame} from './screens';
import type {MenuModel,PartItem} from './model';
import {at,confirm,type MenuLook} from './common';
export class ShopScreen extends Screen {
  constructor(private readonly model:MenuModel,private readonly look:MenuLook={}){super();}
  prepare():Promise<void>|void{return preloadImages([this.look.background]);}
  enter():void {
    const funds=menuFrame(this,{title:'상점',hint:`품목 → 수량 → 확인 · 장착한 ${term('parts')}은 해제한 뒤 판매할 수 있습니다`,background:this.look.background,funds:this.model.funds(),onBack:()=>this.app.pop()})!;
    let selling=false,index=0,goods:PartItem[]=[];
    const description=this.stage.ui.add(at(label('',24,{width:580}),570,230));
    const tabs=this.ui.add(at(new Tabs(['구매','판매'],i=>{selling=i===1;index=0;quantity.value=1;refresh();},{w:600}),550,150));
    const quantity=this.ui.add(at(new Slider('수량',1,1,this.model.shopLimit?.()??99,()=>update(),{w:600}),550,350));
    const total=this.stage.ui.add(at(label('',26,{width:560,weight:900}),570,440));
    const trade=this.ui.add(at(new Button('구매',()=>{
      const p=goods[index];if(!p)return;const count=quantity.value,price=selling?p.sellPrice!:p.price!,sell=selling;
      confirm(this,`${p.name} ×${count}\n${(price*count).toLocaleString()} ${term('funds')}에 ${sell?'판매':'구매'}할까요?`,()=>sell?this.model.sell?.(p.id,count)??false:this.model.buy(p.id,count),`${sell?'판매':'구매'}했습니다`,()=>{refresh();this.run(tween(funds.state,{amount:this.model.funds()},.4));this.app.sound.play('gauge');});
    },{w:600,kind:'main'}),550,540));
    trade.onDenied=()=>toast(this,selling?'판매할 보유 수량이 부족합니다':`${term('funds')}이 부족합니다`);
    const update=():void=>{
      const p=goods[index];description.state.text=p?p.description.replace(/\bEN\b/g,term('en')):selling?'판매할 물건이 없습니다.':'진열된 물건이 없습니다.';
      const price=selling?p?.sellPrice:p?.price;
      total.state.text=p?`${selling?'판매액':'합계'} ${((price??0)*quantity.value).toLocaleString()} ${term('funds')}`:'';
      trade.label=selling?'판매':'구매';trade.enabled=!!p&&(selling?quantity.value<=p.owned&&!!this.model.sell:(price??0)*quantity.value<=this.model.funds());
    };
    const rows=()=>goods.map(p=>({label:p.name,description:`${(selling?p.sellPrice:p.price)?.toLocaleString()} ${term('funds')} · 보유 ${p.owned}개`,labelSize:23}));
    const list=this.ui.add(at(new MenuList([],i=>{index=i;update();this.ui.focusOn(quantity);},{dynamic:true,w:450,rows:6,rowHeight:64,onMove:i=>{index=i;quantity.value=1;update();}}),56,150));
    const refresh=():void=>{goods=selling?(this.model.sellItems?.()??this.model.shop().filter(p=>p.owned>0)):this.model.shop();index=Math.max(0,Math.min(index,goods.length-1));list.setItems(rows());list.index=index;update();};
    this.ui.focusOn(list,true);refresh();tabs.index=0;
  }
}
