import {describe,it,expect,vi} from 'vitest';
import {BattleLinePicker,battleLineIssues,type BattleLines} from '../src/v2/battle/lines';
import {battleProgress,briefSteps} from '../src/v2/battle/progress';
import {battleExchange,type BattleLookup} from '../src/v2/adapter/battle';
import {BattleScreen} from '../src/v2/battle/screen';
import {BattleScene} from '../src/v2/battle/scene';
import {playBrief,type BriefControl} from '../src/v2/map/brief';
import {MapScreen} from '../src/v2/map/screen';
import {CoreMap} from '../src/v2/adapter/map';
import {Board} from '../src/v2/map/board';
import {Stage} from '../src/v2/stage';
import {Runner} from '../src/v2/flow';
import {apply,snapshot,type BattleEvent} from '../src/core';
import {m6,attach} from './core/m6-helpers';
import type {Exchange,Fighter,Strike} from '../src/v2/battle/types';
import type {MapLookup} from '../src/v2/adapter/map';
import type {Screen,App} from '../src/v2/screen';

const speech=(text:string,mood='attack')=>({text,mood});
const base:BattleLookup={mech:()=>({height:335,faces:'left'}),pilot:()=>({portrait:{faces:{},crop:{x:0,y:0,w:1,h:1}}}),weapon:()=>({anim:{template:'heavy-shot'}})};
const sound={play(){},music(){}} as unknown as import('../src/v2/sound').Sound;
class Headless {stack:Screen[]=[];sound=sound;get top(){return this.stack.at(-1)!;}push(s:Screen){s.app=this as unknown as App;this.stack.push(s);s.enter();}pop(){this.stack.pop();this.top?.resume();}tick(n=1){for(let i=0;i<n;i++)this.top.update(1/60);}}
const fighter=(id:string,side:'ally'|'enemy'):Fighter=>({id,side,name:id,pilot:id,hp:1000,hpMax:1000,en:100,enMax:100,height:335,faces:'left',portrait:{faces:{},crop:{x:0,y:0,w:1,h:1}}});
const strike=(attacker:string,target:string,damage:number,extra:Partial<Strike>={}):Strike=>({attacker,target,weapon:{name:'Pulse',kind:'beam',cost:0,anim:{template:'beam'}},outcome:{hit:true,damage},...extra});
const exchange=():Exchange=>({fighters:[fighter('a','ally'),fighter('b','enemy'),fighter('c','ally'),fighter('d','enemy')],strikes:[strike('a','b',100),strike('b','a',80,{banner:'반격'}),strike('c','b',150,{cover:'d',banner:'원호 공격'}),strike('a','b',900)]});

describe('pack battle dialogue',()=>{
 it('prefers opponent/weapon overrides, chooses in sequence, and never repeats a sentence within an exchange',()=>{
  const bank:BattleLines={attack:[speech('generic')],weapons:{blade:[speech('weapon')]},opponents:{rival:{attack:[speech('rival')],weapons:{blade:[speech('rival weapon')]}}}};
  const picker=new BattleLinePicker();expect(Array.from({length:5},()=>picker.pick(bank,'attack','blade','rival')?.text)).toEqual(['rival weapon','rival','weapon','generic',undefined]);
 });
 it('supports a seeded presentation-only random order, finisher fallback and missing data without placeholders',()=>{
  const bank:BattleLines={mode:'random',attack:['one','two','three'].map(s=>speech(s))},a=new BattleLinePicker(19),b=new BattleLinePicker(19);
  const xs=Array.from({length:3},()=>a.pick(bank,'finisher')!.text);expect(xs).toEqual(Array.from({length:3},()=>b.pick(bank,'finisher')!.text));expect(new Set(xs).size).toBe(3);expect(a.pick(bank,'attack')).toBeUndefined();expect(a.pick(undefined,'attack')).toBeUndefined();
 });
 it('validates nonempty lines, selection modes, moods and nested overrides',()=>{
  expect(battleLineIssues({mode:'sequence',attack:[speech('Ready')],opponents:{rival:{weapons:{pulse:[speech('Now')]}}}},['attack'])).toEqual([]);
  for(const bank of [{attack:[{text:' '}]},{mode:'dice'},{attack:[speech('A','absent')]},{opponents:{x:{attack:'not a list'}}}])expect(battleLineIssues(bank,['attack']).length).toBeGreaterThan(0);
 });
 it.each(['hitLight','hitHeavy','guard','dodge','defeated'] as const)('connects %s dialogue and mood using the actual defender, without changing state or RNG',situation=>{
  const before=m6(),enemy=before.units[1],original=snapshot(before),result=apply(before,{type:'attack',unitId:'p1',targetId:'e1',weaponId:'rifle'});
  const e={...result.events.find((e):e is Extract<BattleEvent,{type:'attack'}>=>e.type==='attack')!,hit:situation!=='dodge',hpDamage:situation==='defeated'?enemy.hp:situation==='hitHeavy'?Math.floor(enemy.hp*.6):20};
  const banks:Record<string,BattleLines>={p1:{attack:[speech('Attack')],victory:[speech('Done','smile')]},e1:{[situation]:[speech(situation,'hit')]}};
  const events:BattleEvent[]=situation==='guard'?[{type:'response',unitId:'e1',response:{type:'defend'}},e]:[e];
  const ex=battleExchange(before,events,{...base,castId:u=>u.id,battleLines:u=>banks[u.id]});
  const line=situation==='dodge'?ex.strikes[0].lines?.dodge:situation==='defeated'?ex.strikes[0].lines?.lastWords:ex.strikes[0].lines?.reaction;
  expect(line).toEqual(speech(situation,'hit'));if(situation==='defeated')expect(ex.strikes[0].lines?.after).toEqual(speech('Done','smile'));expect(snapshot(before)).toBe(original);
  expect(battleExchange(before,events,base).strikes[0].lines).toBeUndefined();
 });
});

describe('brief presentation and skip continuation',()=>{
 it('orders attack/result, counter/result, support cover/result, second attack/result and defeat',()=>{
  const steps=briefSteps(exchange());expect(steps.map(s=>`${s.index}:${s.kind}`)).toEqual(['0:launch','0:result','1:launch','1:result','2:launch','2:result','3:launch','3:result','3:defeat']);
  expect(steps.find(s=>s.index===2&&s.kind==='result')).toMatchObject({hpBefore:1000,hpAfter:850});expect(steps.at(-1)).toMatchObject({hpBefore:900,hpAfter:0});
 });
 it('resumes after completed launches and results, including a pending explosion after displayed lethal damage',()=>{
  const ex=exchange(),p=battleProgress(ex);p.strikes[0]={launched:true,result:true,defeated:false};p.strikes[1].launched=true;
  expect(briefSteps(ex,p).map(s=>`${s.index}:${s.kind}`)).toEqual(['1:result','2:launch','2:result','3:launch','3:result','3:defeat']);
  p.strikes.forEach(v=>{v.launched=v.result=true;});expect(briefSteps(ex,p).map(s=>s.kind)).toEqual(['defeat']);p.strikes[3].defeated=true;expect(briefSteps(ex,p)).toEqual([]);
 });
 it('updates map HP only on results, removes a defeat once, and keeps the sequence when sped up',()=>{
  for(const fast of [false,true]){
   const ex=exchange(),show={stage:new Stage(),runner:new Runner(),sound},board=new Board(show,10,10);
   board.sync(ex.fighters.map((f,i)=>({id:f.id,team:f.side,cell:{col:i+1,row:2},name:f.name,pilot:f.pilot,hp:f.hp,hpMax:f.hpMax,en:100,enMax:100,heat:100,acted:false,portrait:f.portrait})));
   const progress=battleProgress(ex),control:BriefControl={fast,history:[]},dead=new Set<string>();show.runner.run(playBrief(show,board,ex,progress,control,dead));
   for(let i=0;i<900&&show.runner.busy;i++){show.runner.update(1/60);if(control.current?.kind==='launch'&&control.current.index===0)expect(board.unit('b')!.hp).toBe(1000);}
   expect(control.history).toEqual(['0:launch','0:result','1:launch','1:result','2:launch','2:result','3:launch','3:result','3:defeat']);expect(board.unit('a')!.hp).toBe(920);expect(board.unit('d')!.hp).toBe(850);expect(board.unit('b')).toBeUndefined();expect([...dead]).toEqual(['b']);expect(show.stage.fx.nodes).toEqual([]);
  }
 });
 it('records a real fullscreen result before a mid-battle skip, so it cannot be replayed',()=>{
  const ex=exchange();ex.strikes=ex.strikes.slice(0,2);const app=new Headless();let finished:Parameters<ConstructorParameters<typeof BattleScreen>[1]>[0]|undefined;
  const screen=new BattleScreen(ex,r=>{finished=r;});app.push(screen);
  for(let i=0;i<1600&&!screen.progress.strikes[0].result;i++)app.tick();expect(screen.progress.strikes[0]).toMatchObject({launched:true,result:true});
  screen.input({kind:'action',action:'cancel'});expect(finished?.skipped).toBe(true);expect(briefSteps(ex,finished!.progress).map(s=>`${s.index}:${s.kind}`)).toEqual(['1:launch','1:result']);
 });
 it('keeps dialogue and mood during fast-forward and gives the fully shown line at least .6 real seconds',()=>{
  for(const speed of [1,3,9]){const ex=exchange(),show={stage:new Stage(),runner:new Runner(),sound},scene=new BattleScene(show,ex);show.runner.speed=speed;show.runner.run(scene.say(scene.actor('a'),speech('Ready','serious')));let fullyShown=0;
   for(let i=0;i<180&&show.runner.busy;i++){const line=show.stage.ui.nodes.find(n=>(n as unknown as {state?:{mood?:string}}).state?.mood==='serious') as unknown as {state:{shown:number;text:string}};expect(line).toBeDefined();if(line.state.shown>=line.state.text.length)fullyShown++;show.runner.update(1/60);}
   expect(fullyShown/60).toBeGreaterThanOrEqual(.6);expect(show.runner.busy).toBe(false);
  }
 });
 it('uses the same brief path for animations off and fast enemy-phase playback; a tap accelerates remaining steps',()=>{
  const lookup:MapLookup={...{unit:()=>({}),spirit:d=>({name:d.name,kind:'focus'})},battle:base};
  for(const animation of ['off','on'] as const){const model=new CoreMap(m6(),lookup),app=new Headless(),screen=new MapScreen(model,{battle:()=>({animation,speed:animation==='off'?1:3,shake:0})});app.push(screen);app.tick(120);
   const ex=exchange();if(animation==='on'){ex.fighters[0].side='enemy';ex.fighters[1].side='ally';}ex.fighters=ex.fighters.map((f,i)=>({...f,id:['p1','e1','p2','e2'][i]}));ex.strikes=[strike('p1','e1',10)];screen.present([{type:'battle',exchange:ex}]);
   for(let i=0;i<120&&!(screen as unknown as {brief?:BriefControl}).brief;i++)app.tick();expect(app.top).toBe(screen);expect((screen as unknown as {brief?:BriefControl}).brief).toBeDefined();screen.input({kind:'pointer',phase:'down',x:20,y:20});expect((screen as unknown as {brief?:BriefControl}).brief?.fast).toBe(true);app.tick(240);expect(app.top).toBe(screen);
  }
 });
});

describe('map integration',()=>{
 const lookup:MapLookup={unit:()=>({}),spirit:d=>({name:d.name,kind:'focus'}),battle:base};
 it('shows a skipped remaining counter without repeating the already displayed HP result',()=>{
  const s=m6();attach(s,0,[{type:'hitSet',value:100}]);const model=new CoreMap(s,lookup),app=new Headless(),screen=new MapScreen(model);app.push(screen);app.tick(120);
  const board=(screen as unknown as {board:Board}).board,harm=vi.spyOn(board,'harm');const events=model.attack('p1',{col:s.units[0].x,row:s.units[0].y},'rifle','e1'),saved=model.save(),ex=events.find(e=>e.type==='battle')!;if(ex.type!=='battle')throw Error('No exchange');screen.present(events);
  for(let i=0;i<1800&&(!(app.top instanceof BattleScreen)||!app.top.progress.strikes[0].result);i++)app.tick();expect(app.top).toBeInstanceOf(BattleScreen);app.top.input({kind:'action',action:'cancel'});app.tick(600);
  expect(harm.mock.calls).toEqual(ex.exchange.strikes.filter(s=>s.outcome.hit).map(s=>[s.cover??s.target,s.outcome.damage]));expect(model.save()).toBe(saved);expect(app.top).toBe(screen);
 });
 it('does not explode a briefly destroyed unit a second time for the following defeat event',()=>{
  const s=m6();s.units[1].hp=1;attach(s,0,[{type:'hitSet',value:100}]);const model=new CoreMap(s,lookup),app=new Headless(),screen=new MapScreen(model,{battle:()=>({animation:'off',speed:1,shake:0})});app.push(screen);app.tick(120);
  const board=(screen as unknown as {board:Board}).board,defeat=vi.spyOn(board,'defeat'),events=model.attack('p1',{col:s.units[0].x,row:s.units[0].y},'rifle','e1'),saved=model.save();screen.present(events);app.tick(600);
  expect(defeat).toHaveBeenCalledTimes(1);expect(board.unit('e1')).toBeUndefined();expect(model.save()).toBe(saved);
 });
});
