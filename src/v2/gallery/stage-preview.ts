/** 팩의 스테이지와 별도 견본을 같은 실제 게임 경로로 연다. */
import {MenuList,hintBar,label} from '../kit';
import {Screen} from '../screen';
import {startGame} from '../game/start';
import type {Pack} from '../pack/load';
import type {Sample} from './sample';
export function themePreviewPack(pack:Pack,setting:string):Pack {
  const id=`terrain-${setting}`,entry=pack.stageScripts![pack.game.episodes[0].stage],source=pack.stories[pack.game.episodes[0].id];
  const compiled={...entry,mapArt:undefined,setting,stage:structuredClone(entry.stage)};compiled.stage.id=id;const parsed=source;
  const p={...pack,examples:[{id,title:`지형 · ${setting}`,stage:id,story:id+'.story',parsed,compiled}]};return examplePack(p,0);
}
export function examplePack(pack:Pack,index:number):Pack {
  const example=pack.examples![index],p={...pack,game:structuredClone(pack.game),campaign:structuredClone(pack.campaign),stories:{...pack.stories},stageScripts:{...pack.stageScripts}};
  p.game.episodes.push({id:example.id,title:example.title,stage:example.stage,story:example.story,objectives:example.compiled.objectives});
  p.campaign.stages[example.stage]={stage:example.compiled.stage,program:example.compiled.program};p.campaign.nodes.push({type:'stage',id:example.stage},{type:'intermission'});
  p.stories[example.id]=example.parsed;p.stageScripts[example.stage]=example.compiled;return p;
}
export class StagePreviewScreen extends Screen {
  prepare():Promise<void>|void{return this.pack.ensureExamples?.();}
  constructor(private readonly pack:Pack,private readonly sample:Sample,private readonly leave:()=>void){super();}
  enter():void {
    this.stage.ui.add(Object.assign(label('맵 · 실제 규칙',38,{display:true}),{x:70,y:85}));

    const choices=[...this.pack.game.episodes.map(e=>({label:e.title,stage:e.stage,pack:this.pack})),...(this.pack.examples??[]).map((e,i)=>({label:e.title,stage:e.stage,pack:examplePack(this.pack,i)})),...Object.keys(this.pack.maps??{}).map(setting=>({label:`지형 견본 · ${setting}`,stage:`terrain-${setting}`,pack:themePreviewPack(this.pack,setting)}))];
    const list=this.ui.add(Object.assign(new MenuList(choices.map(c=>({label:c.label,labelSize:25})),i=>{const choice=choices[i];void startGame(this.app,this.sample,this.leave,choice.pack,true).then(flow=>{flow.model.newGame({name:choice.pack.players.name.default,preset:0,line:choice.pack.players.lines[0].id});flow.model.session.campaign.node=flow.model.data.nodes.findIndex(n=>n.type==='stage'&&n.id===choice.stage);flow.model.advance(false);const ep=choice.pack.game.episodes.find(e=>e.stage===choice.stage)!;flow.model.setStoryValue(`v2:story:${ep.id}:도입`,true);flow.show();});},{w:1050,rows:6,rowHeight:68}),{x:110,y:190}));
    this.ui.setNavigation({kind:'back',onBack:()=>this.app.pop()});this.ui.focusOn(list,true);this.stage.ui.add(hintBar('실제 규칙으로 검수합니다 · 진행 저장은 검수 중에만 유지됩니다'));
  }
}
