import {describe,it,expect,afterEach} from 'vitest';
import {Button,MenuList,Slider} from '../src/v2/kit';
import {Screen,type App} from '../src/v2/screen';
import {SettingsScreen} from '../src/v2/menus/settings';
import {PartsScreen} from '../src/v2/menus/parts';
import type {MenuModel} from '../src/v2/menus/model';
import {paintOcclusions,clippedText,inconsistentInventoryText,type PaintBox} from '../src/v2/layout-audit';
import {paginateLog,logEntries} from '../src/v2/story/play';
import {inputDevice} from '../src/v2/presentation';
class Empty extends Screen{enter(){}}
function attach<T extends Screen>(s:T):T{s.app={sound:{play(){}},pop(){}} as unknown as App;s.enter();return s;}
function text(s:Screen){const result:string[]=[],values:any={font:'18px sans-serif',globalAlpha:1,measureText:(s:string)=>({width:s.length*10}),createLinearGradient:()=>({addColorStop(){}}),fillText:(s:string)=>result.push(s)};s.stage.render(new Proxy(values,{get:(o,k)=>k in o?o[k]:()=>{}})as CanvasRenderingContext2D,0);return result;}
const box=(id:string,kind:PaintBox['kind'],order:number,other:Partial<PaintBox>={}):PaintBox=>({id,owner:id,kind,order,alpha:1,x:0,y:0,w:100,h:20,...other});
afterEach(()=>inputDevice('mouse'));
describe('restored UI visual regressions',()=>{
 it('detects translucent windows above roster text and preserves correctly ordered windows',()=>{expect(paintOcclusions([box('label','text',1),box('window','panel',2,{alpha:.1})]).violations).toHaveLength(1);expect(paintOcclusions([box('label','text',2),box('window','panel',1)]).violations).toEqual([]);});
 it('detects a hint line across text even when drawn first',()=>{expect(paintOcclusions([box('line','line',1,{y:8,h:2,owner:'hint'}),box('hint','text',2,{owner:'hint'})]).violations).toHaveLength(1);});
 it('protects illustration regions and requires documented overlay exceptions',()=>{const image=box('mech','image',1,{h:200,protected:[{name:'body',x:30,y:50,w:40,h:100}]}),cover=box('stats','panel',2,{x:40,h:180});expect(paintOcclusions([image,cover]).violations).toHaveLength(1);const r=paintOcclusions([image,cover],[{id:'intentional-cut-in',reason:'Intentional cinematic overlay.',allows:()=>true}]);expect(r.violations).toEqual([]);expect(r.allowed).toHaveLength(1);});
 it('rejects partially clipped rows while ignoring fully hidden off-page text',()=>{const a=box('last','text',1,{y:600,h:20,clip:{x:0,y:0,w:100,h:610}});expect(clippedText([a])).toHaveLength(1);expect(clippedText([{...a,y:620}])).toEqual([]);});
 it('checks the empty inventory claim against owned quantity',()=>{expect(inconsistentInventoryText(['보유한 플러그인이 없습니다 · 상점에서 살 수 있어요'],2)).toBe(true);expect(inconsistentInventoryText(['보유한 플러그인이 없습니다'],0)).toBe(false);});
 it('pages whole utterances and retains every line of long utterances',()=>{const entries=logEntries(Array.from({length:35},(_,i)=>`인물${i}: 한줄${i}`)),pages=paginateLog(entries,t=>[t]);expect(pages.flat().map(e=>e.lines[0])).toEqual(entries.map(e=>e.text));expect(pages.every(p=>p.reduce((h,e)=>h+e.lines.length*24+14,0)-14<=452)).toBe(true);expect(paginateLog([{speaker:'인물',text:'긴말'}],()=>Array.from({length:40},(_,i)=>String(i))).flatMap(p=>p.flatMap(e=>e.lines))).toHaveLength(40);});
 it('skips all-disabled lists when assigning initial keyboard focus',()=>{const s=attach(new Empty()),list=s.ui.add(new MenuList([{label:'빈 칸',disabled:true}],()=>{},{w:300})),button=s.ui.add(new Button('붙여넣기',()=>{}));expect(s.ui.focus).toBe(button);expect(list.focused).toBe(false);});
 it('starts settings with exactly one active focus on its first control',()=>{const m={settings:()=>({sfx:8,music:6,speed:1,shake:10,animation:'on'}),setSettings(){}} as unknown as MenuModel,s=attach(new SettingsScreen(m));expect(s.ui.focus).toBeInstanceOf(Slider);expect((s.ui.focus as Slider).label).toBe('효과음');expect((s.ui as any).widgets.filter((w:any)=>w.focused)).toHaveLength(1);});
 it('updates the inventory message on immediate slot selection and retains the unit marker',()=>{inputDevice('touch');const m={partUnits:()=>[{id:'unit',name:'기체',slots:[null,null]}],inventory:()=>[{id:'one',name:'부품',description:'설명',owned:2}],equip:()=>true} as unknown as MenuModel,s=attach(new PartsScreen(m)),slot=(s.ui as any).widgets.find((w:any)=>w instanceof MenuList&&w.x===470&&w.y===150);slot.act('confirm');const labels=text(s);expect(labels).toContain('보유한 플러그인을 골라 장착합니다');expect(labels.some(t=>t.includes('플러그인이 없습니다'))).toBe(false);});
});
