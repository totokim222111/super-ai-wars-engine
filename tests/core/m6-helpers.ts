import spirits from '../fixtures/core/spirits.json';
import skills from '../fixtures/core/skills.json';
import parts from '../fixtures/core/parts.json';
import bonuses from '../fixtures/core/fullUpgradeBonuses.json';
import type {BattleState,Content,EffectAtom,EffectDuration,Stage,Spirit,Skill,Part,EffectDefinition} from '../../src/core';
import {arena} from './helpers';
export function m6(configure?: (c:Content,stage:Stage)=>void): BattleState {
  return arena((c,s)=>{
    c.spirits=structuredClone(spirits) as Spirit[];c.skills=structuredClone(skills) as Skill[];c.parts=structuredClone(parts) as Part[];c.fullUpgradeBonuses=structuredClone(bonuses) as EffectDefinition[];
    for(const p of c.pilots){p.sp=200;p.spGrowth=3;p.growth={melee:2,shoot:2,hit:1,evade:1,skill:1,defense:2};p.spirits=c.spirits.map(d=>({id:d.id,level:d.id==='renew'?3:1}));}
    for(const m of c.mechs){m.partSlots=4;m.costClass=2;m.exp=1000;m.credits=100;}
    c.weapons[0].range=[1,6];c.weapons[0].hit=100;
    s.units.push({id:'p2',pilotId:'pilot-2',mechId:'mech-b',side:'player',x:1,y:1},{id:'e2',pilotId:'pilot-5',mechId:'mech-e',side:'enemy',x:4,y:2});
    s.scenario=true;c.options={spiritAfterAction:true};configure?.(c,s);
  });
}
export function attach(s:BattleState,index:number,atoms:EffectAtom[],duration:EffectDuration='passive',id='test'): void {
  s.units[index].effects.push({id,source:id,atoms,duration:{unit:'use',remaining:1},lifetime:duration,hooks:{}});
}
