import { preloadImages } from '../pack/images';
import { Slider, Toggle, Button, label, type Widget } from '../kit';
import { Screen } from '../screen';
import { menuFrame } from './screens';
import type { MenuModel, MenuSettings } from './model';
import { at, type MenuLook } from './common';
export class SettingsScreen extends Screen {
  constructor(private readonly model: MenuModel, private readonly look: MenuLook = {},private readonly replay?:()=>void) { super(); }
  prepare():Promise<void>|void{return preloadImages([this.look.background]);}
  enter(): void {
    menuFrame(this, { title: '설정', navigation:'close', hint: '좌우 또는 −/+ 누르기 · 설정은 바로 반영됩니다', background: this.look.background, onBack: () => this.app.pop() });
    const s = this.model.settings(), set = (key: keyof MenuSettings, value: number | string | boolean) => { this.model.setSettings({ ...this.model.settings(), [key]: value }); };
    const controls:Widget[]=[new Slider('효과음',s.sfx,0,10,n=>set('sfx',n),{w:960}),new Slider('음악',s.music,0,10,n=>set('music',n),{w:960}),new Toggle('전투 연출',s.animation!=='off',on=>set('animation',on?'on':'off'),960),new Toggle('시네마틱 영상',s.cinematic!==false,on=>set('cinematic',on),960),new Slider('연출 속도',s.speed,1,3,n=>set('speed',n),{w:960,format:n=>`×${n}`}),new Slider('흔들림',s.shake,0,10,n=>set('shake',n),{w:960}),new Slider('번쩍임',s.flash??7,0,10,n=>set('flash',n),{w:960}),new Toggle('적 턴 전투',s.enemyBattle!=='brief',on=>set('enemyBattle',on?'full':'brief'),960),new Toggle('조작 안내',s.tutorial!==false,on=>set('tutorial',on),960),new Button('조작 안내 다시 보기',()=>{set('helpSeen',false);set('tutorial',true);this.app.pop();this.replay?.();},{w:960,h:64})];
    let page=0;const shown:Widget[]=[];
    const counter=this.stage.ui.add(at(label('',18,{align:'center'}),640,638));
    const previous=this.ui.add(at(new Button('▲ 이전',()=>show(page-1),{w:160,h:44}),160,618));
    const next=this.ui.add(at(new Button('다음 ▼',()=>show(page+1),{w:160,h:44}),960,618));
    const show=(to:number)=>{for(const w of shown)this.ui.remove(w);shown.length=0;page=Math.max(0,Math.min(Math.ceil(controls.length/6)-1,to));controls.slice(page*6,page*6+6).forEach((w,i)=>{this.ui.add(at(w,160,130+i*82));shown.push(w);});previous.enabled=page>0;next.enabled=page+1<Math.ceil(controls.length/6);counter.state.text=`${page*6+1}–${Math.min(controls.length,page*6+6)} / ${controls.length}`;if(shown[0])this.ui.focusOn(shown[0],true);};
    show(0);

  }
}
