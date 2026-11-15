import { preloadImages } from '../pack/images';
import { Slider, Toggle } from '../kit';
import { Screen } from '../screen';
import { menuFrame } from './screens';
import type { MenuModel, MenuSettings } from './model';
import { at, type MenuLook } from './common';
export class SettingsScreen extends Screen {
  constructor(private readonly model: MenuModel, private readonly look: MenuLook = {}) { super(); }
  prepare():Promise<void>|void{return preloadImages([this.look.background]);}
  enter(): void {
    menuFrame(this, { title: '설정', navigation:'close', hint: '좌우 또는 −/+ 누르기 · 설정은 바로 반영됩니다', background: this.look.background, onBack: () => this.app.pop() });
    const s = this.model.settings(), set = (key: keyof MenuSettings, value: number | string | boolean) => { this.model.setSettings({ ...this.model.settings(), [key]: value }); };
    this.ui.add(at(new Slider('효과음', s.sfx, 0, 10, n => set('sfx', n), { w: 960 }), 160, 130));
    this.ui.add(at(new Slider('음악', s.music, 0, 10, n => set('music', n), { w: 960 }), 160, 212));
    this.ui.add(at(new Toggle('전투 연출', s.animation !== 'off', on => set('animation', on ? 'on' : 'off'), 960), 160, 294));
    this.ui.add(at(new Toggle('시네마틱 영상',s.cinematic!==false,on=>set('cinematic',on),960),160,376));
    this.ui.add(at(new Slider('연출 속도', s.speed, 1, 3, n => set('speed', n), { w: 960, format: n => `×${n}` }), 160, 458));
    this.ui.add(at(new Slider('흔들림', s.shake, 0, 10, n => set('shake', n), { w: 960 }), 160, 540));
  }
}
