import {describe,it,expect} from 'vitest';
import {Director,Taps,dialoguePortraitLayout,type Actor} from '../src/v2/director';
import {Sprite,Stage,Shape} from '../src/v2/stage';
import {Runner} from '../src/v2/flow';
import {Screen} from '../src/v2/screen';
import {StoryPlayback,memoryStoryState} from '../src/v2/story/play';
import {Board} from '../src/v2/map/board';
import {packActors} from '../src/v2/pack/load';

const actor:Actor={name:'Guide',color:'#fff',height:665,framing:{hairCrown:.08,chin:.34,faceCenterX:.52}};
const image=(w:number,h:number)=>({naturalWidth:w,naturalHeight:h}) as HTMLImageElement;
const frames=(runner:Runner,n=120)=>{for(let i=0;i<n;i++)runner.update(1/60);};

describe('dialogue portrait framing',()=>{
 it.each([665,900,1400])('fits a tall ornament at height %i, including speaking zoom',height=>{
  const sprite=new Sprite(image(1024,1536),height);sprite.crop={x:.05,y:0,w:.9,h:1};
  const p=dialoguePortraitLayout({...actor,height},sprite,300);
  expect(p.y-p.height*1.03*(1-actor.framing!.hairCrown)).toBeGreaterThanOrEqual(24-1e-8);
  expect(p.x+((actor.framing!.faceCenterX-.05)/.9-.5)*p.height*1024*.9/1536).toBeCloseTo(300);
  expect(p.y).toBeGreaterThan(508); // Lower body stays behind the dialogue window.
 });
 it('aligns visible head tops through different sizes and honors per-art landmarks',()=>{const art=image(1024,1536),sprite=new Sprite(art,665);sprite.crop={x:0,y:0,w:1,h:1};const normal=dialoguePortraitLayout(actor,sprite,300),small=dialoguePortraitLayout({...actor,framingByImage:new Map([[art,{...actor.framing!,relativeHeight:.85}]])},sprite,300);expect(small.height).toBeLessThan(normal.height);expect(normal.y-normal.height*1.03*(1-actor.framing!.hairCrown)).toBeCloseTo(24);expect(small.y-small.height*1.03*(1-actor.framing!.hairCrown)).toBeCloseTo(24);});
 it('clears old people when a background changes and resets all reusable scene references on dispose',()=>{const show={stage:new Stage(),runner:new Runner()},d=new Director(show,{guide:actor},{},new Taps());show.runner.run(d.perform({do:'enter',who:'guide',side:'left'}));frames(show.runner);expect(show.stage.talk.nodes).toHaveLength(1);show.runner.run(d.perform({do:'bg',image:'place'}));frames(show.runner);expect(show.stage.talk.nodes).toHaveLength(0);d.dispose();expect(show.stage.back.nodes).toHaveLength(0);});
 it('keeps square portraits completely above the dialogue and within the top margin',()=>{
  const sprite=new Sprite(image(768,768),700),p=dialoguePortraitLayout({...actor,height:700,framing:undefined},sprite,985);
  expect(p.y-p.height*1.03).toBeGreaterThanOrEqual(24-1e-8);expect(p.y).toBeLessThan(508);
 });
 it('uses source landmarks for head size and transfers them through packActors',()=>{
  const sprite=new Sprite(image(1024,1536),900);sprite.crop={x:0,y:0,w:1,h:1};
  const p=dialoguePortraitLayout({...actor,height:900,framing:{hairCrown:.1,chin:.5,faceCenterX:.5}},sprite,300);
  expect(p.height*.4).toBeCloseTo(190);
  const actors=packActors({cast:{guide:{name:actor.name,color:actor.color,height:actor.height,framing:actor.framing,moods:{},face:[.2,.1,.6,.3]}}},{});
  expect(actors.guide.framing).toEqual(actor.framing);
 });
 it('uses screen coordinates despite a panned and zoomed map, and stays safe through face changes',()=>{
  const show={stage:new Stage(),runner:new Runner()},taps=new Taps();Object.assign(show.stage.camera,{x:1900,y:1600,zoom:1.8});
  const d=new Director(show,{guide:{...actor,height:1000}}, {},taps);
  show.runner.run(d.play([{do:'enter',who:'guide',side:'left'},{do:'say',who:'guide',text:'Hello'},{do:'say',who:'guide',text:'Again',face:'smile'}]));
  frames(show.runner);const sprite=show.stage.talk.nodes.find(n=>n instanceof Sprite) as Sprite;
  expect(sprite.layer?.parallax).toBe(0);expect(show.stage.world.nodes).toEqual([]);taps.press();
  for(let i=0;i<80;i++){show.runner.update(1/60);expect(sprite.y-sprite.height*sprite.scaleY*(1-actor.framing!.hairCrown)).toBeGreaterThanOrEqual(24-1e-8);}
  taps.press();frames(show.runner);d.dispose();expect(show.stage.ui.nodes).toEqual([]);expect(show.stage.talk.nodes).toEqual([]);
 });
 it.each([false,true])('hides map HUD and restores its previous state after completion/error=%s',fail=>{
  class Page extends Screen{enter(){}}
  const screen=new Page();screen.app={sound:{play(){},music(){}}} as never;
  const visible=screen.stage.ui.add(new Shape({},()=>{})),hidden=screen.stage.ui.add(new Shape({},()=>{}));hidden.visible=false;
  const board=new Board(screen.show,10,10),play=new StoryPlayback(screen,{guide:actor},{},memoryStoryState(),board);
  screen.run(play.play({title:'',file:'fixture',issues:[],locations:[],scenes:{test:[{do:'enter',who:'guide',side:'left'},{do:'say',who:fail?'missing':'guide',text:'Hello'}]}},'test'));
  expect(visible.visible).toBe(false);expect(hidden.visible).toBe(false);
  if(fail)expect(()=>frames(screen.runner)).toThrow();else{frames(screen.runner);play.taps.press();frames(screen.runner);}
  expect(visible.visible).toBe(true);expect(hidden.visible).toBe(false);expect(play.active).toBe(false);
  expect(screen.stage.ui.nodes).toEqual([visible,hidden]);expect(screen.stage.talk.nodes).toEqual([]);
 });
});
