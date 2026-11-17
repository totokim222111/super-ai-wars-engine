import {describe,it,expect,vi} from 'vitest';
import {BattleScene,GROUND} from '../src/v2/battle/scene';
import {makeContext} from '../src/v2/battle/template';
import {sequence} from '../src/v2/battle/templates/sequence';
import {MOVES} from '../src/v2/battle/moves';
import {MOVE_SECONDS,PROP_IDS,ELEMENT_IDS,CLOSER_SECONDS,sequenceIssues,sequenceSeconds,type MoveId,type SequenceAnim} from '../src/v2/battle/moves/catalog';
import {Runner} from '../src/v2/flow';
import {Stage} from '../src/v2/stage';
import type {Fighter,Outcome} from '../src/v2/battle/types';
import {BattleScreen}from'../src/v2/battle/screen';
import {briefSteps}from'../src/v2/battle/progress';
import {playStrike}from'../src/v2/battle/play';
import {wait}from'../src/v2/flow';
function fixture(a:SequenceAnim,reverse=false,outcome:Outcome={hit:true,damage:1}){
 const f=(id:string,side:'ally'|'enemy'):Fighter=>({id,side,name:id,pilot:id,hp:1000,hpMax:1000,en:100,enMax:100,height:id==='a'?280:540,faces:'left',portrait:{faces:{},crop:{x:0,y:0,w:1,h:1}}});
 const show={stage:new Stage(),runner:new Runner(),sound:{play:vi.fn()}as unknown as import('../src/v2/sound').Sound};
 const scene=new BattleScene(show,{fighters:[f('a',reverse?'enemy':'ally'),f('b',reverse?'ally':'enemy')],strikes:[]}),attacker=scene.actor('a'),defender=scene.actor('b');attacker.sprite.visible=defender.sprite.visible=true;
 return{show,scene,c:makeContext(scene,attacker,defender,{name:'fixture',cost:0,anim:a as never},outcome)};
}
const animation=(move:MoveId):SequenceAnim=>({template:'sequence',moves:[{move,prop:'keycap',hits:4,count:8}],element:'volt',closer:'none',tier:1,color:'#7fe9f7'});
describe('sequence vocabulary and execution',()=>{
 it('validates every vocabulary, nested field, integer cap, word length and duration',()=>{
  expect(Object.keys(MOVES)).toHaveLength(35);expect(PROP_IDS).toHaveLength(104);expect(ELEMENT_IDS).toHaveLength(14);expect(Object.keys(CLOSER_SECONDS)).toHaveLength(7);expect(sequenceIssues(animation('cannon'))).toEqual([]);
  for(const patch of [{tier:4},{color:'url(x)'},{moves:[]},{moves:Array(4).fill({move:'cannon'})},{element:'lava'},{closer:'toString'},{moves:[{move:'toString'}]},{moves:[{move:'cannon',prop:'absent'}]},{moves:[{move:'cannon',hits:1.5}]},{moves:[{move:'cannon',count:41}]},{moves:[{move:'cannon',words:['12345']}]},{moves:[{move:'beam'},{move:'beam'}]},{moves:[{move:'beam'},{move:'beam'},{move:'beam'}],closer:'terminal'}])expect(sequenceIssues({...animation('cannon'),...patch}).length,JSON.stringify(patch)).toBeGreaterThan(0);
 });
 it.each(Object.keys(MOVE_SECONDS)as MoveId[])('%s is finite and restores transforms for both sides, hit/miss/guard',move=>{
  for(const reverse of[false,true])for(const outcome of[{hit:true,damage:1},{hit:false,damage:0},{hit:true,guard:true,damage:1}]){
   const a=animation(move),{show,c}=fixture(a,reverse,outcome),before={x:c.defender.sprite.x,y:c.defender.sprite.y,rotation:0,scaleX:1,scaleY:1},camera={...show.stage.camera};let done=false,frames=0,maxNodes=0,minY=GROUND;
   show.runner.run((function*(){yield*sequence.launch(c);yield*sequence.impact(c);done=true;})());while(!done&&frames<1000){show.runner.update(1/60);frames++;maxNodes=Math.max(maxNodes,show.stage.fx.nodes.length);minY=Math.min(minY,c.defender.sprite.y);}
   expect(done).toBe(true);expect(frames/60).toBeGreaterThan(sequenceSeconds(a)-.04);expect(frames/60).toBeLessThan(sequenceSeconds(a)+.08);expect(maxNodes).toBeLessThanOrEqual(2);expect(c.defender.sprite).toMatchObject(before);expect(show.stage.camera).toMatchObject(camera);if(!outcome.hit)expect(minY).toBeGreaterThanOrEqual(GROUND-28.01);if(outcome.guard)expect(minY).toBe(GROUND);
  }
 });
 it('keeps the first .3s of a spinning launch visibly broad instead of an edge-on blank',()=>{const a=animation('spin'),{show,c}=fixture(a);show.runner.run(sequence.launch(c));for(let i=0;i<18;i++){expect(c.attacker.sprite.visible).toBe(true);expect(Math.abs(c.attacker.sprite.scaleX)).toBeGreaterThan(.9);expect(c.attacker.sprite.x).toBeGreaterThan(0);expect(c.attacker.sprite.x).toBeLessThan(1280);show.runner.update(1/60);}show.runner.clear();});
 it('emits impact audio in the visible contact update and restores on cancellation',()=>{
  const{show,c}=fixture(animation('hammer-smash')),play=show.sound.play as ReturnType<typeof vi.fn>;show.runner.run(sequence.impact(c));for(let i=0;i<200&&!play.mock.calls.length;i++)show.runner.update(1/60);
  expect(play).toHaveBeenCalled();expect(show.stage.fx.nodes.some(n=>(n as unknown as{state?:{hit:number}}).state?.hit===1)).toBe(true);show.runner.clear();expect(show.stage.fx.nodes).toHaveLength(0);expect(c.defender.sprite.y).toBe(GROUND);expect(show.stage.camera.zoom).toBe(1);
 });
 it('runs each closer within budget, clears residue before the common defeat and restores camera',()=>{
  for(const closer of Object.keys(CLOSER_SECONDS)as(keyof typeof CLOSER_SECONDS)[]){const a={...animation('stamp'),closer},{show,c}=fixture(a);let done=false,n=0;show.runner.run((function*(){yield*sequence.launch(c);yield*sequence.impact(c);done=true;})());while(!done&&n<1000){show.runner.update(1/60);n++;}expect(done).toBe(true);expect(n/60).toBeLessThanOrEqual(sequenceSeconds(a)+.08);expect(show.stage.fx.nodes).toHaveLength(0);expect(show.stage.camera.zoom).toBe(1);}
 });
 it('bridges shooting to contact within .25s and follows speed without lifting a missed target',()=>{
  const a:SequenceAnim={...animation('cannon'),moves:[{move:'cannon',prop:'token'},{move:'uppercut',prop:'fist'}]},durations=[];
  for(const speed of[1,3]){const{show,c}=fixture(a,false,{hit:false,damage:0});show.runner.speed=speed;let done=false,n=0;show.runner.run((function*(){yield*sequence.launch(c);yield*sequence.impact(c);done=true;})());while(!done&&n<1000){show.runner.update(1/60);n++;}durations.push(n/60);expect(c.defender.sprite.y).toBe(GROUND);expect(n/60*speed).toBeLessThan(sequenceSeconds(a)+.2);}expect(durations[0]/durations[1]).toBeGreaterThan(2.7);
 });
 it('plays a weapon video before the new sequence and resolves real damage only once',()=>{
  const{show,scene,c}=fixture(animation('cannon')),calls:string[]=[];
  scene.video=function*(){calls.push('video');yield*wait(.05);};
  const launch=vi.spyOn(sequence,'launch').mockImplementation(function*(context){calls.push('launch');yield*MOVES.cannon.launch(context,animation('cannon').moves[0],animation('cannon'));});
  const resolve=vi.spyOn(scene,'resolve');show.runner.run(playStrike(scene,{attacker:'a',target:'b',weapon:{...c.weapon,video:'movie'},outcome:{hit:true,damage:10}}));
  for(let i=0;i<1200&&show.runner.busy;i++)show.runner.update(1/60);
  expect(calls).toEqual(['video','launch']);expect(scene.actor('b').hud.hp).toBe(990);expect(resolve).toHaveBeenCalledTimes(1);resolve.mockRestore();launch.mockRestore();
 });
 it('keeps launch/result skip markers compatible with the remaining map presentation',()=>{
  const{c}=fixture(animation('hammer-smash')),ex={fighters:[c.attacker.fighter,c.defender.fighter],strikes:[{attacker:'a',target:'b',weapon:c.weapon,outcome:{hit:true,damage:10}}]};let finished:import('../src/v2/battle/progress').BattleFinish|undefined;
  const screen=new BattleScreen(ex,r=>finished=r);screen.app={sound:{play(){}}}as never;screen.enter();for(let i=0;i<600&&!screen.progress.strikes[0].launched;i++)screen.update(1/60);
  expect(screen.progress.strikes[0].launched).toBe(true);screen.input({kind:'action',action:'cancel'});expect(finished?.skipped).toBe(true);expect(briefSteps(ex,finished!.progress).map(s=>s.kind)).toEqual(['result']);expect(screen.stage.fx.nodes).toHaveLength(0);
 });
});
