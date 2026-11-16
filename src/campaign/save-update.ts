import {setPlayer,validPlayerName}from'./player';
/** Same-pack data updates carry stable campaign IDs, never old combat snapshots. */
import type{Content,StageUnit,UpgradeKey}from'../core';import{upgradeCap}from'./new-game-plus';import{fingerprint}from'./session';import type{CampaignContent}from'./content';import type{CampaignState}from'./state';import type{SaveFile}from'./saves';import type{SaveMigration}from'./save-migration';
const fail=():never=>{throw Error('손상된 이전 저장 진행');};
const obj=(v:unknown):Record<string,any>=>{if(!v||typeof v!=='object'||Array.isArray(v))return fail();return v as Record<string,any>;};
const integer=(v:unknown,min=0,max=Number.MAX_SAFE_INTEGER):number=>{if(!Number.isSafeInteger(v)||Number(v)<min||Number(v)>max)return fail();return Number(v);};
const string=(v:unknown):string=>{if(typeof v!=='string'||!v.length||v.length>4096)return fail();return v;};
const strings=(v:unknown):string[]=>{if(!Array.isArray(v)||v.length>16384)return fail();return v.map(string);};
const keys:UpgradeKey[]=['hp','en','armor','mobility','weapons'];
function checkState(value:unknown):CampaignState {
 const c=obj(value);integer(c.node);integer(c.credits);integer(c.stageCredits);if(c.battleCredits!==undefined)integer(c.battleCredits);if(c.cycle!==undefined)integer(c.cycle,1,100000);strings(c.parts);strings(c.cleared);
 const flags=obj(c.flags);if(Object.keys(flags).length>16384||Object.values(flags).some(v=>typeof v!=='boolean'))fail();
 for(const field of['affection','affectionChoices'])if(c[field]!==undefined)for(const n of Object.values(obj(c[field])))integer(n,field==='affectionChoices'?1:0,field==='affectionChoices'?4:Number.MAX_SAFE_INTEGER);
 for(const list of[c.roster,c.inheritance??[]]){if(!Array.isArray(list)||list.length>4096)fail();const ids=new Set();for(const value of list){const u=obj(value);string(u.id);string(u.pilotId);string(u.mechId);if(u.side!=='player'||ids.has(u.id))fail();ids.add(u.id);if(u.level!==undefined)integer(u.level,1,999);if(u.exp!==undefined)integer(u.exp);if(u.upgrades!==undefined){const x=obj(u.upgrades);if(Object.keys(x).some(k=>!keys.includes(k as UpgradeKey)))fail();for(const k of keys)integer(x[k],0,99);}if(u.parts!==undefined){if(!Array.isArray(u.parts)||u.parts.length>99)fail();for(const p of u.parts)if(p!==null)string(p);}if(u.subPilotProgress!==undefined){if(!Array.isArray(u.subPilotProgress))fail();for(const sub of u.subPilotProgress){string(sub.pilotId);integer(sub.level,1,999);integer(sub.exp);}}}}
 return c as CampaignState;
}
export interface ProgressAnchor{stage?:string;after?:string;end?:boolean}
export function progressAnchor(c:CampaignState,data:CampaignContent):ProgressAnchor{const n=data.nodes[c.retryNode??c.node];return n?.type==='stage'?{stage:n.id}:!n?{end:true}:{after:c.cleared.at(-1)};}
function training(flags:Record<string,boolean>,content:Content,restart:boolean):void {
 const prefix='v2:value:'+encodeURIComponent('v2:training')+':';
 for(const k of Object.keys(flags).filter(k=>k.startsWith(prefix))){let g:any;try{g=JSON.parse(JSON.parse(decodeURIComponent(k.slice(prefix.length))));}catch{return fail();}obj(g);obj(g.pilots);
  for(const[id,p]of Object.entries(g.pilots)as[string,any][]){const pilot=content.pilots.find(p=>p.id===id);if(!pilot){delete g.pilots[id];continue;}integer(p.points);obj(p.stats);obj(p.skills);for(const[key,n]of Object.entries(p.stats)){integer(n);if(!(key in pilot.stats))delete p.stats[key];}for(const[key,n]of Object.entries(p.skills)){integer(n);if(!content.skills?.some(s=>s.id===key))delete p.skills[key];}}
  if(restart)delete g.stage;delete flags[k];flags[prefix+encodeURIComponent(JSON.stringify(JSON.stringify(g)))]=true;
 }
}
export function updateSave(file:SaveFile,data:CampaignContent,content:Content,contract?:SaveMigration):SaveFile {
 integer(file.contentVersion,1,0xffffffff);integer(file.seed,-2147483648,0xffffffff);
 if(!['battle','result','intermission','end','roster'].includes(file.screen))fail();const current=checkState(file.campaign),start=checkState(file.stageStart);let stageId:string|undefined;
 if(file.battle){const g=obj(file.battle);if(typeof g.battle!=='string'||g.battle.length>10000000)fail();let b:any;try{b=JSON.parse(g.battle);}catch{return fail();}if(b.version!=='m2-save-2'||typeof b.contentVersion!=='string')fail();stageId=string(b.stageId);obj(b.battle);if(!Array.isArray(b.battle.units)||!b.battle.units.length)fail();integer(b.battle.round,1);}
 else if(file.screen==='battle'||file.screen==='result')fail();
 const restarting=!!file.battle,c=structuredClone(restarting?start:current);let refund=0;
 const all=Object.values(data.stages).flatMap(s=>[...s.stage.units,...s.stage.definitions??[],...Object.values(s.stage.waves??{}).flat()]).filter(u=>u.side==='player');
 const spent=(u:StageUnit,key:UpgradeKey,from:number,to:number):number=>{const prices=contract?.upgradeLimits[key]?.costs??contract?.upgradeCost??content.rules.upgradeLimits?.[key]?.costs??content.rules.upgradeCost,multiplier=contract?.mechCosts[u.mechId]??content.mechs.find(m=>m.id===u.mechId)?.costClass??1;let n=0;for(let i=from;i<to;i++)n+=(prices[i]??prices.at(-1)??0)*multiplier;return n;};
 const units=(list:StageUnit[],pay:boolean):StageUnit[]=>list.flatMap(old=>{const d=all.find(u=>u.id===old.id);if(!d){if(pay)for(const k of keys)refund+=spent(old,k,0,old.upgrades?.[k]??0);return [];}
  const mech=content.mechs.find(m=>m.id===old.mechId)??content.mechs.find(m=>m.id===d.mechId),pilot=content.pilots.find(p=>p.id===old.pilotId)??content.pilots.find(p=>p.id===d.pilotId);if(!mech||!pilot)return [];
  const u:StageUnit={...structuredClone(d),mechId:mech.id,pilotId:pilot.id,x:0,y:0,side:'player',level:Math.min(old.level??1,content.rules.levelMax),exp:Math.min(old.exp??0,content.rules.expPerLevel-1),upgrades:{hp:0,en:0,armor:0,mobility:0,weapons:0}};
  for(const k of keys){const n=old.upgrades?.[k]??0,next=contract&&!contract.preserveUpgrades?0:Math.min(n,upgradeCap(content,k,c.cycle));u.upgrades![k]=next;if(pay)refund+=spent(old,k,next,n);}
  u.parts=(old.parts??[]).slice(0,mech.partSlots??0).map(id=>id&&content.parts?.some(p=>p.id===id)?id:null);
  if(old.fullUpgradeBonus&&content.fullUpgradeBonuses?.some(b=>b.id===old.fullUpgradeBonus)&&Object.values(u.upgrades!).every(n=>n>=content.rules.fullUpgradeThreshold))u.fullUpgradeBonus=old.fullUpgradeBonus;
  if(old.subPilotProgress)u.subPilotProgress=old.subPilotProgress.filter(s=>content.pilots.some(p=>p.id===s.pilotId)).map(s=>({...s,level:Math.min(s.level,content.rules.levelMax),exp:Math.min(s.exp,content.rules.expPerLevel-1)}));return[u];});
 if(c.player&&data.players){const old=c.player,cfg=data.players,preset=Math.max(0,cfg.presets.findIndex(p=>p.id===old.preset)),line=cfg.lines.find(l=>l.id===old.line)??cfg.lines[0];setPlayer(c,{name:validPlayerName(old.name,cfg.name)?old.name:cfg.name.default,preset,line:line.id},cfg);}
 c.roster=units(c.roster,true);if(c.inheritance)c.inheritance=units(c.inheritance,false);c.credits+=refund;if(!Number.isSafeInteger(c.credits))fail();c.stageCredits=c.credits;delete c.battleCredits;delete c.retryNode;
 if(c.retryExperience)c.retryExperience=Object.fromEntries(Object.entries(c.retryExperience).filter(([id])=>all.some(u=>u.id===id)));
 c.parts=c.parts.filter(id=>content.parts?.some(p=>p.id===id));c.cleared=[...new Set(c.cleared.filter(id=>Object.hasOwn(data.stages,id)))];training(c.flags,content,restarting);
 const anchor=file.progress;if(anchor){if(anchor.stage!==undefined)string(anchor.stage);if(anchor.after!==undefined)string(anchor.after);if(anchor.end!==undefined&&typeof anchor.end!=='boolean')fail();}
 stageId??=anchor?.stage;
 let node=stageId?data.nodes.findIndex(n=>n.type==='stage'&&n.id===stageId):-1;
 if(node<0){const after=anchor?.after??c.cleared.at(-1),last=after?data.nodes.findIndex(n=>n.type==='stage'&&n.id===after):-1;node=last>=0?last+1:data.nodes.findIndex(n=>n.type==='stage'&&!c.cleared.includes(n.id)&&(!n.if||c.flags[n.if.replace(/^flag:/,'')]));}
 if(anchor?.end||file.screen==='end')node=data.nodes.length;if(node<0)node=data.nodes.length;c.node=node;
 const screen=node>=data.nodes.length?'end':'intermission';if(screen==='intermission'&&data.nodes[node]?.type==='stage')c.retryNode=node;
 const result:SaveFile={...file,contentVersion:fingerprint(data),campaign:c,stageStart:structuredClone(c),screen,seed:file.seed,progress:progressAnchor(c,data),migrationNotice:{refund,updated:true,...(restarting?{restartedStage:true}:{})}};delete result.battle;delete result.scenario;return result;
}
