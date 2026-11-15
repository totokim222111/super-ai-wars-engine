import {describe,it,expect,vi}from'vitest';
import {BattleScreen}from'../src/v2/battle/screen';
import {App,Screen}from'../src/v2/screen';
import {Runner}from'../src/v2/flow';
import type {Exchange}from'../src/v2/battle/types';
const portrait={faces:{},crop:{x:0,y:0,w:1,h:1}},fighters=[{id:'a',side:'ally',name:'a',pilot:'a',hp:100,hpMax:100,en:100,enMax:100,height:280,faces:'left',portrait},{id:'b',side:'enemy',name:'b',pilot:'b',hp:100,hpMax:100,en:100,enMax:100,height:280,faces:'right',portrait}];
describe('section-local transitions have zero artificial loading wait',()=>{
 it('starts the entrance on the same frame as the battle jingle, not after its duration',()=>{
  const exchange={fighters,strikes:[{attacker:'a',target:'b',weapon:{name:'shot',cost:0,anim:{template:'beam'}},outcome:{hit:true,damage:1}}]}as Exchange;
  const opening=vi.fn(()=>({seconds:2,cancel:vi.fn()})),screen=new BattleScreen(exchange,()=>{},{opening:{slot:'intro',seconds:2}});screen.app={sound:{opening,play(){}}}as unknown as App;screen.enter();
  expect(opening).toHaveBeenCalledOnce();const actor=screen.scene.actor('a'),x=actor.sprite.x;screen.update(.05);expect(actor.sprite.x).not.toBe(x);
 });
 it('ready cached transitions use no boundary timer or loading screen, including a real pending microtask',async()=>{class Menu extends Screen{prepare(){return Promise.resolve();}enter(){}}const boundary=vi.fn(),app=Object.assign(Object.create(App.prototype),{stack:[],changing:false,epoch:0,loading:0,flow:new Runner(),sound:{music(){}},boundary})as App;app.push(new Menu(),'none');await Promise.resolve();expect(app.top).toBeInstanceOf(Menu);expect((app as unknown as {loading:number}).loading).toBe(0);expect(boundary).not.toHaveBeenCalled();});
});
