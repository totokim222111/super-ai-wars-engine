import {it,expect} from 'vitest';
import {Button,MenuList,Ui} from '../src/v2/kit';
import {uiSoundGain,SFX_NAMES} from '../src/v2/sound';
import {Layer} from '../src/v2/stage';
it('ordinary controls click; only explicitly important actions use the old chime',()=>{
 const played:string[]=[],ui=new Ui({stage:{ui:new Layer(0)},app:{sound:{play:(id:string)=>played.push(id)}}} as never);
 const a=ui.add(new Button('設定',()=>{})),b=ui.add(new Button('出撃',()=>{},{sound:'important'}));a.act('confirm');b.act('confirm');
 const list=ui.add(new MenuList([{label:'分岐',sound:'important'}],()=>{},{w:300}));list.act('confirm');expect(played).toEqual(['confirm','important','important']);expect(SFX_NAMES).toContain('important');
 expect(uiSoundGain('confirm')).toBeLessThan(uiSoundGain('hit'));expect(uiSoundGain('cursor')).toBeLessThan(uiSoundGain('shot'));
});
