import {readable} from './presentation';
import {FONT,wrap} from './ui';
import {W,H} from './stage';
import {focalImageRect,type ImageFocus} from './image-layout';
import type {BattleLines} from './battle/lines';

export interface LoadingEntry {image:string;cast:string;requiresFlag?:string;focus?:ImageFocus}
export interface LoadingSlide extends LoadingEntry {name:string;color:string;lines:string[]}
export interface LoadingManifest {screens:LoadingSlide[];fallbacks:LoadingSlide[];playerName:string;placeholders:Record<string,'name'|'unitName'>}

/** Read only authored sentences, including optional weapon/form/opponent pools. */
export function loadingLines(bank?:BattleLines):string[]{
 const found=new Set<string>();const visit=(v:unknown):void=>{if(!v||typeof v!=='object')return;if('text'in v&&typeof v.text==='string'){if(v.text.trim())found.add(v.text);return;}Object.values(v).forEach(visit);};visit(bank);return [...found];
}
export function chooseSlide(pool:readonly LoadingSlide[],previous?:string,random= Math.random):LoadingSlide|undefined{
 const fresh=pool.filter(s=>s.image!==previous),choices=fresh.length?fresh:pool;return choices[Math.min(choices.length-1,Math.floor(Math.max(0,random())*choices.length))];
}
export function chooseQuote(lines:readonly string[],resolve:(text:string)=>string,random=Math.random):string{
 const resolved=[...new Set(lines.map(resolve))].filter(s=>s.trim());if(!resolved.length)return '';
 const short=resolved.filter(s=>Array.from(s).length<=58),min=Math.min(...resolved.map(s=>Array.from(s).length));
 const choices=short.length?short:resolved.filter(s=>Array.from(s).length===min);return choices[Math.min(choices.length-1,Math.floor(Math.max(0,random())*choices.length))];
}
/** Smooth actual completion only; no fake advance and no reversal within one load. */
export class LoadingProgress {
 target=0;value=0;private elapsed=0;minimum=0;
 reset():void{this.target=this.value=this.elapsed=0;}
 set(done:number,total:number):void{if(Number.isFinite(done)&&Number.isFinite(total)&&total>0)this.target=Math.max(this.target,Math.min(1,Math.max(0,done/total)));}
 tick(dt:number):number{this.elapsed+=Math.max(0,dt);const target=Math.min(this.target,this.minimum?this.elapsed/this.minimum:1);this.value=Math.min(target,this.value+(target-this.value)*(1-Math.exp(-12*Math.max(0,dt))));if(target-this.value<.0001||this.target===1&&this.minimum>0&&this.elapsed>=this.minimum)this.value=target;return this.value;}
}

export type LoadingBoundary='boot'|'story-end'|'stage-end';
/** Only section boundaries own a full loading screen. No sound or browser timers. */
export class LoadingTransition {
 active=false;alpha=0;elapsed=0;private ready=false;private leaving=false;private fade=0;
 static readonly fadeSeconds=.28;static readonly minimumSeconds=2;
 constructor(private readonly swap:()=>void,private readonly finish:()=>void){}
 begin():void{this.active=true;this.alpha=this.elapsed=this.fade=0;this.ready=this.leaving=false;}
 complete():void{this.ready=true;}
 tick(dt:number):void{if(!this.active)return;this.elapsed+=dt;
  if(this.leaving){this.fade+=dt;this.alpha=Math.max(0,1-this.fade/LoadingTransition.fadeSeconds);if(!this.alpha){this.active=false;this.finish();}return;}
  this.alpha=Math.min(1,this.elapsed/LoadingTransition.fadeSeconds);
  if(this.ready&&this.elapsed>=LoadingTransition.fadeSeconds+LoadingTransition.minimumSeconds){this.swap();this.leaving=true;this.fade=0;}
 }
}

/** One decoded current image and one prefetch. Presentation RNG never touches combat. */
export class LoadingScreen {
 readonly progress=new LoadingProgress();slide?:LoadingSlide;image?:HTMLImageElement;private rawQuote='';
 get quote():string{return this.resolve(this.rawQuote);}
 private last?:string;private next?:{slide:LoadingSlide;image:Promise<HTMLImageElement|undefined>};private pending=Promise.resolve();
 private serial=0;private elapsed=0;private appeared=0;
 resolve:(text:string)=>string;
 constructor(readonly manifest:LoadingManifest,private readonly read:(path:string)=>Promise<HTMLImageElement|undefined>,private readonly random=Math.random){
  this.resolve=text=>text.replace(/\{([^{}]+)\}/g,(whole,key:string)=>manifest.placeholders[key]==='name'?manifest.playerName:whole);
 }
 flagValue:(name:string)=>string|number|boolean=()=>false;
 private allowed=(s:LoadingSlide):boolean=>!s.requiresFlag||this.flagValue(s.requiresFlag)===true||this.flagValue(s.requiresFlag)===1;
 private pool():LoadingSlide[]{const main=this.manifest.screens.filter(this.allowed);return main.length?main:this.manifest.fallbacks.filter(this.allowed);}
 begin():void{
  const serial=++this.serial;this.elapsed=this.appeared=0;this.progress.reset();this.image=undefined;this.rawQuote='';
  if(this.next&&!this.allowed(this.next.slide))this.next=undefined;
  const chosen=this.next?.slide??chooseSlide(this.pool(),this.last,this.random),prefetched=this.next;this.next=undefined;this.slide=chosen;
  this.pending=(async()=>{const rest=[...this.pool(),...this.manifest.fallbacks.filter(this.allowed)].filter(s=>s.image!==chosen?.image),seen=new Set<string>();
   for(const slide of [...chosen?[chosen]:[],...rest]){if(seen.has(slide.image))continue;seen.add(slide.image);let image:HTMLImageElement|undefined;
    try{image=await(prefetched?.slide===slide?prefetched.image:this.read(slide.image));}catch{/* Optional loading art never blocks play. */}
    if(serial!==this.serial)return;if(!image?.naturalWidth)continue;
    this.slide=slide;this.last=slide.image;this.image=image;const chosen=chooseQuote(slide.lines,this.resolve,this.random);this.rawQuote=slide.lines.find(line=>this.resolve(line)===chosen)??'';return;
   }
  })();
 }
 imageReady():Promise<void>{return this.pending;}
 end():void{
  // Start only after foreground assets finish; no competition with the first image.
  if(this.next)return;const slide=chooseSlide(this.pool(),this.last,this.random);if(slide)this.next={slide,image:this.read(slide.image).catch(()=>undefined)};
 }
 draw(ctx:CanvasRenderingContext2D,dt:number,reduce=false):void{
  this.elapsed+=dt;const p=this.progress.tick(dt);ctx.save();const opacity=ctx.globalAlpha;ctx.fillStyle='#050816';ctx.fillRect(0,0,W,H);
  if(this.image?.naturalWidth){this.appeared+=dt;ctx.globalAlpha=opacity*Math.min(1,this.appeared/.3);const zoom=reduce?1:1.02+.04*Math.min(1,this.elapsed/8),r=focalImageRect(this.image.naturalWidth,this.image.naturalHeight,{x:0,y:0,w:W,h:H},this.slide?.focus??[.5,1/3],zoom,[0,0],'cover');ctx.drawImage(this.image,r.x,r.y,r.w,r.h);ctx.globalAlpha=opacity;}
  // A localized lower-left shade leaves the right two thirds clear.
  const shade=ctx.createRadialGradient(0,H,0,0,H,790);shade.addColorStop(0,'rgba(3,7,18,.94)');shade.addColorStop(.57,'rgba(3,7,18,.60)');shade.addColorStop(1,'rgba(3,7,18,0)');ctx.fillStyle=shade;ctx.fillRect(0,0,W,H);
  if(this.image&&this.slide){ctx.textAlign='left';ctx.fillStyle='#fff';ctx.font=`${readable(32)}px ${FONT.display}`;const width=448,nameWidth=Math.min(width-36,ctx.measureText(this.slide.name).width);ctx.fillText(this.slide.name,48,H-166,width-36);ctx.fillStyle=this.slide.color;const x=48+nameWidth+14;ctx.beginPath();ctx.moveTo(x,H-192);ctx.lineTo(x+18,H-192);ctx.lineTo(x+8,H-168);ctx.lineTo(x-10,H-168);ctx.closePath();ctx.fill();
   let size=readable(18),lines:string[]=[];for(;size>=readable(12);size--){ctx.font=`${size}px ${FONT.body}`;lines=wrap(ctx,this.quote,width);if(lines.length<=2)break;}if(lines.length<=2){ctx.fillStyle='rgba(255,255,255,.94)';lines.forEach((line,i)=>ctx.fillText(line,48,H-130+i*26));}
  }
  ctx.fillStyle='rgba(0,0,0,.64)';ctx.fillRect(0,H-64,W,64);ctx.textAlign='left';ctx.fillStyle='#fff';ctx.font=`bold ${readable(19)}px ${FONT.num}`;
  let x=48;for(const c of 'NOW LOADING'){ctx.fillText(c,x,H-25);x+=ctx.measureText(c).width+2;}
  for(let i=0;i<3;i++){ctx.globalAlpha=opacity*(reduce||Math.floor(this.elapsed*3)%4>i?1:.22);ctx.fillText('.',x+i*8,H-25);}ctx.globalAlpha=opacity;
  const start=274,end=W-126;ctx.fillStyle='rgba(255,255,255,.2)';ctx.fillRect(start,H-34,end-start,4);ctx.fillStyle='#ffd23f';ctx.fillRect(start,H-34,(end-start)*p,4);
  ctx.textAlign='right';ctx.font=`${readable(20)}px ${FONT.num}`;ctx.fillStyle='#fff';ctx.fillText(String(Math.floor(p*100)).padStart(3,' ')+'%',W-48,H-25);ctx.restore();
 }
}
