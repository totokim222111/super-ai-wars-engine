import {safeCaption} from '../safe-area';
import {hammerPose,liftPose} from './readability';
import {illustration,withAnimationArt,scopedAnimationArt} from '../animation-art';
import {ease,type Step} from '../../flow';
import {Shape,type Sprite} from '../../stage';
import type {StrikeContext} from '../template';
import type {Sfx} from '../../sound';
import {FONT} from '../../ui';
import {CONTACT_MOVES,MOVE_SECONDS,launchSeconds,impactSeconds,type MoveDef,type MoveId,type SequenceAnim} from './catalog';
import {sticker} from './props';
import {propFill} from './palette';
import {materialImpact,materialTrail,materialResidue,MATERIALS} from './materials';
import {contactShape,guardWall} from './contacts';
import {battleLayout,clamp,mix,smooth} from './layout';
export interface MovePart{launch(c:StrikeContext,m:MoveDef,a:SequenceAnim):Step;impact(c:StrikeContext,m:MoveDef,a:SequenceAnim,arrived?:boolean):Step}
export const MOVES:Record<MoveId,MovePart>=Object.fromEntries(Object.keys(MOVE_SECONDS).map(id=>[id,{launch:(c:StrikeContext,m:MoveDef,a:SequenceAnim)=>part(c,m,a,'launch',launchSeconds(m)),impact:(c:StrikeContext,m:MoveDef,a:SequenceAnim,arrived=false)=>part(c,m,a,'impact',impactSeconds(m),arrived)}]))as Record<MoveId,MovePart>;
const multi=new Set<MoveId>(['jab-rush','headbutt','slash','thrust','spin','vulcan','missiles','bits','swarm','popup-storm','storm','stream','beam','sweep-beam','mirage','serpent','scatter']);
const defaults:Partial<Record<MoveId,MoveDef['prop']>>={'jab-rush':'fist',uppercut:'fist','slam-down':'fist','hammer-smash':'hammer',ram:'shield',slash:'sword',iai:'sword',thrust:'lance',whip:'cable',spin:'gear',stamp:'stamp',cling:'droplet',sweep:'broom',vulcan:'paper',cannon:'missile',missiles:'missile',mortar:'bomb',scatter:'pixel',bits:'satellite',lob:'bomb',stream:'droplet',swarm:'heart','popup-storm':'window',drop:'server',wave:'swirl',storm:'snowflake',bind:'chain',summon:'whale',serpent:'dragon-head'};
export const MOVE_SOUNDS:Record<MoveId,Sfx>={'jab-rush':'hit',uppercut:'heavy','slam-down':'ground-thud','hammer-smash':'ground-thud',ram:'heavy',headbutt:'hit',slash:'slash',iai:'slash',thrust:'slash',whip:'whip',spin:'whoosh',stamp:'stamp',cling:'splash',sweep:'whoosh',vulcan:'shot',cannon:'heavy',beam:'beam','sweep-beam':'beam','sky-beam':'electric',missiles:'missile',mortar:'ground-thud',scatter:'shot',bits:'shot',lob:'splash',stream:'splash',swarm:'whoosh','popup-storm':'popup',drop:'ground-thud','text-drop':'stamp',wave:'whoosh',storm:'whoosh',bind:'servo',mirage:'slash',summon:'ground-thud',serpent:'whip'};
type Pose=Pick<Sprite,'x'|'y'|'rotation'|'scaleX'|'scaleY'|'flash'|'alpha'|'visible'|'anchorX'|'anchorY'|'flipX'>;
const pose=(s:Sprite):Pose=>({x:s.x,y:s.y,rotation:s.rotation,scaleX:s.scaleX,scaleY:s.scaleY,flash:s.flash,alpha:s.alpha,visible:s.visible,anchorX:s.anchorX,anchorY:s.anchorY,flipX:s.flipX});
export function hitStops(m:MoveDef,a:SequenceAnim,seconds:number){const count=multi.has(m.move)?Math.min(Math.floor(seconds/.13),m.hits??(m.move==='headbutt'?3:m.move==='vulcan'?6:4)+(a.tier-1)):1,hold=['hammer-smash','drop','ram','slam-down'].includes(m.move)?.1:4/60;
 const at=m.move==='stamp'?.2:m.move==='drop'?.44:m.move==='iai'?.55:['missiles','mortar'].includes(m.move)?.58:['swarm','serpent'].includes(m.move)?.4:m.move==='mirage'?.38:.38;
 const positions=Array.from({length:Math.max(1,count)},(_,i)=>count===1?at:['missiles','mortar'].includes(m.move)?at+i*.035:['swarm','serpent','mirage'].includes(m.move)?at+i*.05:.28+i*.27/Math.max(1,count-1));const active=seconds-positions.length*hold;
 return{hold,active,positions,starts:positions.map((p,i)=>p*active+i*hold)};
}
export function moveClock(elapsed:number,timing:ReturnType<typeof hitStops>){let completed=0;for(let i=0;i<timing.starts.length;i++){const start=timing.starts[i];if(elapsed<start)break;if(elapsed<start+timing.hold)return{t:timing.positions[i],held:true,index:i};completed++;}return{t:clamp((elapsed-completed*timing.hold)/timing.active),held:false,index:completed-1};}
interface Visual{t:number;time:number;hit:number;held:boolean;quality:number;contacts:number[];timing:ReturnType<typeof hitStops>}
/** One owner holds sprites/camera, including hit stops; effect and sound start on that same update. */
function* part(c:StrikeContext,m:MoveDef,a:SequenceAnim,section:'launch'|'impact',seconds:number,arrived=false):Step{
 const stage=c.show.stage,A=c.attacker.sprite,D=c.defender.sprite,ap=pose(A),dp=pose(D),cam=stage.camera,cp={x:cam.x,y:cam.y,zoom:cam.zoom,shake:cam.shake},g=battleLayout(c),body=c.body(),launch=section==='launch',contact=CONTACT_MOVES.has(m.move),hit=c.outcome.hit,guard=!!c.outcome.guard;
 const state:Visual={t:0,time:0,hit:0,held:false,quality:1,contacts:[],timing:hitStops(m,a,seconds)},fx=new Shape(state,(ctx,s)=>withAnimationArt(ctx,c.scene.animationArt,()=>paint(ctx,c,m,a,section,s,g,body)));fx.z=24;stage.fx.add(fx);
 let elapsed=0,next=0;const near=body.x-c.dir*(A.width*.38+D.width*.25);
 try{while(elapsed<seconds){
  const clock=launch?{t:elapsed/seconds,held:false,index:-1}:moveClock(elapsed,state.timing),p=clock.t;Object.assign(state,{t:p,time:elapsed,held:clock.held});Object.assign(A,ap);Object.assign(D,dp);Object.assign(cam,cp);D.flash=0;
  if(launch){
   A.visible=true;const prep=Math.sin(Math.PI*clamp(elapsed/.3));A.scaleY=1-prep*.08;A.scaleX=1+prep*.05;A.x=ap.x-c.dir*prep*20;
   if(contact){const flight=smooth(.3,Math.max(.301,seconds),elapsed);A.x=mix(A.x,c.exitX,flight);A.rotation=c.dir*Math.sin(p*Math.PI)*.1;}
   else A.x-=c.dir*12*Math.sin(smooth(.3,seconds,p*seconds)*Math.PI);
   if(m.move==='spin'){A.anchorY=.5;A.y=g.ground-A.height/2;A.scaleX=elapsed<.3?1:Math.cos((elapsed-.3)/.12*Math.PI*2);A.rotation=Math.sin(p*seconds*15)*.18;}
  }else{
   A.visible=contact;A.x=mix(c.entryX,near,arrived?1:smooth(0,.22,p));A.y=g.ground;
   const last=state.contacts.at(-1),age=last===undefined?10:elapsed-last,reaction=age<state.timing.hold?1:1-smooth(state.timing.hold,state.timing.hold+.25,age);
   if(contact){const swing=Math.sin(smooth(.16,.55,p)*Math.PI);A.x+=c.dir*swing*g.height*.1;A.rotation=c.dir*swing*.12;
    if(m.move==='hammer-smash'||m.move==='slam-down'){A.y-=g.height*.5*(1-smooth(.12,.38,p));A.rotation=-c.dir*.2*(1-smooth(.15,.38,p));}
    if(m.move==='ram'||m.move==='iai')A.x=guard?near-c.dir*g.height*.12*smooth(.38,.8,p):mix(c.entryX,c.defenderHome+c.dir*g.height,smooth(.08,.75,p));
    if(m.move==='iai'&&last!==undefined){A.flipX=!ap.flipX;A.x=body.x+c.dir*g.height*.9;}
    if(m.move==='headbutt')A.x+=c.dir*Math.sin(p*Math.PI*6)*g.height*.14;
    if(m.move==='spin'){A.anchorY=.5;A.y=g.ground-A.height/2;A.rotation=Math.sin(p*seconds*15)*.2;A.scaleX=Math.cos(p*seconds/.12*Math.PI*2);}
    if(m.move==='hammer-smash'){const hand=c.point('hand'),dy=clamp(hand.y-(g.ground-g.height*.82),g.height*.2,g.height*.9),length=g.height*1.6*.74;A.x+=body.x-c.dir*Math.sqrt(Math.max(1,length*length-dy*dy))-hand.x;}
   }
   if(!hit){D.x=dp.x+c.dir*130*smooth(.12,.32,p)*(1-smooth(.8,1,p));D.y=dp.y-28*Math.sin(smooth(.2,.9,p)*Math.PI);}
   else if(guard){D.x=dp.x+c.dir*8*reaction;}
   else if(last!==undefined){
    D.x=dp.x+c.dir*(m.move==='sweep'?30:10)*reaction;D.rotation=c.dir*(m.move==='uppercut'?.25:m.move==='sweep'?.14:.045)*reaction;
    if(m.move==='uppercut'){const lift=liftPose(age,g.height,g.ground,g.safe.top);D.y=dp.y-lift.rise;D.rotation=c.dir*lift.tilt;D.scaleY=lift.scaleY;}
    if(m.move==='slam-down'||m.move==='hammer-smash'||m.move==='drop'){D.scaleY=1-.15*reaction;D.scaleX=1+.12*reaction;}
    if(m.move==='bind'||m.move==='cling')D.scaleX=D.scaleY=1-.05*reaction;
    if(m.move==='storm')D.x=dp.x+Math.sin(elapsed*45)*10*reaction;
    if(m.move==='iai'&&age<.5)D.visible=false;
    cam.shake=(clock.held?['hammer-smash','drop'].includes(m.move)?15:6+a.tier*2:8*reaction);cam.zoom=cp.zoom+.02*reaction;
   }
   while(next<state.timing.starts.length&&elapsed>=state.timing.starts[next]){state.contacts.push(state.timing.starts[next]);state.hit=++next;c.scene.sequenceNotice(c.defender,c.outcome);const sound:Sfx=guard?'shield-clang':!hit?'whoosh':m.move==='hammer-smash'||m.move==='drop'||m.move==='slam-down'?'ground-thud':a.element==='ice'?'ice-break':a.element==='volt'?'electric':a.element==='water'?'splash':MOVE_SOUNDS[m.move];c.show.sound?.play(sound,guard?.6:multi.has(m.move)?.5:.85);}
  }
  const dt=yield;elapsed+=Math.max(0,dt);if(dt>.034)state.quality=Math.max(.5,state.quality-.1);
 }}finally{fx.remove();Object.assign(A,ap);Object.assign(D,dp);Object.assign(cam,cp);if(launch&&contact)A.visible=false;}
}
const tinted=new Map<HTMLImageElement,Map<string,HTMLCanvasElement>>();
function fighterImage(c:CanvasRenderingContext2D,sp:Sprite,x:number,y:number,tint?:string,alpha=1,split=false){
 const image=sp.image;if(!image?.naturalWidth)return;let source:CanvasImageSource=image;const crop=sp.crop??{x:0,y:0,w:1,h:1};
 if(tint&&typeof document!=='undefined'){let colors=tinted.get(image);if(!colors){tinted.set(image,colors=new Map());if(tinted.size>4)tinted.delete(tinted.keys().next().value!)}else{tinted.delete(image);tinted.set(image,colors)}let canvas=colors.get(tint);if(!canvas){canvas=document.createElement('canvas');const ratio=Math.min(1,768/Math.max(image.naturalWidth,image.naturalHeight));canvas.width=Math.ceil(image.naturalWidth*ratio);canvas.height=Math.ceil(image.naturalHeight*ratio);const p=canvas.getContext('2d')!;p.drawImage(image,0,0,canvas.width,canvas.height);p.globalCompositeOperation='source-atop';p.globalAlpha=.45;p.fillStyle=tint;p.fillRect(0,0,canvas.width,canvas.height);colors.set(tint,canvas)}source=canvas}
 c.save();c.globalAlpha*=alpha;c.translate(x,y);c.scale(sp.flipX?-1:1,1);const w=sp.width,h=sp.height,iw=source===image?image.naturalWidth:(source as HTMLCanvasElement).width,ih=source===image?image.naturalHeight:(source as HTMLCanvasElement).height,sx=crop.x*iw,sy=crop.y*ih,sw=crop.w*iw,sh=crop.h*ih;
 if(split){c.drawImage(source,sx,sy,sw,sh/2,-w/2-4,-h,w,h/2);c.drawImage(source,sx,sy+sh/2,sw,sh/2,-w/2+4,-h/2,w,h/2)}else c.drawImage(source,sx,sy,sw,sh,-w/2,-h,w,h);c.restore();
}
const secondsEnd=(m:MoveDef)=>impactSeconds(m);
function paint(ctx:CanvasRenderingContext2D,c:StrikeContext,m:MoveDef,a:SequenceAnim,section:string,s:Visual,g:ReturnType<typeof battleLayout>,body:{x:number;y:number}):void{
 const launch=section==='launch',p=s.t,dir=c.dir,h=g.height,color=a.color??'#ffd23f',prop=m.prop??defaults[m.move],guard=!!c.outcome.guard,miss=!c.outcome.hit;
 const legacySize=Math.max(72,Math.min(155,(launch?g.attackerHeight:h)*.31))*(1+(a.tier-1)*.07),size=h*.55*(1+(a.tier-1)*.04),flight=smooth(.1,launch?.38:s.timing.positions[0],p),last=s.contacts.at(-1),age=last===undefined?-1:s.time-last,held=s.held;
 const dest={x:body.x+(miss?-dir*h*.65:guard?-dir*h*.52:0),y:guard?body.y-h*.04:body.y};
 const src=launch?c.muzzle():{x:c.entryX,y:dest.y},end=launch?{x:c.exitX,y:src.y}:dest,mid={x:mix(src.x,end.x,flight),y:mix(src.y,end.y,flight)};
 const dense=['swarm','storm','stream'].includes(m.move),requested=m.move==='storm'?44:m.move==='swarm'?36:m.move==='stream'?28:m.count??12,q=g.particleCount(requested,dense,s.quality);
 const headAreas=[c.attacker.sprite,c.defender.sprite].filter(sp=>sp.visible).map(sp=>({x:sp.x-sp.width*.5,y:sp.y-sp.height,w:sp.width,h:sp.height*.3}));
 const st=(x:number,y:number,sz=size,angle=0,id=prop,particle=false,grip=false)=>{if(!id)return;if(id==='droplet'&&a.element==='fire'&&illustration(ctx,'grease-drop',x,y,Math.max(particle?g.projectileMin:0,sz),angle,dir))return;if(id==='badge-number'&&!particle&&!launch){sz=h*.5;x=dest.x-dir*h*.6;y=Math.max(g.safe.top+h*.25,g.ground-h-h*.2);}if(!grip&&!particle&&id===prop&&['thrust','iai','whip','ram'].includes(m.move)&&scopedAnimationArt(ctx)?.entry(id)?.grip){grip=true;const hand=c.point('hand');x=hand.x;y=hand.y;}const min=particle?g.projectileMin:0;ctx.save();ctx.translate(x,y);if(held){ctx.scale(1.15,m.move==='stamp'?.85:.87)}sticker(ctx,id,0,0,Math.max(min,sz),propFill(id,a.element),angle,dir,{pivot:grip?'grip':'anchor',stretchMax:held?1.15:1,orientation:particle||m.move==='thrust'?'projectile':'upright'});ctx.restore()};
 const line=(pts:number[][],w=10,tint=color)=>{ctx.beginPath();pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#132035';ctx.lineWidth=w+5;ctx.stroke();ctx.strokeStyle=tint;ctx.lineWidth=w;ctx.stroke()};
 const ellipse=(x:number,y:number,rx:number,ry:number,tint=color,fill=false)=>{ctx.beginPath();ctx.ellipse(x,y,Math.max(1,rx),Math.max(1,ry),0,0,Math.PI*2);ctx.strokeStyle='#132035';ctx.lineWidth=9;if(fill){ctx.fillStyle=tint;ctx.fill()}ctx.stroke();ctx.strokeStyle=tint;ctx.lineWidth=4;ctx.stroke()};
 const targetEnd=guard&&age>.1?{x:dest.x-dir*h*.45*smooth(.1,.5,age),y:dest.y-h*.4*Math.sin(smooth(.1,.5,age)*Math.PI)}:dest;
 ctx.save();if(!launch)ctx.globalAlpha*=1-smooth(secondsEnd(m)-.10,secondsEnd(m)-.02,s.time);
 if(launch&&s.time>=.3&&p<.75&&!CONTACT_MOVES.has(m.move))illustration(ctx,'muzzle-flash',src.x,src.y,h*.55,0,dir);
 if((m.move==='ram'||CONTACT_MOVES.has(m.move)&&p<.25)&&c.attacker.sprite.visible)illustration(ctx,'speed-streak',c.attacker.sprite.x-dir*h*.4,g.ground-h*.45,h*1.1,0,dir);
 if(!launch&&age>=0&&['drop','slam-down'].includes(m.move)){illustration(ctx,'ground-crack',dest.x,g.ground,g.width*2.2);illustration(ctx,'dust-cloud',dest.x,g.ground-h*.12,h*.85);illustration(ctx,'shock-ring',dest.x,g.ground,g.width*2.3,0,1,{flatten:.6})}
 // Anticipation silhouettes are grouped by what the actor actually does, never a common muzzle ring.
 if(launch&&p<.4){if(['summon','wave','storm','mirage'].includes(m.move)){ellipse(c.attacker.sprite.x,g.ground,h*.65*p/.4,h*.12);ellipse(c.attacker.sprite.x,g.ground,h*.4*p/.4,h*.08)}else if(!CONTACT_MOVES.has(m.move)&&!['drop','lob','mortar'].includes(m.move)&&prop)st(src.x,src.y,size*(1+.3*Math.sin(p/.4*Math.PI)));}
 switch(m.move){
 case'jab-rush':case'headbutt':case'thrust':{
  if(launch){st(src.x,src.y,m.move==='thrust'?h*.9:size);break}if(age<0||held)st(mix(c.attacker.sprite.x,dest.x,flight),dest.y,m.move==='thrust'?h*.9:size);
  if(m.move==='jab-rush')for(let i=0;i<s.contacts.length;i++){const dt=s.time-s.contacts[i];if(dt<.5&&!miss&&!guard)illustration(ctx,'hit-star',dest.x+(i%2?1:-1)*h*.17,dest.y+(i%3-1)*h*.2,Math.max(48/g.scale,h*.25),i*.2)}
  if(m.move==='headbutt'&&age>=0)for(let i=0;i<4;i++)st(dest.x+(i-1.5)*h*.18,g.ground-h-h*.08,h*.16,i*.3,'star');break;}
 case'uppercut':if(!launch)st(dest.x-dir*h*.16,dest.y+h*(.55-flight*1.1),h*.62,-dir*.3);else st(src.x,src.y,size);break;
 case'slam-down':if(!launch){st(dest.x,mix(g.safe.top-h,dest.y,flight),h*.85,dir*.65);if(age>=0){ellipse(dest.x,g.ground,g.width*(1+clamp(age)*2),h*.12);for(let i=0;i<6;i++)line([[dest.x,g.ground],[dest.x+(i-2.5)*h*.4,g.ground-h*.06],[dest.x+(i-2.5)*h*.55,g.ground]],5,'#463d38')}}break;
 case'hammer-smash':{const head={x:dest.x,y:g.ground-h*.82},pose=hammerPose(launch?0:s.time,launch?.48:s.timing.starts[0],h,head,dir,c.point('hand'));ctx.save();ctx.globalAlpha*=launch?1:pose.alpha;st(pose.x,pose.y,pose.size,pose.angle,prop,false,true);ctx.restore();ellipse(dest.x,g.ground,g.width*.65,h*.08,'#303544',true);if(!launch&&age>=0&&age<.4){illustration(ctx,'ground-crack',dest.x,g.ground,g.width*2.2);illustration(ctx,'shock-ring',dest.x,g.ground,g.width*2.4,0,1,{flatten:.6});}break;}
 case'ram':if(prop)st(c.attacker.sprite.x+dir*h*.28,g.ground-h*.45,h*.85);for(let i=0;i<3;i++)line([[c.attacker.sprite.x-dir*h,c.attacker.sprite.y-h*.7+i*h*.15],[c.attacker.sprite.x-dir*h*.35,c.attacker.sprite.y-h*.7+i*h*.15]],6);break;
 case'slash':case'iai':{
  if(launch)st(src.x,src.y,h*.7,-dir*.6);else if(m.move==='iai'){if(p<.48){ctx.fillStyle='rgba(2,4,14,.86)';ctx.fillRect(0,0,g.w,g.h)}if(p>.38&&age<.5)line([[0,dest.y],[g.w,dest.y]],6,'#f8f2df');if(c.outcome.hit&&!guard&&age>=0&&age<.5)fighterImage(ctx,c.defender.sprite,c.defender.sprite.x,g.ground,undefined,1,true)}
  else if(age<0||held){const hand=c.point('hand'),grip=!!scopedAnimationArt(ctx)?.entry(prop??'sword')?.grip;st(grip?hand.x:dest.x-dir*h*.15,grip?hand.y:dest.y,h*.75,dir*(s.hit%2?.6:-.6),prop,false,grip);}break;}
 case'whip':{const from=launch?src:{x:c.attacker.sprite.x,y:g.ground-h*.45},pts=Array.from({length:24},(_,i)=>{const t=i/23;return[mix(from.x,targetEnd.x,t),mix(from.y,targetEnd.y,t)+Math.sin(t*Math.PI*2-p*8)*h*.3*Math.sin(t*Math.PI)]});line(pts,18);st(targetEnd.x,targetEnd.y,Math.max(g.projectileMin,h*.18));if(!launch&&!miss&&!guard&&age>=0&&age<.4)ellipse(dest.x,dest.y,h*.42,h*.13);break;}
 case'spin':if(!launch)for(let i=0;i<4;i++){const angle=p*impactSeconds(m)*16+i*Math.PI/2,r=held?h*.14:h*.6;st(dest.x+Math.cos(angle)*r,dest.y+Math.sin(angle)*r*.65,h*.4,angle)}else st(src.x,src.y,h*.6);break;
 case'stamp':if(!launch){if(age<.12)st(dest.x,mix(g.safe.top,dest.y,flight),h*.85);if(age>=0){const yy=clamp(dest.y,g.safe.top+h*.15,g.safe.bottom-h*.15);ellipse(dest.x,yy,h*.32,h*.27);ctx.font=`900 ${Math.round(h*.23)}px ${FONT.display}`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=color;ctx.strokeStyle='#142033';ctx.lineWidth=6;const word=(m.words??[]).join(' ');if(word){const wx=clamp(dest.x-dir*h*.45,g.safe.left+h*.3,g.safe.right-h*.3),wy=clamp(g.ground-h-h*.18,g.safe.top+h*.12,g.safe.bottom);const b=safeCaption(wx,wy,h,h*.23+12,headAreas);ctx.strokeText(word,b.x+b.w/2,b.y+b.h/2,h);ctx.fillText(word,b.x+b.w/2,b.y+b.h/2,h)}else st(dest.x,yy,h*.4)}}else st(src.x,src.y,size);break;
 case'cling':if(!launch&&age<.2){for(let i=0;i<4;i++){const angle=i*Math.PI/2;st(dest.x+Math.cos(angle)*h*.25,dest.y+Math.sin(angle)*h*.25,h*.3)}}break;
 case'sweep':if(!launch){const hand=c.point('hand'),angle=Math.atan2(g.ground-h*.12-hand.y,dest.x-hand.x)-Math.atan2(.75,-.75);st(hand.x,hand.y,h*.9,angle,prop,false,true);line([[dest.x-dir*h*.8,g.ground-8],[dest.x+dir*h*.7,g.ground-8]],10,'#b89b77')}break;
 case'scatter':{const bullets=scatterParticles(s.time,launch?src:{x:c.entryX,y:dest.y},launch?{x:c.exitX,y:src.y}:targetEnd);for(const b of bullets)st(b.x,b.y,Math.max(32,g.projectileMin,h*.15),b.angle,prop,true);break;}
 case'vulcan':{
  const n=m.move==='vulcan'?12:8;for(let i=0;i<n;i++){const shift=false?i*.03/(launch?launchSeconds(m):s.timing.active):i*.015, t=ease.in(clamp((p-.12-shift)/(s.timing.positions[0]-.12))),angle=(i/(n-1)-.5)*Math.PI/3.6;
   const endX=launch?c.exitX:targetEnd.x+Math.sin(i*2.4)*g.width*.6,endY=launch?src.y+Math.tan(angle)*g.w*.6:targetEnd.y+(m.move==='vulcan'?(i%3-1)*h*.22:(i/(n-1)-.5)*h*.85);
   const x=mix(src.x,endX,t),y=mix(src.y,endY,t);if(age<0||held||m.move==='vulcan'&&age<.3)st(x,y,Math.max(g.projectileMin,h*.13),angle,prop,true);if(!launch&&t>=1&&age>=0&&age<.35)contactShape(ctx,m.move,endX,endY,h*.18,dir,color,i)}break;}
 case'cannon':{if(age<0||held||launch){const x=guard?Math.min(Math.max(mid.x,Math.min(src.x,targetEnd.x)),Math.max(src.x,targetEnd.x)):mid.x;materialTrail(ctx,a.element,x,mid.y,dir,h*.35,p,g.fragmentMin);st(x,mid.y,h*.6,0,prop,true)}if(launch&&p>.34&&p<.55)contactShape(ctx,'cannon',src.x,src.y,h*.4,dir,color);break;}
 case'beam':case'sweep-beam':case'sky-beam':{
  const charge=launch?.4/launchSeconds(m):.2;if(p<charge){if(!illustration(ctx,'hit-star',src.x,src.y,h*.3*smooth(0,charge,p)))ellipse(src.x,src.y,h*.18*smooth(0,charge,p),h*.18*smooth(0,charge,p),MATERIALS[a.element].color,true);break}if(p<.8){const width=h*.35*(m.move==='sweep-beam'?.6:1),endY=targetEnd.y+(m.move==='sweep-beam'?Math.tan(mix(-.436,.436,smooth(.25,.65,p)))*g.w*.4:0);
   const pts=m.move==='sky-beam'?launch?[[src.x,src.y],[src.x,-h]]:[[targetEnd.x,g.safe.top],[targetEnd.x,guard?targetEnd.y:g.ground]]:[[src.x,src.y],[guard?targetEnd.x:launch?c.exitX:dest.x+dir*h*1.4,endY]];
   line(pts,width);line(pts,width*.32,'#fcf3d6');}if(!launch&&m.move==='sweep-beam'&&age>=0)line([[dest.x-h*.9,g.ground-5],[dest.x+h*.9,g.ground-5]],12,'#564855');break;}
 case'missiles':case'mortar':case'lob':{const n=m.move==='missiles'?Math.min(q,8):m.move==='mortar'?Math.min(q,4):1;for(let i=0;i<n;i++){const t=m.move==='lob'?flight:clamp((p-.16-i*.035)/.42),x=mix(src.x,guard?targetEnd.x:end.x+dir*i*legacySize*.2,t),y=mix(src.y,guard?targetEnd.y:end.y,t)-Math.sin(t*Math.PI)*legacySize*(m.move==='mortar'?3:1.8);materialTrail(ctx,a.element,x,y,dir,h*.3,p,g.fragmentMin);if(age<0||held||launch)st(x,y,m.move==='lob'?h*.6:Math.max(g.projectileMin,h*.33),-Math.sin(t*Math.PI)*dir*.7,prop,true)}if(!launch&&m.move==='mortar'&&age<0)ellipse(dest.x,g.ground,h*flight,h*.08);break;}
 case'bits':for(let i=0;i<Math.min(q,8);i++){const angle=i*Math.PI*2/Math.min(q,8)-.2,x=(launch?src.x:dest.x)+Math.cos(angle)*legacySize*2,y=(launch?src.y:dest.y)+Math.sin(angle)*legacySize*1.5;st(x,y,Math.max(g.projectileMin,h*.3),angle,prop,true);if(!launch&&p>.28+i*.04&&p<.65+i*.02)line([[x,y],[targetEnd.x,targetEnd.y]],6)}break;
 case'stream':{ctx.save();ctx.globalAlpha*=1-smooth(.55,.8,p);for(let i=0;i<q;i++){const t=ease.out((p*1.8+i/q)%1),spread=Math.sin(i*2.4)*h*.5;st(mix(src.x,end.x,t),mix(src.y,end.y+spread,t),Math.max(g.projectileMin,h*.14),i*.7,prop,true)}ctx.restore();break;}
 case'swarm':{for(let i=0;i<q;i++){const t=smooth(.08+(i%7)*.02,.4+(i%7)*.02,p),x=mix(src.x,targetEnd.x+Math.sin(i*2.4)*g.width*.65,t),y=mix(src.y,targetEnd.y+Math.cos(i*1.7)*h*.48,t);if(p<.73)st(x,y,Math.max(g.projectileMin,h*.23),Math.sin(i+p)*.35,prop,true);else{const z=smooth(.73,1,p);st(x+Math.cos(i)*h*z,y+Math.sin(i)*h*z,Math.max(g.projectileMin,h*.23),i,prop,true)}}break;}
 case'popup-storm':{if(launch){st(src.x,src.y,h*.5);break}for(let i=0;i<12;i++){const appear=i*.025;if(p<appear)continue;const z=smooth(.5,.86,p),x=clamp(dest.x+Math.sin(i*2.4)*h*.45+Math.cos(i)*h*z,40,g.w-40),y=clamp(dest.y+Math.cos(i*1.6)*h*.5+Math.sin(i)*h*z,160,Math.min(600,g.ground));ctx.save();ctx.globalAlpha*=1-smooth(.6,.95,p);if(z<.2)st(x,y,h*.44,i);else if(!illustration(ctx,'ice-chip',x,y,Math.max(32/g.scale,h*.12),i+z*2,dir))st(x,y,h*.12,i,'paper',true);ctx.restore()}}break;
 case'drop':{if(launch){st(src.x,mix(src.y,g.safe.top-h*.6,smooth(.1,.75,p)),h*.8);break;}if(age<0)ellipse(dest.x,g.ground,h*(.2+flight*.55),h*.1,'#303344',true);const sz=Math.min(h*1.9,(g.ground-g.safe.top)*.95),rebound=age>=0?smooth(.1,.4,age):0;ctx.save();ctx.globalAlpha*=1-smooth(.12,.4,age);const xx=clamp(dest.x-dir*h*.45*rebound,sz*.55,g.w-sz*.55),yy=clamp(mix(g.safe.top+sz*.5,g.ground-sz*.5,flight)-h*.12*Math.sin(rebound*Math.PI),g.safe.top+sz*.5,g.ground-sz*.5);st(xx,yy,sz,dir*rebound*.45);ctx.restore();break;}
 case'text-drop':{const word=(m.words??['!']).join(' ');let fs=Math.min(72,h*.25);ctx.font=`900 ${fs}px ${FONT.display}`;fs=Math.floor(fs*Math.min(1,(g.safe.right-g.safe.left-48)/Math.max(1,ctx.measureText(word).width)));ctx.font=`900 ${fs}px ${FONT.display}`;ctx.textAlign='center';ctx.textBaseline='middle';const yy=launch?g.safe.top+fs:mix(g.safe.top+fs,Math.max(g.safe.top+fs,dest.y-h*.35),smooth(.12,.38,p)),b=safeCaption(dest.x,yy,ctx.measureText(word).width+16,fs+20,headAreas);ctx.strokeStyle='#142033';ctx.lineWidth=8;ctx.fillStyle=color;ctx.strokeText(word,b.x+b.w/2,b.y+b.h/2);ctx.fillText(word,b.x+b.w/2,b.y+b.h/2);break;}
 case'wave':if(!launch)ctx.globalAlpha*=1-smooth(1-.2/impactSeconds(m),1,p);for(let i=0;i<4;i++){const t=clamp((p-.1-i*.08)/.5),x=launch?src.x:dest.x;ellipse(x,launch?src.y:mix(dest.y,g.ground,smooth(.65,.88,p)),h*(.1+t*1.6),h*(.1+t*.8)*(1-smooth(.65,.9,p)*.65));if(prop)st(x+Math.cos(i*1.7)*h*t,launch?src.y:dest.y+Math.sin(i*1.7)*h*t*.4,h*.23,i,prop,true)}break;
 case'storm':{if(launch)break;const active=smooth(0,.1,s.time)*(1-smooth(.65,.8,s.time));ctx.save();ctx.globalAlpha*=active;for(let j=0;j<2;j++){if(illustration(ctx,'storm-ring',dest.x,dest.y,h*(1.3-j*.18),p*5+j*Math.PI,dir))continue;const pts=Array.from({length:32},(_,i)=>{const t=i/31,angle=t*Math.PI*3+p*5+j*Math.PI;return[dest.x+Math.cos(angle)*h*1.1*(1-t*.5),dest.y+Math.sin(angle)*h*.6]});line(pts,14,MATERIALS[a.element].color);}for(let i=0;i<q;i++){const angle=i*2.4+p*9,rr=.3+(i%7)*.12;st(dest.x+Math.cos(angle)*h*1.2*rr,dest.y+Math.sin(angle)*h*.8*rr,Math.max(g.projectileMin,h*.2),angle,prop,true);}ctx.restore();break;}
 case'bind':{if(launch){st(src.x,src.y,size);break;}const fade=1-smooth(.65,1,p);ctx.save();ctx.globalAlpha*=fade;if(prop==='cage'){const sz=Math.min(h*1.35,g.ground-g.safe.top),cx=clamp(dest.x,sz*.6,g.w-sz*.6),cy=g.ground-sz*.5,entry=scopedAnimationArt(ctx)?.entry('cage'),ratio=entry?.rect?entry.rect[2]/Math.max(entry.rect[2],entry.rect[3]):1,wide=Math.max(1,g.width*1.15/Math.max(1,sz*ratio)),drawCage=()=>{ctx.save();ctx.translate(cx,cy);ctx.scale(wide,1);st(0,0,sz);ctx.restore();};drawCage();if(!miss&&!guard){fighterImage(ctx,c.defender.sprite,c.defender.sprite.x,c.defender.sprite.y);ctx.save();ctx.beginPath();ctx.rect(cx-sz*.5,cy-sz*.5,sz*.15,sz);ctx.rect(cx+sz*.35,cy-sz*.5,sz*.15,sz);ctx.rect(cx-sz*.5,g.ground-sz*.15,sz,sz*.15);ctx.rect(cx-sz*.08,cy-sz*.15,sz*.16,sz*.4);ctx.clip();drawCage();ctx.restore();}}else{for(let j=0;j<2;j++)for(let i=0;i<8;i++){const t=i/7,angle=(j?-.7:.7),span=h*(1.4-smooth(.08,.38,p)*.6),r=guard&&age>=0?smooth(0,.4,age):0,xx=dest.x+(t-.5)*span*Math.cos(angle)-dir*h*r,yy=dest.y+(t-.5)*span*Math.sin(angle)+(j-.5)*h*.22;st(xx,yy,h*.37,angle+(i%2?.12:-.12),prop);}}ctx.restore();break;}
 case'mirage':{for(let i=0;i<3;i++){const arrive=smooth(.08+i*.04,.38+i*.04,p),alpha=.7*(1-smooth(.58+i*.04,.9,p)),x=launch?src.x+(i-1)*g.cloneSpacing:mix(c.entryX,dest.x-dir*(i-1)*g.cloneSpacing,arrive);fighterImage(ctx,c.attacker.sprite,x,g.ground,['#55e2ef','#ec6dc5','#f1d871'][i],alpha)}break;}
 case'summon':{const t=smooth(.08,.75,p),x=launch?mix(c.attacker.sprite.x,c.exitX,t):mix(c.entryX,c.exitX,t),sz=Math.max(h*1.6,g.h*.6);ellipse(x,g.ground,sz*.5,sz*.06,'#3e4c56',true);st(x,g.ground-sz*.45,sz,Math.sin(p*Math.PI)*dir*.1);if(!launch&&age>=0)materialImpact(ctx,'water',dest.x,g.ground-h*.1,clamp(age/.6),h,8,g.fragmentMin);break;}
 case'serpent':{const n=9,t=launch?smooth(.05,.6,p):smooth(.06,.4,p),headX=launch?mix(src.x,c.exitX,t):mix(c.entryX,dest.x+dir*h*.1,t),yy=(i:number)=>(launch?src.y:dest.y)+Math.sin(i*.4-p*7)*40;for(let i=n;i>0;i--){const xx=headX-dir*i*h*.21;if(!illustration(ctx,i===n?'dragon-tail':'dragon-segment',xx,yy(i),h*.44,Math.sin(i*.4-p*7)*.1,dir))st(xx,yy(i),h*.35,0,'gear');}st(headX,yy(0),h*.8,0);break;}

 }
 if(!launch){
  for(let i=Math.max(0,s.contacts.length-2);i<s.contacts.length;i++){const elapsed=s.time-s.contacts[i];if(elapsed<0)continue;const at={x:dest.x-dir*g.width*.55+(multi.has(m.move)?Math.sin(i*2.4)*g.width*.2:0),y:dest.y+(multi.has(m.move)?Math.cos(i*2.4)*h*.16:0)};
   ctx.save();if(!miss&&!guard){ctx.beginPath();const edge=c.defender.sprite.x-dir*g.width*.1;ctx.rect(dir>0?0:edge,g.safe.top,dir>0?edge:g.w-edge,g.ground-g.safe.top);ctx.clip();}
   if(!miss&&!guard&&elapsed<4/60)contactShape(ctx,m.move,at.x,at.y,h,dir,MATERIALS[a.element].color,i);
   if(guard){if(elapsed<.4){guardWall(ctx,dest.x,body.y,h*1.1,'#86d9eb',-dir);if(elapsed<.18)illustration(ctx,'hit-star',dest.x-dir*h*.25,dest.y,48/g.scale)}}
   else if(miss){if(elapsed<.18)illustration(ctx,'dust-cloud',at.x,g.ground,h*.4);}
   else if(scopedAnimationArt(ctx)?.ready(a.element+'-burst'))materialImpact(ctx,a.element,at.x,at.y,elapsed/.25,h*1.42,6,g.fragmentMin);
   else if(elapsed>=s.timing.hold*.7)materialImpact(ctx,a.element,at.x,at.y,(elapsed-s.timing.hold*.7)/.25,h*1.42,6,g.fragmentMin);
   ctx.restore();
  }
  if(m.move==='sweep-beam'&&age>=0&&age<.8&&!guard&&!miss){ctx.save();ctx.globalAlpha*=1-age/.8;line([[dest.x-g.width,g.ground],[dest.x+g.width,g.ground]],10,MATERIALS[a.element].color);ctx.restore();}
  if(age>=.1&&!guard&&!miss)materialResidue(ctx,a.element,dest.x,g.ground,Math.max(0,age-.1)/Math.max(.1,secondsEnd(m)-s.timing.starts.at(-1)!-.15),h,g.width,g.fragmentMin);
  if(m.words?.length&&m.move!=='text-drop'&&m.move!=='stamp'&&age>=0&&age<.5){const text=m.words.join(' '),fs=Math.min(h*.24,100,(g.safe.right-g.safe.left)/Math.max(1,Array.from(text).length))*(miss?.5:1);ctx.font=`900 ${Math.round(fs)}px ${FONT.display}`;ctx.textAlign='center';ctx.textBaseline='middle';const yy=clamp(g.ground-h-fs*.7,g.safe.top+fs/2,g.safe.bottom-fs/2),xx=clamp(dest.x-dir*h*.45,g.safe.left+ctx.measureText(text).width/2,g.safe.right-ctx.measureText(text).width/2);ctx.strokeStyle='#142033';ctx.lineWidth=6;ctx.fillStyle=color;const b=safeCaption(xx,yy,ctx.measureText(text).width+12,fs+12,headAreas);ctx.strokeText(text,b.x+b.w/2,b.y+b.h/2);ctx.fillText(text,b.x+b.w/2,b.y+b.h/2)}
 }
 ctx.restore();
}

export function scatterParticles(time:number,from:{x:number;y:number},to:{x:number;y:number}){
 return Array.from({length:8},(_,i)=>{const age=time-(.08+i*.023),t=age/.42,angle=(i/7-.5)*Math.PI/3.6;return{x:mix(from.x,to.x,t),y:mix(from.y,to.y,t)+Math.tan(angle)*Math.abs(to.x-from.x)*t,angle,t};}).filter(b=>b.t>=0&&b.t<=1);
}
