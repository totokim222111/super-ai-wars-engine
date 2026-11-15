import type {Exchange,Strike} from './types';
export interface StrikeProgress {launched:boolean;result:boolean;defeated:boolean}
export interface BattleProgress {strikes:StrikeProgress[]}
export interface BattleFinish {skipped:boolean;progress:BattleProgress}
export type BriefStep={kind:'launch'|'result'|'defeat';index:number;strike:Strike;hpBefore:number;hpAfter:number};
export const battleProgress=(exchange:Exchange):BattleProgress=>({strikes:exchange.strikes.map(()=>({launched:false,result:false,defeated:false}))});

/** Produces only unfinished display steps; damage is already decided by the core. */
export function briefSteps(exchange:Exchange,progress:BattleProgress=battleProgress(exchange)):BriefStep[]{
 const hp=new Map(exchange.fighters.map(f=>[f.id,f.hp])),steps:BriefStep[]=[];
 exchange.strikes.forEach((strike,index)=>{
  const target=strike.cover??strike.target,before=hp.get(target)??0,after=strike.outcome.hit?Math.max(0,before-strike.outcome.damage):before;
  if((hp.get(strike.attacker)??0)<=0||before<=0)return;
  hp.set(target,after);const p=progress.strikes[index];
  const add=(kind:BriefStep['kind'])=>steps.push({kind,index,strike,hpBefore:before,hpAfter:after});
  if(!p.launched)add('launch');if(!p.result)add('result');if(before>0&&after===0&&!p.defeated)add('defeat');
 });return steps;
}
