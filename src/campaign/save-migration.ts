/** Explicit pack-owned compatibility contracts. Structural migrations supplement the generic stable-ID data update. */
import type {Content,Unit,StageUnit} from '../core';
import {createBattle,effectiveMech,effectivePilot,snapshot,availableWeapons} from '../core';
import {initializeUnit} from '../core/system';
import {actionLimit} from '../core/actions';
import {enabledFlag} from './conditions';
import {deployment,fingerprint} from './session';
import type {CampaignContent} from './content';
import type {SaveFile} from './saves';
export interface SaveMigration {preserveUpgrades?:boolean;from:number[];contentVersions:string[];campaign:CampaignContent;content:Content;upgradeCost:number[];upgradeLimits:Record<string,{costs:number[]}>;mechCosts:Record<string,number>}
export function convertBalanceSave(file:SaveFile,data:CampaignContent,content:Content,contract:SaveMigration):{file:SaveFile;refund:number}{
 const f=structuredClone(file),zero={hp:0,en:0,armor:0,mobility:0,weapons:0};let refund=0;
 if(!contract.preserveUpgrades)for(const u of f.campaign.roster){for(const [key,n]of Object.entries(u.upgrades??{})){const prices=contract.upgradeLimits[key]?.costs??contract.upgradeCost;refund+=prices.slice(0,n).reduce((a,b)=>a+b,0)*(contract.mechCosts[u.mechId]??1);}}
 const reset=(u:StageUnit)=>{u.upgrades={...zero};delete u.fullUpgradeBonus;};
 for(const c of [f.campaign,f.stageStart]){if(!contract.preserveUpgrades)for(const u of [...c.roster,...c.inheritance??[]])reset(u);c.credits+=refund;c.stageCredits+=refund;}
 if(f.battle){const g=f.battle as any,old=JSON.parse(g.battle),item=data.stages[old.stageId];if(!item||!contract.contentVersions.includes(old.contentVersion))throw Error('지원하지 않는 전투 콘텐츠 버전');
  const stage=deployment(item.stage,f.stageStart,content),fresh=createBattle(content,stage,f.seed),definitions=[...stage.units,...stage.definitions??[],...Object.values(stage.waves??{}).flat()];
  const b=old.battle;fresh.round=b.round;fresh.phase=b.phase;fresh.rng=b.rng;fresh.outcome=b.outcome;fresh.options=b.options;fresh.credits=b.credits;fresh.pending=b.pending;fresh.units=[];
  for(const saved of b.units as Unit[]){const declared=item.stage.units.find(u=>u.id===saved.id);if(declared&&!enabledFlag(f.stageStart.flags,declared.requiresFlag))continue;const def=definitions.find(u=>u.id===saved.id);if(!def)throw Error('변환할 유닛 정의가 없습니다');const allied=saved.side==='player';const initial={...def,...(allied?{level:saved.level,exp:saved.exp,parts:saved.parts,upgrades:contract.preserveUpgrades?saved.upgrades:{...zero}}:{}),side:saved.side,x:saved.x,y:saved.y};
   const base=initializeUnit(fresh,initial),u={...saved,...(allied?{upgrades:contract.preserveUpgrades?saved.upgrades:{...zero}}:{level:base.level,upgrades:base.upgrades,pilotOverrides:base.pilotOverrides}),ammo:base.ammo,deviceUses:base.deviceUses,subPilots:base.subPilots} as Unit;
   if(!contract.preserveUpgrades){delete u.fullUpgradeBonus;delete u.aiFinisherUses;}
   const m=effectiveMech(fresh,u),p=effectivePilot(fresh,u);u.hp=Math.min(saved.hp,m.hp);u.en=Math.min(saved.en,m.en);u.sp=Math.min(saved.sp,p.sp);u.actionsSpent=Number(saved.acted);u.actionsRemaining=saved.acted?0:actionLimit(fresh,u);u.extraActionsUsed=0;
   fresh.units.push(u);
  }
  if(fresh.pending&&![fresh.pending.attackerId,fresh.pending.targetId].every(id=>fresh.units.some(u=>u.id===id))){fresh.pending=null;g.mode='idle';}
  if(fresh.units.length!==b.units.length){g.selected=null;g.target=null;g.weapon=null;g.clips=[];g.commands=(g.commands??[]).filter((c:any)=>!('unitId'in c)||!c.unitId||fresh.units.some(u=>u.id===c.unitId));}
  if(fresh.pending&&!availableWeapons(fresh,fresh.pending.attackerId,fresh.pending.targetId).some(w=>w.id===fresh.pending!.weaponId)){fresh.pending=null;g.mode='idle';}
  g.battle=snapshot(fresh);g.before=null;
  // A pending response is retained. Cosmetic old playback is settled to its already committed state.
  if(!['scenario','idle','selected','map','objectives','response'].includes(g.mode)){g.mode=fresh.pending?'response':'idle';delete g.exchange;delete g.rewards;}
 }
 f.contentVersion=fingerprint(data);f.migrationNotice={refund};return {file:f,refund};
}
