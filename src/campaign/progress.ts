import type {BattleState,StageUnit} from '../core';
import type {CampaignState} from './state';

export function persistentUnit(u: StageUnit): StageUnit {
  const {id,pilotId,mechId,side,x,y,ai,tags,level,exp,upgrades,parts,fullUpgradeBonus,subPilotProgress}=u;
  return {id,pilotId,mechId,side,x,y,...(ai?{ai}:{}),...(tags?{tags}:{}),...(level!==undefined?{level}:{}),...(exp!==undefined?{exp}:{}),...(upgrades?{upgrades:structuredClone(upgrades)}:{}),...(parts?{parts:structuredClone(parts)}:{}),...(fullUpgradeBonus?{fullUpgradeBonus}:{}),...(subPilotProgress?{subPilotProgress:structuredClone(subPilotProgress)}:{})};
}
export function persistBattle(c:CampaignState,b:BattleState): CampaignState {
  const next=structuredClone(c);
  if(b.credits!==undefined) {next.credits+=b.credits-(next.battleCredits??0);next.battleCredits=b.credits;}
  for(const unit of b.units) if(unit.side==='player') {
    const members=unit.combined?.members??[unit];
    for(const m of members) {
      const progress=m.id===unit.id&&unit.combined?{...m,pilotId:unit.pilotId,level:unit.level,exp:unit.exp}:m;
      const index=next.roster.findIndex(v=>v.id===m.id);if(index>=0)next.roster[index]=persistentUnit({...progress,...(m.subPilots?{subPilotProgress:m.subPilots.map(({pilotId,level,exp})=>({pilotId,level,exp}))}:{})});if(index>=0&&b.content.rules.consumablePolicy==='consume')for(const slot of m.usedItems??[])if(next.roster[index].parts)next.roster[index].parts![slot]=null;
    }
  }
  return next;
}
