import {behaviorOf} from '../../core/ai-patterns';
import {chooseAICommand,availableActions,reachable,type BattleState,type Command} from '../../core';
import type {CompiledStage} from './stage';
import {aiProjection} from './stage-core';
import {configOf} from '../rules/config';
import {runtime,faction,hostile} from '../rules/runtime';
/** 목표 제한만 자료로 투영하고 이동/무기/피해 평가와 합법성은 기존 코어에 맡긴다. */
export function stageAI(compiled:CompiledStage|undefined,s:BattleState,normal:Command):Command {
  if(!compiled||!('unitId'in normal)||s.pending)return normal;
  if(configOf(s.stage).combos.some(c=>(c.lead===normal.unitId||c.partner===normal.unitId)&&runtime(s).vars[c.flag])&&faction(s.units.find(u=>u.id===normal.unitId)!)==='player')return normal;
  if(behaviorOf(s,s.units.find(u=>u.id===normal.unitId)!))return normal;
  const rule=compiled.ai[normal.unitId];if(!rule)return normal;
  if(rule.kind==='defend')return {type:'wait',unitId:normal.unitId};
  if(rule.kind==='reach'){
    const u=s.units.find(u=>u.id===normal.unitId)!,area=s.stage.areas?.[rule.target??''];
    if(!area||u.moved||u.acted)return {type:'wait',unitId:u.id};
    const distance=(p:{x:number;y:number})=>Math.max(area[0]-p.x,0,p.x-area[2])+Math.max(area[1]-p.y,0,p.y-area[3]);
    const next=reachable(aiProjection(s),u.id).filter(p=>p.cost>0).sort((a,b)=>distance(a)-distance(b)||a.cost-b.cost||a.y-b.y||a.x-b.x)[0];
    return next&&distance(next)<distance(u)?{type:'move',unitId:u.id,x:next.x,y:next.y}:{type:'wait',unitId:u.id};
  }
  const u=s.units.find(u=>u.id===normal.unitId)!,target=s.units.find(t=>t.id===rule.target&&hostile(u,t));if(!target)return normal;
  const projection=aiProjection(s),query={...projection,stage:{...s.stage,scenario:false},units:projection.units.map(v=>v.side!==u.side&&v.id!==target.id?{...v,side:'neutral' as const}:v)};
  const command=chooseAICommand(query,u.id);
  if(command.type==='attack'&&command.targetId!==target.id)return normal;
  // 점유는 그대로다. 후보 명령도 실제 상태에서 다시 검사한다.
  return availableActions(projection,u.id).some(c=>JSON.stringify(c)===JSON.stringify(command))?command:normal;
}
