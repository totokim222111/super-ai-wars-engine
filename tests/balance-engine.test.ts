import {describe,it,expect,beforeAll} from 'vitest';
import {readFile} from 'node:fs/promises';
import {arena} from './core/helpers';
import {apply,createBattle,snapshot,restore,forecast,nextAICommand,availableActions,spiritProblem,effectiveMech,effectivePilot,effectiveWeapon,skillChance,chooseResponse,resourceScore,validateContent,type Content,type BattleState} from '../src/core';
import {previewUpgrade,upgradeMech} from '../src/campaign/intermission';
import {newCampaign} from '../src/campaign/state';
import {nextCycle} from '../src/campaign/new-game-plus';
import {deployment} from '../src/campaign/session';
import {persistBattle} from '../src/campaign/progress';
import {loadPack,packLookup,type Pack} from '../src/v2/pack/load';
import {prepareRules,applyRules,comboProblem,setRuleVariable} from '../src/v2/rules/runtime';
import {configOf} from '../src/v2/rules/config';
import {CoreMap} from '../src/v2/adapter/map';
import {trainedContent,growthFromFlags} from '../src/v2/adapter/training';

function battle(configure?:(c:Content)=>void):BattleState{return arena((c,stage)=>{
  c.rules.actions={stat:'skill',threshold:130,count:2,extraMax:1};c.options={spiritAfterAction:false};
  for(const p of c.pilots)p.stats.skill=140;
  for(const m of c.mechs)m.hp=100000;
  c.spirits=[{id:'wake',name:'각성',desc:'예약 행동',sp:0,spPct:50,target:'self',duration:'instant',effects:[{type:'extraAction'}]},{id:'supply',name:'보급',desc:'자원 회복',sp:10,target:'ally',duration:'instant',effects:[{type:'resupply'}]}];
  c.pilots[0].spirits=[{id:'wake',level:1},{id:'supply',level:1}];
  stage.units.push({id:'p2',pilotId:c.pilots[1].id,mechId:c.mechs[1].id,side:'player',x:1,y:3});
  configure?.(c);
});}
const round=(s:BattleState)=>apply(apply(s,{type:'endPhase'}).state,{type:'endPhase'}).state;
const shoot=(s:BattleState,id='p1',targetId='e1')=>{const cmd=availableActions(s,id).find(c=>c.type==='attack'&&c.targetId===targetId)!;expect(cmd).toBeDefined();return apply(s,cmd);};
describe('resource and action budgets',()=>{
  it('charges ammo on misses and counters; sortie fills, restore does not',()=>{
    let s=battle(c=>{for(const w of c.weapons){w.ammo=4;w.en=0;w.hit=-999;w.range=[1,8];}});
    const result=shoot(s),hits=result.events.filter(e=>e.type==='attack');expect(hits.length).toBe(2);
    for(const e of hits){expect(e.hit).toBe(false);expect(result.state.units.find(u=>u.id===e.attackerId)!.ammo[e.weaponId]).toBe(3);}
    const loaded=restore(s.content,s.stage,snapshot(result.state));expect(loaded.units[0].ammo).toEqual(result.state.units[0].ammo);
    expect(createBattle(s.content,s.stage,1).units[0].ammo).toEqual(s.units[0].ammo);
    s=round(result.state);expect(s.units[0].ammo).toEqual(result.state.units[0].ammo);
  });
  it('allows move/attack/move/attack and forbids spirits after the first completion',()=>{
    let s=battle(c=>{for(const w of c.weapons)w.range=[1,8];});
    s=apply(s,{type:'move',unitId:'p1',x:2,y:2}).state;s=shoot(s).state;
    expect(s.units[0]).toMatchObject({acted:false,moved:false,actionsSpent:1,actionsRemaining:1});
    expect(spiritProblem(s,'p1','wake')).toContain('cannot act');
    s=apply(s,{type:'move',unitId:'p1',x:2,y:1}).state;s=shoot(s).state;
    expect(s.units[0]).toMatchObject({acted:true,actionsSpent:2,actionsRemaining:0});
    expect(()=>apply(s,{type:'move',unitId:'p1',x:1,y:1})).toThrow();
  });
  it('enemy AI uses both actions before ending phase',()=>{
    let s=battle(c=>{for(const w of c.weapons)w.range=[1,8];});s=apply(s,{type:'endPhase'}).state;
    let shots=0;for(let n=0;n<20;n++){const cmd=nextAICommand(s)!;if(cmd.type==='endPhase')break;const r=apply(s,cmd);shots+=r.events.filter(e=>e.type==='attack'&&!e.counter).length;s=r.state;}
    expect(shots).toBe(2);expect(s.units.find(u=>u.id==='e1')?.actionsRemaining).toBe(0);
  });
  it('supports level thresholds and evaluates growth at the next phase',()=>{
    let s=battle(c=>{c.rules.actions={level:2,count:2};});expect(s.units[0].actionsRemaining).toBe(1);s.units[0].level=2;s=round(s);expect(s.units[0].actionsRemaining).toBe(2);
  });
  it('reserves one extra action and charges a fraction of the casting pilot max SP',()=>{
    let s=battle(),before=s.units[0].sp;s=apply(s,{type:'spirit',unitId:'p1',spiritId:'wake'}).state;
    expect(s.units[0]).toMatchObject({sp:before-Math.ceil(before/2),actionsRemaining:3,extraActionsUsed:1});
    expect(()=>apply(s,{type:'spirit',unitId:'p1',spiritId:'wake'})).toThrow('round limit');
    for(let n=0;n<3;n++)s=apply(s,{type:'wait',unitId:'p1'}).state;
    expect(s.units[0].acted).toBe(true);s=round(s);expect(s.units[0].extraActionsUsed).toBe(0);
  });
  it('migrates only the previous core format conservatively and rejects inconsistent counters',()=>{
    const s=battle(),old=JSON.parse(snapshot(s));old.version='m2-save-1';for(const u of old.battle.units){delete u.actionsRemaining;delete u.actionsSpent;delete u.extraActionsUsed;}
    expect(restore(s.content,s.stage,JSON.stringify(old)).units[0].actionsRemaining).toBe(1);
    const bad=JSON.parse(snapshot(s));bad.battle.units[0].actionsRemaining=0;expect(()=>restore(s.content,s.stage,JSON.stringify(bad))).toThrow('acted');
  });
});
describe('recovery, devices, crew and consumable persistence',()=>{
  function support(){return battle(c=>{c.mechs[0].devices=[{id:'supply',name:'보급 장치',kind:'resupply',uses:8,postMove:true,morale:-10,experience:60},{id:'repair',name:'수리 장치',kind:'repair',uses:2,postMove:true,amount:{pct:30},experience:30}];});}
  it('counts all eight supplies; moving and loading never refill devices',()=>{
    let s=support();for(let n=0;n<8;n++){s.units[1].en=0;const target=s.units.find(u=>u.id==='p2')!;target.en=0;target.morale=110;const r=apply(s,{type:'device',unitId:'p1',deviceId:'supply',targetId:'p2'});s=r.state;expect(s.units.find(u=>u.id==='p2')!.morale).toBe(100);expect(r.events.some(e=>e.type==='exp-gained'&&e.amount===60)).toBe(true);s=restore(s.content,s.stage,snapshot(s));s=round(s);}
    s.units.find(u=>u.id==='p2')!.en=0;expect(()=>apply(s,{type:'device',unitId:'p1',deviceId:'supply',targetId:'p2'})).toThrow('no uses');
    expect(createBattle(s.content,s.stage,1).units[0].deviceUses?.supply).toBe(8);
  });
  it('repairs HP, consumes one action, rejects full or distant targets atomically',()=>{
    const s=support(),v=s.units.find(u=>u.id==='p2')!;v.hp=1000;
    const r=apply(s,{type:'device',unitId:'p1',deviceId:'repair',targetId:'p2'});expect(r.state.units.find(u=>u.id==='p2')!.hp).toBe(31000);expect(r.state.units[0].deviceUses?.repair).toBe(1);expect(r.state.units[0].actionsSpent).toBe(1);
    v.y=5;expect(()=>apply(s,{type:'device',unitId:'p1',deviceId:'repair',targetId:'p2'})).toThrow('adjacent');expect(s.units[0].deviceUses?.repair).toBe(2);
  });
  it('sub-pilot spends only their own SP, survives saves, and follows host action restrictions',()=>{
    let s=battle(c=>{c.mechs[0].subPilots=[c.pilots[2].id];c.pilots[2].spirits=[{id:'supply',level:1}];});const sub=s.units[0].subPilots![0],main=s.units[0].sp;
    s.units.find(u=>u.id==='p2')!.en=0;s=apply(s,{type:'spirit',unitId:'p1',pilotId:sub.pilotId,spiritId:'supply',targetId:'p2'}).state;
    expect(s.units[0].sp).toBe(main);expect(s.units[0].subPilots![0].sp).toBe(sub.sp-10);s=restore(s.content,s.stage,snapshot(s));expect(s.units[0].subPilots![0].sp).toBe(sub.sp-10);
    s=apply(s,{type:'wait',unitId:'p1'}).state;expect(spiritProblem(s,'p1','supply','p2',sub.pilotId)).toContain('cannot act');
    const c=newCampaign();c.roster=s.stage.units.filter(u=>u.side==='player');expect(persistBattle(c,s).roster[0].subPilotProgress?.[0].pilotId).toBe(sub.pilotId);
  });
  it('rejects the same sub-pilot on two hosts and does not refill a device on transform',()=>{
    expect(()=>battle(c=>{c.mechs[0].subPilots=[c.pilots[2].id];c.mechs[1].subPilots=[c.pilots[2].id];})).toThrow('twice');
    let s=support();s.content.mechs[0].forms=[{id:'base',name:'기본',overrides:{}},{id:'other',name:'다른 형태',overrides:{move:3}}];s.units[0].deviceUses!.supply=3;s=apply(s,{type:'transform',unitId:'p1',formId:'other'}).state;expect(s.units[0].deviceUses?.supply).toBe(3);
  });
  it('physical combination/splitting consumes budgets and never duplicates or refills lead crew SP',()=>{
    let s=battle(c=>{c.combinations=[{id:'link',parts:[c.mechs[0].id,c.mechs[1].id],result:c.mechs[2].id}];c.mechs[0].subPilots=[c.pilots[2].id];});s.units[0].subPilots![0].sp=7;
    s=apply(s,{type:'combine',unitId:'p1',combinationId:'link'}).state;expect(s.units[0]).toMatchObject({acted:true,actionsRemaining:0,actionsSpent:2});expect(spiritProblem(s,'p1','wake')).toContain('cannot act');s=restore(s.content,s.stage,snapshot(s));s=round(s);s=apply(s,{type:'split',unitId:'p1'}).state;expect(s.units.find(u=>u.id==='p1')!.subPilots![0].sp).toBe(7);expect(s.units.filter(u=>u.alive).flatMap(u=>u.subPilots??[])).toHaveLength(1);expect(s.units.filter(u=>u.side==='player').every(u=>u.acted&&u.actionsRemaining===0)).toBe(true);
  });
  it('recovers flat + percent only once per own phase; ammo has no natural recovery',()=>{
    let s=battle(c=>{c.rules.enRegenPerRound=5;c.rules.recoveryTiming='phase';c.mechs[0].enRecovery={pct:10};c.parts=[{id:'regen',name:'회복',desc:'회복',kind:'passive',effects:[{type:'enRegen',value:{pct:10}}]}];});s.units[0].parts=['regen'];s.units[0].en=0;s=round(s);
    expect(s.units[0].en).toBe(5+Math.floor(s.content.mechs[0].en*.1)*2);
  });
  it('consumed inventory is removed, without removing passive parts or refilling on reload',()=>{
    let s=battle(c=>{c.rules.consumablePolicy='consume';c.mechs[0].partSlots=1;c.parts=[{id:'ammo',name:'탄약',desc:'전량',kind:'consumable',effects:[{type:'ammoRestore'}]}];for(const w of c.weapons)w.ammo=3;});s.units[0].parts=['ammo'];Object.keys(s.units[0].ammo).forEach(id=>s.units[0].ammo[id]=0);
    s=apply(s,{type:'useItem',unitId:'p1',slot:0}).state;expect(Object.values(s.units[0].ammo).every(n=>n===3)).toBe(true);s=restore(s.content,s.stage,snapshot(s));expect(()=>apply(s,{type:'useItem',unitId:'p1',slot:0})).toThrow();const c=newCampaign();c.roster=s.stage.units.filter(u=>u.side==='player');expect(persistBattle(c,s).roster[0].parts).toEqual([null]);
  });
});
describe('reasoning, upgrades and AI',()=>{
  it.each([[0,300,5],[300,0,75],[130,130,10]])('critical bounds (%s/%s)',(a,d,expected)=>{
    const s=battle(c=>{c.rules.critical={stat:'skill',coefficient:.4,min:5,max:75};c.pilots[0].stats.skill=a;c.pilots[3].stats.skill=d;for(const w of c.weapons){w.crit=10;w.range=[1,8];}});const cmd=availableActions(s,'p1').find(c=>c.type==='attack')!;if(cmd.type!=='attack')throw Error();expect(forecast(s,'p1',cmd.targetId,cmd.weaponId).critRate).toBe(expected);
  });
  it('piecewise growth and training add together, without changing source pilot stats',()=>{
    const s=battle(c=>c.pilots[0].statCurves={skill:[{level:1,value:110},{level:11,value:130}]});s.units[0].level=6;expect(effectivePilot(s,s.units[0]).stats.skill).toBe(120);
    const c=trainedContent(s.content,{pilots:{[s.units[0].pilotId]:{points:0,stats:{skill:2},skills:{}}}},{rewards:{grunt:0,elite:0,boss:0,named:0},classification:{bossSizes:[],eliteSizes:[],bossTags:[],eliteTags:[],namedPilots:[]},stats:{skill:{label:'추론',step:1,costs:[1,2]}},skills:{}});expect(effectivePilot({...s,content:c},s.units[0]).stats.skill).toBe(122);expect(s.content.pilots[0].stats.skill).toBe(140);
  });
  it('probability skills use clamped inference chance; forecasts are RNG-free and include expected effects',()=>{
    const s=battle(c=>{c.rules.skillActivation={stat:'skill',coefficient:.2,min:5,max:25};c.skills=[{id:'shadow',name:'분신',desc:'회피',effects:[],activation:{hook:'defense',base:5,baseline:100,effects:[{type:'evadeAll'}]}}];c.pilots[3].skills=[{id:'shadow'}];for(const w of c.weapons)w.range=[1,8];});const rng=s.rng,skill=s.content.skills![0];expect(skillChance(s,s.units[1],skill)).toBe(13);const cmd=availableActions(s,'p1').find(c=>c.type==='attack')!;if(cmd.type!=='attack')throw Error();const f=forecast(s,'p1','e1',cmd.weaponId);expect(s.rng).toBe(rng);const plain=structuredClone(s);delete plain.content.pilots[3].skills;expect(f.expectedDamage).toBeCloseTo(forecast(plain,'p1','e1',cmd.weaponId).expectedDamage*.87);
    skill.activation!.min=100;skill.activation!.max=100;const result=apply(s,cmd);expect(result.events.some(e=>e.type==='skill-activated')).toBe(true);expect(result.state.units.every(u=>!u.effects.some(e=>e.source==='chance'))).toBe(true);
  });
  it('percentage weapon upgrades use original power and per-key/NG+ caps/costs',()=>{
    const s=battle(c=>{c.rules.weaponUpgrade={mode:'percent',rate:.1};c.rules.upgradeLimits={weapons:{max:15,newGamePlusMax:30,costs:Array.from({length:30},(_,i)=>100+i*10)}};}),campaign=newCampaign();campaign.roster=[s.stage.units[0]];campaign.credits=100000;
    let ctx={screen:'intermission',campaign};ctx=upgradeMech(ctx,s.content,'p1','weapons',15);expect(previewUpgrade(ctx,s.content,'p1','weapons').allowed).toBe(false);ctx.campaign.cycle=2;expect(previewUpgrade(ctx,s.content,'p1','weapons')).toMatchObject({max:30,cost:250,allowed:true});
    const u={...s.units[0],upgrades:ctx.campaign.roster[0].upgrades};expect(effectiveWeapon(s,u,s.content.weapons[0]).power).toBe(Math.round(s.content.weapons[0].power*2.5));expect(previewUpgrade(ctx,s.content,'p1','hp').max).toBe(s.content.rules.upgradeMax);
  });
  it('resource policy favors ammo, saves finisher cost, and is shared with counters',()=>{
    const s=battle(c=>{c.rules.ai.resources={ammoBonus:.5,reserveFinisher:true,reservePenalty:.8};for(const m of c.mechs)m.weapons=[c.weapons[0].id,c.weapons[1].id];Object.assign(c.weapons[1],{...c.weapons[0],id:c.weapons[1].id,ammo:8,en:0});for(const w of c.weapons){w.range=[1,8];w.hit=100;}}),d=s.units[1];
    expect(chooseResponse(s,'e1','p1')).toMatchObject({type:'counter',weaponId:s.content.weapons[1].id});
    expect(resourceScore(s,d,s.content.weapons[1],100)).toBe(150);
    s.content.weapons.push({...s.content.weapons[0],id:'finisher',en:50,moraleReq:130});s.content.mechs.find(m=>m.id===d.mechId)!.weapons.push('finisher');d.en=50;s.content.weapons[0].en=30;expect(resourceScore(s,d,s.content.weapons[0],100)).toBeCloseTo(20);
    expect(resourceScore(s,d,s.content.weapons[0],100,80)).toBe(100);
  });
  it('deployment minimum includes late roster placements without lowering veterans',()=>{
    const s=battle(),c=newCampaign();c.roster=[{...s.stage.units[2],id:'late',level:2}];s.stage.minimumLevel=6;s.stage.rosterDeployments={late:[2,4]};s.stage.units[0].level=9;const d=deployment(s.stage,c,s.content);expect(d.units.find(u=>u.id==='late')?.level).toBe(6);expect(d.units[0].level).toBe(9);
  });
  it('rejects malformed balance configuration',()=>{const s=battle();s.content.mechs[0].devices=[{id:'x',name:'x',kind:'repair',uses:-1,postMove:true,experience:0}];expect(()=>validateContent(s.content)).toThrow('device');});
});

let pack:Pack;beforeAll(async()=>{pack=await loadPack('packs/example',p=>readFile(p,'utf8'));});
describe('example integration and cycle inheritance',()=>{
  function trio(){const s=prepareRules(createBattle(pack.rules,pack.campaign.stages['lesson-2'].stage,1));setRuleVariable(s,'affection:loop',1);return s;}
  it('three connected participants, morale, affection, movement and individual cost are enforced atomically',()=>{
    const s=trio(),c=configOf(s.stage).combos[0];expect(comboProblem(s,c)).toBeUndefined();const map=new CoreMap(s,packLookup(pack,{}));const cmd=availableActions((map as any).state(),'hero');expect(cmd.length).toBeGreaterThan(0);
    const result=applyRules(s,{type:'attack',unitId:'hero',targetId:'target',weaponId:c.virtual});for(const id of ['hero','loop','wing']){expect(result.state.units.find(u=>u.id===id)).toMatchObject({acted:true,actionsRemaining:0});expect(result.state.units.find(u=>u.id===id)!.en).toBe(s.units.find(u=>u.id===id)!.en-10);}
    const exchange=map.attack('hero',{col:1,row:2},c.virtual,'target').find(e=>e.type==='battle');expect(exchange?.type==='battle'&&exchange.exchange.strikes[0].combo?.dialogue?.map(d=>d.fighter.id)).toEqual(['hero','loop','wing','hero']);
    for(const which of ['morale','distance','spent','affection','moved']){const copy=structuredClone(s),co={...c,postMove:false};if(which==='morale')copy.units.find(u=>u.id==='wing')!.morale=0;if(which==='distance')copy.units.find(u=>u.id==='wing')!.x=6;if(which==='spent')copy.units.find(u=>u.id==='hero')!.actionsSpent=1;if(which==='affection')setRuleVariable(copy,'affection:loop',0);if(which==='moved')copy.units.find(u=>u.id==='wing')!.moved=true;expect(comboProblem(copy,co)).toBeTruthy();}
  });
  it('NG+ carries configured growth/loadout only; hidden joins, affection and device uses reset',()=>{
    const previous=newCampaign();previous.credits=12345;previous.roster=[{...pack.campaign.stages['lesson-1'].stage.units[0],level:8,exp:5,upgrades:{hp:0,en:0,armor:0,mobility:0,weapons:15},parts:['hull']}];previous.flags={hidden:true,unlocked:true};previous.affection={loop:99};previous.cleared=['lesson-1'];previous.parts=['ammo-box'];const next=nextCycle(previous,pack.rules);expect(next).toMatchObject({cycle:2,credits:12345,parts:['ammo-box'],flags:{},roster:[],cleared:[]});expect(next.affection).toBeUndefined();const stage=deployment(pack.campaign.stages['lesson-1'].stage,next,pack.rules);expect(stage.units.find(u=>u.id==='hero')).toMatchObject({level:8,upgrades:{weapons:15},parts:['hull']});const s=createBattle(pack.rules,stage,1);expect(s.units.find(u=>u.id==='loop')!.deviceUses?.supply).toBe(8);
  });
  it('NG+ retains training investments but drops per-stage reward deduplication and hidden recruitment',()=>{
    const old=newCampaign(),prefix='v2:value:'+encodeURIComponent('v2:training')+':',growth={pilots:{hero:{points:9,stats:{skill:2},skills:{}}},stage:{id:'lesson-2',earned:{hero:10},seen:['battle'],settled:true}};
    old.flags[prefix+encodeURIComponent(JSON.stringify(JSON.stringify(growth)))]=true;old.inheritance=[{...pack.campaign.stages['lesson-2'].stage.units[2],level:9}];const next=nextCycle(old,pack.rules),g=growthFromFlags(next.flags);expect(g.pilots.hero.stats.skill).toBe(2);expect(g.stage).toBeUndefined();expect(next.inheritance?.find(u=>u.id==='wing')?.level).toBe(9);expect(next.roster).toEqual([]);
  });
  it('support and low-HP crew cheer select the authored banks without adding placeholder dialogue',()=>{
    const s=trio();s.units.find(u=>u.id==='hero')!.en=0;const m=new CoreMap(s,packLookup(pack,{}));expect(m.device('loop',{col:1,row:3},'supply','hero').some(e=>e.type==='speech'&&e.text==='필요한 건 여기 있어요.')).toBe(true);
    const t=trio();t.units.find(u=>u.id==='loop')!.en=0;const n=new CoreMap(t,packLookup(pack,{}));expect(n.cast('hero','echo::supply','loop').some(e=>e.type==='speech'&&e.name==='메아리'&&e.text==='다시 가득 채웠어요.')).toBe(true);
    expect((n as any).supportSpeech(t,'hero','cheer','echo').text).toBe('천천히, 같이 가요!');expect((n as any).supportSpeech(t,'hero','repair')).toBeUndefined();
  });
  it('UI shows resource types, reasoning, crew choices and device counts',()=>{
    const s=trio(),map=new CoreMap(s,packLookup(pack,{}));const d=map.details('hero');expect(d.pilotStats.find(([name])=>name==='추론')).toBeDefined();expect(d.effects.some(s=>s.includes('남은 행동 2'))).toBe(true);expect(map.spirits('hero').some(s=>s.pilotId==='echo')).toBe(true);expect(map.commands('loop',{col:1,row:3}).some(c=>c.label==='보급 장치 · 8/8')).toBe(true);
    const list=map.weapons('hero',{col:1,row:2},'target');expect(list.some(w=>w.resources?.includes('잔탄'))).toBe(true);expect(list.some(w=>w.resources?.includes('에너지'))).toBe(true);expect(list.some(w=>w.resources?.includes('무소모'))).toBe(true);
  });
});

import {CoreCampaign} from '../src/v2/adapter/campaign';
import {TrainingSaves} from '../src/v2/adapter/saves';
import {enemyUpgradeLevel,enemyUpgrades} from '../src/core/stage-content';
import {ResultScreen} from '../src/v2/menus/result';
import {Button} from '../src/v2/kit';
import type {App} from '../src/v2/screen';
function model(extra:Partial<Pack>={}){const bytes=new Map<string,string>(),storage={read:async(k:string)=>bytes.get(k)??null,replace:async(k:string,v:string)=>{bytes.set(k,v);}};
 const saves=new TrainingSaves(storage,pack.campaign,pack.rules,pack.training),m=new CoreCampaign(pack.campaign,pack.rules,saves,packLookup(pack,{}),undefined,[],{...pack,...extra});
 m.newGame({name:pack.players.name.default,preset:0,line:pack.players.lines[0].id});return {m,bytes};}
function lose(m:CoreCampaign){const b=m.session.game!.battle;b.outcome='defeat';m.session.game!.mode='outcome';m.finish();}
it('rolls back items, consumed equipment, joins, affection, flags and progression; keeps only XP and credits, including dead pilots',async()=>{
 const {m}=model(),start=structuredClone(m.session.stageStart),b=m.session.game!.battle,hero=b.units.find(u=>u.id==='hero')!;
 hero.level=7;hero.exp=23;hero.alive=false;hero.hp=0;b.credits=1234;
 hero.parts=[];m.session.campaign.parts.push('ammo-box');m.session.campaign.flags.changed=true;m.session.campaign.affection={loop:99};
 lose(m);await m.retry();const c=m.session.campaign;
 expect(c.roster.find(u=>u.id==='hero')).toMatchObject({level:7,exp:23});expect(c.credits).toBe(start.credits+1234);
 expect(c.parts).toEqual(start.parts);expect(c.roster[0].parts).toEqual(start.roster[0].parts);expect(c.flags).toEqual(start.flags);expect(c.affection).toEqual(start.affection);expect(c.cleared).toEqual(start.cleared);
 expect(m.session.screen).toBe('intermission');expect(m.session.game).toBeNull();expect(c.retryNode).toBe(start.node);expect(m.hub().next).toBe(pack.campaign.stages['lesson-1'].stage.name);
 await m.load('auto');expect(m.session.campaign).toEqual(c);expect(m.session.screen).toBe('intermission');
 m.advance();expect(m.session.game!.battle.stage.id).toBe('lesson-1');expect(m.session.game!.battle.units.find(u=>u.id==='hero')).toMatchObject({level:7,exp:23,alive:true});
 expect(m.session.game!.battle.units.find(u=>u.id==='loop')!.deviceUses?.supply).toBe(8);expect(m.session.campaign.retryNode).toBeUndefined();
});
it('retry investment survives reload, a second defeat and clear, without duplicate clear rewards',async()=>{
 const {m}=model();m.session.game!.battle.credits=20000;lose(m);await m.retry();expect(m.upgrade('hero','weapons')).toBe(true);
 const funds=m.funds(),level=m.session.campaign.roster[0].upgrades!.weapons;await m.save('auto');await m.load('auto');m.advance();
 m.session.game!.battle.credits=100;lose(m);await m.retry();expect(m.funds()).toBe(funds+100);expect(m.session.campaign.roster[0].upgrades!.weapons).toBe(level);m.advance();
 const b=m.session.game!.battle;b.units.find(u=>u.id==='hero')!.level=9;b.outcome='victory';m.session.game!.mode='outcome';m.finish();const credited=m.funds(),parts=[...m.session.campaign.parts];m.finish();
 expect(m.funds()).toBe(credited);expect(m.session.campaign.parts).toEqual(parts);expect(m.session.campaign.cleared).toContain('lesson-1');m.advance();m.advance();expect(m.session.game!.battle.units.find(u=>u.id==='hero')!.level).toBe(9);
});
it('policy is opt-in and only declared rewards are kept',async()=>{
 const {m}=model();const rules=structuredClone(m.content);delete rules.rules.retryOnDefeat;
 expect(()=>validateContent({...rules,rules:{...rules.rules,retryOnDefeat:{keep:['items']}}})).toThrow();
 const {retryDefeat}=await import('../src/campaign/session');lose(m);expect(()=>retryDefeat(m.session,rules)).toThrow('not available');rules.rules.retryOnDefeat={keep:[]};const retry=retryDefeat(m.session,rules);expect(retry.campaign.credits).toBe(m.session.stageStart.credits);
});
it('restores consumed parts and records temporary recruits XP without keeping the recruitment',async()=>{
 const {m}=model(),b=m.session.game!.battle,hero=b.units.find(u=>u.id==='hero')!;
 const item=pack.rules.parts!.find(p=>p.kind==='consumable')!.id;
 m.session.stageStart.roster.find(u=>u.id==='hero')!.parts=[item];hero.parts=[item];hero.usedItems=[0];
 // A roster member recruited during the failed sortie must not stay recruited.
 const temporary={...m.session.campaign.roster[1],id:'wing',level:8,exp:21};m.session.campaign.roster.push(temporary);
 lose(m);await m.retry();expect(m.session.campaign.roster.find(u=>u.id==='hero')!.parts).toEqual([item]);
 expect(m.session.campaign.roster.some(u=>u.id==='wing')).toBe(false);expect(m.session.campaign.retryExperience?.wing).toMatchObject({level:8,exp:21});
 await m.load('auto');m.storyRecruit('wing');expect(m.session.campaign.roster.find(u=>u.id==='wing')).toMatchObject({level:8,exp:21});
});
it('defeat result offers retry first and title second, without a generic continue button',()=>{
 const {m}=model();lose(m);const screen=new ResultScreen(m,()=>{}, {},()=>{});screen.app={sound:{play(){}}}as unknown as App;screen.enter();
 const labels=(screen.ui as unknown as {widgets:Button[]}).widgets.filter(w=>w instanceof Button).map(w=>w.label);
 expect(labels).toContain('인터미션으로 돌아가기');expect(labels).toContain('타이틀로');expect(labels).not.toContain('계속');
});
it('scales later cycles without changing player loadouts, reinforcement paths or save roundtrips',async()=>{
 const rules=structuredClone(pack.rules);rules.rules.newGamePlus!.enemyUpgradeOffsetPerCycle=15;
 for(const [cycle,episode,effective]of [[1,1,1],[1,15,15],[2,1,16],[2,15,30],[3,1,31],[9,15,135]]){
  expect(enemyUpgradeLevel(episode,cycle,rules.rules)).toBe(effective);const base=structuredClone(pack.campaign.stages['lesson-1'].stage);base.enemyUpgradeLevel=episode;
  const c=newCampaign();c.cycle=cycle;const stage=deployment(base,c,rules),b=createBattle(rules,stage,1),enemy=b.units.find(u=>u.side==='enemy')!;
  expect(enemy.upgrades).toEqual(enemyUpgrades(effective,rules.rules));expect(enemy.upgrades).toMatchObject({hp:effective,en:effective,armor:Math.floor(effective/2),weapons:Math.floor(effective/2)});
  expect(effectiveMech(b,enemy).hp).toBe(b.content.mechs.find(m=>m.id===enemy.mechId)!.hp+effective*rules.rules.upgradeStep.hp);
  const spawned=apply(b,{type:'system',unitId:'',action:{kind:'spawn',units:[{...base.units.find(u=>u.side==='enemy')!,id:'reinforcement',x:0,y:0}]}}).state.units.find(u=>u.id==='reinforcement')!;
  expect(spawned.upgrades).toEqual(enemy.upgrades);
 }
 const {m}=model();m.session.campaign.cycle=3;m.advance(false);const before=m.session.game!.battle.units.find(u=>u.side==='enemy')!.upgrades;await m.save('auto');await m.load('auto');expect(m.session.campaign.cycle).toBe(3);expect(m.session.game!.battle.units.find(u=>u.side==='enemy')!.upgrades).toEqual(before);
});

it('ordinary roster clear funding includes only permanent members and settles once across save/load',async()=>{
 const {m}=model({economy:{...pack.economy!,income:{'lesson-1':{clear:1000,defeat:100,rosterClear:{hero:300,loop:200,wing:900}}}}});
 const game=m.session.game!;m.session.campaign.credits+=500;game.battle.credits=50;game.battle.outcome='victory';game.mode='outcome';m.finish();expect(m.funds()).toBe(1550);m.finish();expect(m.funds()).toBe(1550);await m.save('auto');await m.load('auto');expect(m.funds()).toBe(1550);
});
it('enemy baseline ratios affect matching stats while a grunt action cap survives high inference and normal effects still apply',()=>{
 const original=battle(),stage=structuredClone(original.stage);stage.enemyPilotScaling={baseline:{level:10,stats:{melee:200,shoot:180,hit:160,evade:150,defense:140,skill:200}},units:{e1:{ratio:.8,actionCap:1}}};const s=createBattle(original.content,stage,1),u=s.units.find(u=>u.id==='e1')!;
 expect(effectivePilot(s,u).stats).toEqual({melee:160,shoot:144,hit:128,evade:120,defense:112,skill:160});expect(u.level).toBe(8);expect(u.actionsRemaining).toBe(1);
 u.effects.push({id:'test-stat',source:'fixture',hooks:{},duration:{unit:'round',remaining:1},atoms:[{type:'pilotStatSet',value:{hit:140}}]});expect(effectivePilot(s,u).stats.hit).toBe(140);expect(restore(s.content,s.stage,snapshot(s)).units.find(u=>u.id==='e1')!.actionsRemaining).toBe(1);
});
it('NG+ reference uses inherited main pilots with training, and reference metadata is not mutated',()=>{
 const stage=structuredClone(pack.campaign.stages['lesson-1'].stage);stage.enemyPilotScaling={baseline:{level:1,stats:{melee:100,shoot:100,hit:100,evade:100,defense:100,skill:100}},units:{target:{ratio:1.2}},newGamePlusReference:'allied-mean',referencePilots:['hero','loop']};
 const c=newCampaign();c.cycle=2;c.inheritance=stage.units.filter(u=>u.side==='player').map(u=>({...u,level:30,exp:0}));const content=trainedContent(pack.rules,{pilots:{hero:{points:0,stats:{shoot:3},skills:{}}}},pack.training),next=deployment(stage,c,content),allies=next.units.filter(u=>u.side==='player');
 const avg=allies.reduce((n,u)=>n+effectivePilot({content}as BattleState,{...u,effects:[]}as any).stats.shoot,0)/allies.length;expect(next.enemyPilotScaling!.baseline.stats.shoot).toBe(avg);expect(next.enemyPilotScaling!.baseline.level).toBe(30);expect(stage.enemyPilotScaling.baseline.level).toBe(1);
});
