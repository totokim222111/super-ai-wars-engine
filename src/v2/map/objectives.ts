import {readable} from '../presentation';
import { all, ease, tween, type Step } from '../flow';
import type { InputEvent } from '../input';
import { Button,label, windowFrame } from '../kit';
import { Screen } from '../screen';
import { H, W, type Node } from '../stage';
import { COLOR, FONT, cover, plate } from '../ui';
import { Shape } from '../stage';
/** 조건 덩어리의 이름표(비스듬한 판)와, 그 아래 줄들을 묶는 세로 띠. 색이 승리(금)와 패배(적색)를 가른다. */
function heading(text:string,color:string,ink:string,barHeight:number):Shape<object>{
  return new Shape<object>({},ctx=>{
    plate(ctx,0,0,168,34,color,'right');
    ctx.font=`900 ${readable(20)}px ${FONT.body}`;ctx.fillStyle=ink;ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(text,16,18);
    ctx.fillStyle=color;ctx.globalAlpha*=.55;ctx.fillRect(0,44,4,barHeight);
  });
}
export interface Objectives { win: string[]; lose: string[];optional?:import('./hints').MapHint[] }
/** 작전 목표. 뒤의 맵을 멈추고 확인·취소·터치로 닫는다. */
export class ObjectivesScreen extends Screen {
  opaque = false;
  private ready=false;
  private closing=false;
  private pending=false;
  private nodes:Node[]=[];
  /** hint: 카드 아래 안내 글. 맵을 시작할 때는 '누르면 시작', 메뉴에서 다시 볼 때는 '누르면 닫기'. */
  constructor(readonly objectives:Objectives,private readonly done:()=>void,private readonly hint='누르면 시작',private readonly focus?:(h:import('./hints').MapHint)=>void){super();}
  enter():void {
    const rows=(lines:string[])=>lines.reduce((n,s)=>n+Math.max(1,Math.ceil(Array.from(s).length/23)),0);
    const h=Math.min(620,254+(rows(this.objectives.win)+rows(this.objectives.lose))*34+(this.objectives.optional?.length?60+this.objectives.optional.length*84:0)),x=(W-720)/2,y=(H-h)/2;
    const dim=this.stage.ui.add(cover('#000'));dim.alpha=0;this.nodes.push(dim);
    this.ui.setNavigation({kind:'close',bounds:{x,y,w:720,h},onBack:()=>this.close()});
    const cards:Node[]=[];
    const add=(node:Node,atX:number,atY:number)=>{Object.assign(node,{x:atX,y:atY+24,alpha:0});cards.push(this.stage.ui.add(node));};
    add(windowFrame('작전 목표',720,h),x,y);
    let top=y+64;
    for(const [title,color,lines]of [['승리 조건',COLOR.gold,this.objectives.win],['패배 조건',COLOR.enemy,this.objectives.lose]] as const){
      add(heading(title,color,color===COLOR.gold?'#1a1200':'#fff',rows(lines)*34-4),x+36,top);top+=46;
      for(const line of lines){add(label(line,26,{color:'#fff',width:628}),x+56,top);top+=Math.max(1,Math.ceil(Array.from(line).length/23))*34;}
      top+=26;
    }
    if(this.objectives.optional?.length){add(heading('보조 목표',COLOR.ally,'#fff',this.objectives.optional.length*84),x+36,top);top+=44;for(const h of this.objectives.optional){const b=this.ui.add(Object.assign(new ObjectiveRow(h.name+(h.kind==='danger'?' · 위험 지역':''),()=>this.focus?.(h)),{x:x+46,y:top,z:65}));this.nodes.push(b);top+=84;}}
    add(label(this.objectives.optional?.length?'보조 목표를 누르면 위치 보기':this.hint.includes('시작')?'×를 눌러 출격':'',22,{color:COLOR.dim,align:'center'}),W/2,y+h-32);
    this.nodes.push(...cards);this.app.sound.play('confirm',.5);
    const screen=this;
    this.run((function*():Step{yield*all(tween(dim,{alpha:.85},.2),...cards.map(n=>all(tween(n,{alpha:1},.25),tween(n,{y:n.y-24},.25,ease.out))));screen.ready=true;if(screen.pending)screen.close();})());
  }
  private close():void{if(this.closing)return;if(!this.ready){this.pending=true;return;}this.closing=true;this.app.sound.play('cancel',.5);const screen=this;this.run((function*():Step{yield*all(...screen.nodes.map(n=>tween(n,{alpha:0},.15)));screen.done();})());}
  input(event:InputEvent):void{if(this.ready&&this.ui.input(event))return;if(event.kind==='action'&&(event.action==='confirm'||event.action==='cancel'))this.close();}
}

class ObjectiveRow extends Button{constructor(name:string,run:()=>void){super(name,run,{w:628,h:84});}protected paint(ctx:CanvasRenderingContext2D):void{ctx.font=`700 24px ${FONT.body}`;ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillStyle=this.focused?COLOR.gold:COLOR.ink;ctx.fillText(this.label,12,42,604);ctx.strokeStyle='rgba(185,199,230,.2)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(12,82);ctx.lineTo(612,82);ctx.stroke();}}
