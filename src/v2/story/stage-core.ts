import {applyRules,rulesProjection,runtime} from '../rules/runtime';
import {type BattleState,type Command,type Unit} from '../../core';
/** 코어의 비행은 지형 비용을 무시한다. 이동 조회 때만 벽을 중립 점유로 투영한다. */
const prefix='__v2_wall_';
export function wallProjection(s:BattleState):BattleState {
  const blocked=new Set(s.content.terrain.filter(t=>Object.values(t.moveCost).every(c=>c===null)).map(t=>t.id));
  const toggled=new Set(runtime(s).blocked);
  if((!blocked.size&&!toggled.size)||!s.units.length)return s;
  const units:Unit[]=[];
  s.stage.map.tiles.forEach((row,y)=>row.forEach((tile,x)=>{if((!blocked.has(tile)&&!toggled.has(`${x},${y}`))||s.units.some(u=>u.alive&&u.x===x&&u.y===y))return;const base=s.units[0];units.push({id:`${prefix}${x}_${y}`,pilotId:base.pilotId,mechId:base.mechId,side:'neutral',x,y,hp:1,en:0,ammo:{},morale:100,sp:0,moved:true,acted:true,alive:true,moveOrigin:null,effects:[],tags:[]});}));
  return units.length?{...s,units:[...s.units,...units]}:s;
}
export function stageApply(s:BattleState,c:Command):ReturnType<typeof applyRules>{
  const query=c.type==='move'?wallProjection(s):s,result=applyRules(query,c);
  if(query!==s)result.state.units=result.state.units.filter(u=>!u.id.startsWith(prefix));return result;
}
export function aiProjection(s:BattleState):BattleState {const q=wallProjection(rulesProjection(s));return q===s?s:{...q,stage:{...q.stage,scenario:false}};}
