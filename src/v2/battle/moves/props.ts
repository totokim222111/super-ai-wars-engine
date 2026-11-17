import {illustration,type AnimationArt,type IllustrationOptions} from '../animation-art';
import {PROP_IDS,type PropId} from './catalog';
import {PROP_COLORS} from './palette';

const ink='#101a30',paper='#f4f4eb';
/** Flat, outlined stickers, drawn once per size/accent. LRU <= 128 canvases (~32MiB worst case). */
const cache=new Map<string,HTMLCanvasElement>();
const thumbnails=new WeakMap<AnimationArt,Map<string,HTMLCanvasElement>>();
export function clearPropCache():void{cache.clear();}
export const propCacheSize=():number=>cache.size;
export function propCanvas(id:PropId,size=96,color=PROP_COLORS[id],art?:AnimationArt):HTMLCanvasElement{
 if(art?.ready(id)){const key=id+':'+size;let rows=thumbnails.get(art);if(!rows)thumbnails.set(art,rows=new Map());let canvas=rows.get(key);if(!canvas){canvas=document.createElement('canvas');canvas.width=canvas.height=Math.ceil(size);art.draw(canvas.getContext('2d')!,id,size/2,size/2,size*.96);rows.set(key,canvas);if(rows.size>128)rows.delete(rows.keys().next().value!);}return canvas;}
 const px=Math.max(40,Math.min(1024,Math.round(size/8)*8)),key=id+':'+px+':'+color;
 let canvas=cache.get(key);if(canvas){cache.delete(key);cache.set(key,canvas);return canvas;}
 canvas=document.createElement('canvas');canvas.width=canvas.height=px;const ctx=canvas.getContext('2d')!;
 const base=document.createElement('canvas');base.width=base.height=px;const paint=base.getContext('2d')!;paint.scale(px/100,px/100);drawProp(paint,id,color);
 const rim=document.createElement('canvas');rim.width=rim.height=px;const rc=rim.getContext('2d')!;rc.fillStyle=paper;rc.fillRect(0,0,px,px);rc.globalCompositeOperation='destination-in';rc.drawImage(base,0,0);
 const r=px/100*(id==='bomb'?2:1.2);for(const[x,y]of[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]])ctx.drawImage(rim,x*r,y*r);ctx.drawImage(base,0,0);
 cache.set(key,canvas);let pixels=Array.from(cache.values()).reduce((n,c)=>n+c.width*c.height,0);while(cache.size>128||pixels>8*1024*1024){const key=cache.keys().next().value!,old=cache.get(key)!;pixels-=old.width*old.height;cache.delete(key);}return canvas;
}
export function sticker(ctx:CanvasRenderingContext2D,id:PropId,x:number,y:number,size:number,color:string,angle=0,dir=1,options?:IllustrationOptions):void{
 if(illustration(ctx,id,x,y,size,angle,dir,options))return;
 const image=propCanvas(id,size,color);ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(dir,1);ctx.drawImage(image,-size/2,-size/2,size,size);ctx.restore();
}
/** Public painter also used by the prop contact-sheet tool. Coordinates 0..100. */
export function drawProp(c:CanvasRenderingContext2D,id:PropId,color=PROP_COLORS[id]):void{
 if(!PROP_IDS.includes(id))throw Error('unknown prop '+id);
 c.save();c.lineWidth=3;c.lineJoin='round';c.lineCap='round';c.strokeStyle=ink;c.fillStyle=color;
 const path=(pts:number[][],fill=color,close=true)=>{c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));if(close)c.closePath();if(close){c.fillStyle=fill;c.fill();}c.stroke();};
 const oval=(x:number,y:number,rx:number,ry:number,fill=color)=>{c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fillStyle=fill;c.fill();c.stroke();};
 const box=(x:number,y:number,w:number,h:number,fill=color,r=5)=>{c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=fill;c.fill();c.stroke();};
 const line=(pts:number[][])=>path(pts,ink,false);
 const star=(x=50,y=50,r=40,n=5)=>path(Array.from({length:n*2},(_,i)=>{const a=-Math.PI/2+i*Math.PI/n,k=i%2?r*.45:r;return[x+Math.cos(a)*k,y+Math.sin(a)*k];}));
 const window=(kind:string)=>{box(9,18,82,65,paper);box(9,18,82,17,color,3);line([[77,23],[85,30]]);line([[85,23],[77,30]]);if(kind==='error-window'){line([[48,43],[48,60]]);oval(48,71,2,2,ink);}else{for(let i=0;i<3;i++)line([[21,46+i*11],[kind==='terms-window'?76:62-i*8,46+i*11]]);}};
 switch(id){
 case'six-hand':path([[26,84],[18,55],[5,41],[9,31],[26,42],[18,17],[27,11],[37,37],[34,7],[45,5],[48,35],[52,5],[63,8],[60,37],[70,13],[80,19],[70,44],[86,30],[94,38],[79,61],[72,87]]);line([[35,56],[61,54],[65,71]]);break;
 case'fist':case'cat-paw':{
  if(id==='cat-paw'){oval(50,64,27,22,paper);for(let i=0;i<4;i++)oval(20+i*19,33+(i===0||i===3?7:0),11,15,paper);oval(50,64,15,12);}
  else{box(24,39,55,43);for(let i=0;i<4;i++)box(15+i*12,19,13,38);box(10,48,30,18,paper);line([[43,65],[68,65]]);}break;}
 case'keycap':case'enter-key':box(8,26,84,58);path([[15,27],[27,15],[78,15],[90,27]],paper);if(id==='enter-key')line([[71,39],[71,60],[35,60],[45,48],[35,60],[45,72]]);else{box(29,35,42,32,paper);line([[39,49],[60,49]]);}break;
 case'hammer':case'gavel':box(45,33,12,59,paper);box(id==='gavel'?24:10,12,id==='gavel'?54:82,32);if(id==='gavel')box(25,87,56,7);break;
 case'wrench':path([[27,10],[36,28],[53,26],[61,8],[72,23],[67,41],[57,48],[78,84],[66,93],[43,54],[27,50],[17,33]],color);break;
 case'chip':box(26,26,48,48);box(36,36,28,28,paper);for(let i=0;i<4;i++){line([[32+i*12,13],[32+i*12,26]]);line([[32+i*12,74],[32+i*12,87]]);line([[13,32+i*12],[26,32+i*12]]);line([[74,32+i*12],[87,32+i*12]]);}break;
 case'spinner':c.lineWidth=12;c.strokeStyle=ink;c.beginPath();c.arc(50,50,33,.1,Math.PI*1.7);c.stroke();c.lineWidth=6;c.strokeStyle=color;c.stroke();break;
 case'cooler-fan':box(5,5,90,90);oval(50,50,34,34,ink);for(const[x,y]of[[14,14],[86,14],[14,86],[86,86]])oval(x,y,3,3,paper);for(let i=0;i<4;i++){c.save();c.translate(50,50);c.rotate(i*Math.PI/2);path([[0,0],[6,-29],[25,-26],[28,-9],[8,6]],color);c.restore();}oval(50,50,10,10,paper);break;
 case'gear':case'bike-wheel':{
  if(id==='gear')path(Array.from({length:32},(_,i)=>{const a=i*Math.PI/16,r=i%4<2?43:34;return[50+Math.cos(a)*r,50+Math.sin(a)*r];}));else oval(50,50,42,42,id==='bike-wheel'?ink:paper);
  if(id==='bike-wheel')oval(50,50,31,31,paper);
  for(let i=0;i<6;i++){c.save();c.translate(50,50);c.rotate(i*Math.PI/3);line([[0,0],[32,0]]);c.restore();}oval(50,50,10,10);break;}
 case'radiator':box(12,15,76,72,paper);for(let i=0;i<6;i++)box(20+i*11,24,7,53);break;
 case'plug':box(30,36,40,38);line([[39,16],[39,36]]);line([[61,16],[61,36]]);line([[50,75],[50,94]]);break;
 case'cable':case'tentacle':case'chain':{
  if(id==='chain'){for(let i=0;i<4;i++){c.save();c.translate(18+i*21,77-i*18);c.rotate(-.7+(i%2)*.6);c.lineWidth=9;c.strokeStyle=ink;c.beginPath();c.ellipse(0,0,17,10,0,0,Math.PI*2);c.stroke();c.lineWidth=5;c.strokeStyle=color;c.stroke();c.lineWidth=2;c.strokeStyle=paper;c.beginPath();c.ellipse(0,-1,15,8,0,Math.PI,Math.PI*1.8);c.stroke();c.restore();}}
  else{c.lineWidth=id==='tentacle'?17:10;c.strokeStyle=ink;c.beginPath();c.moveTo(12,75);c.bezierCurveTo(75,95,2,8,80,25);c.stroke();c.lineWidth=id==='tentacle'?11:5;c.strokeStyle=color;c.stroke();c.strokeStyle=ink;c.lineWidth=3;for(let i=0;i<4&&id==='tentacle';i++)oval(31+i*13,66-i*12,3,3,paper);if(id==='cable')box(76,15,15,23,paper);}break;}
 case'battery':box(20,25,65,50);box(85,39,7,21,paper);path([[53,31],[34,55],[51,55],[46,71],[71,45],[54,45]],paper);break;
 case'server':box(18,10,64,80,ink);for(let i=0;i<3;i++){box(23,16+i*24,54,19,paper);oval(32,25+i*24,3,3);line([[44,25+i*24],[67,25+i*24]]);}break;
 case'drill':path([[12,28],[36,28],[90,50],[36,72],[12,72]]);for(let i=0;i<3;i++)line([[39+i*14,30+i*6],[32+i*14,69-i*6]]);break;
 case'saw':box(12,59,22,22,paper);path([[25,65],[80,10],[88,20],[79,28],[83,34],[73,40],[75,47],[65,52],[66,60],[56,64],[56,72],[46,73],[41,82]]);break;
 case'anchor':line([[50,20],[50,86],[22,72],[13,52]]);line([[50,86],[78,72],[87,52]]);line([[26,38],[74,38]]);oval(50,13,8,8,paper);path([[8,53],[28,58],[14,72]]);path([[92,53],[72,58],[86,72]]);break;
 case'shield':path([[15,15],[50,8],[85,15],[80,63],[50,91],[20,63]],paper);path([[28,28],[50,22],[72,28],[67,56],[50,74],[33,56]]);break;
 case'sword':path([[48,70],[36,30],[50,7],[64,30],[54,70]],paper);box(45,70,10,23);box(25,65,50,8);break;
 case'dagger':path([[42,58],[31,30],[50,13],[67,32],[54,58]],paper);path([[31,57],[66,57],[64,69],[55,67],[58,84],[72,87],[65,95],[45,89],[42,68],[29,68]]);break;
 case'rapier':path([[48,66],[51,5],[54,66]],paper);oval(50,70,23,14);oval(50,70,15,8,paper);box(47,79,7,16);break;
 case'lance':path([[22,60],[50,4],[78,60]],paper);path([[28,60],[50,42],[72,60],[58,71],[58,94],[43,94],[43,71]]);break;
 case'hairpin':path([[31,33],[37,33],[44,91],[40,96]]);path([[58,33],[65,33],[61,94],[57,91]]);oval(48,27,22,16);oval(48,27,10,8,paper);oval(28,14,8,8,paper);oval(68,14,8,8,paper);break;
 case'needle':path([[44,27],[50,8],[56,27],[50,95]],paper);oval(50,26,3,9,ink);c.strokeStyle='#d67e91';line([[50,23],[77,12],[87,29],[73,41],[88,58]]);break;
 case'folding-fan':path([[49,88],[7,35],[22,14],[50,7],[79,15],[94,35]]);for(let i=0;i<5;i++)line([[49,86],[12+i*19,28-Math.sin(i/4*Math.PI)*16]]);break;
 case'broom':line([[60,6],[48,52]]);path([[28,47],[67,55],[74,91],[8,76]],paper);for(let i=0;i<4;i++)line([[31+i*9,56],[22+i*12,79+i*2]]);break;
 case'shuriken':path([[50,5],[58,32],[90,21],[70,50],[93,80],[60,69],[49,95],[41,67],[10,79],[30,50],[9,20],[39,32]]);oval(50,50,8,8,paper);break;
 case'missile':path([[10,39],[67,39],[90,50],[67,61],[10,61]],paper);path([[14,39],[5,24],[37,39]]);path([[14,61],[5,76],[37,61]]);path([[68,40],[90,50],[68,60]]);break;
 case'bomb':oval(50,59,32,32,'#2a3550');oval(37,47,8,10,paper);box(42,20,17,14);line([[50,20],[61,9],[75,15]]);star(80,14,10);break;
 case'satellite':box(38,35,25,34,paper);box(4,29,30,43);box(67,29,30,43);line([[50,35],[59,14],[73,22]]);break;
 case'drum':oval(50,27,36,14,paper);box(14,27,72,49);oval(50,75,36,14,paper);for(let i=0;i<4;i++)line([[20+i*18,35],[24+i*16,68]]);break;
 case'window':case'error-window':case'terms-window':window(id);break;
 case'cursor':path([[24,9],[24,80],[43,63],[58,90],[71,82],[55,56],[82,54]],paper);break;
 case'magnifier':oval(40,39,28,28,paper);line([[62,63],[89,90]]);oval(40,39,18,18);break;
 case'bell':oval(50,81,10,10,paper);path([[17,74],[29,58],[31,28],[42,15],[58,15],[70,28],[72,58],[84,74]]);break;
 case'check-badge':star(50,50,43,12);c.lineWidth=12;c.strokeStyle=ink;line([[27,49],[44,67],[75,31]]);c.lineWidth=7;c.strokeStyle=paper;line([[27,49],[44,67],[75,31]]);break;
 case'badge-number':star(50,50,43,8);c.fillStyle=ink;c.font='bold 34px sans-serif';c.textAlign='center';c.fillText('99',50,64);break;
 case'heart':c.beginPath();c.moveTo(50,87);c.bezierCurveTo(-5,50,8,4,35,18);c.quadraticCurveTo(45,21,50,32);c.bezierCurveTo(76,-8,119,28,50,87);c.fill();c.stroke();break;
 case'thumb':path([[12,46],[36,44],[49,12],[62,12],[65,36],[87,39],[86,73],[74,88],[34,87],[34,51]],paper);box(8,45,24,43);break;
 case'star':star();break;
 case'speech':oval(50,42,39,28,paper);path([[30,61],[20,88],[54,68]],paper);for(let i=0;i<3;i++)oval(30+i*20,42,3,3);break;
 case'mail':box(9,24,82,54,paper);path([[10,25],[50,55],[90,25]],color);break;
 case'link':c.save();c.translate(50,50);c.rotate(-.6);oval(-18,0,25,16,paper);oval(18,0,25,16);line([[-15,0],[15,0]]);c.restore();break;
 case'cookie':oval(50,50,40,40,paper);for(const[x,y]of[[25,38],[54,25],[72,54],[43,60],[35,78]])oval(x,y,5,5,ink);break;
 case'token':path([[50,5],[87,27],[87,73],[50,95],[13,73],[13,27]]);star(50,50,25,4);break;
 case'coin':oval(50,50,40,40);oval(50,50,29,29,paper);line([[54,24],[54,76],[67,36],[38,36],[32,49],[66,56],[64,68],[34,68]]);break;
 case'paper':case'note-tag':case'patch':box(20,10,60,80,paper);if(id==='note-tag')path([[63,10],[80,10],[80,28]],color);if(id==='patch'){line([[50,28],[50,72]]);line([[29,50],[71,50]]);}else for(let i=0;i<4;i++)line([[30,31+i*13],[67-i*3,31+i*13]]);break;
 case'scroll':box(25,12,53,76,paper);oval(25,18,12,9);oval(76,82,12,9);for(let i=0;i<4;i++)line([[36,31+i*12],[66,31+i*12]]);break;
 case'book':path([[11,18],[46,24],[50,34],[55,24],[89,18],[89,79],[55,86],[50,91],[44,86],[11,79]],paper);line([[50,34],[50,89]]);for(let i=0;i<3;i++){line([[21,36+i*14],[40,40+i*14]]);line([[60,40+i*14],[80,36+i*14]]);}break;
 case'stamp':box(37,10,26,39,paper);path([[24,49],[76,49],[85,80],[15,80]]);box(10,80,80,10,ink);break;
 case'play-button':box(10,20,80,60);path([[40,32],[40,68],[69,50]],paper);break;
 case'pixel':box(16,16,32,32);box(52,16,32,32,paper);box(16,52,32,32,paper);box(52,52,32,32);break;
 case'hashtag':for(const p of [[[39,10],[25,90]],[[69,10],[55,90]],[[13,36],[91,36]],[[8,66],[86,66]]]){c.lineWidth=8;line(p);}break;
 case'red-underline':box(13,20,29,18,'#a5a8b0',2);box(52,20,33,18,'#a5a8b0',2);c.lineWidth=7;c.strokeStyle='#d83e4d';line(Array.from({length:13},(_,i)=>[8+i*7,65+(i%2?7:-7)]));break;
 case'flame':path([[50,6],[57,35],[73,25],[89,62],[73,87],[27,87],[11,62],[28,35],[34,55]],color);path([[49,45],[64,73],[50,86],[36,72]],paper);break;
 case'droplet':c.beginPath();c.moveTo(50,6);c.bezierCurveTo(37,35,14,47,18,69);c.bezierCurveTo(23,101,80,101,83,68);c.bezierCurveTo(87,47,61,25,50,6);c.fill();c.stroke();break;
 case'snowflake':for(let i=0;i<6;i++){c.save();c.translate(50,50);c.rotate(i*Math.PI/3);line([[0,0],[0,-41]]);line([[-10,-29],[0,-20],[10,-29]]);c.restore();}oval(50,50,9,9,paper);break;
 case'icicle':path([[24,14],[76,14],[63,48],[50,94],[36,48]],paper);path([[43,14],[57,14],[50,80]]);break;
 case'bolt':path([[51,5],[20,55],[46,55],[35,95],[83,35],[55,35]],color);break;
 case'swirl':c.lineWidth=9;c.strokeStyle=ink;c.beginPath();for(let i=0;i<=90;i++){const a=i*.2,r=i*.43;const x=50+Math.cos(a)*r,y=50+Math.sin(a)*r;i?c.lineTo(x,y):c.moveTo(x,y);}c.stroke();c.lineWidth=4;c.strokeStyle=color;c.stroke();break;
 case'whale':oval(40,59,35,25);path([[68,58],[80,47],[76,31],[89,37],[98,31],[94,48],[79,66]]);path([[14,66],[22,78],[49,83],[65,70]],paper);for(let i=0;i<3;i++)line([[25+i*10,71],[27+i*10,79]]);oval(20,53,3,3,ink);path([[40,35],[32,17],[23,12],[29,6],[39,12],[43,27],[47,12],[59,8],[65,14],[53,19],[47,36]],'#83d7e5');break;
 case'llama':case'teddy':{
  if(id==='llama'){path([[30,76],[24,67],[27,56],[39,53],[42,23],[52,19],[65,25],[64,51],[75,56],[81,67],[76,80],[31,80]],color);oval(63,27,19,11,paper);path([[45,21],[36,5],[44,3],[54,17]]);path([[57,17],[66,2],[73,6],[67,24]]);box(30,78,10,18);box(66,78,10,18);oval(64,24,3,3,ink);for(let i=0;i<3;i++)oval(39+i*13,65,10,10,paper);}else{oval(25,23,14,14);oval(75,23,14,14);oval(50,44,30,27);oval(50,79,25,18);oval(50,52,15,12,paper);oval(50,49,4,3,ink);}break;}
 case'cake':box(16,55,68,31,paper);box(26,32,48,27);box(35,15,30,20,paper);oval(50,9,7,7);line([[20,66],[79,66]]);break;
 case'thermos':box(29,15,42,73,paper);box(29,15,42,14);box(39,44,22,25);line([[72,35],[83,35],[83,65],[72,65]]);break;
 case'shrimp':path([[18,48],[27,30],[48,24],[68,33],[76,51],[66,66],[56,65],[54,50],[45,44],[36,50],[34,69],[45,80],[33,86],[18,72]]);path([[55,72],[65,64],[88,69],[78,80],[88,90],[61,87]],paper);for(let i=0;i<4;i++)line([[24+i*10,35],[20+i*12,54]]);oval(35,34,4,4,ink);line([[28,25],[14,8],[5,13]]);line([[38,24],[29,4],[19,5]]);break;
 case'turkey-leg':path([[46,54],[77,76],[88,73],[94,81],[87,89],[79,85],[74,94],[65,89],[66,81],[40,67]],paper);oval(34,37,27,30,color);oval(25,25,9,6,'#ce925e');break;
 case'banana':c.beginPath();c.moveTo(15,24);c.bezierCurveTo(18,87,74,110,91,29);c.bezierCurveTo(58,67,39,65,15,24);c.fill();c.stroke();path([[12,17],[22,15],[25,30],[16,34]],'#805631');path([[85,27],[92,22],[96,29],[91,37]],'#805631');line([[27,46],[36,67],[54,78]]);break;
 case'cube':path([[16,26],[51,45],[51,93],[16,76]],'#df8a75');path([[51,45],[87,28],[87,75],[51,93]],'#78b4bc');path([[16,26],[51,10],[87,28],[51,45]],'#efcc70');line([[32,36],[32,84]]);line([[68,36],[68,84]]);break;
 case'parcel':path([[16,26],[52,10],[87,28],[87,75],[51,93],[16,76]],paper);path([[16,26],[51,45],[87,28],[51,10]]);line([[51,45],[51,93]]);path([[33,18],[69,37],[69,61],[58,67],[58,43],[24,23]]);break;
 case'smile-mask':oval(50,49,33,40,paper);oval(35,39,5,4,ink);oval(65,39,5,4,ink);c.beginPath();c.arc(50,52,20,0,Math.PI);c.stroke();break;
 case'eye':path([[7,50],[26,27],[50,19],[74,27],[93,50],[74,73],[50,81],[26,73]],paper);oval(50,50,22,22);oval(50,50,9,13,ink);break;
 case'crown':path([[10,20],[33,42],[50,10],[67,42],[90,20],[80,84],[20,84]]);box(20,72,60,12,paper);break;
 case'crescent':c.beginPath();c.arc(50,50,42,.5,Math.PI*1.6);c.quadraticCurveTo(27,54,87,70);c.closePath();c.fill();c.stroke();break;
 case'dragon-head':path([[7,34],[27,31],[27,8],[39,23],[56,15],[64,3],[68,27],[88,32],[95,52],[83,73],[54,74],[34,90],[25,64],[8,64]]);path([[55,53],[90,52],[78,67],[54,65]],'#743d46');for(let i=0;i<4;i++)path([[57+i*8,53],[61+i*8,61],[65+i*8,53]],paper);oval(65,36,5,5,paper);line([[41,43],[22,20],[11,25]]);line([[39,68],[18,81],[8,77]]);break;
 case'worm-head':oval(36,52,30,35,color);oval(57,52,32,34,color);oval(67,52,26,29,ink);for(let i=0;i<8;i++){const a=i*Math.PI/4;path([[67+Math.cos(a)*23,52+Math.sin(a)*25],[67+Math.cos(a)*13,52+Math.sin(a)*14],[67+Math.cos(a+.3)*23,52+Math.sin(a+.3)*25]],paper);}line([[16,28],[16,76]]);line([[27,20],[27,83]]);break;
 case'net':case'cage':box(10,14,80,73,paper);for(let i=1;i<5;i++)line([[10+i*16,15],[10+i*16,86]]);if(id==='net')for(let i=1;i<4;i++)line([[11,14+i*18],[89,14+i*18]]);else oval(50,51,8,12);break;
 case'spray-can':box(29,28,42,61);box(38,14,24,15,paper);line([[50,14],[50,7],[67,7]]);box(34,48,32,24,paper);break;
 case'picture':box(9,16,82,68);box(16,23,68,54,paper);oval(69,36,9,9);path([[17,75],[36,43],[54,64],[66,50],[84,76]]);break;
 case'music-note':path([[31,23],[76,10],[76,70],[64,70],[64,30],[43,37],[43,79],[31,79]],paper);oval(26,80,17,12);oval(62,72,17,12);break;
 case'feather':c.beginPath();c.moveTo(17,88);c.bezierCurveTo(18,24,50,3,87,12);c.bezierCurveTo(78,50,62,73,17,88);c.fill();c.stroke();line([[17,88],[72,25]]);for(let i=0;i<3;i++)line([[32+i*12,70-i*12],[59+i*7,67-i*14]]);break;
 case'bao':oval(50,57,39,29,paper);path([[18,50],[29,27],[40,20],[49,27],[59,19],[73,29],[84,49]],paper);for(let i=0;i<4;i++)line([[31+i*12,31],[45+i*4,55]]);break;
 case'fork':box(44,44,13,49,paper);path([[26,9],[26,43],[38,58],[64,58],[77,43],[77,9],[66,9],[66,37],[57,37],[57,9],[46,9],[46,37],[37,37],[37,9]]);break;
 case'galleon':path([[8,65],[89,65],[73,87],[28,87]],color);line([[50,65],[50,8]]);path([[47,15],[47,59],[17,59]],paper);path([[55,21],[80,57],[55,57]],paper);break;
 case'crab':oval(50,56,27,21,'#6d4430');for(const d of[-1,1]){line([[50+d*24,58],[50+d*42,72]]);line([[50+d*23,66],[50+d*32,87]]);line([[50+d*25,46],[50+d*39,31]]);path([[50+d*33,33],[50+d*42,13],[50+d*47,31],[50+d*43,43]],'#6d4430');}oval(39,46,4,4,paper);oval(61,46,4,4,paper);break;
 case'fish-hook':line([[50,8],[50,68]]);c.beginPath();c.arc(36,68,14,0,Math.PI);c.stroke();path([[23,57],[30,69],[18,68]],paper);oval(50,27,9,14,'#e94b4d');break;
 case'thumbnail':box(5,23,90,54,paper);c.strokeStyle='#e94b4d';oval(38,49,18,17,paper);c.lineWidth=5;line([[81,29],[59,47],[61,32],[59,47],[76,47]]);break;
 case'sandbag':path([[31,8],[68,8],[62,27],[77,45],[84,75],[71,90],[28,90],[16,75],[23,45],[38,27]],color);box(30,24,40,8,'#92734c');line([[54,40],[49,80]]);for(let i=0;i<4;i++)line([[43,46+i*9],[58,50+i*9]]);break;
 case'glasses':box(5,32,37,31,paper);box(58,32,37,31,paper);line([[42,41],[58,41]]);oval(85,39,3,3,ink);break;
 case'claw':line([[50,6],[50,33],[22,52],[14,79],[30,67]]);line([[50,33],[77,52],[87,79],[70,66]]);line([[50,33],[52,76],[44,85]]);oval(50,32,10,10);break;
 case'vacuum':oval(31,65,25,21,color);oval(17,81,9,9,ink);oval(43,81,9,9,ink);c.lineWidth=12;c.strokeStyle=ink;c.beginPath();c.moveTo(38,47);c.bezierCurveTo(8,6,79,5,73,40);c.lineTo(64,70);c.stroke();c.lineWidth=6;c.strokeStyle=color;c.stroke();c.lineWidth=3;c.strokeStyle=ink;path([[55,67],[80,67],[94,86],[46,86]],paper);line([[25,43],[38,43]]);break;
 case'chest':box(15,45,70,41);path([[15,36],[21,16],[77,16],[85,36],[85,45],[15,45]]);for(let i=0;i<4;i++)path([[22+i*16,45],[30+i*16,60],[38+i*16,45]],paper);oval(57,73,15,9,paper);break;
 case'blanket':path([[14,13],[87,13],[87,85],[14,85]],color);for(let i=0;i<3;i++)for(let j=0;j<3;j++)if((i+j)%2===0)box(20+i*21,20+j*20,16,15,paper,1);path([[14,65],[36,85],[14,85]],paper);line([[14,65],[36,65],[36,85]]);break;
 }
 // One small common highlight, not a gradient or external sprite.
 c.globalCompositeOperation='source-atop';c.fillStyle=paper;c.beginPath();
 const spot:Partial<Record<PropId,[number,number]>>={glasses:[18,39],claw:[48,29],vacuum:[38,62],blanket:[29,48],droplet:[30,61],heart:[30,36],crescent:[24,42]};const[x,y]=spot[id]??[29,24];c.ellipse(x,y,5,2,-.55,0,Math.PI*2);c.fill();c.restore();
}
