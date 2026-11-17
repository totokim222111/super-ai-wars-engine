import {safeCaption} from '../safe-area';
import {withAnimationArt,illustration} from '../animation-art';
import type {Step} from '../../flow';
import {Shape,W,H} from '../../stage';
import {FONT} from '../../ui';
import {flash} from '../../fx';
import type {StrikeContext} from '../template';
import {CLOSER_SECONDS,type SequenceAnim} from './catalog';
import {MATERIALS,illustratedBurst,materialImpact,materialResidue} from './materials';
import {sticker} from './props';
import {propFill} from './palette';
import {battleLayout,clamp} from './layout';
const mixCloser=(a:number,b:number,t:number)=>a+(b-a)*t;
export function* closeSequence(c:StrikeContext,a:SequenceAnim):Step{
 const seconds=CLOSER_SECONDS[a.closer];if(!seconds)return;
 if(!c.outcome.hit||c.outcome.guard){let time=0;while(time<Math.min(.2,seconds))time+=Math.max(0,yield);return;}
 const g=battleLayout(c),body=c.body(),x=clamp(body.x+(!c.outcome.hit?c.dir*g.height*.65:0),g.safe.left+g.height*.2,g.safe.right-g.height*.2),y=a.closer==='rainbow'?body.y:clamp(body.y-g.height*.1,g.safe.top+g.height*.15,g.safe.bottom-g.height*.15),show=c.show,cam=show.stage.camera,oldShake=cam.shake,oldZoom=cam.zoom;
 const materialColor=MATERIALS[a.element].color,channel=[1,3,5].map(i=>parseInt(materialColor.slice(i,i+2),16)),blastColors=[0,.28,.6].map(k=>'rgb('+channel.map(n=>Math.round(n+(255-n)*k)).join(',')+')');
 const word=a.moves.flatMap(m=>m.words??[]).join(' ')||'!',color=a.color??'#ffd23f',state={closer:a.closer,t:0};
 if(a.closer==='nova')flash(show,.85,3/60);
 const node=new Shape(state,(ctx,s)=>withAnimationArt(ctx,c.scene.animationArt,()=>{
  const t=s.t,fade=Math.min(1,t*12,(1-t)*7),r=g.height*.55;ctx.save();ctx.globalAlpha*=fade;
  if(a.moves.some(m=>m.prop==='cage')){const sz=Math.min(g.height*1.35,g.ground-g.safe.top);illustration(ctx,'cage',x,g.ground-sz*.5,sz,0,1);ctx.restore();return;}
  switch(a.closer){
   case'nova':{ctx.save();ctx.globalAlpha*=t>3/60/seconds?.6:1;const ring=illustration(ctx,'nova-ring',x,y,g.height*1.2*Math.min(1,t*8),0,1);ctx.restore();if(ring){if(t>.55)materialResidue(ctx,a.element,x,g.ground,(t-.55)/.45,g.height,g.width,g.fragmentMin);break;}if(illustratedBurst(ctx,a.element,x,y,t,g.height*1.2,g.height*1.25,g.fragmentMin)){illustration(ctx,'shock-ring',x,g.ground,g.w*.8,0,1,{flatten:.6});if(t>.55)materialResidue(ctx,a.element,x,g.ground,(t-.55)/.45,g.height,g.width,g.fragmentMin);break;}const k=t<.25?t/.25:t<.59?1:1-(t-.59)/.41;for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(x,y,g.h*.35*k*(1-i*.18),g.h*.33*k*(1-i*.18),0,0,Math.PI*2);ctx.fillStyle=blastColors[i];ctx.strokeStyle='#172036';ctx.lineWidth=5;ctx.fill();ctx.stroke()}for(let i=0;i<2;i++){ctx.beginPath();ctx.ellipse(x,y,g.h*(.2+t*.5+i*.08),g.h*(.08+t*.18),0,0,Math.PI*2);ctx.strokeStyle=MATERIALS[a.element].color;ctx.lineWidth=8-i*3;ctx.stroke()}if(t>.55)materialResidue(ctx,a.element,x,g.ground,(t-.55)/.45,g.height,g.width,g.fragmentMin);break;}
   case'blackout':ctx.fillStyle=`rgba(2,3,12,${Math.sin(t*Math.PI)*.94})`;ctx.fillRect(0,0,W,H);if(t<.15){illustration(ctx,'speed-streak',x-g.height*.3,y,g.height*.6,0,-1);illustration(ctx,'speed-streak',x+g.height*.3,y,g.height*.6,0,1);}if(t>.55){const q=(t-.55)/.45,k=Math.min(1,q*5)*(1-Math.max(0,(q-.7)/.3));if(!illustratedBurst(ctx,a.element,x,y,q,g.height*1.2,g.height*1.25,g.fragmentMin))for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(x,y,g.h*.3*k*(1-i*.18),g.h*.28*k*(1-i*.18),0,0,Math.PI*2);ctx.fillStyle=blastColors[i];ctx.strokeStyle='#142033';ctx.lineWidth=4;ctx.fill();ctx.stroke()}if(!c.scene.animationArt?.ready(a.element+'-burst'))materialImpact(ctx,a.element,x,y,q,g.h*.6,16,g.fragmentMin)}break;
   case'terminal':{ctx.fillStyle='rgba(1,12,13,.88)';for(let i=0;i<18;i++)if(t>i/35)ctx.fillRect(0,i*g.h/18,g.w,Math.min(g.h/18,t*g.h*.25));ctx.font=`700 42px ${FONT.num}`;ctx.fillStyle='#8fffc4';ctx.textAlign='left';const line='> '+word+' _';ctx.fillText(line.slice(0,Math.max(1,Math.floor(t*line.length*2))),g.safe.left,g.safe.top+g.h*.15,g.safe.right-g.safe.left);for(let i=0;i<7;i++){ctx.globalAlpha=fade*(1-i*.1);ctx.fillRect(g.safe.left,g.safe.top+g.h*.2+i*24,(g.safe.right-g.safe.left)*Math.min(1,Math.max(0,t*2-i*.1)),5)}break;}
   case'rainbow':{ctx.save();ctx.beginPath();ctx.rect(0,212,g.w,g.ground-212);ctx.clip();const k=Math.min(1,t*seconds/.4),fade=1-clamp((t*seconds-.4)/.3);ctx.save();ctx.globalAlpha*=fade;const xx=mixCloser(c.dir<0?g.w+g.height:-g.height,x,k);if(!illustration(ctx,'rainbow-beam',xx,Math.max(260,y),g.height*1.8,-c.dir*.2,c.dir))for(let i=0;i<5;i++){ctx.fillStyle=['#ff6c97','#ffd76e','#75ffa8','#6edaff','#bc86ff'][i];ctx.fillRect(xx-g.height,Math.max(220,y)-60+i*24,g.height*2,24);}ctx.restore();if(t*seconds>.4)materialResidue(ctx,'rgb',x,g.ground,clamp((t*seconds-.4)/.5),g.height,g.width,g.fragmentMin);ctx.restore();break;}
   case'verdict':{const fs=Math.round(Math.min(170,(g.safe.right-g.safe.left)/Math.max(1,Array.from(word).length))*(1+.25*(1-Math.min(1,t*5))));ctx.font=`900 ${fs}px ${FONT.display}`;ctx.textAlign='center';ctx.textBaseline='middle';const measure=ctx.measureText(word),tw=measure.width,th=(measure.actualBoundingBoxAscent||fs*.6)+(measure.actualBoundingBoxDescent||fs*.4),angle=-c.dir*.12,bw=Math.abs(tw*Math.cos(angle))+Math.abs(th*Math.sin(angle))+32,bh=Math.abs(th*Math.cos(angle))+Math.abs(tw*Math.sin(angle))+32,b=safeCaption(clamp(x-c.dir*g.height*.4,g.safe.left+100,g.safe.right-100),g.ground-g.height-55,bw,bh);ctx.translate(b.x+b.w/2,b.y+b.h/2);ctx.rotate(angle);ctx.strokeStyle='#101725';ctx.lineWidth=4;for(let i=0;i<8;i++){const a=i*Math.PI/4,k=clamp(t/.2);ctx.beginPath();ctx.moveTo(Math.cos(a)*g.height*.2,Math.sin(a)*g.height*.2);ctx.lineTo(Math.cos(a+.08)*r*k,Math.sin(a+.08)*r*k);ctx.lineTo(Math.cos(a-.07)*r*1.5*k,Math.sin(a-.07)*r*1.5*k);ctx.stroke()}ctx.strokeStyle='#11152c';ctx.lineWidth=12;ctx.strokeText(word,0,0);ctx.fillStyle=color;ctx.fillText(word,0,0);break;}
   case'confetti':ctx.globalAlpha*=1-clamp((t-.72)/.13);for(let i=0;i<(g.mobile?60:76);i++){const xx=(i*137+55)%g.w,yy=-g.h*.2+((i*23)%(g.h*.25))+t*t*g.h*1.5,prop=a.element==='gold'?'coin':a.element==='sugar'?(i%2?'heart':'star'):'paper';sticker(ctx,prop,xx,yy,Math.max(g.fragmentMin,g.mobile?24/g.scale:32+i%4*5),propFill(prop,a.element),i+t*3)}break;
  }ctx.restore();
 }));node.z=28;show.stage.fx.add(node);show.sound?.play(a.closer==='terminal'?'electric':a.closer==='verdict'?'stamp':a.closer==='confetti'?'popup':'ground-thud',.7);
 let time=0;try{while(time<seconds){state.t=Math.min(1,time/seconds);cam.shake=(a.closer==='confetti'?3:10)*(1-state.t);cam.zoom=oldZoom+.025*Math.sin(state.t*Math.PI);time+=Math.max(0,yield)}}finally{node.remove();cam.shake=oldShake;cam.zoom=oldZoom;}
}
