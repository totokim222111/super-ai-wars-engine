import {describe,it,expect} from 'vitest';
import {apply,attackForecast,effectiveMech,effectivePilot,effectiveAdaptation,spiritProblem,conditionMatches,chooseAICommand,experienceFor,gainExperience,snapshot,restore} from '../../src/core';
import type {BattleEvent,EffectAtom} from '../../src/core';
import {m6,attach} from './m6-helpers';
import {deepFreeze} from './helpers';

const cast=(s:ReturnType<typeof m6>,id:string,targetId?:string)=>apply(s,{type:'spirit',unitId:'p1',spiritId:id,...(targetId?{targetId}:{})});
describe('M6 effect algebra and lifetime',()=>{
  it('adds and multiplies independently of definition order; strongest sets override',()=>{
    const s=m6();attach(s,0,[{type:'hitAdd',value:10},{type:'hitAdd',value:20},{type:'hitSet',value:70},{type:'hitSet',value:100},{type:'damageMul',value:2},{type:'damageMul',value:3},{type:'critSet',value:80}]);
    attach(s,1,[{type:'evadeAdd',value:30},{type:'takenMul',value:.5},{type:'takenMul',value:.5},{type:'takenSet',value:40},{type:'takenSet',value:10}]);
    const f=attackForecast(s,'p1','e1','blade');expect(f.hitRate).toBe(100);expect(f.critRate).toBe(80);expect(f.damage).toEqual({min:10,max:10});
    s.units.forEach(u=>u.effects.forEach(e=>e.atoms?.reverse()));expect(attackForecast(s,'p1','e1','blade')).toEqual(f);
    attach(s,1,[{type:'evadeAll'}],'nextHitTaken','avoid');expect(attackForecast(s,'p1','e1','blade').hitRate).toBe(0);
  });
  it('multiplies outgoing and incoming damage and sums hit/evade modifiers',()=>{
    const s=m6();s.content.weapons[0].hit=0;const before=attackForecast(s,'p1','e1','blade');
    attach(s,0,[{type:'hitAdd',value:5},{type:'hitAdd',value:7},{type:'damageMul',value:2},{type:'damageMul',value:1.5}]);attach(s,1,[{type:'evadeAdd',value:4},{type:'takenMul',value:.5}]);
    const after=attackForecast(s,'p1','e1','blade');expect(after.hitRate).toBe(before.hitRate+8);expect(after.damage.min).toBeGreaterThanOrEqual(before.damage.min*1.5-1);
  });
  it('turn effects expire at the next owner phase, passive effects persist',()=>{
    let s=cast(m6(),'focus').state;attach(s,0,[{type:'moveAdd',value:1}]);s=apply(s,{type:'endPhase'}).state;expect(s.units[0].effects).toHaveLength(2);
    s=apply(s,{type:'endPhase'}).state;expect(s.units[0].effects.map(e=>e.id)).toEqual(['test']);
    s.phase='enemy';s=apply(s,{type:'spirit',unitId:'e1',spiritId:'focus'}).state;s=apply(s,{type:'endPhase'}).state;expect(s.units[1].effects).toHaveLength(1);
    s=apply(s,{type:'endPhase'}).state;expect(s.units[1].effects).toHaveLength(0);
  });
  it('clips resource caps when temporary maximum-stat and morale-cap effects expire',()=>{
    let s=m6();attach(s,0,[{type:'statAdd',value:{hp:1000,en:50,sp:20}},{type:'moraleCapAdd',value:20}],'turn');s.units[0].hp=7800;s.units[0].en=200;s.units[0].sp=220;s.units[0].morale=170;
    s=apply(apply(s,{type:'endPhase'}).state,{type:'endPhase'}).state;expect(s.units[0]).toMatchObject({hp:6800,en:150,sp:200,morale:150});expect(snapshot(restore(s.content,s.stage,snapshot(s)))).toBe(snapshot(s));
  });
  it('nextAttack expires on a miss, nextHitTaken damage effects persist through misses',()=>{
    let s=m6();attach(s,0,[{type:'damageMul',value:2}],'nextAttack');attach(s,1,[{type:'takenSet',value:10}],'nextHitTaken');attach(s,1,[{type:'evadeAll'}],'nextHitTaken','dodge');
    s=apply(s,{type:'attack',unitId:'p1',targetId:'e1',weaponId:'blade'}).state;
    expect(s.units[0].effects).toHaveLength(0);expect(s.units[1].effects.map(e=>e.id)).toEqual(['test']);
  });
  it('counterattacks consume nextAttack and fortune persists until a kill',()=>{
    let s=m6();s=cast(s,'fortune').state;
    const a=apply(s,{type:'attack',unitId:'p1',targetId:'e1',weaponId:'blade'});expect(a.state.units[0].effects).toHaveLength(1);
    s=apply(a.state,{type:'endPhase'}).state;s=apply(s,{type:'spirit',unitId:'e1',spiritId:'surge'}).state;s.options.autoResponse=true;
    s=apply(s,{type:'endPhase'}).state;s.units[0].acted=false;s=apply(s,{type:'attack',unitId:'p1',targetId:'e1',weaponId:'blade'}).state;
    expect(s.units[1].effects).toHaveLength(0);
  });
});
describe('M6 spirits and AI',()=>{
  it.each(['focus','assure','vanish','surge','shelter','brace','rouse','mend','aid','stride','renew','study','fortune','unsettle'])('casts %s with SP cost and no action or RNG use',id=>{
    const s=m6();s.units[0].level=3;s.units[0].hp=1000;s.units[2].hp=1000;s.units[0].acted=true;
    const target=id==='aid'?'p2':id==='unsettle'?'e1':undefined,sp=s.units[0].sp,def=s.content.spirits!.find(d=>d.id===id)!;
    const before=snapshot(s),result=cast(deepFreeze(s),id,target);expect(snapshot(s)).toBe(before);expect(result.state.rng).toBe(s.rng);expect(result.state.units[0].sp).toBe(sp-def.sp);
    expect(result.state.units[0].acted).toBe(id==='renew'?false:true);expect(result.events.some(e=>e.type==='spirit')).toBe(true);
    if(id==='mend')expect(result.state.units[0].hp).toBe(1000+Math.floor(effectiveMech(s,s.units[0]).hp*.3));
    if(id==='aid')expect(result.state.units[2].hp).toBeGreaterThan(1000);
    if(id==='rouse')expect(result.state.units[0].morale).toBe(110);
    if(id==='unsettle')expect(result.state.units[1].morale).toBe(90);
    if(id==='stride')expect(effectiveMech(result.state,result.state.units[0]).move).toBe(7);
  });
  it('rejects low SP, locked spirit, wrong phase, dead and invalid targets transactionally',()=>{
    const s=m6();expect(spiritProblem(s,'p1','renew')).toContain('locked');s.units[0].sp=0;expect(()=>cast(s,'focus')).toThrow('SP');s.units[0].sp=200;
    expect(()=>cast(s,'aid','e1')).toThrow('target');expect(()=>cast(s,'unsettle','p2')).toThrow('target');expect(()=>cast(s,'focus','p2')).toThrow('self');s.phase='enemy';expect(()=>cast(s,'focus')).toThrow('phase');
  });
  it('rejects repeated active spirits but allows immediate recovery again',()=>{
    const s=cast(m6(),'focus').state;expect(()=>cast(s,'focus')).toThrow('already active');expect(()=>cast(cast(m6(),'mend').state,'mend')).not.toThrow();
  });
  it('rejects the same ongoing spirit from a second caster on an affected ally',()=>{
    const s=m6();const def=s.content.spirits!.find(d=>d.id==='aid')!;def.duration='turn';def.effects=[{type:'hitAdd',value:10}];
    const a=apply(s,{type:'spirit',unitId:'p1',spiritId:'aid',targetId:'p2'}).state;
    expect(()=>apply(a,{type:'spirit',unitId:'p2',spiritId:'aid',targetId:'p2'})).toThrow('already active');
    expect(()=>apply(a,{type:'spirit',unitId:'p1',spiritId:'aid',targetId:'p1'})).not.toThrow();
  });
  it('supports a targeted enemy AI spirit and rejects dead casters',()=>{
    const s=m6();s.phase='enemy';s.content.pilots[3].aiSpirits=[{id:'unsettle',when:'start'}];const command=chooseAICommand(s,'e1');expect(command).toMatchObject({type:'spirit',spiritId:'unsettle',targetId:'p1'});
    const r=apply(s,command);expect(r.state.units[0].morale).toBe(90);s.units[1].alive=false;expect(()=>apply(s,{type:'spirit',unitId:'e1',spiritId:'focus'})).toThrow('cannot act');
  });
  it('can renew an unmoved actor and restore its snapshot',()=>{const s=m6();s.units[0].level=3;s.units[0].acted=true;const r=cast(s,'renew').state;expect(r.units[0].moved).toBe(false);expect(snapshot(restore(r.content,r.stage,snapshot(r)))).toBe(snapshot(r));});
  it('supports allAllies without affecting enemies',()=>{
    const s=m6();s.content.spirits!.push({id:'rally',name:'Rally',sp:5,duration:'turn',target:'allAllies',effects:[{type:'hitAdd',value:10}],desc:'All allies.'});s.content.pilots[0].spirits!.push({id:'rally',level:1});
    const r=cast(s,'rally');expect(r.events.find(e=>e.type==='spirit')).toMatchObject({targetIds:['p1','p2']});expect(r.state.units.map(u=>u.effects.length)).toEqual([1,0,1,0]);
  });
  it.each([['start',100,1,true],['morale>=120',119,1,false],['morale>=120',120,1,true],['hp<50%',100,.49,true],['hp<50%',100,.5,false]] as const)('AI condition %s at %s/%s', (when,morale,hp,expected)=>{
    const s=m6();s.phase='enemy';const u=s.units[1];u.morale=morale;u.hp=Math.floor(effectiveMech(s,u).hp*hp);s.content.pilots.find(p=>p.id===u.pilotId)!.aiSpirits=[{id:'focus',when}];
    expect(conditionMatches(s,u,when)).toBe(expected);expect(chooseAICommand(s,u.id).type==='spirit').toBe(expected);
    if(expected){const r=apply(s,chooseAICommand(s,u.id));expect(chooseAICommand(r.state,u.id).type).not.toBe('spirit');}
  });
});
describe('M6 progression, parts and skills',()=>{
  it.each([[1,1,1000],[1,11,2000],[30,1,250],[1,99,3000]] as const)('level factor %d to %d', (level,target,exp)=>{const s=m6();s.units[0].level=level;s.units[1].level=target;expect(experienceFor(s,s.units[0],s.units[1],true)).toBe(exp);expect(experienceFor(s,s.units[0],s.units[1],false)).toBe(exp*.1);});
  it('supports minimum damage EXP, multiple levels, stats, SP, spirit unlock and events',()=>{
    const s=m6();s.content.mechs[3].exp=1;expect(experienceFor(s,s.units[0],s.units[1],false)).toBe(1);const events:BattleEvent[]=[];gainExperience(s,s.units[0],1600,events);
    expect(s.units[0]).toMatchObject({level:4,exp:100,sp:209});expect(effectivePilot(s,s.units[0]).stats.melee).toBe(s.content.pilots[0].stats.melee+6);
    expect(events).toContainEqual(expect.objectContaining({type:'level-up',from:1,to:4,newSpirits:['renew']}));expect(spiritProblem(s,'p1','renew')).toBeNull();
  });
  it('enemy stats scale by level and enemies never gain EXP',()=>{const s=m6();s.units[1].level=8;const p=s.content.pilots.find(p=>p.id===s.units[1].pilotId)!;expect(effectivePilot(s,s.units[1]).stats.hit).toBe(p.stats.hit+7);gainExperience(s,s.units[1],3000,[]);expect(s.units[1].level).toBe(8);});
  it('caps level and EXP at the configured maximum',()=>{const s=m6();s.units[0].level=98;gainExperience(s,s.units[0],10000,[]);expect(s.units[0]).toMatchObject({level:99,exp:499});});
  it('projects all passive parts and only improves effective adaptation',()=>{
    const s=m6();s.units[0].parts=['hull','battery','plating','stabilizer'];const m=effectiveMech(s,s.units[0]),base=s.content.mechs[0];expect([m.hp,m.en,m.armor,m.mobility]).toEqual([base.hp+1000,base.en+40,base.armor+200,base.mobility+10]);
    s.units[0].parts=['sea-kit','booster'];expect(effectiveAdaptation(s,s.units[0],'sea')).toBe('S');expect(effectiveMech(s,s.units[0]).move).toBe(base.move+1);
    attach(s,0,[{type:'adaptSet',value:{sea:'D'}}]);expect(effectiveAdaptation(s,s.units[0],'sea')).toBe('S');
  });
  it('uses a consumable once per slot, without action; stage deployment restores availability',()=>{
    const s=m6((_c,stage)=>{stage.units[0].parts=['repair-kit','sp-kit'];});s.units[0].hp=500;s.units[0].sp=1;s.units[0].acted=true;
    const a=apply(s,{type:'useItem',unitId:'p1',slot:0}).state;expect(a.units[0].hp).toBe(500+Math.floor(effectiveMech(s,s.units[0]).hp*.5));expect(a.units[0].acted).toBe(true);expect(()=>apply(a,{type:'useItem',unitId:'p1',slot:0})).toThrow('unavailable');
    const b=apply(a,{type:'useItem',unitId:'p1',slot:1}).state;expect(b.units[0].sp).toBe(31);expect(m6((_c,stage)=>{stage.units[0].parts=['repair-kit'];}).units[0].usedItems).toBeUndefined();
    expect(snapshot(restore(b.content,b.stage,snapshot(b)))).toBe(snapshot(b));
  });
  it('adds morale growth and cap; regenerates SP at player phase start',()=>{
    const s=m6();s.content.pilots[0].skills=[{id:'momentum'},{id:'resolve'},{id:'renewal'}];s.units[0].morale=165;s.units[0].sp=100;
    let r=cast(s,'rouse').state;expect(r.units[0].morale).toBe(170);r=apply(apply(r,{type:'endPhase'}).state,{type:'endPhase'}).state;expect(r.units[0].sp).toBe(95);expect(snapshot(restore(r.content,r.stage,snapshot(r)))).toBe(snapshot(r));
  });
  it('restores HP/EN/SP flat values and keeps extraAction movement spent',()=>{
    const s=m6();s.units[0].level=3;s.units[0].hp=1;s.units[0].en=1;s.content.spirits![0].effects=[{type:'hpRestore',value:{flat:20}},{type:'enRestore',value:{pct:10,flat:3}},{type:'spRestore',value:5}] as EffectAtom[];s.content.spirits![0].duration='instant';
    let r=cast(s,'focus').state;expect(r.units[0]).toMatchObject({hp:21,en:19,sp:195});r=apply(r,{type:'move',unitId:'p1',x:2,y:2}).state;r=apply(r,{type:'wait',unitId:'p1'}).state;r=cast(r,'renew').state;
    expect(r.units[0]).toMatchObject({moved:true,acted:false,moveCommitted:true});expect(()=>apply(r,{type:'move',unitId:'p1',x:2,y:3})).toThrow('moved');expect(snapshot(restore(r.content,r.stage,snapshot(r)))).toBe(snapshot(r));
  });
});
