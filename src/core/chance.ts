import {effectiveMorale} from './modifiers';
import type {BattleState,Unit,Skill,Effect,BattleEvent} from './types';
import {effectivePilot} from './modifiers';
import {nextRandom} from './rng';

export function skillChance(s:BattleState,u:Unit,skill:Skill):number {
  const a=skill.activation;if(!a)return 0;const rule=s.content.rules.skillActivation;
  if((u.level??1)<(a.level??1)||effectiveMorale(s,u)<(a.morale??0))return 0;
  const stat=effectivePilot(s,u).stats[rule?.stat??'skill'];
  return Math.max(a.min??rule?.min??0,Math.min(a.max??rule?.max??100,a.base+(a.coefficient??rule?.coefficient??0)*(stat-(a.baseline??0))));
}
function candidates(s:BattleState,a:Unit,d:Unit,counter:boolean) {
  return [a,d].flatMap(u=>(s.content.pilots.find(p=>p.id===u.pilotId)?.skills??[]).flatMap(ref=>{
    const skill=s.content.skills?.find(k=>k.id===ref.id),hook=skill?.activation?.hook;
    return skill?.activation&&(u===d?hook==='defense':hook==='attack'||hook==='counter'&&counter)?[{u,skill,chance:skillChance(s,u,skill)}]:[];
  }));
}
const effect=(skill:Skill):Effect=>({id:'chance:'+skill.id,source:'chance',lifetime:'passive',duration:{unit:'use',remaining:1},hooks:{},atoms:skill.activation!.effects});
/** Exact independent-activation distribution, without drawing or modifying combat RNG. */
export function chanceVariants(s:BattleState,a:Unit,d:Unit,counter=false):{state:BattleState;weight:number}[] {
  let variants=[{state:s,weight:1}];
  for(const c of candidates(s,a,d,counter)){
    const probability=c.chance/100;if(!probability)continue;
    variants=variants.flatMap(v=>{const on={...v.state,units:v.state.units.map(u=>u.id===c.u.id?{...u,effects:[...u.effects,effect(c.skill)]}:u)};
      return [...(probability<1?[{state:v.state,weight:v.weight*(1-probability)}]:[]),{state:on,weight:v.weight*probability}];});
  }
  return variants;
}
export function rollSkills(s:BattleState,a:Unit,d:Unit,counter:boolean,events:BattleEvent[]):()=>void {
  for(const c of candidates(s,a,d,counter)){
    if(c.chance<=0)continue;const draw=nextRandom(s.rng);s.rng=draw.state;
    if(draw.value<c.chance/100){c.u.effects.push(effect(c.skill));events.push({type:'skill-activated',unitId:c.u.id,skillId:c.skill.id,chance:c.chance,roll:draw.value});}
  }
  return ()=>{for(const u of [a,d])u.effects=u.effects.filter(e=>e.source!=='chance');};
}
