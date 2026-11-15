import {describe,it,expect} from 'vitest';
import {apply,forecast,mapCells,mapForecast,createBattle,supportAttackCandidates,supportDefenseCandidates,effectiveMech,effectiveWeapon,chooseAICommand,nextAICommand,snapshot,restore,availableActions} from '../../src/core';
import type {BattleState,Command,Weapon} from '../../src/core';
import {m6,attach} from './m6-helpers';
import {deepFreeze} from './helpers';
function support(): BattleState {return m6(c=>{c.pilots[1].skills=[{id:'support-fire',level:2},{id:'support-guard',level:2}];});}
function map(shape:NonNullable<Weapon['map']>['shape']='area',friendlyFire=false): BattleState {
  const s=m6();const w={...s.content.weapons[0],id:'map-test',map:{shape,size:2,friendlyFire},en:15,ammo:3,range:[1,6] as [number,number]};s.content.weapons.push(w);s.content.mechs[0].weapons.push(w.id);s.units[0].ammo[w.id]=3;return s;
}
const fire:Command={type:'attack',unitId:'p1',targetId:'e1',weaponId:'blade',supportAttackerId:'p2'};
describe('M6 support combat',()=>{
  it('filters adjacency, remaining count, sides, alive and weapon range without RNG',()=>{
    const s=support(),before=snapshot(s);expect(supportAttackCandidates(deepFreeze(s),'p1','e1')[0]).toMatchObject({unitId:'p2'});expect(snapshot(s)).toBe(before);
    for(const variant of ['range','distance','count','dead','side']) {const t=structuredClone(s),u=t.units[2];if(variant==='range')t.content.weapons.forEach(w=>w.range=[1,1]);if(variant==='distance')u.x=0;if(variant==='count')u.supportAttackUsed=2;if(variant==='dead')u.alive=false;if(variant==='side')u.side='enemy';expect(supportAttackCandidates(t,'p1','e1')).toEqual([]);}
  });
  it('performs main attack, counterattack then support with no support counter or action spent',()=>{
    const s=support();s.content.weapons.forEach(w=>w.power=600);const r=apply(s,fire),attacks=r.events.filter(e=>e.type==='attack');expect(attacks.map(e=>e.attackerId)).toEqual(['p1','e1','p2']);
    expect(r.state.units[2]).toMatchObject({acted:false,supportAttackUsed:1});expect(r.events).toContainEqual({type:'support',kind:'attack',unitId:'p2',targetId:'e1'});expect(r.events.some(e=>e.type==='exp-gained'&&e.unitId==='p2')).toBe(true);
    expect(forecast(s,'p1','e1','blade').supportAttackers?.[0]).toMatchObject({unitId:'p2'});
  });
  it('does not spend support if the main shot kills; rejects invalid support transactionally',()=>{
    const s=support();s.units[1].hp=1;const before=snapshot(s);const r=apply(s,fire);expect(r.events.filter(e=>e.type==='attack')).toHaveLength(1);expect(r.state.units[2].supportAttackUsed).toBeUndefined();expect(snapshot(s)).toBe(before);
    expect(()=>apply(s,{...fire,supportAttackerId:'e2'})).toThrow('support');
  });
  it('intercepts an incoming attack, defends automatically, earns EXP and leaves original HP intact',()=>{
    let s=support();s=apply(s,{type:'endPhase'}).state;s=apply(s,{type:'attack',unitId:'e1',targetId:'p1',weaponId:'rifle'}).state;expect(s.pending).not.toBeNull();
    expect(supportDefenseCandidates(s,'e1','p1','rifle')[0]).toMatchObject({unitId:'p2'});const hp=s.units[0].hp;
    const r=apply(s,{type:'respond',response:{type:'counter',weaponId:'blade'},supportDefenderId:'p2'});expect(r.state.units[0].hp).toBe(hp);expect(r.state.units[2].hp).toBeLessThan(s.units[2].hp);expect(r.state.units[2].supportDefenseUsed).toBe(1);
    expect(r.events.filter(e=>e.type==='attack').map(e=>e.targetId)).toEqual(['p2']);expect(r.events.some(e=>e.type==='exp-gained'&&e.unitId==='p2')).toBe(true);
  });
  it('refills both support counts at player phase start and keeps them through enemy start',()=>{
    let s=support();s.units[2].supportAttackUsed=2;s.units[2].supportDefenseUsed=2;s=apply(s,{type:'endPhase'}).state;expect(s.units[2].supportAttackUsed).toBe(2);s=apply(s,{type:'endPhase'}).state;expect(s.units[2]).toMatchObject({supportAttackUsed:0,supportDefenseUsed:0});
  });
  it('enemy selects its strongest support attacker and supports defense at low HP only',()=>{
    let s=m6(c=>{c.pilots[4].skills=[{id:'support-fire',level:1},{id:'support-guard',level:1}];});s.options.autoResponse=true;s=apply(s,{type:'endPhase'}).state;
    let r=apply(s,{type:'attack',unitId:'e1',targetId:'p1',weaponId:'rifle'});expect(r.events.some(e=>e.type==='support'&&e.unitId==='e2'&&e.kind==='attack')).toBe(true);
    s=apply(s,{type:'endPhase'}).state;s.units[1].hp=100;attach(s,1,[{type:'hitSet',value:0}]);r=apply(s,{type:'attack',unitId:'p1',targetId:'e1',weaponId:'blade'});expect(r.events.some(e=>e.type==='support'&&e.unitId==='e2'&&e.kind==='defense')).toBe(true);
  });
  it('preserves enemy support selection across a pending response snapshot',()=>{
    let s=m6(c=>{c.pilots[4].skills=[{id:'support-fire',level:1}];});s=apply(s,{type:'endPhase'}).state;s=apply(s,{type:'attack',unitId:'e1',targetId:'p1',weaponId:'rifle'}).state;expect(s.pending?.supportAttackerId).toBe('e2');
    const restored=restore(s.content,s.stage,snapshot(s));expect(snapshot(apply(restored,{type:'respond',response:{type:'defend'}}).state)).toBe(snapshot(apply(s,{type:'respond',response:{type:'defend'}}).state));
  });
});
describe('M6 MAP weapons',()=>{
  it.each(['burst','line','area'] as const)('computes %s shape geometrically in row/column order',shape=>{
    const s=map(shape);const cells=mapCells(s,'p1','map-test',{x:3,y:2},'right');expect([...cells].sort((a,b)=>a.y-b.y||a.x-b.x)).toEqual(cells);
    if(shape==='burst'){expect(cells).toContainEqual({x:1,y:0});expect(cells).toContainEqual({x:1,y:2});expect(cells).not.toContainEqual({x:4,y:2});}
    if(shape==='line')expect(cells).toEqual([{x:2,y:2},{x:3,y:2}]);
    if(shape==='area'){expect(cells).toHaveLength(13);expect(cells).toContainEqual({x:3,y:0});}
  });
  it('rejects invalid centers, directions, regular attack, and moved non-P MAP',()=>{
    const s=map();expect(()=>mapCells(s,'p1','map-test',{x:7,y:5})).toThrow('center');expect(()=>mapCells(map('line'),'p1','map-test')).toThrow('direction');expect(()=>apply(s,{type:'attack',unitId:'p1',targetId:'e1',weaponId:'map-test'})).toThrow('MAP');
    s.content.weapons.find(w=>w.id==='map-test')!.postMove=false;s.units[0].moved=true;expect(()=>mapForecast(s,'p1','map-test',{x:3,y:2})).toThrow('non-P');
  });
  it.each([false,true])('honors friendlyFire=%s, sorted targets, and immutable repeated prediction',friendly=>{
    const s=map('area',friendly);const before=snapshot(s),f=mapForecast(deepFreeze(s),'p1','map-test',{x:2,y:2});expect(f.targets.map(t=>t.unitId)).toEqual(friendly?['p2','e1','e2']:['e1','e2']);expect(f.friendlyFire).toBe(friendly);
    for(let i=0;i<5;i++)expect(mapForecast(s,'p1','map-test',{x:2,y:2})).toEqual(f);expect(snapshot(s)).toBe(before);
  });
  it('resolves one volley with ordered shots, simultaneous deaths, aggregate rewards and no counters',()=>{
    let s=map();s.units[1].hp=1;s.units[3].hp=1;s=apply(s,{type:'spirit',unitId:'p1',spiritId:'study'}).state;
    // Combine credit and EXP multiplier definitions to check all targets receive both.
    s=apply(s,{type:'spirit',unitId:'p1',spiritId:'fortune'}).state;const en=s.units[0].en;
    const preview=mapForecast(s,'p1','map-test',{x:3,y:2}),r=apply(s,{type:'mapAttack',unitId:'p1',weaponId:'map-test',point:{x:3,y:2}}),shots=r.events.filter(e=>e.type==='attack');
    expect(shots.map(e=>e.targetId)).toEqual(preview.targets.map(t=>t.unitId));expect(shots.every(e=>!e.counter)).toBe(true);expect(r.events.findIndex(e=>e.type==='unit-defeated')).toBeGreaterThan(r.events.map(e=>e.type).lastIndexOf('attack'));
    expect(r.state.units[0]).toMatchObject({en:en-15,acted:true,morale:107,level:9,exp:0});expect(r.state.units[0].ammo['map-test']).toBe(2);expect(r.state.credits).toBe(400);expect(r.state.units[0].effects).toHaveLength(0);expect(r.events.filter(e=>e.type==='exp-gained').map(e=>e.amount)).toEqual([2000,2000]);
  });
  it('adds attacker hit morale once with several targets and no kill; misses give no EXP',()=>{
    const s=map();s.content.weapons.find(w=>w.id==='map-test')!.power=100;let r=apply(s,{type:'mapAttack',unitId:'p1',weaponId:'map-test',point:{x:3,y:2}});expect(r.state.units[0].morale).toBe(101);
    attach(s,0,[{type:'hitSet',value:0}]);r=apply(s,{type:'mapAttack',unitId:'p1',weaponId:'map-test',point:{x:3,y:2}});expect(r.state.units[0].morale).toBe(100);expect(r.events.filter(e=>e.type==='exp-gained')).toEqual([]);
  });
  it.each(['player','neutral'] as const)('does not reward friendly %s kills; preserves fortune',side=>{
    let s=map('area',true);s.units[2].side=side;s.units[2].hp=1;s=apply(s,{type:'spirit',unitId:'p1',spiritId:'fortune'}).state;
    const r=apply(s,{type:'mapAttack',unitId:'p1',weaponId:'map-test',point:{x:1,y:0}});expect(r.state.credits).toBeUndefined();expect(r.events.some(e=>e.type==='exp-gained')).toBe(false);expect(r.state.units[0].effects).toHaveLength(1);
  });
});
describe('M6 transformation, combination and command replay',()=>{
  function forms() {return m6(c=>{c.mechs[0].forms=[{id:'base',name:'Base',overrides:{}},{id:'fast',name:'Fast',overrides:{move:8,hp:3000,en:50,weapons:['rifle']}}];});}
  it('transforms before or after action once per round, clips resources and preserves all ammo',()=>{
    const s=forms();s.units[0].ammo.rifle=2;s.units[0].acted=true;const r=apply(s,{type:'transform',unitId:'p1',formId:'fast'}).state;expect(r.units[0]).toMatchObject({hp:3000,en:50,acted:true,formId:'fast'});expect(r.units[0].ammo.rifle).toBe(2);expect(()=>apply(r,{type:'transform',unitId:'p1',formId:'base'})).toThrow('transformed');expect(snapshot(restore(r.content,r.stage,snapshot(r)))).toBe(snapshot(r));
    const n=apply(apply(r,{type:'endPhase'}).state,{type:'endPhase'}).state;expect(()=>apply(n,{type:'transform',unitId:'p1',formId:'base'})).not.toThrow();
  });
  it('commits movement after transform, leaving no additional move or undo',()=>{
    let s=forms();s=apply(s,{type:'move',unitId:'p1',x:2,y:2}).state;s=apply(s,{type:'transform',unitId:'p1',formId:'fast'}).state;expect(availableActions(s,'p1').some(c=>c.type==='move')).toBe(false);expect(()=>apply(s,{type:'undoMove',unitId:'p1'})).toThrow('no pending');expect(snapshot(restore(s.content,s.stage,snapshot(s)))).toBe(snapshot(s));
  });
  it('AI chooses configured transformation without RNG',()=>{const s=forms();s.phase='enemy';s.units[1].mechId='mech-a';s.content.mechs[0].aiForm=[{formId:'fast',when:'start'}];expect(chooseAICommand(s,'e1')).toEqual({type:'transform',unitId:'e1',formId:'fast'});});
  it('combines adjacent units at the representative, averages ratios, and splits nearby after a round',()=>{
    let s=m6(c=>{c.combinations=[{id:'link',parts:['mech-a','mech-b'],result:'mech-c'}];});s.units[0].hp=Math.floor(effectiveMech(s,s.units[0]).hp*.5);s.units[2].en=0;const hp=(s.units[0].hp/effectiveMech(s,s.units[0]).hp+1)/2;
    s=apply(s,{type:'combine',unitId:'p1',combinationId:'link'}).state;expect(s.units[0]).toMatchObject({mechId:'mech-c',x:1,y:2,acted:true,hp:Math.floor(effectiveMech(s,s.units[0]).hp*hp),en:80});expect(s.units[2]).toMatchObject({alive:false,removed:true});expect(snapshot(restore(s.content,s.stage,snapshot(s)))).toBe(snapshot(s));
    s=apply(apply(s,{type:'endPhase'}).state,{type:'endPhase'}).state;s=apply(s,{type:'split',unitId:'p1'}).state;expect(s.units[0]).toMatchObject({mechId:'mech-a',x:1,y:2,acted:true,alive:true});expect(s.units[2]).toMatchObject({mechId:'mech-b',x:1,y:1,acted:true,alive:true});expect(snapshot(restore(s.content,s.stage,snapshot(s)))).toBe(snapshot(s));
  });
  it('rejects missing, distant, wrong-side members and blocked split without mutation',()=>{
    const s=m6(c=>{c.combinations=[{id:'link',parts:['mech-a','mech-b'],result:'mech-c'}];});s.units[2].x=0;expect(()=>apply(s,{type:'combine',unitId:'p1',combinationId:'link'})).toThrow('adjacent');s.units[2].x=1;s.units[2].side='enemy';expect(()=>apply(s,{type:'combine',unitId:'p1',combinationId:'link'})).toThrow('missing');
  });
  it('preserves representative effects and spent support while clamping SP from component bonuses',()=>{
    let s=m6(c=>{c.combinations=[{id:'link',parts:['mech-a','mech-b'],result:'mech-c'}];});s.units[0].upgrades={hp:5,en:5,armor:5,mobility:5,weapons:5};s.units[0].fullUpgradeBonus='sp-bonus';s.units[0].sp=220;s.units[0].supportAttackUsed=1;
    attach(s,0,[{type:'damageMul',value:2}],'nextAttack');s=apply(s,{type:'combine',unitId:'p1',combinationId:'link'}).state;expect(s.units[0]).toMatchObject({sp:200,supportAttackUsed:1});expect(s.units[0].effects).toHaveLength(1);expect(snapshot(restore(s.content,s.stage,snapshot(s)))).toBe(snapshot(s));
    s=apply(apply(s,{type:'endPhase'}).state,{type:'endPhase'}).state;s=apply(s,{type:'split',unitId:'p1'}).state;expect(s.units[0].effects).toHaveLength(1);expect(snapshot(restore(s.content,s.stage,snapshot(s)))).toBe(snapshot(s));
  });
  it('rejects blocked separation atomically and permits a non-first representative',()=>{
    const original=m6(c=>{c.combinations=[{id:'link',parts:['mech-a','mech-b'],result:'mech-c'}];});
    let s=apply(original,{type:'combine',unitId:'p2',combinationId:'link'}).state;s=apply(apply(s,{type:'endPhase'}).state,{type:'endPhase'}).state;
    const combined=s.units.find(u=>u.id==='p2')!;
    for(const [i,p]of [{x:combined.x,y:combined.y-1},{x:combined.x-1,y:combined.y},{x:combined.x+1,y:combined.y},{x:combined.x,y:combined.y+1}].entries())s.units.push({...s.units[1],id:`block${i}`,...p});
    const before=snapshot(s);expect(()=>apply(s,{type:'split',unitId:'p2'})).toThrow('free cell');expect(snapshot(s)).toBe(before);
  });
  it('replays support attack and support defense commands with saved response selection',()=>{
    let s=support();s.content.weapons.forEach(w=>w.power=600);const initial=structuredClone(s),commands:Command[]=[fire,{type:'endPhase'},{type:'attack',unitId:'e1',targetId:'p1',weaponId:'rifle'},{type:'respond',response:{type:'defend'},supportDefenderId:'p2'}];
    for(const command of commands)s=apply(s,command).state;let replay=initial;
    for(const command of commands)replay=restore(s.content,s.stage,snapshot(apply(replay,command).state));expect(snapshot(replay)).toBe(snapshot(s));
  });
  it('replays every new command with intermediate restore and identical snapshots',()=>{
    const base=map('area',true);base.content.combinations=[{id:'link',parts:['mech-a','mech-b'],result:'mech-c'}];base.content.mechs[0].forms=[{id:'base',name:'Base',overrides:{}},{id:'fast',name:'Fast',overrides:{move:6}}];base.stage.units[0].parts=['sp-kit'];
    const initial=createBattle(base.content,base.stage,17);let s=initial;const log:Command[]=[];
    const run=(cmd:Command)=>{log.push(cmd);s=apply(s,cmd).state;expect(snapshot(restore(s.content,s.stage,snapshot(s)))).toBe(snapshot(s));};
    run({type:'spirit',unitId:'p1',spiritId:'focus'});run({type:'useItem',unitId:'p1',slot:0});run({type:'transform',unitId:'p1',formId:'fast'});run({type:'mapAttack',unitId:'p1',weaponId:'map-test',point:{x:3,y:2}});run({type:'endPhase'});run({type:'endPhase'});run({type:'combine',unitId:'p1',combinationId:'link'});run({type:'endPhase'});run({type:'endPhase'});run({type:'split',unitId:'p1'});
    let replay=initial;for(const cmd of log)replay=restore(base.content,base.stage,snapshot(apply(replay,cmd).state));expect(snapshot(replay)).toBe(snapshot(s));expect(nextAICommand(replay)).not.toBeNull();expect(effectiveWeapon(s,s.units[0],s.content.weapons[0]).power).toBe(s.content.weapons[0].power);
  });
});
