import {briefSteps,type BattleProgress,type BriefStep} from '../battle/progress';
import type {Exchange} from '../battle/types';
import type {Step} from '../flow';
import {burst,type Show} from '../fx';
import {Shape} from '../stage';
import {FONT} from '../ui';
import type {Board} from './board';

export interface BriefControl {fast:boolean;current?:BriefStep;history?:string[]}

/** Short, ordered map presentation. Only display HP changes here; no combat commands. */
export function* playBrief(show:Show,board:Board,exchange:Exchange,progress:BattleProgress,control:BriefControl,defeated:Set<string>,speed=1):Step{
 for(const step of briefSteps(exchange,progress)){
  const {strike,index}=step,target=strike.cover??strike.target,p=progress.strikes[index];
  const duration=()=>control.fast ? .04 : .4/Math.max(1,Math.min(3,speed));
  const actor=board.unit(step.kind==='launch'?strike.attacker:target);if(!actor)continue;
  yield* board.look(actor.cell,.08);
  control.current=step;control.history?.push(`${step.index}:${step.kind}`);
  const from=board.feet(strike.attacker),to=board.feet(target),color=typeof strike.weapon.anim.color==='string'?strike.weapon.anim.color:'#7fe9f7';
  const state={t:0};let node:Shape<{t:number}>|undefined;
  if(step.kind==='launch'){
   show.sound?.play(strike.weapon.kind==='melee'?'slash':strike.weapon.kind==='beam'?'beam':strike.weapon.kind==='missile'?'missile':'shot',.55);
   node=new Shape(state,(ctx,s)=>{
    const ax=from.x,ay=from.y-40,bx=to.x,by=to.y-40,t=Math.min(1,s.t);
    ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineCap='round';ctx.lineWidth=4;
    if(strike.weapon.kind==='map'){
     ctx.globalAlpha*=.25+.4*Math.sin(Math.PI*t);
     for(const cell of exchange.area??[{x:actor.cell.col,y:actor.cell.row}]){const c=board.center({col:cell.x,row:cell.y});ctx.fillRect(c.x-38,c.y-38,76,76);ctx.strokeRect(c.x-38,c.y-38,76,76);}
    }else if(strike.weapon.kind==='melee'){
     ctx.lineWidth=8*(1-t)+2;ctx.beginPath();ctx.arc(bx,by,45,-Math.PI*.75+t,Math.PI*.25+t);ctx.stroke();
    }else{
     const x=ax+(bx-ax)*t,y=ay+(by-ay)*t-(strike.weapon.kind==='missile'?Math.sin(Math.PI*t)*65:0);
     ctx.globalAlpha*=.9;ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(x,y);ctx.stroke();
     ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x,y,strike.weapon.kind==='beam'?9:6,0,Math.PI*2);ctx.fill();
    }
    if(strike.banner){ctx.font=`700 24px ${FONT.body}`;ctx.textAlign='center';ctx.fillStyle='#fff3b0';ctx.fillText(strike.banner,ax,ay-64,260);}
   });
   node.z=30;show.stage.fx.add(node);p.launched=true;
  }else{
   const tags=[...(strike.effects??[]).map(e=>e.text),strike.cover?'원호 방어':'',strike.outcome.guard?'방어':'',strike.outcome.critical?'크리티컬':'',strike.outcome.barrier==='immune'?'무효':''].filter(Boolean).join(' · ');
   const text=step.kind==='defeat'?'격파':strike.outcome.hit?String(strike.outcome.damage):'회피';
   node=new Shape(state,(ctx,s)=>{
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=5;ctx.strokeStyle='#05070c';
    const y=to.y-95-s.t*14;ctx.font=`900 38px ${FONT.body}`;ctx.fillStyle=step.kind==='defeat'?'#ffb64d':'#fff';ctx.strokeText(text,to.x,y,340);ctx.fillText(text,to.x,y,340);
    if(step.kind==='result'&&tags){ctx.font=`700 23px ${FONT.body}`;ctx.fillStyle='#ffe488';ctx.strokeText(tags,to.x,y-42,340);ctx.fillText(tags,to.x,y-42,340);}
   });node.z=32;show.stage.fx.add(node);
   if(step.kind==='result'){
    for(const f of exchange.fighters)if(f.revealed)board.reveal(f.id);
    if(strike.outcome.hit){board.harm(target,strike.outcome.damage);burst(show,to.x,to.y-40,65,color);show.sound?.play('hit',.5);if(strike.outcome.guard)show.sound?.play('deny',.4);}else show.sound?.play('whoosh',.5);
    p.result=true;
   }else{
    yield* board.defeat(target,duration(),false);p.defeated=true;defeated.add(target);node.remove();continue;
   }
  }
  let elapsed=0;while(elapsed<duration()){elapsed+=yield;state.t=Math.min(1,elapsed/duration());if(step.kind==='launch'&&strike.weapon.kind==='melee'){const dx=to.x-from.x,dy=to.y-from.y,d=Math.hypot(dx,dy)||1,k=Math.sin(Math.PI*state.t)*Math.min(120,d*.4)/d;board.offset(strike.attacker,dx*k,dy*k);}}
  if(step.kind==='launch'&&strike.weapon.kind==='melee')board.offset(strike.attacker,0,0);
  node?.remove();
 }
 control.current=undefined;
}
