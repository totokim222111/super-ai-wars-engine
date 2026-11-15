/** Shared execution/archive shape checks. History is validated, never replayed on load. */
import type {Command} from './types';
type Row=Record<string,unknown>;
const object=(v:unknown):v is Row=>!!v&&typeof v==='object'&&!Array.isArray(v);
const id=(v:unknown)=>typeof v==='string'&&v.length>0;
const ids=(v:unknown)=>Array.isArray(v)&&v.every(id);
const integer=(v:unknown)=>Number.isSafeInteger(v);
const optional=(c:Row,k:string,test:(v:unknown)=>boolean)=>c[k]===undefined||test(c[k]);
const response=(v:unknown)=>object(v)&&(v.type==='counter'?id(v.weaponId):v.type==='defend'||v.type==='evade');
const point=(v:unknown)=>object(v)&&integer(v.x)&&integer(v.y);
const direction=(v:unknown)=>['up','down','left','right'].includes(v as string);
const system=(v:unknown):boolean=>{
 if(!object(v))return false;
 switch(v.kind){
  case 'win':case 'lose':return true;
  case 'spawn':case 'reinforce':return Array.isArray(v.units)&&v.units.every(u=>object(u)&&id(u.id)&&id(u.mechId)&&id(u.pilotId)&&['player','enemy','neutral'].includes(u.side as string)&&point(u));
  case 'move':return ids(v.ids)&&integer(v.x)&&integer(v.y);
  case 'retreat':case 'join':case 'leave':return ids(v.ids);
  case 'set-ai':return ids(v.ids)&&['aggressive','hold','defensive'].includes(v.ai as string);
  case 'experience':return ids(v.ids)&&integer(v.amount)&&Number(v.amount)>=0;
  case 'effect':return ids(v.ids)&&object(v.effect);
  default:return false;
 }
};
// Record<Command['type'], ...> makes a new core command a compile error until its
// archive/execution shape is supplied here too (including support weaponSkill).
const shapes:Record<Command['type'],(c:Row)=>boolean>={
 weaponSkill:c=>id(c.unitId)&&id(c.weaponId),system:c=>typeof c.unitId==='string'&&system(c.action),
 persuade:c=>id(c.unitId)&&id(c.targetId),move:c=>id(c.unitId)&&integer(c.x)&&integer(c.y),undoMove:c=>id(c.unitId),
 spirit:c=>id(c.unitId)&&id(c.spiritId)&&optional(c,'targetId',id)&&optional(c,'pilotId',id),
 device:c=>id(c.unitId)&&id(c.deviceId)&&id(c.targetId),useItem:c=>id(c.unitId)&&integer(c.slot)&&Number(c.slot)>=0,
 mapAttack:c=>id(c.unitId)&&id(c.weaponId)&&optional(c,'point',point)&&optional(c,'direction',direction),
 transform:c=>id(c.unitId)&&id(c.formId),combine:c=>id(c.unitId)&&id(c.combinationId)&&optional(c,'memberIds',ids),split:c=>id(c.unitId),
 attack:c=>id(c.unitId)&&id(c.targetId)&&id(c.weaponId)&&optional(c,'supportAttackerId',id),
 respond:c=>response(c.response)&&optional(c,'supportDefenderId',id),wait:c=>id(c.unitId),endPhase:()=>true,
};
export function validCommandShape(value:unknown):value is Command{return object(value)&&Object.hasOwn(shapes,value.type as string)&&shapes[value.type as Command['type']](value);}
