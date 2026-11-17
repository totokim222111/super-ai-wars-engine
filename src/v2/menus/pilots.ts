import {uiMetrics,largeUi} from '../presentation';
import {preloadImages} from '../pack/images';
import {portraitImages} from '../portrait';
import {Button,MenuList,Tabs,label,statTable,toast,type Widget} from '../kit';
import {Screen} from '../screen';
import type {Node} from '../stage';
import {COLOR} from '../ui';
import {term} from '../terms';
import {ConfirmScreen} from '../dialogs';
import {menuFrame} from './screens';
import type {MenuModel} from './model';
import {at,type MenuLook} from './common';
export class PilotScreen extends Screen{
 private refresh?:()=>void;
 constructor(private readonly model:MenuModel,private readonly look:MenuLook={}){super();}
 prepare(){return preloadImages([this.look.background,...this.model.pilots().slice(0,6).flatMap(p=>portraitImages(p.portrait))]);}
 resume(){this.refresh?.();}
 enter():void{
  menuFrame(this,{title:'파일럿 육성',hint:'←→ 목록 이동 · 확정 전에 −로 되돌릴 수 있습니다',background:this.look.background,onBack:()=>this.app.pop()});
  let index=0,training=false,skills=false,page=0,pending=new Set<string>();
  const name=this.stage.ui.add(at(label('',24,{weight:900,width:720}),460,126));
  const points=this.stage.ui.add(at(label('',24,{color:COLOR.gold,width:700}),460,232));
  const tabs=this.ui.add(at(new Tabs(['정보','육성'],i=>{training=!!i;pending.clear();page=0;render();},{w:320}),460,168));
  const sub=this.ui.add(at(new Tabs(['능력치','기술'],i=>{skills=!!i;pending.clear();page=0;render();},{w:380}),460,largeUi()?268:244));
  let nodes:Node[]=[],widgets:Widget[]=[];
  const render=()=>{
   for(const n of nodes)n.remove();for(const w of widgets)this.ui.remove(w);nodes=[];widgets=[];
   const p=this.model.pilots()[index];if(!p)return;name.state.text=`${p.name} · Lv ${p.level}`;const info=this.model.training?.(p.id);sub.visible=training;sub.h=largeUi()?68:56;
   name.state.text=`${p.name} · Lv ${p.level}`+(training?` · 보유 ${term('trainingShort')} ${info?.points??0}`:'');points.state.text='';
   if(!training){nodes.push(this.stage.ui.add(at(statTable(p.stats,720,44),460,288)));widgets.push(this.ui.add(at(new MenuList([...p.spirits,...p.skills].map(label=>({label})),()=>undefined,{w:720,rows:2,rowHeight:84,maxHeight:180}),460,484)));return;}
   if(!info){nodes.push(this.stage.ui.add(at(label('이 팩에는 육성 자료가 없습니다.',24),460,310)));return;}
   if(skills){widgets.push(this.ui.add(at(new MenuList(info.skills.map(s=>({label:`${s.name} · Lv ${s.level}`,description:s.description,labelSize:24,value:s.cost===undefined?'최대':`${s.cost} ${term('trainingShort')}`,disabled:s.cost===undefined||s.cost>info.points})),i=>{const s=info.skills[i];if(s.cost===undefined)return;this.app.push(new ConfirmScreen(`${s.name} Lv ${s.level} → ${s.next}\n${s.cost} ${term('trainingShort')}을 쓸까요?`,()=>{const ok=this.model.learn?.(p.id,s.id);toast(this,ok?'기술을 익혔습니다':'기술을 익히지 못했습니다');render();}),'none');},{w:720,rows:3,rowHeight:100,maxHeight:330}),460,largeUi()?352:308)));return;}
   const per=largeUi()?2:3,count=Math.ceil(info.stats.length/per);page=Math.min(page,Math.max(0,count-1));
   if(count>1){widgets.push(this.ui.add(at(new Button('▲',()=>{page=(page+count-1)%count;render();},{w:84,h:68}),1000,86)));widgets.push(this.ui.add(at(new Button('▼',()=>{page=(page+1)%count;render();},{w:84,h:68}),1100,86)));}
   const cost=()=>info.stats.filter(s=>pending.has(s.id)).reduce((n,s)=>n+(s.cost??0),0);
   info.stats.slice(page*per,(page+1)*per).forEach((s,i)=>{const y=(largeUi()?356:320)+i*102,chosen=pending.has(s.id),value=chosen?s.next:s.value;
    nodes.push(this.stage.ui.add(at(label(`${s.label}  ${Number(s.value.toFixed(2))} → ${Number((value??s.value).toFixed(2))}`,26,{weight:900,width:480}),470,y+8)));
    nodes.push(this.stage.ui.add(at(label(s.cost===undefined?'최대':`${s.cost} ${term('trainingShort')}`,21,{color:COLOR.dim}),470,y+49)));
    const minus=this.ui.add(at(new Button('−',()=>{pending.delete(s.id);render();},{w:84,h:84}),990,y));minus.enabled=chosen;widgets.push(minus);
    const plus=this.ui.add(at(new Button('+',()=>{pending.add(s.id);render();},{w:84,h:84}),1090,y));plus.enabled=!chosen&&s.cost!==undefined&&cost()+s.cost<=info.points;widgets.push(plus);
   });
   const commit=this.ui.add(at(new Button('육성 확정'+` · ${cost()} ${term('trainingShort')}`,()=>{this.app.push(new ConfirmScreen(`${cost()} ${term('trainingShort')}을 쓸까요?`,()=>{for(const id of pending)this.model.train?.(p.id,id);pending.clear();this.app.sound.play('gauge');render();}),'none');},{w:580,h:uiMetrics().button,kind:'main'}),460,largeUi()?624:596));commit.enabled=pending.size>0;widgets.push(commit);
  };
  this.refresh=render;this.ui.onCancel=()=>{if(pending.size){pending.clear();render();}else this.app.pop();};
  const pilots=this.model.pilots(),show=(i:number)=>{index=i;pending.clear();page=0;render();};
  const list=this.ui.add(at(new MenuList(pilots.map(p=>({label:p.name,value:`Lv ${p.level}`,portrait:p.portrait})),()=>this.ui.focusOn(tabs),{w:370,rows:5,rowHeight:84,maxHeight:470,onMove:show}),56,150));this.ui.focusOn(list,true);show(0);
 }
}
