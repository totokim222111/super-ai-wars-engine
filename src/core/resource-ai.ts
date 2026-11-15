import {effectiveMorale} from './modifiers';
import type {BattleState,Unit,Weapon} from './types';
import {resourceRecovery} from './resources';
import {effectiveMech} from './modifiers';
import {energyRegen} from './gimmicks';

/** Opt-in policy shared by enemy turns and automatic counter selection. */
export function resourceScore(s:BattleState,u:Unit,w:Weapon,expected:number,targetHp=Infinity,context?:{hitRate:number;counter?:number;kill?:boolean;target?:Unit;counterContext?:boolean}):number {
  const policy=s.content.rules.ai.resources;if(!policy)return expected;
  if(policy.utility){
    const k=policy.utility,p=(context?.hitRate??100)/100,useful=Math.min(expected,targetHp*p),cost=w.en??0;
    const role=k.roleEnPrices?.[u.pilotId];let price=u.en-cost<k.enReserve?(role?.[1]??k.scarceEnPrice):(role?.[0]??k.baseEnPrice);
    const legal=effectiveMech(s,u).weapons.map(id=>s.content.weapons.find(w=>w.id===id)!).filter(n=>!n.map&&u.en>=(n.en??0)&&effectiveMorale(s,u)>=(n.moraleReq??0)&&(n.ammo===undefined||(u.ammo[n.id]??0)>0)&&(!u.moved||n.postMove)&&(!context?.target||Math.abs(u.x-context.target.x)+Math.abs(u.y-context.target.y)>=n.range[0]&&Math.abs(u.x-context.target.x)+Math.abs(u.y-context.target.y)<=n.range[1]));
    const free=Math.max(0,...legal.filter(n=>!n.en).map(n=>n.power)),freeDamage=expected*free/Math.max(1,w.power);
    const saving=cost>0&&!w.finisher&&freeDamage>0&&Math.ceil(targetHp/Math.max(1,expected))<Math.ceil(targetHp/freeDamage)?freeDamage*(k.ordinaryActionSavingWeight??0):0;
    const fin=Math.max(0,...legal.filter(n=>n.finisher&&u.en-cost>=(n.en??0)).map(n=>n.power));
    const positioning=!context?.counterContext&&effectiveMorale(s,u)>=110?expected*fin/Math.max(1,w.power)*(k.futureBurstWeight??0):0;
    let burstBonus=0,penalty=0;const burst=context?.counterContext&&policySide(s,u)==='player'?undefined:policy.burst;
    if(burst&&w.finisher){const normals=legal.filter(n=>!n.finisher),normalDamage=expected*Math.max(0,...normals.map(n=>n.power))/Math.max(1,w.power),elite=context?.target&&burst.eliteMechs.includes(context.target.mechId),elites=s.stage.units.filter(t=>t.side!==u.side&&burst.eliteMechs.includes(t.mechId)).length,combatants=s.stage.units.filter(t=>t.side===u.side&&!policy.supportPilots?.includes(t.pilotId)&&!policy.supportUnits?.includes(t.id)).length,budget=elites>=burst.eliteCount||elites>=1&&combatants>=6&&!Object.values(s.content.aiReserves??{}).some(Boolean)?burst.crowded:burst.base;
      if(normals.length&&((u.aiFinisherUses??0)>=budget||!elite||targetHp<normalDamage*.75))penalty+=Math.max(1,expected)*5+20000;
      else {burstBonus=expected*.45;price*=.4;}
    }
    const reserve=Math.max(context?.counterContext&&policySide(s,u)==='player'?0:s.content.aiReserves?.[u.id]??0,policy.reserveFinisher&&!w.finisher&&burst?Math.min(...effectiveMech(s,u).weapons.map(id=>s.content.weapons.find(w=>w.id===id)!).filter(n=>n.finisher).map(n=>n.en??0)):0);
    if(!w.finisher&&cost>0&&Number.isFinite(reserve)&&u.en-cost<reserve&&expected<targetHp)penalty+=(reserve-(u.en-cost))*price;
    return useful+burstBonus-penalty+positioning+saving+k.targetHpRatioWeight*Math.min(1,useful/Math.max(1,targetHp))+(context?.kill?Math.min(k.lethalBonusCap,useful*k.lethalUsefulMultiplier)*p:0)-k.counterWeight*(context?.counter??0)-cost*price*(1+(u.level??1)/30)-(w.ammo!==undefined?useful*k.ammoUsefulFactor/Math.max(1,u.ammo[w.id]):0);
  }
  let score=expected*(w.ammo!==undefined?1+policy.ammoBonus:1);
  if(policy.reserveFinisher&&(w.en??0)>0&&(w.moraleReq??0)<(policy.finisherMorale??120)&&expected<targetHp){
    const finishers=effectiveMech(s,u).weapons.map(id=>s.content.weapons.find(w=>w.id===id)!).filter(candidate=>(candidate.moraleReq??0)>=(policy.finisherMorale??120)&&(candidate.en??0)>0&&candidate.id!==w.id);
    const reserve=Math.min(...finishers.map(w=>w.en!));
    const recovery=energyRegen(s,u)+resourceRecovery(s,u).en;
    if(Number.isFinite(reserve)&&u.en-(w.en??0)+recovery<reserve)score*=1-policy.reservePenalty;
  }
  return score;
}

/** Query-only faction map survives v2's hostile-side projection. */
export const policySide=(s:BattleState,u:Unit):string=>s.content.aiSides?.[u.id]??u.side;
/** Independent stateless FNV stream: repeated previews never advance combat RNG.
 * One best position per weapon, then the 95% damage gate among near-utility choices.
 * Low-cost candidates win a near tie; hash mixes distinct equally priced weapons. */
export function selectResourceCandidate<T extends {damage:number}>(s:BattleState,u:Unit,rows:T[],score:keyof T,id:keyof T):T|undefined{
 const tolerance=s.content.rules.ai.resources?.nearOptimal;if(!tolerance||rows.length<2)return rows[0];
 const top=Number(rows[0][score]),cutoff=top-Math.max(1,Math.abs(top)*tolerance),seen=new Set(),choices:T[]=[];
 for(const row of rows){const key=String(row[id]);if(Number(row[score])<cutoff||seen.has(key))continue;seen.add(key);choices.push(row);}
 const damage=Math.max(...choices.map(x=>x.damage));let pool=choices.filter(x=>x.damage>=damage*(1-tolerance));
 const cost=(row:T)=>{const w=s.content.weapons.find(w=>w.id===row[id]);return w?.en??0;};const min=Math.min(...pool.map(cost));pool=pool.filter(x=>cost(x)===min);
 let hash=2166136261;for(const ch of [s.stage.id,s.round,u.id,u.actionsSpent??0,u.aiFinisherUses??0,s.rng].join('|'))hash=Math.imul(hash^ch.charCodeAt(0),16777619)>>>0;
 return pool.length?pool[hash%pool.length]:rows[0];
}
