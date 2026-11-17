import {preloadImages} from '../pack/images';
import {MenuList,label,windowFrame} from '../kit';
import {Screen} from '../screen';
import {term} from '../terms';
import {menuFrame} from './screens';
import type {MenuModel,PartUnit} from './model';
import {at,confirm,type MenuLook} from './common';
export class PartsScreen extends Screen{
 private refresh?:()=>void;
 constructor(private readonly model:MenuModel,private readonly look:MenuLook={}){super();}
 prepare(){return preloadImages([this.look.background]);}
 resume(){this.refresh?.();}
 enter():void{
  menuFrame(this,{title:term('parts'),hint:'기체 → 장착 칸 → 보유 플러그인',background:this.look.background,onBack:()=>this.app.pop()});
  let unit=this.model.partUnits()[0];
  const description=this.stage.ui.add(at(label('',24,{width:660}),490,510));
  const slots=new MenuList([],i=>{this.app.push(new PartInventoryScreen(this.model,unit,i));},{dynamic:true,w:700,rows:3,rowHeight:100,maxHeight:360,onMove:i=>{description.state.text=unit.slots[i]?.description??'비어 있는 장착 칸입니다.';}});
  this.stage.ui.add(at(windowFrame('장착 플러그인',720,370),470,148));
  this.stage.ui.add(at(windowFrame('보유 플러그인',720,150),470,536));
  const empty=this.stage.ui.add(at(label('',22,{width:580}),490,568));
  const refresh=()=>{unit=this.model.partUnits().find(u=>u.id===unit?.id)??this.model.partUnits()[0];if(unit)slots.setItems(unit.slots.map((p,i)=>({label:`${i+1}번 칸`,value:p?.name??'비어 있음'})));const held=this.model.inventory().filter(p=>p.owned>0);empty.state.text=held.length?`보유 플러그인 (${held.length})`:'보유한 플러그인이 없습니다 · 상점에서 살 수 있어요';};this.refresh=refresh;
  this.ui.add(at(new MenuList(this.model.partUnits().map(u=>({label:u.name})),()=>this.ui.focusOn(slots),{w:370,rows:5,rowHeight:84,maxHeight:470,onMove:i=>{unit=this.model.partUnits()[i];refresh();}}),56,150));this.ui.add(at(slots,480,180));refresh();
 }
}
class PartInventoryScreen extends Screen{
 constructor(private readonly model:MenuModel,private readonly unit:PartUnit,private readonly slot:number){super();}
 enter(){menuFrame(this,{title:'보유 플러그인',hint:'고른 플러그인의 효과를 확인하고 장착합니다',onBack:()=>this.app.pop()});
 const held=this.model.inventory().filter(p=>p.owned>0),items=[{label:'해제',disabled:!this.unit.slots[this.slot]},...held.map(p=>({label:p.name,value:`×${p.owned}`}))];
 const desc=this.stage.ui.add(at(label(held.length?'플러그인을 골라 효과를 확인하세요.':'보유한 플러그인이 없습니다 · 상점에서 살 수 있어요',24,{width:1000}),80,555));
 this.ui.add(at(new MenuList(items,i=>{const item=i?held[i-1]:null;confirm(this,`${this.unit.name}의 ${this.slot+1}번 칸에\n${item?item.name+' 장착':'파츠 해제'}할까요?`,()=>this.model.equip(this.unit.id,this.slot,item?.id??null),'파츠를 변경했습니다',()=>this.app.pop());},{w:1100,rows:3,rowHeight:100,maxHeight:380,onMove:i=>{desc.state.text=i?held[i-1].description:'장착한 파츠를 보유 목록으로 돌려놓습니다.';}}),70,150));
 }
}
