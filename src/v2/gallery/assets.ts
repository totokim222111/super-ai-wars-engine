/** 어셋 도감. 목록은 글만, 오른쪽에 실제로 보이는 한 항목만 받는다. */
import { Screen } from '../screen';
import { hintBar, label, MenuList, Tabs } from '../kit';
import { Shape, Sprite, type Node } from '../stage';
import { COLOR, cover, drawFace } from '../ui';
import {drawFocusedImage} from '../image-layout';
import { STANDARD_MOODS } from '../portrait';
import { visibleContent, castPortrait, packUnit, type Pack, type UnitDef } from '../pack/load';
import { preloadImages } from '../pack/images';
import type { Sample } from './sample';
type Entry={id:string; kind:'cast'|'unit'|'art';art?:string;unit?:UnitDef;cast?:string;missing?:boolean};
export class AssetBookScreen extends Screen {
  private tab=0;
  private list?:MenuList;
  private nodes:Node[]=[];
  private selected=0;
  constructor(readonly pack:Pack,readonly sample:Sample){super();}
  private entries():Entry[]{
    if(this.tab===0||this.tab===2)return Object.entries(this.pack.cast).filter(([id,c])=>!c.voiceOnly&&visibleContent(this.pack,'cast',id)&&!this.pack.game.compatibility?.cast?.[id]).sort(([,a],[,b])=>Number(!!b.bust)-Number(!!a.bust)).filter(([,c])=>this.tab===2?!!c.bust&&(/portrait/.test(c.bust)||(c.moodSheet?.rect[2]===1&&c.moodSheet.rect[3]===1)):!c.bust||!(/portrait/.test(c.bust)||(c.moodSheet?.rect[2]===1&&c.moodSheet.rect[3]===1))).map(([id,c])=>({id,kind:'cast',cast:id,art:c.bust}));
    if(this.tab===1)return Object.entries(this.pack.units).filter(([id])=>visibleContent(this.pack,'units',id)&&!this.pack.game.compatibility?.units?.[id]).flatMap(([id,u])=>[{id,kind:'unit' as const,unit:packUnit(this.pack,id,'player'),art:u.art,missing:!u.art&&!u.recolor},...Object.keys(u.forms??{}).map(form=>({id:`${id} / ${form}`,kind:'unit' as const,unit:packUnit(this.pack,id,'player',form),art:u.forms![form].art}))]);
    return Object.keys(this.pack.game.art.files).filter(id=>/^(bg-|bbg-|cg-)/.test(id)&&visibleContent(this.pack,'images',id)).map(id=>({id,kind:'art',art:id}));
  }
  private resources(e?:Entry):(HTMLImageElement|undefined)[]{if(!e)return [];const c=e.cast&&this.pack.cast[e.cast];return c?[this.sample.images[c.bust??''],...Object.values(c.moods??{}).map(id=>this.sample.images[id]),this.sample.images[c.moodSheet?.art??'']]:[this.sample.images[e.unit?.art??e.art??''],this.sample.images[e.unit?.icon??'']];}
  prepare():Promise<void>|void{return preloadImages(this.resources(this.entries()[0]));}
  enter():void{
    this.stage.back.add(cover('#080d20'));this.stage.ui.add(Object.assign(label('어셋 도감',32),{x:80,y:94}));
    this.ui.setNavigation({kind:'back',onBack:()=>this.app.pop()});
    this.ui.add(Object.assign(new Tabs(['인물','기체','자코 초상','배경·삽화'],i=>{this.tab=i;this.page();},{w:1120}),{x:80,y:150}));
    this.stage.ui.add(hintBar('목록을 누르거나 끌어서 넘기기 · 표정·말·기준점 확인'));this.page();
  }
  private page():void{
    if(this.list)this.ui.remove(this.list);const entries=this.entries();this.selected=0;
    this.list=this.ui.add(Object.assign(new MenuList(entries.map(e=>({label:e.id,labelSize:17})),i=>this.display(i),{w:350,rows:6,rowHeight:58,onMove:i=>this.display(i)}),{x:65,y:220}));this.display(0);
  }
  private display(index:number):void{
    this.selected=index;const e=this.entries()[index],resources=this.resources(e),task=preloadImages(resources);
    if(task){this.app.preload(resources,()=>{if(this.selected===index)this.display(index);});return;}
    this.nodes.forEach(n=>n.remove());this.nodes=[];
    const add=<T extends Node>(n:T):T=>{this.nodes.push(n);return this.stage.ui.add(n);};
    if(!e){add(Object.assign(label('등록된 그림 없음',26),{x:650,y:350}));return;}
    const c=e.cast?this.pack.cast[e.cast]:undefined,u=e.unit,image=this.sample.images[u?.art??e.art??''];
    const temporary=c?.temporary||u?.temporary||e.missing;
    add(Object.assign(label(`${e.id}${temporary?' · 임시 그림':''}${e.missing||!image?.naturalWidth?' · 빠진 그림':''}`,18,{color:temporary?COLOR.gold:COLOR.ink,width:750}),{x:450,y:212}));
    if(image?.naturalWidth){
      const sprite=Object.assign(new Sprite(image,350),{x:830,y:420});
      if(c){sprite.portrait=castPortrait(c,this.sample.images);sprite.trimToContent();}else if(u)sprite.trimToContent();
      if(c||u)add(sprite);else add(new Shape({},ctx=>{drawFocusedImage(ctx,image,{x:490,y:250,w:720,h:350},1.06);}));
      if(u){const icon=this.sample.images[u.icon??u.art??''];const token=Object.assign(new Sprite(icon,72),{x:1150,y:500});if(!u.icon&&u.iconCrop){const [x,y,w,h]=u.iconCrop;token.crop={x,y,w,h};}else token.trimToContent();token.height*=Math.min(1,72/token.width);add(token);
        add(new Shape({},ctx=>{ctx.font='14px sans-serif';for(const [name,[x,y]]of Object.entries(u.anchors??{})){const px=sprite.x+(x-.5)*sprite.width,py=sprite.y+(y-.5)*sprite.height;ctx.fillStyle=COLOR.gold;ctx.beginPath();ctx.arc(px,py,4,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#000';ctx.lineWidth=4;ctx.strokeText(name,px+7,py);ctx.fillText(name,px+7,py);}}));
        if(!u.anchors)add(Object.assign(label('기준점 없음',20,{color:COLOR.gold}),{x:760,y:610}));
      }
    }
    if(c){const p=castPortrait(c,this.sample.images);add(new Shape({},ctx=>{const order=c.moodSheet?.order??STANDARD_MOODS;const moods=this.tab===2?(c.moodSheet?.order??['default','hit']):Array.from({length:12},(_,i)=>order[i]??'');for(const [i,mood]of moods.entries()){const x=438+i*63;if(mood)drawFace(ctx,p,mood,x,585,58);else{ctx.fillStyle='#15203b';ctx.fillRect(x,585,58,58);}ctx.font='10px sans-serif';ctx.textAlign='center';ctx.fillStyle=c.moods?.[mood]||c.moodSheet?.order.includes(mood)?COLOR.dim:COLOR.enemy;const name=c.moodNames?.[mood]??({default:'기본',smile:'미소',laugh:'웃음',attack:'공격',serious:'진지',hit:'피격',shock:'충격',sad:'슬픔',angry:'분노',shy:'부끄러움'} as Record<string,string>)[mood]??(mood||'예약');const chars=Array.from(name);ctx.fillText(chars.slice(0,6).join(''),x+29,chars.length>6?655:665,61);if(chars.length>6)ctx.fillText(chars.slice(6).join(''),x+29,668,61);}}));}
  }
}
