import {describe,it,expect,afterEach} from 'vitest';
import {MenuList,Button,Tabs} from '../src/v2/kit';
import {densityRegressions,UI_LIMITS,layoutGaps,layoutSizes} from '../src/v2/layout-audit';
import {resolveUiSize,setUiSize,inputDevice} from '../src/v2/presentation';
afterEach(()=>inputDevice('mouse'));
describe('alpha density with beta interaction contracts',()=>{
 it('has one layout regardless of legacy storage, touch or scale',()=>{for(const setting of ['auto','normal','large']as const){setUiSize(setting);expect(resolveUiSize(setting,true,.4)).toBe('normal');expect(resolveUiSize(setting,false,1)).toBe('normal');}});
 it('never collapses a six-weapon list to one row because of available height',()=>{const rows=Array.from({length:6},(_,i)=>({label:'무기 '+i}));const list=new MenuList(rows,()=>{},{w:760,rows:6,rowHeight:68,maxHeight:100});expect(list.visibleItems()).toHaveLength(6);expect(list.h).toBe(428);});
 it('keeps alpha button and tab dimensions instead of imposing beta minimums',()=>{expect(new Button('뒤로',()=>{},{h:32}).h).toBe(32);expect(new Tabs(['정보','육성'],()=>{},{w:300,h:40}).h).toBe(40);const list=new MenuList([{label:'a'}],()=>{},{w:400,rowHeight:52});expect((list as unknown as {rowHeight:number}).rowHeight).toBe(52);expect(UI_LIMITS.buttonHeight).toBe(26);expect(layoutGaps([])).toEqual([]);expect(layoutSizes([])).toEqual([]);});
 it('fails any density loss or missing screen block while allowing more visible items',()=>{const alpha={'mobile/weapons':{items:6},'pc/training':{stats:6}},current={'mobile/weapons':{items:5}};expect(densityRegressions(alpha,current)).toEqual([{screen:'mobile/weapons',block:'items',expected:6,actual:5},{screen:'pc/training',block:'stats',expected:6,actual:0}]);expect(densityRegressions(alpha,{'mobile/weapons':{items:6},'pc/training':{stats:7}})).toEqual([]);});
});
