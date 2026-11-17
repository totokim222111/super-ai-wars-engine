import {preloadImages} from '../pack/images';
import {Button,Slider,Toggle,Tabs,label} from '../kit';
import {Screen} from '../screen';
import {menuFrame} from './screens';
import type {MenuModel,MenuSettings} from './model';
import {at,type MenuLook} from './common';
import {setUiSize,uiMetrics,type UiSize} from '../presentation';
export class SettingsScreen extends Screen{
 private page=0;
 constructor(private readonly model:MenuModel,private readonly look:MenuLook={},private readonly replay?:()=>void){super();}
 prepare(){return preloadImages([this.look.background]);}
 enter():void{
  menuFrame(this,{title:'설정',navigation:'close',hint:'←→ 값 조절 · 설정은 바로 반영됩니다',background:this.look.background,onBack:()=>this.app.pop()});
  const s=this.model.settings(),set=(key:keyof MenuSettings,value:number|string|boolean)=>this.model.setSettings({...this.model.settings(),[key]:value});
  this.stage.ui.add(at(label('화면 크기',26,{weight:900}),56,154));
  const sizes=this.ui.add(at(new Tabs(['자동','보통','크게'],i=>{const size=(['auto','normal','large']as UiSize[])[i];set('uiSize',size);setUiSize(size);this.app.replace(new SettingsScreen(this.model,this.look,this.replay),'none');},{w:740,h:uiMetrics().tab}),400,126));sizes.index=['auto','normal','large'].indexOf(s.uiSize??'auto');
  const groups=[
   [()=>new Slider('효과음',s.sfx,0,10,n=>set('sfx',n),{w:550}),()=>new Slider('음악',s.music,0,10,n=>set('music',n),{w:550}),()=>new Toggle('전투 연출',s.animation!=='off',on=>set('animation',on?'on':'off'),550),()=>new Toggle('시네마틱 영상',s.cinematic!==false,on=>set('cinematic',on),550),()=>new Slider('연출 속도',s.speed,1,3,n=>set('speed',n),{w:550,format:n=>`×${n}`}),()=>new Slider('흔들림',s.shake,0,10,n=>set('shake',n),{w:550})],
   [()=>new Slider('번쩍임',s.flash??7,0,10,n=>set('flash',n),{w:550}),()=>{const b=new Toggle('적 턴 전투 · '+(s.enemyBattle==='brief'?'간략':'전체'),s.enemyBattle!=='brief',on=>{set('enemyBattle',on?'full':'brief');b.label='적 턴 전투 · '+(on?'전체':'간략');},550);return b;},()=>new Toggle('조작 안내',s.tutorial!==false,on=>set('tutorial',on),550),()=>new Button('조작 안내 다시 보기',()=>{set('helpSeen',false);set('tutorial',true);this.app.pop();this.replay?.();},{w:550,h:uiMetrics().button})]
  ];
  const widgets:import('../kit').Widget[]=[];
  const show=()=>{for(const w of widgets)this.ui.remove(w);widgets.length=0;groups[this.page].forEach((make,i)=>widgets.push(this.ui.add(at(make(),56+(i%2)*610,246+Math.floor(i/2)*110))));};
  const pages=this.ui.add(at(new Tabs(['소리·연출','표시·조작'],i=>{this.page=i;show();},{w:500,h:uiMetrics().tab}),56,582));pages.index=this.page;show();
 }
}
