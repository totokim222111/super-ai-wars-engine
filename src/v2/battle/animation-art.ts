import {BATTLE_CONTROLS,BATTLE_HUD,overlaps} from './safe-area';
import {PROP_IDS,ELEMENT_IDS,type PropId,type ElementId} from './moves/catalog';
export const COMMON_ART_IDS=['guard-barrier','guard-barrier-side','dust-cloud','ground-crack','shock-ring','smoke-puff','hit-star','speed-streak','muzzle-flash','dragon-segment','dragon-tail','rainbow-beam','storm-ring','nova-ring','grease-drop','contact-slash']as const;
export type CommonArtId=typeof COMMON_ART_IDS[number];
export interface AnimationSprite {art:string;rect?:[number,number,number,number];sourceSize?:[number,number];anchor?:[number,number];grip?:[number,number];facing?:'none'|'left'|'right'|'up'|'down';large?:boolean}
export interface AnimationArtSpec {version:1;pages?:Record<string,{width:number;height:number;file?:string;sha256?:string}>;props?:Partial<Record<PropId,AnimationSprite>>;elements?:Partial<Record<ElementId,Partial<Record<'burst'|'mark'|'chip'|'trail',AnimationSprite>>>>;common?:Partial<Record<CommonArtId,AnimationSprite>>;provenance?:{title?:string;license?:string;[key:string]:unknown}}
export function animationArtIssues(value:unknown,art:Record<string,string>):string[]{
 const errors:string[]=[];if(!value||typeof value!=='object'||Array.isArray(value))return['animationArt object required'];const a=value as AnimationArtSpec;
 if(a.version!==1)errors.push('animationArt version must be 1');
 const object=(x:unknown)=>!!x&&typeof x==='object'&&!Array.isArray(x);
 if(a.pages!==undefined&&!object(a.pages))errors.push('pages must be an object');else for(const[id,p]of Object.entries(a.pages??{})){if(!art[id])errors.push('unregistered atlas art: '+id);if(!p||!Number.isInteger(p.width)||!Number.isInteger(p.height)||p.width<=0||p.height<=0||p.width>2048||p.height>2048)errors.push('atlas dimensions: '+id);}
 const sprite=(s:AnimationSprite,id:string)=>{
  if(!object(s)||typeof s.art!=='string'||!art[s.art]){errors.push('unregistered animation art: '+id);return;}
  for(const key of['anchor','grip']as const){const v=s[key];if(v!==undefined&&(!Array.isArray(v)||v.length!==2||v.some(n=>!Number.isFinite(n)||n<0||n>1)))errors.push('anchor/grip outside 0..1: '+id);}
  if(s.facing!==undefined&&!['none','left','right','up','down'].includes(s.facing))errors.push('invalid facing: '+id);
  if(s.sourceSize!==undefined&&(!Array.isArray(s.sourceSize)||s.sourceSize.length!==2||s.sourceSize.some(n=>!Number.isInteger(n)||n<=0)))errors.push('invalid sourceSize: '+id);
  const r=s.rect,p=a.pages?.[s.art];if(r!==undefined&&(!Array.isArray(r)||r.length!==4||r.some(n=>!Number.isInteger(n))||r[0]<0||r[1]<0||r[2]<=0||r[3]<=0||p&&(r[0]+r[2]>p.width||r[1]+r[3]>p.height)))errors.push('invalid atlas rect: '+id);
 };
 for(const[key,ids]of[['props',PROP_IDS],['common',COMMON_ART_IDS]]as const){const rows=a[key];if(rows!==undefined&&!object(rows)){errors.push(key+' must be an object');continue;}for(const[id,s]of Object.entries(rows??{})){if(!(ids as readonly string[]).includes(id))errors.push('unknown '+key+' id: '+id);sprite(s,id);}}
 if(a.elements!==undefined&&!object(a.elements))errors.push('elements must be an object');else for(const[id,parts]of Object.entries(a.elements??{})){if(!(ELEMENT_IDS as readonly string[]).includes(id))errors.push('unknown element id: '+id);if(!object(parts)){errors.push('element parts must be an object');continue;}for(const[k,s]of Object.entries(parts)){if(!['burst','mark','chip','trail'].includes(k))errors.push('unknown element part: '+k);sprite(s,id+'-'+k);}}
 return errors;
}
export function animationSprites(a?:AnimationArtSpec):[string,AnimationSprite][]{return a?[...Object.entries(a.props??{}),...Object.entries(a.common??{}),...Object.entries(a.elements??{}).flatMap(([id,parts])=>Object.entries(parts).map(([part,s])=>[id+'-'+part,s]as[string,AnimationSprite]))]:[];}
export interface IllustrationOptions {pivot?:'anchor'|'grip';orientation?:'upright'|'projectile';flatten?:number;stretchMax?:number}
/** A library belongs to a single pack/image store. No global pack selection or I/O in painters. */
export class AnimationArt {
 private cache=new Map<string,HTMLCanvasElement>();private pixels=0;private warned=new Set<string>();
 readonly scaleRequests=new Map<string,{id:string;requested:number;allowed:number;source:[number,number];packed:[number,number];capped:boolean}>();
 readonly usage=new Map<string,number>();
 constructor(readonly spec:AnimationArtSpec,readonly images:Record<string,HTMLImageElement|undefined>){}
 get imageIds():string[]{return [...new Set(animationSprites(this.spec).map(([,s])=>s.art))];}
 get pageImages():(HTMLImageElement|undefined)[]{return this.imageIds.map(id=>this.images[id]);}
 get cachePixels():number{return this.pixels;}
 get cacheEntries():number{return this.cache.size;}
 entry(id:string):AnimationSprite|undefined{return this.spec.props?.[id as PropId]??this.spec.common?.[id as CommonArtId]??(()=>{const at=id.lastIndexOf('-');return this.spec.elements?.[id.slice(0,at)as ElementId]?.[id.slice(at+1)as'burst'|'mark'|'chip'|'trail']})()}
 ready(id:string):boolean{const e=this.entry(id),image=e&&this.images[e.art],r=e?.rect;return !!image?.naturalWidth&&(!r||r[0]+r[2]<=image.naturalWidth&&r[1]+r[3]<=image.naturalHeight);}
 clear():void{this.cache.clear();this.pixels=0;}
 /** Prime small sprites during section loading, before a dense attack requests them. */
 warm():void{if(typeof document==='undefined')return;const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');if(!ctx)return;const used=new Map(this.usage),requests=new Map(this.scaleRequests);try{for(const[id]of animationSprites(this.spec))if(this.ready(id))this.draw(ctx,id,0,0,192);}finally{this.usage.clear();this.scaleRequests.clear();for(const row of used)this.usage.set(...row);for(const row of requests)this.scaleRequests.set(...row);}}
 draw(c:CanvasRenderingContext2D,id:string,x:number,y:number,size:number,angle=0,dir=1,options:IllustrationOptions={}):boolean{
  const e=this.entry(id);if(!e)return false;const image=this.images[e.art];if(!image?.naturalWidth){if((!image||image.complete)&&!this.warned.has(e.art)){this.warned.add(e.art);console.warn('[animation art] unavailable; using code drawing: '+e.art)}return false;}
  const r=e.rect??[0,0,image.naturalWidth,image.naturalHeight];if(r[0]+r[2]>image.naturalWidth||r[1]+r[3]>image.naturalHeight)return false;const source=e.sourceSize??[r[2],r[3]],allowed=Math.max(...source)*1.25;
  const requested=size*(options.stretchMax??1),old=this.scaleRequests.get(id);if(!old||old.requested<requested)this.scaleRequests.set(id,{id,requested,allowed,source,packed:[r[2],r[3]],capped:requested>allowed+.01});
  size=Math.min(size,allowed/(options.stretchMax??1));const level=Math.min(Math.max(r[2],r[3]),[32,48,64,96,128,192,256,384,512,768,1024,1280,1536].find(n=>n>=size)??1536),key=id+':'+level;
  let cachedKey=key,canvas=this.cache.get(key);if(!canvas){const larger=[...this.cache].filter(([k,c])=>k.startsWith(id+':')&&Math.max(c.width,c.height)>=level).sort((a,b)=>a[1].width*a[1].height-b[1].width*b[1].height)[0];if(larger){cachedKey=larger[0];canvas=larger[1];}}if(canvas){this.cache.delete(cachedKey);this.cache.set(cachedKey,canvas);}else{
   canvas=document.createElement('canvas');const ratio=level/Math.max(r[2],r[3]);canvas.width=Math.max(1,Math.round(r[2]*ratio));canvas.height=Math.max(1,Math.round(r[3]*ratio));const ctx=canvas.getContext('2d')!;ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(image,...r,0,0,canvas.width,canvas.height);this.cache.set(key,canvas);this.pixels+=canvas.width*canvas.height;
   while(this.cache.size>192||this.pixels>8*1024*1024){const k=this.cache.keys().next().value!,gone=this.cache.get(k)!;this.cache.delete(k);this.pixels-=gone.width*gone.height;}
  }
  const factor=size/Math.max(canvas.width,canvas.height),w=canvas.width*factor,h=canvas.height*factor,pivot=options.pivot==='grip'?e.grip??e.anchor??[.5,.5]:e.anchor??[.5,.5];
  c.save();c.translate(x,y);c.rotate(angle);c.scale(e.facing==='none'?1:e.facing==='left'?-dir:dir,options.flatten??1);
  if(options.orientation==='projectile'){if(e.facing==='up')c.rotate(Math.PI/2);if(e.facing==='down')c.rotate(-Math.PI/2);}
  c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';c.drawImage(canvas,-pivot[0]*w,-pivot[1]*h,w,h);if(id==='badge-number'){c.font=`900 ${h*.28}px sans-serif`;c.textAlign='center';c.textBaseline='middle';c.strokeStyle='#101a30';c.lineWidth=Math.max(2,h*.025);c.fillStyle='#fff4db';const xx=(.5-pivot[0])*w,yy=(.52-pivot[1])*h,t=c.getTransform?.(),surface=c.canvas,viewport=surface&&Math.abs(surface.width/surface.height-16/9)<.01;let safe=true;if(viewport&&t){const u=surface.width/1280,points=[[-h*.2,-h*.16],[h*.2,-h*.16],[h*.2,h*.16],[-h*.2,h*.16]].map(([a,b])=>({x:(t.a*(xx+a)+t.c*(yy+b)+t.e)/u,y:(t.b*(xx+a)+t.d*(yy+b)+t.f)/u})),left=Math.min(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y)),box={x:left-4,y:top-4,w:Math.max(...points.map(p=>p.x))-left+8,h:Math.max(...points.map(p=>p.y))-top+8};safe=![BATTLE_CONTROLS,...BATTLE_HUD].some(area=>overlaps(box,area));}if(safe){c.strokeText('99',xx,yy);c.fillText('99',xx,yy);}}c.restore();this.usage.set(id,(this.usage.get(id)??0)+1);return true;
 }
}
const scopes=new WeakMap<CanvasRenderingContext2D,AnimationArt>();
export function withAnimationArt<T>(ctx:CanvasRenderingContext2D,art:AnimationArt|undefined,paint:()=>T):T{const old=scopes.get(ctx);if(art)scopes.set(ctx,art);else scopes.delete(ctx);try{return paint()}finally{if(old)scopes.set(ctx,old);else scopes.delete(ctx)}}
export const scopedAnimationArt=(ctx:CanvasRenderingContext2D):AnimationArt|undefined=>scopes.get(ctx);
export const illustration=(ctx:CanvasRenderingContext2D,id:string,x:number,y:number,size:number,angle=0,dir=1,options?:IllustrationOptions):boolean=>scopes.get(ctx)?.draw(ctx,id,x,y,size,angle,dir,options)??false;
