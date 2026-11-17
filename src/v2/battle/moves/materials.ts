import type {ElementId,PropId} from './catalog';
import {sticker} from './props';
import {propFill} from './palette';
import {illustration,scopedAnimationArt} from '../animation-art';
import {burstEnvelope} from './readability';
/** The illustration is the main blast, with a contact-frame overshoot and separate flying chips. */
export function illustratedBurst(c:CanvasRenderingContext2D,id:ElementId,x:number,y:number,age:number,size:number,reach:number,minimum=24):boolean{
 const art=scopedAnimationArt(c);if(!art?.ready(id+'-burst'))return false;
 if(age<0||age>1)return true;
 const {scale,alpha}=burstEnvelope(age);
 c.save();c.globalAlpha*=alpha;illustration(c,id+'-burst',x,y,size*scale);
 for(let i=0;i<10;i++){const a=i*2.39996,r=reach*(.12+.88*(1-(1-age)**2))*(.45+(i%4)*.16),xx=x+Math.cos(a)*r,yy=y+Math.sin(a)*r*.55+age*age*reach*.18,sz=Math.max(minimum,size*.095),rotation=a+age*(i%2?3:-3);if(!illustration(c,id+'-chip',xx,yy,sz,rotation))sticker(c,MATERIALS[id].fragment,xx,yy,sz,propFill(MATERIALS[id].fragment,id),rotation);}
 c.restore();return true;
}
export const MATERIALS:Record<ElementId,{color:string;fragment:PropId}>={
 fire:{color:'#ff8447',fragment:'flame'},ice:{color:'#9ceaff',fragment:'icicle'},volt:{color:'#ffee70',fragment:'bolt'},water:{color:'#5ad9ff',fragment:'droplet'},wind:{color:'#bbffe5',fragment:'swirl'},light:{color:'#fff7ba',fragment:'star'},dark:{color:'#b47bf1',fragment:'eye'},data:{color:'#72f9ce',fragment:'pixel'},paper:{color:'#fff1cf',fragment:'paper'},sugar:{color:'#ff9dc8',fragment:'heart'},gold:{color:'#ffd23f',fragment:'coin'},rgb:{color:'#9aa7ff',fragment:'pixel'},sand:{color:'#d5b17a',fragment:'pixel'},impact:{color:'#ffa74c',fragment:'star'}};
const ink='#152033',rgb=['#ff6c97','#67e3b1','#6dbfff'];
const ellipse=(c:CanvasRenderingContext2D,x:number,y:number,rx:number,ry:number,color:string)=>{c.beginPath();c.ellipse(x,y,Math.max(1,rx),Math.max(1,ry),0,0,Math.PI*2);c.fillStyle=color;c.fill();c.strokeStyle=ink;c.lineWidth=3;c.stroke()};
function stroke(c:CanvasRenderingContext2D,pts:number[][],color:string,w:number){c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.lineCap='round';c.lineJoin='round';c.strokeStyle=ink;c.lineWidth=w+5;c.stroke();c.strokeStyle=color;c.lineWidth=w;c.stroke()}
/** Distinct, opaque silhouettes. Explosion pieces stay legible on the small viewport. */
export function materialImpact(c:CanvasRenderingContext2D,id:ElementId,x:number,y:number,age:number,radius:number,count=12,minimum=24):void{
 if(illustratedBurst(c,id,x,y,age,radius*.6,radius,minimum))return;
 if(age<0||age>1)return;const m=MATERIALS[id],t=1-(1-age)**3,r=radius*(.12+t*.88),s=Math.max(minimum,radius*.055);c.save();c.translate(x,y);c.globalAlpha*=age>.86?(1-age)/.14:1;
 if(id==='fire'){for(let i=0;i<5;i++)ellipse(c,Math.cos(i*2.4)*r*.19,Math.sin(i*2.4)*r*.16,r*.26,r*.22,i%2?'#ffbd55':'#e96337');}
 if(id==='impact'){for(let i=0;i<7;i++){const a=i*Math.PI*2/7;stroke(c,[[Math.cos(a)*r*.08,Math.sin(a)*r*.08],[Math.cos(a)*r*.65,Math.sin(a)*r*.65]],i%2?'#ffd374':'#ee8b3b',s*.4)}}
 if(id==='dark'){for(let i=0;i<5;i++)ellipse(c,Math.cos(i*2.4)*r*.22,Math.sin(i*2.4)*r*.17,r*.24,r*.18,i%2?'#77518e':'#ac79c4');}
 if(id==='volt'){for(let j=0;j<3;j++){const a=j*Math.PI*2/3;c.save();c.rotate(a);stroke(c,[[-r*.6,0],[-r*.3,-s],[0,s*.8],[r*.3,-s],[r*.7,0]],m.color,6);c.restore();}}
 if(id==='water'){const pts=[[ -r*.45,r*.25],[-r*.55,-r*.1],[-r*.22,r*.04],[-r*.23,-r*.38],[0,-r*.08],[r*.2,-r*.42],[r*.23,r*.04],[r*.55,-r*.12],[r*.45,r*.25]];c.beginPath();pts.forEach(([a,b],i)=>i?c.lineTo(a,b):c.moveTo(a,b));c.closePath();c.fillStyle=m.color;c.fill();c.lineWidth=4;c.strokeStyle=ink;c.stroke();}
 if(id==='wind'){for(let j=0;j<2;j++){const pts=Array.from({length:35},(_,i)=>{const a=i*.17+j*Math.PI,rr=r*(.1+i/45);return[Math.cos(a)*rr,Math.sin(a)*rr*.45]});stroke(c,pts,m.color,Math.max(12,s*.55));}}
 if(id==='light'){stroke(c,[[-r*.65,0],[r*.65,0]],m.color,s*.5);stroke(c,[[0,-r*.65],[0,r*.65]],m.color,s*.5);for(let i=0;i<8;i++){const a=i*Math.PI/4;stroke(c,[[Math.cos(a)*r*.3,Math.sin(a)*r*.3],[Math.cos(a)*r*.85,Math.sin(a)*r*.85]],'#fff0a5',s*.35)}}
 if(id==='data'){for(let i=0;i<4;i++){c.fillStyle=i%2?'#283f61':m.color;c.strokeStyle=ink;c.lineWidth=3;c.fillRect(-r*.65+(i%2)*s,y*0+(i-1.5)*s*1.7,r*1.25,s*.65);c.strokeRect(-r*.65+(i%2)*s,(i-1.5)*s*1.7,r*1.25,s*.65)}}
 if(id==='sand'){for(let i=0;i<7;i++)ellipse(c,Math.cos(i)*r*.35,Math.sin(i)*r*.15,r*.29,r*.18,i%2?'#b69164':'#d3b380');}
 const n=id==='ice'?8:id==='paper'?10:id==='gold'?10:id==='sand'?20:Math.min(count,12);
 for(let i=0;i<n;i++){const a=i*2.39996,rr=r*(.35+.65*((i*7)%11)/11),xx=Math.cos(a)*rr,yy=Math.sin(a)*rr*.6+age*age*radius*.18;const sz=s*(1+(i%3)*.15);
  if(id==='ice'){c.save();c.translate(xx,yy);c.beginPath();for(let k=0;k<6;k++){const a=k*Math.PI/3;k?c.lineTo(Math.cos(a)*sz,Math.sin(a)*sz):c.moveTo(sz,0)}c.closePath();c.fillStyle=i%2?'#a7e9f5':'#d8f8ff';c.fill();c.strokeStyle=ink;c.lineWidth=3;c.stroke();stroke(c,[[-sz*.65,0],[sz*.65,0]],'#6eb7d5',3);c.restore();}
  else if(id==='sand')ellipse(c,xx,yy,sz*.55,sz*.4,i%2?'#785b3b':'#e3c591');
  else if(id==='rgb'){c.fillStyle=rgb[i%3];c.strokeStyle=ink;c.lineWidth=3;c.fillRect(xx,yy,sz*1.2,sz*.65);c.strokeRect(xx,yy,sz*1.2,sz*.65)}
  else if(!['volt','wind','light','impact','dark'].includes(id)){const prop=id==='sugar'?(i%2?'heart':'star'):m.fragment;sticker(c,prop,xx,yy,sz*1.25,propFill(prop,id),a+age*.6);}
 }c.restore();
}
/** Residue stays on the foot line instead of becoming another chest-level spark. */
export function materialResidue(c:CanvasRenderingContext2D,id:ElementId,x:number,ground:number,age:number,height:number,width:number,minimum=24):void{
 if(scopedAnimationArt(c)?.ready(id+'-mark')){if(age<0||age>1)return;c.save();c.globalAlpha*=age>.75?(1-age)/.25:1;illustration(c,id+'-mark',x,ground,width*2,0,1,{flatten:.65});if(age>.35&&age<.85&&['fire','sand','impact'].includes(id)){c.save();c.globalAlpha*=Math.sin((age-.35)/.5*Math.PI)*.65;for(let i=0;i<3;i++)illustration(c,'smoke-puff',x+(i-1)*width*.35,ground-height*(.15+age*.35),height*.3,Math.sin(i)*.1);c.restore();}c.restore();return;}
 if(age<0||age>1)return;const color=MATERIALS[id].color;c.save();c.globalAlpha*=age>.8?(1-age)/.2:1;
 if(id==='fire'){ellipse(c,x,ground-5,width*.8,height*.07,'#9f442b');for(let i=0;i<5;i++)sticker(c,'flame',x+(i-2)*width*.32,ground-height*.13,height*.32*(1-age*.25),propFill('flame','fire'),Math.sin(i+age)*.1)}
 else if(id==='ice'||id==='water'||id==='wind'){c.strokeStyle=ink;c.lineWidth=10;c.beginPath();c.ellipse(x,ground-5,width*(1+age*.3),height*.08,0,0,Math.PI*2);c.stroke();c.strokeStyle=color;c.lineWidth=5;c.stroke();if(id==='ice')for(let i=0;i<6;i++)sticker(c,'snowflake',x+(i-2.5)*width*.32,ground-height*.05,Math.max(minimum,height*.12),propFill('snowflake','ice'));}
 else if(id==='light'){for(let i=0;i<5;i++){const xx=x+(i-2)*width*.4,yy=ground-height*.1;stroke(c,[[xx-minimum,yy],[xx+minimum,yy]],'#ffe8a3',5);stroke(c,[[xx,yy-minimum],[xx,yy+minimum]],'#ffe8a3',5)}}
 else if(['paper','gold','sugar','data','rgb'].includes(id)){for(let i=0;i<9;i++){const prop=id==='gold'?'coin':id==='sugar'?(i%2?'star':'heart'):id==='paper'?'paper':'pixel';sticker(c,prop,x+Math.sin(i*2.4)*width*1.2,ground-height*.1-Math.abs(Math.cos(i+age))*height*.15,Math.max(minimum,height*.12),id==='rgb'?rgb[i%3]:propFill(prop,id),i+age)}}
 else if(id==='volt'){for(let i=0;i<3;i++)stroke(c,[[x-width+i*width*.5,ground-5],[x-width*.3+i*width*.5,ground-height*.1],[x+i*width*.5,ground-8]],color,5)}
 else{ellipse(c,x,ground-4,width*(.8+age*.4),height*.08,id==='dark'?'#654877':id==='sand'?'#ad8859':'#4c4650');for(let i=0;i<3;i++)ellipse(c,x+(i-1)*width*.45,ground-height*(.13+age*.35),height*.14,height*.12,id==='dark'?'#88619f':id==='sand'?'#c2a272':'#6f6670')}
 c.restore();
}
/** Existing distinct missile/mortar/bits paths are unchanged; only the visible material wake changes. */
export function materialTrail(c:CanvasRenderingContext2D,id:ElementId,x:number,y:number,dir:number,size:number,time:number,minimum=24):void{
 if(illustration(c,id+'-trail',x-dir*size*.65,y,size*2.2,0,dir,{orientation:'projectile'}))return;
 if(scopedAnimationArt(c)?.ready(id+'-chip')){c.save();for(let i=0;i<3;i++){c.globalAlpha=(1-i*.25)*.7;illustration(c,id+'-chip',x-dir*i*size*.35,y+Math.sin(time+i)*size*.1,Math.max(minimum,size*(.45-i*.06)),time+i,dir);}c.restore();return;}
 const m=MATERIALS[id];c.save();for(let i=0;i<4;i++){const xx=x-dir*i*size*.35,yy=y+Math.sin(i+time)*size*.1;if(id==='volt')stroke(c,[[xx,yy],[xx-dir*size*.2,yy-size*.1],[xx-dir*size*.35,yy+size*.1]],m.color,5);else if(id==='wind'){c.strokeStyle=m.color;c.lineWidth=7;c.beginPath();c.arc(xx,yy,size*.2,.2,Math.PI*1.6);c.stroke()}else sticker(c,m.fragment,xx,yy,Math.max(minimum,size*(.5-i*.07)),propFill(m.fragment,id),time+i)}c.restore();
}
