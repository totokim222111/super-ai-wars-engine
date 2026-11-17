import {describe,it,expect,vi} from 'vitest';
import {Button,MenuList,TextField,type Widget} from '../src/v2/kit';
import {Screen,type App} from '../src/v2/screen';
import {NewGameScreen} from '../src/v2/menus/new-game';
import type {MenuModel} from '../src/v2/menus/model';
import {MapScreen} from '../src/v2/map/screen';
import type {MapModel,ResponsePrompt,UnitView} from '../src/v2/map/model';
import {Board} from '../src/v2/map/board';
class Page extends Screen {enter(){}}
class Headless {
 sound={play(){},music(){}};stack:Screen[]=[];
 get top(){return this.stack.at(-1)!;}
 push(s:Screen){s.app=this as unknown as App;this.stack.push(s);s.enter();}
 pop(){this.stack.pop();this.top?.resume();}
 tick(n=60){for(let i=0;i<n;i++)this.top.update(1/60);}
 action(action:'confirm'|'cancel'|'down'){this.top.input({kind:'action',action});}
}
const widgets=(s:Screen)=>(s.ui as unknown as {widgets:Widget[]}).widgets;
const tap=(s:Screen,x:number,y:number)=>{for(const phase of ['down','up'] as const)s.input({kind:'pointer',phase,x,y});};
const press=(s:Screen,label:string)=>{const b=widgets(s).find(w=>w instanceof Button&&w.label===label)!;expect(b).toBeDefined();tap(s,b.x+b.w/2,b.y+b.h/2);};
const row=(s:Screen,list:MenuList,index:number)=>tap(s,list.x+80,list.y+10+(index+.5)*52);
function page(){const app=new Headless(),screen=new Page();app.push(screen);return{app,screen};}
function canvasText(){const texts:string[]=[];const target:Record<string,unknown>={globalAlpha:1,measureText:(s:string)=>({width:s.length*16}),fillText:(s:string)=>texts.push(String(s)),createLinearGradient:()=>({addColorStop(){}})};const ctx=new Proxy(target,{get:(t,k)=>k in t?t[k as string]:()=>{}}) as unknown as CanvasRenderingContext2D;return{ctx,texts};}
function response(choices=3,noCounter=false){
 const unit=(id:string,team:'ally'|'enemy',col:number):UnitView=>({id,team,cell:{col,row:1},name:id,pilot:id,portrait:{faces:{},crop:{x:0,y:0,w:1,h:1}},hp:1000,hpMax:1000,en:100,enMax:100,heat:100,acted:false});
 const defender=unit('ally','ally',1),attacker=unit('enemy','enemy',2),ids=noCounter?['defend','evade']:Array.from({length:Math.max(0,choices-2)},(_,i)=>'counter:'+i).concat('defend','evade');
 const prompt:ResponsePrompt={attacker,defender,choices:ids.map((id,i)=>({id,label:id==='defend'?'방어':id==='evade'?'회피':'반격 · 아주 긴 무기 이름을 가진 연습용 장거리 장비 '+i,forecast:{attacker:{unitId:'enemy',weapon:'연습포',hit:91-i,damage:900-i*100},defender:{unitId:'ally',weapon:id.startsWith('counter:')?'연습 무기 '+i:undefined,hit:61+i,damage:120+i}}}))};
 let done=false;const respond=vi.fn(()=>{done=true;return[];}),continueTurn=vi.fn(()=>[]);
 const model={cols:5,rows:5,units:()=>[defender,attacker],turn:()=>({team:done?'ally':'enemy',number:done?2:1}),terrainAt:()=>({name:'평지',defense:0,evade:0}),response:()=>done?undefined:prompt,respond,continueTurn} as unknown as MapModel;
 const app=new Headless(),screen=new MapScreen(model);app.push(screen);app.tick();screen.present([{type:'response'}]);app.tick();return{app,screen,prompt,respond,continueTurn};
}
describe('touch selection and response confirmation',()=>{
 it('confirm-selected selects a different row on first tap and confirms only its next tap',()=>{const{screen}=page(),choose=vi.fn();const list=screen.ui.add(new MenuList([{label:'A'},{label:'B'}],choose,{w:300,tap:'confirm-selected'}));row(screen,list,1);expect(list.index).toBe(1);expect(choose).not.toHaveBeenCalled();row(screen,list,1);expect(choose).toHaveBeenCalledWith(1,list.items[1]);});
 it('a hover selects first, so a mouse click confirms immediately',()=>{const{screen}=page(),choose=vi.fn();const list=screen.ui.add(new MenuList([{label:'A'},{label:'B'}],choose,{w:300}));screen.input({kind:'pointer',phase:'move',x:80,y:88});row(screen,list,1);expect(choose).toHaveBeenCalledTimes(1);});
 it('select never confirms from a tap, including repeated taps on the current row',()=>{const{app,screen}=page(),choose=vi.fn();const list=screen.ui.add(new MenuList([{label:'A'},{label:'B'}],choose,{w:300,tap:'select'}));row(screen,list,1);row(screen,list,1);expect(choose).not.toHaveBeenCalled();app.action('confirm');expect(choose).toHaveBeenCalledTimes(1);});
 it('choose confirms a different row with one tap',()=>{const{screen}=page(),choose=vi.fn();const list=screen.ui.add(new MenuList([{label:'A'},{label:'B'}],choose,{w:300,tap:'choose'}));row(screen,list,1);expect(choose).toHaveBeenCalledTimes(1);});
 it('dragging, releasing elsewhere and disabled rows never confirm',()=>{const{screen}=page(),choose=vi.fn();screen.ui.add(new MenuList(Array.from({length:10},(_,i)=>({label:String(i),disabled:i===1})),choose,{w:300,rows:3}));tap(screen,80,126);for(const [phase,y]of [['down',70],['move',10],['up',10]] as const)screen.input({kind:'pointer',phase,x:80,y});screen.input({kind:'pointer',phase:'down',x:80,y:85});screen.input({kind:'pointer',phase:'up',x:80,y:400});screen.input({kind:'pointer',phase:'down',x:80,y:85});screen.input({kind:'pointer',phase:'up',x:500,y:85});expect(choose).not.toHaveBeenCalled();});
 it('new-game type and line taps preserve their step; Next advances and retains the selection',()=>{
  const app=new Headless(),newGame=vi.fn();const model={playerConfig:()=>({name:{default:'여행자',min:1,max:6},presets:[{id:'one',name:'첫째',description:'첫 타입'},{id:'two',name:'둘째',description:'둘째 타입'}],lines:[{id:'first',name:'첫 계열'},{id:'second',name:'둘째 계열'}]}),newGame} as unknown as MenuModel;
  const screen=new NewGameScreen(model,()=>{});app.push(screen);(screen.ui.focus as TextField).accept('여행자');press(screen,'다음');
  const types=screen.ui.focus as MenuList;tap(screen,types.x+80,types.y+10+64*1.5);tap(screen,types.x+80,types.y+10+64*1.5);expect(screen.ui.focus).toBe(types);expect(types.index).toBe(1);press(screen,'다음');
  const lines=screen.ui.focus as MenuList;tap(screen,lines.x+80,lines.y+10+110*1.5);tap(screen,lines.x+80,lines.y+10+110*1.5);expect(screen.ui.focus).toBe(lines);expect(lines.index).toBe(1);expect(newGame).not.toHaveBeenCalled();press(screen,'다음');expect(screen.ui.focus).toBeInstanceOf(Button);
  expect((screen as unknown as {draft:{preset:number;line:string}}).draft.preset).toBe(1);
 });
 it('map cells follow the same select-then-confirm rule',()=>{const{screen}=response();const b=widgets(screen).find(w=>w instanceof Board) as Board;const pick=vi.fn();b.onTap=undefined;b.onPick=pick;vi.spyOn(b,'cellAt').mockReturnValue({col:3,row:3});b.point('down',100,100);b.point('up',100,100);expect(pick).not.toHaveBeenCalled();b.point('down',100,100);b.point('up',100,100);expect(pick).toHaveBeenCalledTimes(1);});
 it('opens with counter forecast, updates the actual painted numbers on selection, and only commits the confirm button',()=>{
  const{app,screen,respond,prompt}=response();let panel=screen.stage.ui.nodes.find(n=>n.z===60)!;let paint=canvasText();panel.draw(paint.ctx);expect(paint.texts).toContain('900');expect(paint.texts).toContain('91%');
  press(screen,'방어');panel=screen.stage.ui.nodes.find(n=>n.z===60)!;paint=canvasText();panel.draw(paint.ctx);expect(paint.texts).toContain(String(prompt.choices[1].forecast.attacker.damage));expect(paint.texts).toContain('90%');expect(respond).not.toHaveBeenCalled();
  app.action('cancel');expect(widgets(screen).some(w=>w instanceof Button&&w.label==='✔ 방어')).toBe(true);expect(respond).not.toHaveBeenCalled();
  // Enter on a response button is also selection only.
  screen.ui.focusOn(widgets(screen).find(w=>w instanceof Button&&w.label==='✔ 방어')!,true);app.action('confirm');app.tick();expect(respond).not.toHaveBeenCalled();press(screen,'대응 확정');app.tick();expect(respond).toHaveBeenCalledExactlyOnceWith('defend');
 });
 it('falls back to the first response when no counter exists',()=>{const{screen}=response(2,true);expect(widgets(screen).some(w=>w instanceof Button&&w.label==='✔ 방어')).toBe(true);});
 it.each([2,3,5,8,11])('keeps %i responses inside two rows, between forecast and hint, with reachable pagination',count=>{
  const{screen,respond}=response(count,count===2);let buttons=widgets(screen).filter((w):w is Button=>w instanceof Button&&w.z===62);for(const b of buttons){expect(b.y).toBeGreaterThanOrEqual(400);expect(b.y+b.h).toBeLessThan(680);expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.w).toBeLessThanOrEqual(1280);}
  const options=buttons.filter(b=>!['대응 확정','◀ 이전','다음 ▶'].includes(b.label));expect(options.length).toBeLessThanOrEqual(8);for(const y of new Set(options.map(b=>b.y)))expect(options.filter(b=>b.y===y).length).toBeLessThanOrEqual(4);
  if(count>8){press(screen,'다음 ▶');expect(widgets(screen).some(w=>w instanceof Button&&w.label==='방어')).toBe(true);expect(respond).not.toHaveBeenCalled();}
 });
});
