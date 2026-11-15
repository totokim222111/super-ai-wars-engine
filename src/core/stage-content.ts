import {effectivePilot} from './modifiers';
import type {BattleState,Unit,Content,Stage,Rules,StageUnit,Upgrades} from './types';
/** Stage-scoped numeric tables never leak into the next episode's shared catalog. */
export function stageContent(content:Content,stage:Stage):Content {
  const o=stage.contentOverrides;if(!o&&stage.enemyUpgradeLevel===undefined)return content;
  const c=structuredClone(content);
  if(stage.enemyUpgradeLevel!==undefined&&c.rules.enemyUpgrades)c.rules.deploymentUpgradeMax=Math.max(1,c.rules.deploymentUpgradeMax??0,stage.enemyUpgradeLevel);
  if(!o)return c;
  for(const key of ['mechs','weapons']as const){const changes=o[key]??{};for(const [id,patch]of Object.entries(changes)){
    const row=c[key].find(r=>r.id===id);if(!row)throw Error(`stage override: unknown ${key} ${id}`);Object.assign(row,structuredClone(patch),{id});
  }}
  const keys=['hp','en','armor','mobility','move','weapons','enRecovery','hpRecovery','devices','subPilots','pilotOverrides','credits','exp']as const;
  const numeric=(row:Content['mechs'][number])=>Object.fromEntries(keys.filter(k=>row[k]!==undefined).map(k=>[k,structuredClone(row[k])]));
  for(const m of c.mechs){const origin=o.aliases?.[m.id],canonical=origin&&c.mechs.find(v=>v.id===origin);if(canonical)Object.assign(m,numeric(canonical));
    for(const f of m.forms??[]){const first=f.overrides.weapons?.[0],source=first?c.mechs.find(v=>!o.aliases?.[v.id]&&v.weapons.includes(first)):undefined;if(source&&(o.mechs?.[source.id]||origin))Object.assign(f.overrides,Object.fromEntries(Object.entries(numeric(source)).filter(([k])=>['hp','en','armor','mobility','move','weapons','enRecovery'].includes(k))));}
  }
  for(const w of c.weapons)if(w.ammo===null)delete w.ammo;
  return c;
}


/** First campaign is cycle 1 in saves; no offset is applied to it. */
export function enemyUpgradeLevel(level:number,cycle:number,rules:Rules):number {
  if(!Number.isSafeInteger(level)||level<0||!Number.isSafeInteger(cycle)||cycle<1)throw Error('invalid enemy upgrade cycle/level');
  const result=level+Math.max(0,cycle-1)*(rules.newGamePlus?.enemyUpgradeOffsetPerCycle??0);
  if(!Number.isSafeInteger(result)||result<0)throw Error('invalid enemy upgrade level');
  return result;
}
export function enemyUpgrades(level:number,rules:Rules):Upgrades|undefined {
  const f=rules.enemyUpgrades;if(!f)return;
  return {hp:level,en:level,armor:Math.min(Math.floor(level/(f.armorDivisor??1)),f.armorCap??Infinity),mobility:Math.min(Math.floor(level/(f.mobilityDivisor??1)),f.mobilityCap??Infinity),weapons:Math.floor(level/f.weaponDivisor)};
}
/** Used for initial units and every spawn path, including scripted reinforcements. */
export function enemyLoadout(unit:StageUnit,stage:Stage,rules:Rules):StageUnit {
  const upgrades=stage.enemyUpgradeLevel===undefined?undefined:enemyUpgrades(stage.enemyUpgradeLevel,rules);
  const scaling=stage.enemyPilotScaling,target=scaling?.units[unit.id];
  return unit.side==='enemy'?{...unit,...(upgrades?{upgrades}:{}),...(target?{level:Math.max(1,Math.min(rules.levelMax,Math.round(scaling!.baseline.level*target.ratio)))}:{})}:unit;
}

/** Save restoration and sortie preparation both compute the same inherited reference. */
export function scaleEnemyReference(stage:Stage,roster:StageUnit[],content:Content,cycle:number):void {
  const scale=stage.enemyPilotScaling;if(cycle<=1||scale?.newGamePlusReference!=='allied-mean')return;
  const candidates=[...roster,...stage.units.filter(u=>u.side==='player')],pilots=[...new Map(candidates.filter(u=>!scale.referencePilots||scale.referencePilots.includes(u.pilotId)).map(u=>[u.pilotId,u])).values()];
  if(!pilots.length)return;
  const stats={...scale.baseline.stats};for(const key of Object.keys(stats)as (keyof typeof stats)[])stats[key]=pilots.reduce((sum,u)=>sum+effectivePilot({content}as BattleState,{...u,effects:[]}as unknown as Unit).stats[key],0)/pilots.length;
  scale.baseline={level:pilots.reduce((n,u)=>n+(u.level??1),0)/pilots.length,stats};
}
