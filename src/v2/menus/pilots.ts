/** 파일럿 목록-상세. 육성의 비용·다음 값·기술 효과는 모델에서 받는다. */
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
import {at,temporary,type MenuLook} from './common';
export class PilotScreen extends Screen {
  private refresh?:()=>void;
  constructor(private readonly model:MenuModel,private readonly look:MenuLook={}){super();}
  prepare():Promise<void>|void{return preloadImages([this.look.background,...this.model.pilots().slice(0,6).flatMap(p=>portraitImages(p.portrait))]);}
  resume():void{this.refresh?.();}
  enter():void {
    menuFrame(this,{title:'파일럿',hint:`파일럿 → 정보 / 육성 · 확정 전에 취소하면 ${term('trainingShort')}을 쓰지 않습니다`,background:this.look.background,onBack:()=>this.app.pop()});temporary(this,this.look);
    let index=0,training=false,skills=false;
    const name=this.stage.ui.add(at(label('',28,{weight:900,width:680}),480,145));
    const points=this.stage.ui.add(at(label('',25,{color:COLOR.gold,align:'right'}),1190,195));
    const tabs=this.ui.add(at(new Tabs(['정보','육성'],i=>{training=!!i;render();},{w:320}),480,195));
    const sub=this.ui.add(at(new Tabs(['능력치','기술'],i=>{skills=!!i;render();},{w:710}),480,252));
    let nodes:Node[]=[],widgets:Widget[]=[];
    const render=():void=>{
      for(const n of nodes)n.remove();for(const w of widgets)this.ui.remove(w);nodes=[];widgets=[];
      const p=this.model.pilots()[index];if(!p)return;
      name.state.text=`${p.name} · Lv ${p.level}`;
      const info=this.model.training?.(p.id);points.state.text=training?`${term('trainingShort')} ${(info?.points??0).toLocaleString()}`:'';sub.visible=training;
      if(!training){
        nodes.push(this.stage.ui.add(at(statTable(p.stats,680,30),480,280)));
        const details=this.ui.add(at(new MenuList([...p.spirits,...p.skills].map(label=>({label})),()=>undefined,{w:710,rows:2,rowHeight:46}),480,490));widgets.push(details);return;
      }
      if(!info){nodes.push(this.stage.ui.add(at(label('이 팩에는 육성 자료가 없습니다.',24),490,330)));return;}
      if(skills){
        const rows=info.skills.map(s=>({label:`${s.name} · Lv ${s.level}`,description:`${s.description}${s.cost===undefined?' · 최대':` · 다음 ${s.cost} ${term('trainingShort')}`}`,labelSize:22}));
        const list=this.ui.add(at(new MenuList(rows,i=>{
          const s=info.skills[i];if(s.cost===undefined||s.cost>info.points){this.app.sound.play('deny');toast(this,s.cost===undefined?'이미 최고 단계입니다':`${term('training')}가 부족합니다`);return;}
          this.app.push(new ConfirmScreen(`${s.name} Lv ${s.level} → ${s.next}\n${s.cost} ${term('trainingShort')}을 쓸까요?`,()=>{const ok=this.model.learn?.(p.id,s.id);this.app.sound.play(ok?'levelup':'deny');toast(this,ok?'기술을 익혔습니다':'기술을 익히지 못했습니다');render();}),'none');
        },{w:710,rows:4,rowHeight:68}),480,320));widgets.push(list);return;
      }
      info.stats.forEach((s,i)=>{
        const y=328+i*Math.min(47,260/Math.max(1,info.stats.length));
        nodes.push(this.stage.ui.add(at(label(s.label,25),490,y)));
        const value=this.stage.ui.add(at(label(`${Number(s.value.toFixed(2))}`,26,{weight:900,color:COLOR.gold}),685,y));nodes.push(value);
        nodes.push(this.stage.ui.add(at(label(s.cost===undefined?'최대':`${s.cost} ${term('trainingShort')}`,22,{align:'right'}),1080,y)));
        const plus=this.ui.add(at(new Button('+',()=>{
          value.state.text=`${Number(s.value.toFixed(2))} → ${Number(s.next!.toFixed(2))}`;
          this.app.push(new ConfirmScreen(`${p.name} · ${s.label} ${Number(s.value.toFixed(2))} → ${Number(s.next!.toFixed(2))}\n${s.cost} ${term('trainingShort')}을 쓸까요?`,()=>{const ok=this.model.train?.(p.id,s.id);this.app.sound.play(ok?'gauge':'deny');toast(this,ok?`${s.label} +${Number((s.next!-s.value).toFixed(2))}`:'육성하지 못했습니다');render();}),'none');
        },{w:70,h:42}),1115,y-14));
        plus.enabled=s.cost!==undefined&&s.cost<=info.points;plus.onDenied=()=>toast(this,s.cost===undefined?'이미 최고 단계입니다':`${term('training')}가 부족합니다`);widgets.push(plus);
      });
    };
    this.refresh=render;
    const pilots=this.model.pilots();
    const show=(i:number):void=>{index=i;const images=pilots.slice(i,i+6).flatMap(p=>portraitImages(p.portrait));if(preloadImages(images))this.app.preload(images,render);else render();};
    const list=this.ui.add(at(new MenuList(pilots.map(p=>({label:p.name,value:`Lv ${p.level}`,portrait:p.portrait})),()=>this.ui.focusOn(tabs),{w:370,rows:6,rowHeight:60,onMove:show}),56,150));
    this.ui.focusOn(list,true);show(0);
  }
}
