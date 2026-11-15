import type {Content, StageUnit, UpgradeKey, Upgrades} from '../core';
import {effectiveMech,effectivePilot,effectiveWeapon} from '../core';
import type {BattleState,Unit} from '../core';
import type {CampaignState} from './state';
import {upgradeCap} from './new-game-plus';

export interface IntermissionContext {screen: string; campaign: CampaignState}
export const emptyUpgrades = (): Upgrades => ({hp:0,en:0,armor:0,mobility:0,weapons:0});
function unit(c: CampaignState,id: string): StageUnit {const u=c.roster.find(u=>u.id===id);if(!u)throw new Error('intermission: unknown unit');return u;}
function check(ctx: IntermissionContext): void {if(ctx.screen!=='intermission')throw new Error('intermission: unavailable outside intermission');}
export function rosterStats(c: Content,u: StageUnit) {
  const state={content:c} as BattleState,subject={...u,effects:[]} as unknown as Unit,m=effectiveMech(state,subject);
  const weapons=m.weapons.map(id=>effectiveWeapon(state,subject,c.weapons.find(w=>w.id===id)!));
  return {hp:m.hp,en:m.en,armor:m.armor,mobility:m.mobility,move:m.move,adapt:m.adapt,sp:effectivePilot(state,subject).sp,weaponPower:Object.fromEntries(weapons.map(w=>[w.id,w.power])),weaponRange:Object.fromEntries(weapons.map(w=>[w.id,w.range]))};
}
const projection=rosterStats;
export function fullUpgradeEligible(u: StageUnit,c: Content): boolean {return Object.values(u.upgrades??emptyUpgrades()).every(n=>n>=c.rules.fullUpgradeThreshold);}
export function previewUpgrade(ctx: IntermissionContext,c: Content,id: string,key: UpgradeKey,steps=1) {
  const u=unit(ctx.campaign,id),levels=u.upgrades??emptyUpgrades(),next=structuredClone(u),m=c.mechs.find(m=>m.id===u.mechId)!;
  const cap=upgradeCap(c,key,ctx.campaign.cycle),prices=c.rules.upgradeLimits?.[key]?.costs??c.rules.upgradeCost;
  let reason: string|null=ctx.screen!=='intermission'?'intermission required':null;
  if(!Object.hasOwn(levels,key)||!Number.isSafeInteger(steps)||steps<1||levels[key]+steps>cap)reason='upgrade cap or invalid steps';
  const cost=reason?0:prices.slice(levels[key],levels[key]+steps).reduce((a,b)=>a+b,0)*(m.costClass??1);
  if(!reason && cost>ctx.campaign.credits)reason='insufficient credits';
  next.upgrades={...levels,[key]:Math.min(cap,levels[key]+steps)};
  return {max:cap,allowed:!reason,reason,cost,from:levels[key],to:next.upgrades[key],before:projection(c,u),after:projection(c,next),bonusAvailable:fullUpgradeEligible(next,c)&&!next.fullUpgradeBonus};
}
export function upgradeMech<T extends IntermissionContext>(ctx:T,c:Content,id:string,key:UpgradeKey,steps=1): T {
  const preview=previewUpgrade(ctx,c,id,key,steps);if(!preview.allowed)throw new Error(`upgrade: ${preview.reason}`);
  const next=structuredClone(ctx),u=unit(next.campaign,id);u.upgrades={...(u.upgrades??emptyUpgrades()),[key]:preview.to};next.campaign.credits-=preview.cost;return next;
}
export function equipPart<T extends IntermissionContext>(ctx:T,c:Content,id:string,slot:number,partId:string): T {
  check(ctx);const next=structuredClone(ctx),u=unit(next.campaign,id),m=c.mechs.find(m=>m.id===u.mechId)!;
  if(!Number.isSafeInteger(slot)||slot<0||slot>=(m.partSlots??0)||!c.parts?.some(p=>p.id===partId))throw new Error('part: invalid slot or part');
  const index=next.campaign.parts.indexOf(partId);if(index<0)throw new Error('part: not owned');
  next.campaign.parts.splice(index,1);u.parts??=Array<string|null>(m.partSlots??0).fill(null);if(u.parts[slot])next.campaign.parts.push(u.parts[slot]!);u.parts[slot]=partId;return next;
}
export function unequipPart<T extends IntermissionContext>(ctx:T,c:Content,id:string,slot:number): T {
  check(ctx);const next=structuredClone(ctx),u=unit(next.campaign,id);
  if(!Number.isSafeInteger(slot)||slot<0||slot>=(c.mechs.find(m=>m.id===u.mechId)!.partSlots??0)||!u.parts?.[slot])throw new Error('part: empty slot');
  next.campaign.parts.push(u.parts[slot]!);u.parts[slot]=null;return next;
}
export function selectFullUpgradeBonus<T extends IntermissionContext>(ctx:T,c:Content,id:string,bonusId:string): T {
  check(ctx);const next=structuredClone(ctx),u=unit(next.campaign,id);
  if(u.fullUpgradeBonus||!fullUpgradeEligible(u,c)||!c.fullUpgradeBonuses?.some(b=>b.id===bonusId))throw new Error('bonus: unavailable');
  u.fullUpgradeBonus=bonusId;return next;
}
/** Pilot growth follows the pilot; loadout and upgrade data remain on the machine. */
export function swapPilots<T extends IntermissionContext>(ctx:T,aId:string,bId:string): T {
  check(ctx);const next=structuredClone(ctx),a=unit(next.campaign,aId),b=unit(next.campaign,bId);
  for(const key of ['pilotId','level','exp'] as const) {const av=a[key],bv=b[key];Object.assign(a,{[key]:bv});Object.assign(b,{[key]:av});}
  return next;
}
export function partPreview(ctx: IntermissionContext,c:Content,id:string,slot:number,partId:string) {
  const after=equipPart(ctx,c,id,slot,partId);return {before:projection(c,unit(ctx.campaign,id)),after:projection(c,unit(after.campaign,id))};
}
