import {illustration,scopedAnimationArt} from '../animation-art';
import type {MoveId} from './catalog';
/** Motion-specific contact silhouettes; no shared white disc or white sprite cover. */
export function contactShape(c:CanvasRenderingContext2D,move:MoveId,x:number,y:number,h:number,dir:number,color:string,hit=0):void{
 if(scopedAnimationArt(c)){const slash=['slash','iai','thrust','whip','sweep','beam','sweep-beam','sky-beam','mirage'].includes(move);if(illustration(c,slash?'contact-slash':'hit-star',x,y,h*(slash?.65:.38),slash?(hit%2?.5:-.5):hit*.4,dir))return;}
 const r=h*.32;if(['jab-rush','uppercut','headbutt','vulcan','scatter','thrust'].includes(move))illustration(c,'hit-star',x,y,h*.38,0,dir);c.save();if(scopedAnimationArt(c))c.globalAlpha*=.7;c.translate(x,y);c.scale(dir,1);c.lineJoin='round';c.lineCap='round';
 const line=(p:number[][],w=12,tint=color)=>{c.beginPath();p.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.strokeStyle='#142033';c.lineWidth=w+6;c.stroke();c.strokeStyle=tint;c.lineWidth=w+2;c.stroke();c.strokeStyle='#f4f8ff';c.lineWidth=Math.max(2,w-5);c.stroke()};
 const ray=(n:number,span=Math.PI*2,offset=0)=>{for(let i=0;i<n;i++){const a=offset+i*span/Math.max(1,n-1);line([[Math.cos(a)*r*.15,Math.sin(a)*r*.15],[Math.cos(a)*r,Math.sin(a)*r]],8)}};
 const arc=(angle:number)=>{c.save();c.rotate(angle);c.beginPath();c.moveTo(-r*1.9,r*.2);c.quadraticCurveTo(0,-r*1.7,r*1.9,r*.2);c.quadraticCurveTo(0,-r*.7,-r*1.9,r*.2);c.closePath();c.fillStyle='#f4f8ff';c.fill();c.strokeStyle=color;c.lineWidth=6;c.stroke();c.restore()};
 const box=(w:number,h:number)=>{c.strokeStyle='#142033';c.lineWidth=12;c.strokeRect(-w/2,-h/2,w,h);c.strokeStyle=color;c.lineWidth=6;c.strokeRect(-w/2,-h/2,w,h)};
 switch(move){
 case'jab-rush':for(let i=0;i<3;i++)line([[-r*.5,-r*.5+i*r*.5],[r*.7,(-1+i)*r*.12],[r,-r*.35+i*r*.35]],11);break;
 case'uppercut':for(let i=0;i<3;i++)line([[-r*.7+i*r*.4,r],[i*r*.2-r*.3,-r*.8],[i*r*.2-r*.5,-r*.5]],10);break;
 case'slam-down':for(let i=0;i<3;i++)line([[-r+i*r,-r],[0,r*.1],[-r*1.5+i*r*1.5,r*.7]],12);break;
 case'hammer-smash':line([[-r,-r],[0,r*.3],[r,-r]],18);line([[-r*1.8,r*.5],[0,r*.3],[r*1.8,r*.5]],10);break;
 case'ram':line([[-r*2,-r*.6],[r*.4,0],[-r*2,r*.6]],20);line([[r*.4,0],[r*1.6,0]],14);break;
 case'headbutt':ray(5,Math.PI,-Math.PI/2);arc(-.2);break;
 case'slash':arc([.61,-.61,0][hit%3]);break;
 case'iai':line([[-r*5,0],[r*5,0]],6,'#fbf5db');line([[-r*1.2,-r*.07],[r*1.4,r*.07]],3);break;
 case'thrust':for(let i=0;i<5;i++)line([[-r*1.8,-r*.5+i*r*.25],[r*1.8,-r*.5+i*r*.25]],i===2?12:5);break;
 case'whip':arc(.5);line([[-r,-r*.2],[r*.4,r*.6],[r*.9,-r*.6]],12);break;
 case'spin':c.beginPath();c.arc(0,0,h*.6,-Math.PI*.6,Math.PI*.9);c.strokeStyle=color;c.lineWidth=18;c.stroke();break;
 case'stamp':box(r*1.5,r*1.3);line([[-r,-r],[r,r]],7);break;
 case'cling':for(let i=0;i<4;i++){const a=i*Math.PI/2;line([[Math.cos(a)*r*1.2,Math.sin(a)*r*1.2],[Math.cos(a)*r*.25,Math.sin(a)*r*.25]],10)}break;
 case'sweep':arc(-.18);line([[-r*1.8,r*.8],[r*1.6,r*.8]],10);break;
 case'vulcan':for(let i=0;i<3;i++){c.save();c.translate((i-1)*r*.25,(i-1)*r*.35);ray(3,Math.PI*.6,-Math.PI*.3);c.restore()}break;
 case'cannon':ray(9,Math.PI*2);box(r*.5,r*.5);break;
 case'beam':line([[-r*4,-r*.3],[r*4,-r*.3]],16);line([[-r*4,r*.3],[r*4,r*.3]],16);ray(5,Math.PI,-Math.PI/2);break;
 case'sweep-beam':arc(.45);line([[-r*2,r],[r*2,r*.7]],12);break;
 case'sky-beam':line([[0,-r*2.6],[0,r]],24);line([[-r*1.3,r*.4],[0,r],[r*1.3,r*.4]],12);break;
 case'missiles':for(let i=0;i<3;i++){c.save();c.translate((i-1)*r*.6,Math.sin(i)*r*.4);ray(5);c.restore()}break;
 case'mortar':line([[-r*2,r*.4],[0,r],[r*2,r*.4]],16);ray(6,Math.PI,Math.PI);break;
 case'scatter':for(let i=0;i<5;i++)line([[-r,-r+i*r*.5],[r*.4,-r*.7+i*r*.35]],8);break;
 case'bits':for(let i=0;i<6;i++){const a=i*Math.PI/3;line([[Math.cos(a)*r*2,Math.sin(a)*r*2],[Math.cos(a)*r*.2,Math.sin(a)*r*.2]],6)}break;
 case'lob':arc(0);line([[-r*1.4,r*.6],[0,0],[r*1.4,r*.6]],10);break;
 case'stream':for(let i=0;i<5;i++)line([[-r*2,(i-2)*r*.15],[0,(i-2)*r*.4],[r,(i-2)*r*.45]],9);break;
 case'swarm':for(let i=0;i<4;i++){c.save();c.translate(Math.cos(i*2.4)*r,Math.sin(i*2.4)*r);box(r*.4,r*.4);c.restore()}break;
 case'popup-storm':box(r*2,r*1.5);line([[-r,-r*.8],[r,r*.8]],12);line([[-r,r*.8],[r,-r*.8]],12);break;
 case'drop':line([[-r*1.5,-r],[0,r*.5],[r*1.5,-r]],20);line([[-r*2,r*.7],[r*2,r*.7]],14);break;
 case'text-drop':line([[-r,-r*.7],[-r,r*.5],[r,r*.5],[r,-r*.7]],13);break;
 case'wave':arc(.1);arc(-.1);ray(3,Math.PI,Math.PI);break;
 case'storm':for(let i=0;i<3;i++)arc(i*Math.PI*.66);break;
 case'bind':box(r*1.6,r*2);line([[-r,-r],[r,r]],9);line([[-r,r],[r,-r]],9);break;
 case'mirage':for(let i=0;i<3;i++){c.save();c.translate((i-1)*r*.5,0);line([[-r,-r],[r,r]],8,['#65e3e8','#f075c5','#f3dc76'][i]);c.restore()}break;
 case'summon':line([[-r*2,-r],[0,r],[r*2,-r]],18);arc(0);break;
 case'serpent':arc(-.6);arc(Math.PI-.6);line([[r*.5,-r],[r*.2,-r*.2],[r*.8,-r*.7]],10);break;
 }c.restore();
}
export function guardWall(c:CanvasRenderingContext2D,x:number,y:number,height:number,color='#86d9eb',facing=1):void{
 if(illustration(c,'guard-barrier-side',x,y,height,0,facing))return;
 if(illustration(c,'guard-barrier',x,y,height))return;
 c.save();c.translate(x,y);c.beginPath();for(let i=0;i<6;i++){const a=Math.PI/6+i*Math.PI/3;i?c.lineTo(Math.cos(a)*height*.4,Math.sin(a)*height*.55):c.moveTo(Math.cos(a)*height*.4,Math.sin(a)*height*.55)}c.closePath();c.fillStyle='rgba(26,84,111,.48)';c.fill();c.strokeStyle='#102635';c.lineWidth=12;c.stroke();c.strokeStyle=color;c.lineWidth=6;c.stroke();c.beginPath();c.moveTo(-height*.2,-height*.25);c.lineTo(0,-height*.4);c.lineTo(height*.2,-height*.25);c.strokeStyle='#e4fcff';c.lineWidth=3;c.stroke();c.restore();
}
