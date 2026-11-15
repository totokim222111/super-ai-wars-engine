import type {BattleState,Unit} from './types';
import {effectivePilot} from './modifiers';

/** Each action allows one move and one attack (or wait/support). Counters are free. */
export function actionLimit(s:BattleState,u:Unit):number {
  const rule=s.content.rules.actions;
  if(!rule)return 1;
  const p=effectivePilot(s,u);
  const source=u.summonedBy?s.units.find(v=>v.id===u.summonedBy!.unitId):u;
  const cap=u.side==='enemy'?s.stage?.enemyPilotScaling?.units[source?.summonedBy?.unitId??source?.id??u.id]?.actionCap:undefined;
  const count=(rule.stat!==undefined&&p.stats[rule.stat]>=(rule.threshold??Infinity))||
    (rule.level!==undefined&&(u.level??1)>=rule.level)?rule.count:1;
  return Math.min(count,cap??count);
}
export const actionsLeft=(u:Unit):number=>u.actionsRemaining??Number(!u.acted);
export const hasActed=(u:Unit):boolean=>u.acted||(u.actionsSpent??0)>0;
export function resetActions(s:BattleState,u:Unit):void {
  u.acted=false;u.moved=false;u.moveOrigin=null;delete u.moveCommitted;
  if(s.content.rules.actions||u.actionsRemaining!==undefined){u.actionsRemaining=actionLimit(s,u);u.actionsSpent=0;u.extraActionsUsed=0;}
}
export function finishAction(s:BattleState,u:Unit,all=false):void {
  u.moveOrigin=null;
  if(s.content.rules.actions||u.actionsRemaining!==undefined){
    u.actionsSpent=(u.actionsSpent??0)+(all?Math.max(0,actionsLeft(u)):1);
    u.actionsRemaining=all?0:Math.max(0,actionsLeft(u)-1);
    u.acted=u.actionsRemaining===0;
    if(!u.acted){u.moved=false;delete u.moveCommitted;}
  }else u.acted=true;
}
export function addAction(s:BattleState,u:Unit):void {
  if(!s.content.rules.actions){u.acted=false;if(u.moved){u.moveOrigin=null;u.moveCommitted=true;}return;}
  if((u.extraActionsUsed??0)>=(s.content.rules.actions.extraMax??1))throw Error('extra action: round limit');
  u.actionsRemaining=actionsLeft(u)+1;u.actionsSpent??=Number(u.acted);u.extraActionsUsed=(u.extraActionsUsed??0)+1;u.acted=false;
}
