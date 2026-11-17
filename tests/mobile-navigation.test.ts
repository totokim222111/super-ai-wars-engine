import {inputDevice} from '../src/v2/presentation';
import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {Screen,type App} from '../src/v2/screen';
import {Button,type Widget} from '../src/v2/kit';
import {lockGameViewport} from '../src/v2/viewport';
import {Tooltip} from '../src/v2/tooltip';
import {ConfirmScreen} from '../src/v2/dialogs';

class WindowScreen extends Screen { enter(){} }
const widgets=(s:Screen)=>(s.ui as unknown as {widgets:Widget[]}).widgets;
function setup(){const s=new WindowScreen();s.app={sound:{play(){}}} as unknown as App;return s;}
function tap(s:Screen,w:Widget){for(const phase of ['down','up'] as const)s.input({kind:'pointer',phase,x:w.x+w.w/2,y:w.y+w.h/2});}
describe('local navigation declarations',()=>{
 it.each(['close','back'] as const)('places %s within the window, reserves the corner, and shares keyboard semantics',kind=>{
  inputDevice('touch');const s=setup(),close=vi.fn(),bounds={x:210,y:110,w:800,h:500};s.ui.setNavigation({kind,bounds,onBack:close});
  const list=widgets(s) as Button[],local=list.find(w=>w.label===(kind==='close'?'✕':'뒤로'))!,esc=list.find(w=>w.label==='ESC')!;
  expect(local.x).toBeGreaterThanOrEqual(bounds.x);expect(local.x+local.w).toBeLessThanOrEqual(bounds.x+bounds.w);expect(local.y).toBeGreaterThanOrEqual(bounds.y);expect(local.y+local.h).toBeLessThanOrEqual(bounds.y+bounds.h);
  expect(Math.min(local.w,local.h)*390/720).toBeGreaterThanOrEqual(30);expect(local.y).toBe(kind==='close'?bounds.y+8:bounds.y+bounds.h-local.h-8);
  expect(esc).toBeDefined();
  tap(s,local);s.input({kind:'action',action:'cancel'});expect(close).toHaveBeenCalledTimes(2);inputDevice('mouse');
 });
 it('removes stale targets and hides every return button for mandatory/busy/dialogue states',()=>{const s=setup(),close=vi.fn();s.ui.setNavigation({kind:'back',onBack:close});s.ui.setNavigation({kind:'none'});expect(widgets(s)).toEqual([]);s.input({kind:'action',action:'cancel'});expect(close).not.toHaveBeenCalled();});
 it('has a fallback-only declaration for the idle map',()=>{const s=setup();s.ui.setNavigation({kind:'escape',onBack:()=>{}});expect((widgets(s) as Button[]).map(w=>w.label)).toEqual(['ESC']);});
 it('keeps a tooltip with its selection until its owner hides it, without a close control',()=>{const t=new Tooltip();t.show({title:'첫 항목',lines:['설명']});expect(t.visible).toBe(true);t.show({title:'다음 항목',lines:['다음 설명']});expect(t.state.tip?.title).toBe('다음 항목');t.hide();expect(t.visible).toBe(false);});
 it('uses the existing No button instead of a duplicate X and finishes its fade',()=>{
  const yes=vi.fn(),pop=vi.fn(),s=new ConfirmScreen('돌아갈까요?',yes);s.app={sound:{play(){}},pop} as unknown as App;s.enter();for(let i=0;i<60;i++)s.update(1/60);
  expect((widgets(s) as Button[]).map(w=>w.label)).toEqual(['예','아니오','ESC']);expect(s.ui.focus).toMatchObject({label:'아니오'});
  expect(s.stage.ui.nodes.slice(1).every(n=>n.alpha===1)).toBe(true);tap(s,widgets(s).find(w=>(w as Button).label==='아니오')!);expect(pop).toHaveBeenCalled();expect(yes).not.toHaveBeenCalled();
 });
});
describe('fixed mobile viewport',()=>{
 it('captures overlay gestures and restores only its own panned viewport on return',()=>{
  const viewport=Object.assign(new EventTarget(),{offsetTop:20,offsetLeft:0}),root={scrollTop:25,scrollLeft:3},callbacks:FrameRequestCallback[]=[];
  const view=Object.assign(new EventTarget(),{visualViewport:viewport,scrollX:0,scrollY:25,scrollTo:vi.fn(()=>{view.scrollY=0;viewport.offsetTop=0;}),requestAnimationFrame:(f:FrameRequestCallback)=>{callbacks.push(f);return callbacks.length;},cancelAnimationFrame:vi.fn()});
  const doc=Object.assign(new EventTarget(),{defaultView:view,scrollingElement:root,activeElement:null}),listen=vi.spyOn(doc,'addEventListener'),stop=lockGameViewport(doc as unknown as Document);
  expect(listen).toHaveBeenCalledWith('touchend',expect.any(Function),{capture:true,passive:false});expect(root).toEqual({scrollTop:0,scrollLeft:0});
  for(const type of ['dblclick','gesturechange','gestureend']){const event=new Event(type,{cancelable:true});doc.dispatchEvent(event);expect(event.defaultPrevented).toBe(true);}
  view.scrollY=40;viewport.offsetTop=30;viewport.dispatchEvent(new Event('scroll'));callbacks.shift()!(0);expect(view.scrollY).toBe(0);expect(viewport.offsetTop).toBe(0);stop();
 });
 it('cancels only the default of consecutive touchend; no additional game input is emitted',()=>{
  const doc=new EventTarget(),stop=lockGameViewport(doc as Document);const send=(type:string,time:number)=>{const e=new Event(type,{cancelable:true});Object.defineProperty(e,'timeStamp',{value:time});doc.dispatchEvent(e);return e.defaultPrevented;};
  expect(send('touchend',100)).toBe(false);expect(send('touchend',200)).toBe(true);expect(send('touchend',800)).toBe(false);expect(send('touchmove',900)).toBe(true);expect(send('gesturestart',1000)).toBe(true);stop();expect(send('touchend',1050)).toBe(false);
 });
 it.each(['game.html','v2.html'])('locks the document, canvas and letterbox in %s',name=>{const html=readFileSync(name,'utf8');expect(html).toContain('maximum-scale=1,user-scalable=no');for(const rule of ['position:fixed','inset:0','width:100%','height:100%','overflow:hidden','overscroll-behavior:none','touch-action:none'])expect(html).toContain(rule);expect(html).not.toContain('100dvh');});
});
