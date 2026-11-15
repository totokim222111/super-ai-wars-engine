import {describe,it,expect,vi} from 'vitest';
import {m6} from './core/m6-helpers';
import {chooseAICommand,type Command} from '../src/core';
import {CoreMap,type MapLookup} from '../src/v2/adapter/map';
import {MapScreen} from '../src/v2/map/screen';
import {Board} from '../src/v2/map/board';
import type {MapEvent,UnitView} from '../src/v2/map/model';
import {Screen,type App} from '../src/v2/screen';
import type {Step} from '../src/v2/flow';
const lookup:MapLookup={unit:()=>({}),spirit:d=>({name:d.name,kind:'focus'}),battle:{mech:()=>({height:335,faces:'left'}),pilot:()=>({portrait:{faces:{},crop:{x:0,y:0,w:1,h:1}}}),weapon:()=>({anim:{template:'heavy-shot'}})}};
class Headless{sound={play(){},music(){}};top!:Screen;push(s:Screen){this.top=s;s.app=this as unknown as App;s.enter();}tick(n=1){for(let i=0;i<n;i++)this.top.update(1/60);}}
type Private={board:Board;card:{state:{unit?:UnitView}};hover(cell:{col:number;row:number}):void;play(events:MapEvent[]):Step;settle():void;goTo(unit:UnitView,at:{col:number;row:number}):void;back():void};
function fixture(){return m6((c,stage)=>{
 for(const m of c.mechs){m.hp=10000;m.en=100;m.weapons=['shot'];m.devices=[{id:'repair',name:'수리',kind:'repair',uses:8,postMove:true,amount:{flat:600},experience:0},{id:'supply',name:'보급',kind:'resupply',uses:8,postMove:true,experience:0}];}
 c.mechs[0].subPilots=['crew'];c.pilots.push({...structuredClone(c.pilots[1]),id:'crew'});
 c.weapons=[{...c.weapons[0],id:'shot',power:50,en:0,ammo:4,range:[1,6],hit:0,postMove:true},...['hp','en','supply'].map(id=>({...c.weapons[0],id,power:0,en:1,ammo:2,postMove:true,special:{kind:'restore' as const,label:'회복',target:'allies' as const,radius:1,...(id==='hp'?{hpPct:3}:id==='en'?{enFlat:10}:{enFlat:10,ammo:1})}}))];
 for(const m of c.mechs)m.weapons.push('hp','en','supply');
 c.spirits=[{id:'fill',name:'보급',sp:1,duration:'instant',target:'ally',effects:[{type:'resupply'}],desc:'보급'},{id:'heal',name:'회복',sp:1,duration:'instant',target:'self',effects:[{type:'hpRestore',value:{flat:500}}],desc:'회복'},{id:'energy',name:'회복',sp:1,duration:'instant',target:'self',effects:[{type:'enRestore',value:{flat:30}}],desc:'회복'}];
 for(const p of c.pilots)p.spirits=c.spirits.map(d=>({id:d.id,level:1}));
 c.parts=[{id:'cell',name:'셀',kind:'consumable',effects:[{type:'enRestore',value:{flat:30}},{type:'ammoRestore'}],desc:'회복'},{id:'regen',name:'자동',kind:'passive',effects:[{type:'hpRegen',value:{flat:200}},{type:'enRegen',value:{flat:12}}],desc:'매 턴'}];
 c.rules.actions={stat:'skill',threshold:130,count:2,extraMax:1};c.rules.recoveryTiming='phase';stage.scenario=true;
 });}
function setup(state=fixture(),speed=1){const model=new CoreMap(state,lookup),app=new Headless(),screen=new MapScreen(model,{speed:()=>speed,battle:()=>({animation:'off',speed,shake:0})});app.push(screen);app.tick(180);return{model,app,screen,p:screen as unknown as Private};}
function play(f:ReturnType<typeof setup>,events:MapEvent[]){f.screen.run(f.p.play(events));for(let n=0;n<4000&&f.screen.runner.busy;n++)f.app.tick();expect(f.screen.runner.busy).toBe(false);}
describe('ordered map movement and live resource presentation',()=>{
 it('keeps cell, sprite and retained card view together through movement, melee return and later reinforcement',()=>{
  const f=setup(),b=f.p.board,u=b.unit('e1')!,origin={...u.cell},to={col:5,row:2};f.screen.run(b.moveAlong(u.id,[origin,{col:4,row:2},to]));f.app.tick(80);expect(u.cell).toEqual(to);const feet={...b.feet(u.id)};b.offset(u.id,0,0);expect(b.feet(u.id)).toEqual(feet);f.screen.run(b.spawn({...u,id:'reinforcement',cell:{col:7,row:5}}));f.app.tick(100);expect(b.feet(u.id)).toEqual(feet);expect(b.unitAt(to)?.id).toBe(u.id);
 });
 it('replays move → attack → second move in order and final settlement never moves sprites',()=>{
  const s=fixture();s.units=s.units.filter(u=>['p1','e1'].includes(u.id));s.options.autoResponse=true;s.units.find(u=>u.id==='e1')!.pilotOverrides={stats:{skill:140}};const f=setup(s),events:MapEvent[]=[],emit=(c:Command)=>events.push(...f.model.execute(c));
  emit({type:'endPhase'});emit({type:'move',unitId:'e1',x:2,y:2});emit({type:'attack',unitId:'e1',weaponId:'shot',targetId:'p1'});emit({type:'move',unitId:'e1',x:4,y:2});emit({type:'wait',unitId:'e1'});const before=f.model.units().map(u=>({id:u.id,cell:u.cell}));emit({type:'endPhase'});expect(f.model.units().map(u=>({id:u.id,cell:u.cell}))).toEqual(before);
  expect(events.filter(e=>e.type==='move'||e.type==='battle').map(e=>e.type)).toEqual(['move','battle','move']);const seen:string[]=[],move=f.p.board.moveAlong.bind(f.p.board);vi.spyOn(f.p.board,'moveAlong').mockImplementation(function*(id,path,speed){seen.push('move');yield*move(id,path,speed)});(f.screen as unknown as {options:{battle:()=>unknown}}).options.battle=()=>{seen.push('battle');return {animation:'off',speed:1,shake:0}};play(f,events);expect(seen).toEqual(['move','battle','move']);const feet=f.p.board.feet('e1');expect(f.p.board.unit('e1')!.cell).toEqual({col:4,row:2});f.p.settle();expect(f.p.board.feet('e1')).toEqual(feet);
 });
 it('animates a real retreat-pattern AI move after an attack when an extra action remains',()=>{
  const s=fixture();s.units=s.units.filter(u=>['p1','e1'].includes(u.id));s.units.find(u=>u.id==='e1')!.hp=1000;s.units.find(u=>u.id==='e1')!.pilotOverrides={stats:{skill:140}};s.stage.aiPatterns={default:{pattern:'retreat'}};s.options.autoResponse=true;const f=setup(s);f.model.execute({type:'endPhase'});f.model.execute({type:'attack',unitId:'e1',weaponId:'shot',targetId:'p1'});const command=chooseAICommand(f.model.state(),'e1');expect(command.type).toBe('move');const events=f.model.execute(command);expect(events.some(e=>e.type==='move')).toBe(true);play(f,events);const u=f.model.units().find(u=>u.id==='e1')!;expect(f.p.board.unit('e1')!.cell).toEqual(u.cell);expect(f.p.board.feet('e1').x).toBe(u.cell.col*80+40);
 });
 it('uses the same per-cell movement at normal speed and respects fast-forward, including its camera',()=>{
  const frames=(speed:number)=>{const f=setup(),b=f.p.board,from=b.unit('e1')!.cell,g=b.moveAlong('e1',[from,{col:4,row:2},{col:5,row:2},{col:6,row:2}],speed);let count=0,r=g.next();while(!r.done&&count<200){r=g.next(1/120);count++;}expect(b.unit('e1')!.cell).toEqual({col:6,row:2});return count;};expect(frames(3)).toBeLessThan(frames(1));
 });
 it('preserves the tentative player origin so Escape still cancels a preview move',()=>{
  const f=setup(),u=f.p.board.unit('p1')!,origin={...u.cell};f.p.goTo(u,{col:2,row:2});f.app.tick(100);expect(f.p.board.unit('p1')!.cell).toEqual({col:2,row:2});f.p.back();expect(f.p.board.unit('p1')!.cell).toEqual(origin);expect(f.model.units().find(u=>u.id==='p1')!.cell).toEqual(origin);
 });
 it('does not mutate retained spawn/initial snapshots when its displayed HP changes',()=>{
  const f=setup(),view={...f.model.units()[0],id:'fresh',cell:{col:7,row:5}},hp=view.hp;f.screen.run(f.p.board.spawn(view));f.app.tick(100);f.p.board.harm('fresh',300);expect(view.hp).toBe(hp);expect(f.p.board.unit('fresh')!.hp).toBe(hp-300);
 });
 it.each(['sub-supply','device-supply','device-repair','spirit-hp','spirit-en','item','passive','natural','special-hp','special-supply'] as const)('refreshes card, dossier and weapon resources before settlement: %s',kind=>{
  const s=fixture(),enemy=kind.startsWith('special'),actor=enemy?'e1':'p1',target=enemy?'e2':['spirit-hp','spirit-en','item'].includes(kind)?'p1':'p2',u=s.units.find(u=>u.id===target)!;u.hp=5000;u.en=10;u.ammo.shot=0;
  if(kind==='item')u.parts=['cell'];if(kind==='passive')u.parts=['regen'];if(enemy)s.phase='enemy';const f=setup(s),cell=f.p.board.unit(target)!.cell;f.p.board.cursor=cell;f.p.hover(cell);const old=f.p.card.state.unit!;
  let events:MapEvent[]=[];if(kind==='sub-supply')events=f.model.cast(actor,'crew::fill',target);else if(kind==='device-supply'||kind==='device-repair')events=f.model.device(actor,f.model.units().find(u=>u.id===actor)!.cell,kind==='device-supply'?'supply':'repair',target);else if(kind==='spirit-hp'||kind==='spirit-en')events=f.model.cast(actor,kind==='spirit-hp'?'heal':'energy');else if(kind==='item')events=f.model.item(actor,cell,0);else if(enemy)events=f.model.weaponSkill(actor,f.model.units().find(u=>u.id===actor)!.cell,kind==='special-hp'?'hp':'supply');else{events=f.model.execute({type:'endPhase'});events.push(...f.model.execute({type:'endPhase'}));}
  const status=events.filter(e=>e.type==='status');expect(status.length).toBeGreaterThan(0);expect(status.some(e=>e.gains.some(g=>g.unitId===target))).toBe(true);play(f,events);const actual=f.model.units().find(u=>u.id===target)!;expect(f.p.card.state.unit).toMatchObject({id:target,hp:actual.hp,en:actual.en});expect(old).toMatchObject({hp:actual.hp,en:actual.en});const details=f.model.details(target);if(!enemy){expect(details.mech.hp).toBe(actual.hp);expect(details.mech.en).toBe(actual.en);const ammo=f.model.state().units.find(u=>u.id===target)!.ammo.shot;expect(f.model.weapons(target,actual.cell,enemy?'p1':'e1').find(w=>w.id==='shot')!.resources).toContain(`잔탄 ${ammo}/4`);if(ammo>0&&!actual.acted){expect(f.model.forecast(target,actual.cell,'shot','e1').attacker.resources).toContain(`잔탄 ${ammo}/4`);const next=f.model.attack(target,actual.cell,'shot','e1').find(e=>e.type==='battle');expect(next?.exchange.fighters.find(u=>u.id===target)).toMatchObject({hp:actual.hp,en:actual.en});}}
 });
});
