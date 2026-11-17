import {describe,it,expect,vi} from 'vitest';
import {apply,snapshot,restore,availableActions,spiritProblem,createBattle} from '../src/core';
import {m6} from './core/m6-helpers';
import {CoreMap,type MapLookup} from '../src/v2/adapter/map';
import {MapScreen} from '../src/v2/map/screen';
import {Board} from '../src/v2/map/board';
import {UnitDetailsScreen,RosterScreen} from '../src/v2/map/details';
import {Button,MenuList,type Widget} from '../src/v2/kit';
import {Screen,type App} from '../src/v2/screen';
import {applyRules,runtime,storeRuntime} from '../src/v2/rules/runtime';
import {emptyConfig,CONFIG,THIRD} from '../src/v2/rules/config';
const lookup:MapLookup={unit:()=>({}),spirit:d=>({name:d.name,kind:'focus'}),battle:{mech:()=>({height:335,faces:'left'}),pilot:()=>({portrait:{faces:{},crop:{x:0,y:0,w:1,h:1}}}),weapon:()=>({anim:{template:'heavy-shot'}})}};
class Headless{
 sound={play(){},music(){}};stack:Screen[]=[];get top(){return this.stack.at(-1)!;}
 push(s:Screen){s.app=this as unknown as App;this.stack.push(s);s.enter();}pop(){this.stack.pop();this.top?.resume();}
 action(action:'confirm'|'cancel'|'up'|'down'|'left'|'right'|'menu'){this.top.input({kind:'action',action});}tick(n=30){for(let i=0;i<n;i++)this.top?.update(1/60);}
}
function state(allow?:boolean){const s=m6();s.content.options=allow===undefined?undefined:{spiritAfterAction:allow};s.content.spirits!.push({id:'scan',name:'정찰',sp:10,duration:'instant',target:'enemy',effects:[{type:'scan'}],desc:'정보 공개'});s.content.pilots[0].spirits!.push({id:'scan',level:1});return s;}
const widgets=(s:Screen)=>(s.ui as unknown as {widgets:Widget[]}).widgets;
const mode=(s:MapScreen)=>(s as unknown as {mode:{kind:string;choiceId?:string}}).mode.kind;
function setup(s=state()){const model=new CoreMap(s,lookup),app=new Headless(),screen=new MapScreen(model,{objectives:{win:['적 격파'],lose:['아군 격파']} as never,battle:()=>({animation:'off',speed:10,shake:0})});app.push(screen);app.tick(120);const board=widgets(screen).find(w=>w instanceof Board) as Board;return{model,app,screen,board};}
function tap(screen:Screen,x:number,y:number){for(const phase of ['down','up'] as const)screen.input({kind:'pointer',phase,x,y});}
function choose(screen:Screen,label:string){const list=screen.ui.focus as MenuList;expect(list).toBeInstanceOf(MenuList);const i=list.items.findIndex(i=>i.label===label);expect(i).toBeGreaterThanOrEqual(0);list.index=i;list.act('confirm');}
function button(screen:Screen,label:string){const b=widgets(screen).find(w=>w instanceof Button&&w.label===label)!;tap(screen,b.x+b.w/2,b.y+b.h/2);}
function paint(screen:Screen){const texts:string[]=[],values:Record<string,unknown>={globalAlpha:1,measureText:(s:string)=>({width:s.length*14}),fillText:(s:string)=>texts.push(String(s)),createLinearGradient:()=>({addColorStop(){}})};const ctx=new Proxy(values,{get:(t,k)=>k in t?t[k as string]:()=>{}}) as unknown as CanvasRenderingContext2D;screen.stage.render(ctx,0);return texts;}

describe('map commands and information rules',()=>{
 it.each([undefined,false,true])('uses spiritAfterAction=%s in the reducer, actions and adapter menu',allow=>{
  const s=state(allow);s.units[0].acted=true;const before=snapshot(s),m=new CoreMap(s,lookup),commands=m.commands('p1',{col:1,row:2});
  expect(commands.filter(c=>!c.disabled).map(c=>c.id)).toEqual(allow?['spirit','inspect']:['inspect']);
  expect(availableActions(s,'p1').some(c=>c.type==='spirit')).toBe(!!allow);expect(!spiritProblem(s,'p1','scan','e1')).toBe(!!allow);
  if(allow)expect(m.cast('p1','scan','e1').length).toBeGreaterThan(0);else expect(()=>m.cast('p1','scan','e1')).toThrow();expect(snapshot(s)).toBe(before);
 });
 it('scan has unlimited range, costs only SP, reveals neutral/third units and survives restore',()=>{
  const s=state();s.units[1].side='neutral';s.units[1].x=7;s.units[1].y=5;s.units[3].tags=[THIRD];
  const m=new CoreMap(s,lookup);expect(m.spiritTargets('p1','scan')).toEqual(expect.arrayContaining(['e1','e2']));const rng=m.state().rng,sp=m.state().units[0].sp;
  m.cast('p1','scan','e1');expect(m.details('e1').known).toBe(true);expect(m.state().units[0]).toMatchObject({acted:false,moved:false,sp:sp-10});expect(m.state().rng).toBe(rng);
  expect(()=>m.cast('p1','scan','p2')).toThrow();const loaded=new CoreMap(restore(s.content,s.stage,m.save()),lookup);expect(loaded.details('e1').known).toBe(true);
  expect(createBattle(s.content,s.stage,1).units.every(u=>!u.revealed)).toBe(true);
 });
 it('reveals resolved ally attacks and enemy attacks, including defend with no counter; previews do not reveal',()=>{
  const s=state(),m=new CoreMap(s,lookup);const w=m.weapons('p1',{col:1,row:2},'e1').find(w=>w.usable)!;m.forecast('p1',{col:1,row:2},w.id,'e1');expect(m.details('e1').known).toBe(false);m.attack('p1',{col:1,row:2},w.id,'e1');expect(m.state().units.find(u=>u.id==='e1')!.revealed).toBe(true);
  const t=state();t.phase='enemy';t.units[0].hp=6000;const e=new CoreMap(t,lookup,{manualResponse:true});e.execute({type:'attack',unitId:'e1',targetId:'p1',weaponId:'rifle'});expect(e.details('e1').known).toBe(false);e.respond('defend');expect(e.details('e1').known).toBe(true);expect(new CoreMap(restore(t.content,t.stage,e.save()),lookup).details('e1').known).toBe(true);
 });
 it('does not reveal enemy/third-party combat through the temporary player-side projection',()=>{
  const s=state(),config=emptyConfig();config.units.e1={third:true};s.stage.units[0].tags=[CONFIG+encodeURIComponent(JSON.stringify(config))];s.units[1].tags=[THIRD];s.units[1].x=3;s.units[3].x=4;s.options.autoResponse=true;const r=runtime(s);r.phase='third';storeRuntime(s,r);
  const result=applyRules(s,{type:'attack',unitId:'e1',targetId:'e2',weaponId:'rifle'});expect(result.events.some(e=>e.type==='attack')).toBe(true);expect(result.state.units.filter(u=>u.id==='e1'||u.id==='e2').every(u=>!u.revealed)).toBe(true);
 });
 it('rejects malformed reveal state, insufficient SP and dead scan targets transactionally',()=>{const s=state();s.units[0].sp=9;expect(()=>apply(s,{type:'spirit',unitId:'p1',spiritId:'scan',targetId:'e1'})).toThrow('SP');s.units[0].sp=100;s.units[1].alive=false;expect(()=>apply(s,{type:'spirit',unitId:'p1',spiritId:'scan',targetId:'e1'})).toThrow();const saved=JSON.parse(snapshot(s));saved.battle.units[0].revealed='yes';expect(()=>restore(s.content,s.stage,JSON.stringify(saved))).toThrow('revealed');});
});

describe('map pointer navigation and dossiers',()=>{
 it('shows only inspection enabled for an acted ally and a one-item menu for enemies on either phase',()=>{
  for(const phase of ['player','enemy'] as const){const s=state();s.phase=phase;s.units[0].acted=true;const{screen,board}=setup(s);const at=board.onScreen({col:1,row:2});tap(screen,at.x,at.y);expect(mode(screen)).toBe(phase==='player'?'command':'inspectMenu');expect((screen.ui.focus as MenuList).items.filter(i=>!i.disabled).map(i=>i.label)).toEqual(['능력 보기']);}
 });
 it('outside taps close exactly one popup step; movement outside range cancels without opening a menu',()=>{
  const{app,screen,board}=setup();app.action('confirm');app.action('confirm');app.tick();if(mode(screen)==='weapon')button(screen,'뒤로');expect(mode(screen)).toBe('command');choose(screen,'정신기');expect(mode(screen)).toBe('spirit');tap(screen,25,400);expect(mode(screen)).toBe('command');tap(screen,25,400);expect(mode(screen)).toBe('move');const p=board.onScreen({col:7,row:5});tap(screen,p.x,p.y);expect(mode(screen)).toBe('idle');
 });
 it('does not carry a popup outside press into a later gesture',()=>{
  const{app,screen}=setup();app.action('confirm');app.action('confirm');app.tick();if(mode(screen)==='weapon')button(screen,'뒤로');const list=screen.ui.focus as MenuList,x=list.x+20,y=list.y+20;
  screen.input({kind:'pointer',phase:'down',x:25,y:400});screen.input({kind:'pointer',phase:'up',x,y});expect(mode(screen)).toBe('command');
  screen.input({kind:'pointer',phase:'down',x,y});screen.input({kind:'pointer',phase:'up',x:25,y:400});expect(mode(screen)).toBe('command');
  tap(screen,25,400);expect(mode(screen)).toBe('move');
 });
 it('requires a short same-empty-cell double tap; button and M also open the map menu',()=>{
  const{app,screen,board}=setup();const p=board.onScreen({col:7,row:5});tap(screen,p.x,p.y);expect(mode(screen)).toBe('idle');app.tick(60);tap(screen,p.x,p.y);expect(mode(screen)).toBe('idle');tap(screen,p.x,p.y);expect(mode(screen)).toBe('menu');expect((screen.ui.focus as MenuList).items.map(i=>i.label)).toEqual(expect.arrayContaining(['작전 목표','부대 현황']));app.action('cancel');button(screen,'메뉴');expect(mode(screen)).toBe('menu');app.action('cancel');app.action('menu');expect(mode(screen)).toBe('menu');
 });
 it('opens the ally roster and a dossier, returns in order, and keeps a dossier open on background tap until explicit close',()=>{
  const{app,screen}=setup();button(screen,'메뉴');choose(screen,'부대 현황');expect(app.top).toBeInstanceOf(RosterScreen);app.action('confirm');expect(app.top).toBeInstanceOf(UnitDetailsScreen);app.action('cancel');expect(app.top).toBeInstanceOf(RosterScreen);app.action('cancel');expect(app.top).toBe(screen);expect(mode(screen)).toBe('idle');
  app.push(new UnitDetailsScreen(new CoreMap(state(),lookup).details('p1'),()=>app.pop()));tap(app.top,300,100);expect(app.top).toBeInstanceOf(UnitDetailsScreen);button(app.top,'✕');expect(app.top).toBe(screen);
 });
 it('masks enemy stats, skill and weapon text before scan, paints real numbers after scan, and paginates many weapons',()=>{
  const s=state(),base=s.content.weapons[0];for(let i=0;i<8;i++){s.content.weapons.push({...structuredClone(base),id:'extra-'+i,name:'연습 무기 '+i});s.content.mechs[0].weapons.push('extra-'+i);}const m=new CoreMap(s,lookup),app=new Headless();
  const secret=m.details('e1');expect(secret.weapons.every(w=>w.name==='???'&&w.power==='???')).toBe(true);app.push(new UnitDetailsScreen(secret,()=>app.pop()));const hidden=paint(app.top);expect(hidden.filter(s=>s==='???').length).toBeGreaterThan(6);expect(hidden).not.toContain(base.name);
  m.cast('p1','scan','e1');app.pop();app.push(new UnitDetailsScreen(m.details('e1'),()=>app.pop()));expect(paint(app.top)).toContain('HP');expect(m.details('e1').pilotStats.every(([,v])=>v!=='???')).toBe(true);
  app.pop();const screen=new UnitDetailsScreen(m.details('p1'),()=>app.pop());app.push(screen);const before=paint(screen);app.action('menu');expect((screen as unknown as {tooltip:{visible:boolean}}).tooltip.visible).toBe(true);app.action('down');const after=paint(screen);expect(after).not.toEqual(before);expect(after).toContain('무기 2/4');app.action('down');expect(paint(screen).some(s=>s.includes('연습 무기'))).toBe(true);expect(snapshot(m.state())).toBe(m.save());
 });
 it('ignores outside taps on forecasts, responses and automatic playback',()=>{
  const{screen,app}=setup();const done=vi.fn();const internal=screen as unknown as {mode:{kind:string};responseDone:()=>void};for(const kind of ['forecast','responseForecast','busy']){internal.mode={kind};internal.responseDone=done;tap(screen,20,400);expect(mode(screen)).toBe(kind);}expect(done).not.toHaveBeenCalled();app.tick();
 });
});

describe('map UI finish',()=>{
 it('has a titled map popup with X only, a named spirit header and an attached selection tooltip',()=>{
  const{screen,app}=setup();button(screen,'메뉴');const list=screen.ui.focus as MenuList;expect(list.items.some(i=>i.label==='닫기')).toBe(false);expect(paint(screen)).toContain('맵 메뉴');expect(widgets(screen).filter(w=>w instanceof Button).map(w=>(w as Button).label)).not.toContain('뒤로');button(screen,'✕');expect(mode(screen)).toBe('idle');
  app.action('confirm');app.action('confirm');app.tick();if(mode(screen)==='weapon')button(screen,'뒤로');choose(screen,'정신기');const text=paint(screen);expect(text.some(s=>s.startsWith('정신기 · '))).toBe(true);expect(text.filter(s=>s==='✕')).toHaveLength(1);
  button(screen,'✕');expect(mode(screen)).toBe('command');expect(screen.stage.ui.nodes.some(n=>n.constructor.name==='Tooltip')).toBe(false);
 });
 it('keeps forecast cancellation on its existing button without a duplicate X',()=>{
  const{screen,model}=setup();const u=model.units().find(u=>u.id==='p1')!,w=model.weapons(u.id,u.cell,'e1').find(w=>w.usable)!;
  (screen as unknown as {forecast:(unit:typeof u,at:typeof u.cell,target:string,weapon:string)=>void}).forecast(u,u.cell,'e1',w.id);
  const labels=widgets(screen).filter(w=>w instanceof Button).map(w=>(w as Button).label);expect(labels).toContain('취소');expect(labels).not.toContain('✕');button(screen,'취소');expect(mode(screen)).toBe('weapon');
 });

 it('returns with the local button exactly like Esc, including a provisional move',()=>{
  const{screen,app,model,board}=setup(),before=model.save(),u=model.units().find(u=>u.id==='p1')!;
  (screen as unknown as {goTo:(unit:typeof u,at:{col:number;row:number})=>void}).goTo(u,{col:2,row:2});app.tick(120);if(mode(screen)==='weapon')button(screen,'뒤로');expect(mode(screen)).toBe('command');
  button(screen,'뒤로');expect(mode(screen)).toBe('move');expect(board.unitAt(u.cell)?.id).toBe(u.id);expect(model.save()).toBe(before);
  app.action('cancel');expect(mode(screen)).toBe('idle');
 });
 it('does not offer an ESC shortcut while a mandatory response or automatic presentation is active',()=>{
  const{screen}=setup(),internal=screen as unknown as {set:(m:{kind:string})=>void};
  for(const kind of ['busy','responseForecast']){internal.set({kind});expect(widgets(screen).some(w=>w instanceof Button&&w.label==='ESC')).toBe(false);}
 });
 it('hides the unit card and terrain under popups and retains the alpha map-menu toggle',()=>{
  const{screen}=setup();const internal=screen as unknown as {card:{visible:boolean};land:{visible:boolean};mapButton:Button};
  button(screen,'메뉴');expect(internal.card.visible).toBe(false);expect(internal.land.visible).toBe(false);expect(internal.mapButton.enabled).toBe(true);expect(internal.mapButton.visible).toBe(true);
  button(screen,'✕');expect(mode(screen)).toBe('idle');expect(internal.card.visible).toBe(true);expect(internal.land.visible).toBe(true);
 });
 it('opens a popup upward beside a lower map cell',()=>{
  const{screen,board}=setup();vi.spyOn(board,'onScreen').mockReturnValue({x:480,y:600});(screen as any).commands((screen as any).model.units()[0],{col:1,row:2});const list=screen.ui.focus as MenuList;
  expect(list.y).toBeGreaterThanOrEqual(16);expect(list.y+list.h).toBeLessThanOrEqual(540);
 });
 it('shows ally upgrades and equipped part names in place of defeat rewards, retaining enemy reward fields',()=>{
  const s=state(),ally=s.units[0],enemy=s.units[1];ally.upgrades={hp:2,en:1,armor:3,mobility:0,weapons:4};ally.parts=[s.content.parts![0].id];
  for(const m of s.content.mechs){m.exp=100;m.credits=200;m.costClass=1;}enemy.revealed=true;
  const model=new CoreMap(s,lookup),a=model.details(ally.id),e=model.details(enemy.id),rewards=['비용 등급','획득 경험치','획득 자금'];
  expect(a.mech.stats.some(([name])=>rewards.includes(name))).toBe(false);expect(a.mech.upgrades).toEqual([['HP','2'],['EN','1'],['장갑','3'],['운동성','0'],['무기','4']]);expect(a.effects[0]).toContain(s.content.parts![0].name);
  expect(e.mech.stats.filter(([name])=>rewards.includes(name))).toHaveLength(3);expect(e.mech.upgrades).toBeUndefined();
  const app=new Headless();app.push(new UnitDetailsScreen(a,()=>{}));const texts=paint(app.top);expect(texts.some(t=>t.startsWith('개조 · HP 2'))).toBe(true);expect(texts.some(t=>t.includes('장착 파츠'))).toBe(true);
 });
 it.each([[50,undefined,false],[100,undefined,false],[120,undefined,true],[110,110,false],[120,110,true]])('shows morale requirement %i only above initial morale %s',(requirement,start,shown)=>{
  const s=state(),u=s.units[0];s.content.rules.morale.start=100;s.content.pilots.find(p=>p.id===u.pilotId)!.startMorale=start;
  for(const w of s.content.weapons)w.moraleReq=requirement;const weapons=new CoreMap(s,lookup).details(u.id).weapons;
  expect(weapons.length).toBeGreaterThan(0);expect(weapons.every(w=>w.traits.includes('기력 '+requirement)===shown)).toBe(true);
 });
});
