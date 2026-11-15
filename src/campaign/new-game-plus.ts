import type {Content,StageUnit,UpgradeKey} from '../core';
import {newCampaign,type CampaignState} from './state';

export function upgradeCap(content:Content,key:UpgradeKey,cycle=1):number {
  const rule=content.rules.upgradeLimits?.[key];
  return rule?(cycle>1?rule.newGamePlusMax??rule.max:rule.max):content.rules.upgradeMax;
}
/** Progress records are separate from the initial roster: hidden recruitment happens again. */
export function nextCycle(previous:CampaignState,content:Content):CampaignState {
  const rule=content.rules.newGamePlus;if(!rule)throw Error('new game plus is not enabled');
  const c=newCampaign(),carry=new Set(rule.carry);c.cycle=(previous.cycle??1)+1;
  c.player=structuredClone(previous.player);c.persona=previous.persona;
  if(carry.has('credits'))c.credits=previous.credits;
  if(carry.has('parts'))c.parts=structuredClone(previous.parts);
  c.inheritance=[...new Map([...(previous.inheritance??[]),...previous.roster].map(u=>[u.id,u])).values()].map(u=>{
    const next:StageUnit={id:u.id,pilotId:u.pilotId,mechId:u.mechId,x:u.x,y:u.y,side:'player'};
    if(carry.has('upgrades')){next.upgrades=structuredClone(u.upgrades);next.fullUpgradeBonus=u.fullUpgradeBonus;}
    if(carry.has('parts'))next.parts=structuredClone(u.parts);
    if(carry.has('levels')){next.level=u.level;next.exp=u.exp;next.subPilotProgress=structuredClone(u.subPilotProgress);}
    return next;
  });
  if(carry.has('training'))for(const [key,v]of Object.entries(previous.flags))if(key.startsWith('v2:value:'+encodeURIComponent('v2:training')+':')){
    try{const prefix='v2:value:'+encodeURIComponent('v2:training')+':',encoded=JSON.parse(decodeURIComponent(key.slice(prefix.length))),g=JSON.parse(encoded);delete g.stage;c.flags[prefix+encodeURIComponent(JSON.stringify(JSON.stringify(g)))]=v;}catch{/* Invalid optional training is not carried. */}
  }
  return c;
}
