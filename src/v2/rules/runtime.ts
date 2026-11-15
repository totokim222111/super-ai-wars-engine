import {effectiveMorale} from '../../core/modifiers';
import {updatePatternAlerts} from '../../core/ai-patterns';
import {term} from '../terms';
import { wallProjection } from '../story/stage-core';
/** 저장 가능한 범용 v2 규칙. 코어의 reducer/예측기에 투영한 뒤 진영·정적 자료를 복원한다. */
import { revealCombat, apply, availableActions, chooseAICommand, chooseResponse, effectiveMech, forecast, nextRandom, reachable, supportAttackCandidates, aiSupportDefender } from '../../core';
import type { ApplyResult, BattleEvent, BattleState, Command, Effect, Unit, Response, Forecast } from '../../core';
import { configOf, THIRD, type ComboRule, type FormRule } from './config';
import {applySystem} from '../../core/system';
import {effectiveWeapon} from '../../core/modifiers';
import {finishAction,resetActions,hasActed} from '../../core/actions';
export const comboMembers=(c:ComboRule):string[]=>c.participants??[c.lead,c.partner];
const comboUnlocked=(s:BattleState,c:ComboRule):boolean=>c.joined?!!s.units.find(u=>u.id===c.joined&&u.alive&&faction(u)===phase(s)):c.affection?Number(runtime(s).vars[c.flag]??0)>=c.affection.min:runtime(s).vars[c.flag]===true||runtime(s).vars[c.flag]===1;
const STATE = 'v2-rules-state', COMMAND = 'v2-rules-command', TEMP = 'v2-query-', PERK = 'v2-form-perk', HASTE = 'v2-haste';
export type Faction = 'player' | 'enemy' | 'third' | 'neutral';
export interface Runtime {
    stage: string;
    phase: Exclude<Faction, 'neutral'>;
    barriers: Record<string, number>;
    vars: Record<string, string | number | boolean>;
    battles: Record<string, number>;
    fired: string[];
    drawn: string[];
    blocked: string[];
    copies: Record<string, {
        weapon?: string;
        pending?: string;
        ready: number;
        last: string;
        ammo?: Record<string, number>;
    }>;
    defeated: Record<string, boolean>;
}
export type RuleOp = {
    kind: 'exhaust';
    id: string;
} | {
    kind: 'barrier';
    id: string;
    value: number;
} | {
    kind: 'form';
    id: string;
    form: string;
} | {
    kind: 'passage';
    rect: [
        number,
        number,
        number,
        number
    ];
    blocked: boolean;
};
export type RuleEvent = {
    type:'v2-passage';
    cells:string[];
} | {
    type: 'v2-notice';
    text: string;
    unitId?: string;
} | {
    type: 'v2-scene';
    scene: string;
} | {
    type: 'v2-form';
    unitId: string;
    form: string;
} | {
    type: 'v2-phase';
    phase: 'third';
    round: number;
};
export type RuleAttack = Extract<BattleEvent, {
    type: 'attack';
}> & {
    barrier?: 'immune' | 'reduce';
    combo?: string;
};
const emit = (events: BattleEvent[], e: RuleEvent) => events.push(e as unknown as BattleEvent);
const passive = (id: string, source: string, atoms: Effect['atoms'] = [], hooks: Effect['hooks'] = {}): Effect => ({ id, source, lifetime: 'passive', duration: { unit: 'round', remaining: 1000000000 }, atoms, hooks });
export function runtime(s: BattleState): Runtime { const e = s.units.flatMap(u => u.effects).find(e => e.id === STATE); if (e)
    return JSON.parse(e.source); const c = configOf(s.stage); return { stage: s.stage.id, phase: s.phase, barriers: Object.fromEntries(Object.entries(c.units).filter(([, r]) => r.barrier !== undefined).map(([id, r]) => [id, r.barrier!])), vars: {}, battles: {}, fired: [], drawn: [], blocked: [], copies: {}, defeated: {} }; }
export function storeRuntime(s: BattleState, r: Runtime): void { if (s.units[0]) {
    s.units[0].effects = s.units[0].effects.filter(e => e.id !== STATE);
    s.units[0].effects.push(passive(STATE, JSON.stringify(r)));
} }
export function faction(u: Unit): Faction { return u.tags?.includes(THIRD) ? 'third' : u.side; }
export function phase(s: BattleState): Exclude<Faction, 'neutral'> { return runtime(s).phase === 'third' ? 'third' : s.phase; }
export const hostile = (a: Unit, b: Unit) => a.id !== b.id && a.alive && b.alive && faction(a) !== 'neutral' && faction(b) !== 'neutral' && faction(a) !== faction(b);
export function formRule(s: BattleState, u: Unit): FormRule | undefined { const fs = configOf(s.stage).units[u.id]?.forms; return fs?.find(f => f.id === (u.formId ?? fs[0]?.id)); }
export function formName(s: BattleState, u: Unit): string | undefined { return configOf(s.stage).units[u.id]?.forms?.length ? u.formId ?? configOf(s.stage).units[u.id].forms![0].id : undefined; }
/** 같은 기체 그림을 공유하는 모드만 이름 뒤에 표시한다. 서로 다른 기체는 해당 형태의 기체명을 쓴다. */
export function unitName(s:BattleState,u:Unit):string {
    const f=formRule(s,u),base=effectiveMech(s,u);
    if(!f)return base.name;
    const name=s.content.mechs.find(m=>m.id===f.mech)?.name??base.name;
    return name+(configOf(s.stage).units[u.id].forms!.filter(v=>v.mech===f.mech).length>1?' · '+f.id:'');
}
function perks(s: BattleState): void { for (const u of s.units) {
    const f = formRule(s, u);
    u.effects = u.effects.filter(e => e.id !== PERK&&e.id!=='v2-barrier-state');
    const states=configOf(s.stage).units[u.id]?.barrierStates;if(states)u.effects.push(passive('v2-barrier-state','v2',runtime(s).barriers[u.id]?states.active:states.inactive));
    if (f)
        u.effects.push(passive(PERK, 'v2-form', [{ type: 'statAdd', value: { weapons: f.attack ?? 0, armor: f.armor ?? 0 } }, { type: 'evadeAdd', value: f.evade ?? 0 }, { type: 'supportAttack', value: f.support ?? 0 }]));
} }
function beginPhase(s: BattleState, r: Runtime, events: BattleEvent[], initial = false): void {
    const c = configOf(s.stage);
    for (const u of s.units) {
        if (!u.alive || faction(u) !== r.phase)
            continue;
        const copied = r.copies[u.id];
        if (copied?.pending && s.round >= copied.ready) {
            copied.weapon = copied.pending;
            const w = s.content.weapons.find(w => w.id === copied.weapon);
            if (w?.ammo !== undefined) {
                copied.ammo ??= {};
                copied.ammo[w.id] ??= u.ammo[w.id] ?? w.ammo;
            }
            delete copied.pending;
        }
        u.effects = u.effects.filter(e => e.id !== HASTE);
        const bonus = c.haste[s.stage.map.tiles[u.y][u.x]];
        if (bonus)
            u.effects.push(passive(HASTE, 'v2-terrain', [{ type: 'moveAdd', value: bonus }]));
        const f = formRule(s, u);
        if (!initial && f?.restore)
            for (const a of s.units.filter(a => a.alive && faction(a) === faction(u) && a.id !== u.id && Math.abs(a.x - u.x) + Math.abs(a.y - u.y) === 1)) {
                const n = Math.min(f.restore, effectiveMech(s, a).en - a.en);
                a.en += n;
                if (n)
                    events.push({ type: 'recover', unitId: a.id, hp: 0, en: n });
            }
    }
}
export function prepareRules(s: BattleState): BattleState { if (!s.units.some(u => u.tags?.some(t => t.startsWith('v2-rules:'))))
    return s; perks(s); if (!s.units.flatMap(u => u.effects).some(e => e.id === STATE)) {
    const r = runtime(s);
    perks(s);
    beginPhase(s, r, [], true);
    storeRuntime(s, r);
} return s; }
export function setRuleVariable(s: BattleState, name: string, value: string | number | boolean): void { const r = runtime(s); r.vars[name] = value; updatePatternAlerts(s,[],r.vars); storeRuntime(s, r); }
export function ruleCommand(op: RuleOp): Command { return { type: 'system', unitId: '', action: { kind: 'effect', ids: [], effect: passive(COMMAND, JSON.stringify(op)) } }; }
function operation(c: Command): RuleOp | undefined { return c.type === 'system' && c.action.kind === 'effect' && c.action.effect.id === COMMAND ? JSON.parse(c.action.effect.source) : undefined; }
export function comboFor(s: BattleState, weapon: string): ComboRule | undefined { return configOf(s.stage).combos.find(c => c.virtual === weapon); }
export function comboProblem(s: BattleState, c: ComboRule): string | undefined {
    if(c.participants||c.costs||c.morale!==undefined||c.postMove!==undefined||c.affection||c.joined){
      const members=comboMembers(c).map(id=>s.units.find(u=>u.id===id));
      if(members.some(u=>!u?.alive||u.removed||u.acted||hasActed(u)||faction(u)!==phase(s)))return '참가자 모두 행동 전이어야 합니다.';
      const units=members as Unit[],spatial=units.filter(u=>!c.virtualParticipants?.includes(u.id)),connected=new Set([spatial[0].id]);let changed=true;
      while(changed){changed=false;for(const u of spatial)if(!connected.has(u.id)&&spatial.some(v=>connected.has(v.id)&&Math.abs(u.x-v.x)+Math.abs(u.y-v.y)===1)){connected.add(u.id);changed=true;}}
      if(connected.size!==spatial.length)return '참가자가 이어 붙어 있어야 합니다.';
      if(!comboUnlocked(s,c))return '합체기 해금 전입니다.';
      if(c.postMove===false&&units.some(u=>u.moved))return '이동 전 합체기입니다.';
      const w=s.content.weapons.find(w=>w.id===c.weapon)!;
      if(units.some(u=>effectiveMorale(s,u)<(c.morale??0)))return `${term('morale')} ${c.morale} 이상이어야 합니다.`;
      if(units.some((u,i)=>u.en<(c.costs?.[i]??(i===0?Math.ceil((w.en??0)/2):Math.floor((w.en??0)/2)))))return term('partnerEnergy');
      return;
    }
    const r = runtime(s), a = s.units.find(u => u.id === c.lead), b = s.units.find(u => u.id === c.partner), w = s.content.weapons.find(w => w.id === c.weapon);
    if (!a?.alive || !b?.alive || a.acted || b.acted || faction(a) !== faction(b) || faction(a) !== phase(s))
        return '두 기체 모두 행동 전이어야 합니다.';
    if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) !== 1)
        return '파트너와 인접해야 합니다.';
    if (r.vars[c.flag] !== true && r.vars[c.flag] !== 1)
        return '합체기 해금 전입니다.';
    if (!w || a.en < Math.ceil((w.en ?? 0) / 2) || b.en < Math.floor((w.en ?? 0) / 2))
        return term('partnerEnergy');
}
/** 가상 무장·진영·효과를 복사본에서만 노출. 저장 원본에는 코어가 아는 정적 id만 남는다. */
function priorityReserve(s:BattleState,c:ComboRule):boolean{return s.units.some(u=>(runtime(s).barriers[u.id]??0)>0&&configOf(s.stage).units[u.id]?.breakBy===c.id);}
export function rulesProjection(input: BattleState, actorId?: string, targetId?: string, weaponId?: string): BattleState {
    const c = configOf(input.stage);
    if (!Object.keys(c.units).length && !c.combos.length && !c.gachas.length && !Object.keys(c.haste).length)
        return input;
    const s = prepareRules({ ...input, content: { ...input.content, mechs: [...input.content.mechs], rules: { ...input.content.rules, k: { ...input.content.rules.k } } }, stage: { ...input.stage }, units: input.units.map(u => ({ ...u, ammo: { ...u.ammo }, effects: [...u.effects] })) }), r = runtime(s), acting = actorId ? s.units.find(u => u.id === actorId) : undefined, own = acting ? faction(acting) : r.phase;
    if (targetId && faction(input.units.find(u => u.id === targetId)!) !== 'player')
        s.options = { ...s.options, autoResponse: true };
    const activeSide = own === 'player' ? 'player' : 'enemy';
    s.content.aiSides=Object.fromEntries(input.units.map(u=>[u.id,faction(u)]));
    s.content.aiReserves=s.content.rules.ai.resources?.burst?Object.fromEntries(input.units.map(u=>[u.id,Math.max(0,...c.combos.filter(co=>comboUnlocked(input,co)&&comboMembers(co).includes(u.id)&&priorityReserve(input,co)).map(co=>co.costs?.[comboMembers(co).indexOf(u.id)]??0))])):{};
    s.phase = activeSide;
    s.stage.id = 'v2-query:' + s.stage.id;
    const combo = weaponId ? configOf(input.stage).combos.find(c=>c.virtual===weaponId&&(!actorId||actorId===c.lead)) : undefined;
    for(const co of c.combos)if(co.powerMultiplier){const power=Math.max(0,...comboMembers(co).flatMap(id=>{const u=input.units.find(u=>u.id===id);if(!u?.alive)return [];return effectiveMech(input,u).weapons.map(w=>input.content.weapons.find(v=>v.id===w)!).filter(w=>w.finisher&&!w.id.startsWith('v2-combo')).map(w=>effectiveWeapon(input,u,w).power);}));const w=s.content.weapons.find(w=>w.id===co.virtual);if(w){s.content.weapons=s.content.weapons.map(x=>x.id===w.id?{...x,power:Math.round(power*co.powerMultiplier!),fixedPower:true}:x);}}
    for (const u of s.units) {
        const original = input.units.find(v => v.id === u.id)!, side = faction(original);
        const opponent = targetId ? faction(input.units.find(v => v.id === targetId)!) : undefined;
        u.side = side === 'neutral' || opponent && side !== own && side !== opponent ? 'neutral' : side === own ? activeSide : activeSide === 'player' ? 'enemy' : 'player';
        // 중립은 점유만 유지한다. 교전 상대가 아닌 진영은 원호에 끼지 않는다.
        if (side === 'neutral')
            u.side = 'neutral';
        const base = s.content.mechs.find(m => m.id === u.mechId)!;
        const extra: string[] = [];
        for (const co of c.combos)
            if (co.lead === u.id && !comboProblem(input, co))
                extra.push(co.virtual);
        const cp = r.copies[u.id];
        if (cp?.weapon) {
            extra.push(cp.weapon);
            const w = s.content.weapons.find(w => w.id === cp.weapon);
            if (w?.ammo !== undefined)
                u.ammo[w.id] = cp.ammo?.[w.id] ?? w.ammo;
        }
        const arms = input.stage.contentOverrides?.aliases?.[base.id]?undefined:c.units[u.id]?.arms;
        if (extra.length || arms) {
            const index = s.content.mechs.indexOf(base), copy = structuredClone(base);
            copy.weapons = [...new Set([...(arms?.[''] ?? copy.weapons), ...extra])];
            if (copy.forms)
                copy.forms = copy.forms.map(f => ({ ...f, overrides: { ...f.overrides, weapons: [...new Set([...(arms?.[f.id] ?? f.overrides.weapons ?? base.weapons), ...extra])] } }));
            if(u.recruited&&copy.allyStats){copy.allyStats={...copy.allyStats,weapons:[...new Set([...(arms?.['']??copy.allyStats.weapons??copy.weapons),...extra])],forms:copy.allyStats.forms?.map(f=>({...f,overrides:{...f.overrides,weapons:[...new Set([...(arms?.[f.id]??f.overrides.weapons??base.weapons),...extra])]}}))};}
            s.content.mechs[index] = copy;
        }
        const value = r.barriers[u.id] ?? 0, breaks = combo && c.units[u.id]?.breakBy === combo.id;
        if (value && !breaks) {
            u.effects.push(value >= 100 ? passive(TEMP + 'barrier', 'v2', [{ type: 'takenSet', value: 0 }]) : passive(TEMP + 'barrier', 'v2', [], { modifyDamage: { op: 'multiply', value: 1 - value / 100, role: 'defender' } }));
            s.content.rules.k.minDamage = 0;
        }
        if ((!targetId || u.id === targetId) && weaponId && c.units[u.id]?.copy && cp?.last === weaponId)
            u.effects.push(passive(TEMP + 'repeat', 'v2', [{ type: 'takenMul', value: 1 - c.units[u.id].copy! / 100 }]));
        const f = formRule(input, original);
        if (u.id === targetId && f?.counter!==undefined)
            u.effects.push(passive(TEMP + 'counter', 'v2', [], { modifyDamage: { op: 'multiply', value: f.counter / 100, role: 'attacker' } }));
    }
    return s;
}
function restoreProjection(result: BattleState, input: BattleState, r: Runtime): void { result.content = input.content; result.stage = input.stage; result.phase = input.phase; result.options = input.options; for (const u of result.units) {
    const original = input.units.find(v => v.id === u.id);
    if (original) {
        u.side = original.side;
        const copied = r.copies[u.id];
        if (copied?.weapon && u.ammo[copied.weapon] !== undefined) {
            copied.ammo ??= {};
            copied.ammo[copied.weapon] = u.ammo[copied.weapon];
        }
        for (const id of Object.keys(u.ammo))
            if (!(id in original.ammo))
                delete u.ammo[id];
    }
    u.effects = u.effects.filter(e => !e.id.startsWith(TEMP));
} }
function counterResistance(query:BattleState,input:BattleState,attacker:string,response:Response):void {
    const value=configOf(input.stage).units[attacker]?.copy;
    if(value&&response.type==='counter'&&runtime(input).copies[attacker]?.last===response.weaponId)
        query.units.find(u=>u.id===attacker)!.effects.push(passive(TEMP+'counter-copy','v2',[{type:'takenMul',value:1-value/100}]));
}
export function rulesForecast(s: BattleState, a: string, d: string, w: string, response?: Response): Forecast {
    const query=rulesProjection(s,a,d,w),chosen=response??chooseResponse(query,d,a);
    counterResistance(query,s,a,chosen);
    return forecast(query,a,d,w,chosen);
}
export function ruleActions(s: BattleState, id: string): Command[] { const u = s.units.find(u => u.id === id); if (!u || faction(u) !== phase(s) || faction(u) === 'neutral')
    return []; return availableActions(rulesProjection(s, id), id).filter(c=>c.type!=='transform'||!u.moved||!configOf(s.stage).units[id]?.transformBeforeMove); }
export function nextRulesAI(s: BattleState): Command | null {
    if (s.outcome)
        return null;
    if (s.pending)
        return { type: 'respond', response: chooseResponse(rulesProjection(s, s.pending.attackerId, s.pending.targetId, s.pending.weaponId), s.pending.targetId, s.pending.attackerId) };
    const pair = comboAI(s);
    if (pair)
        return pair;
    const u = s.units.filter(u => u.alive && !u.acted && faction(u) === phase(s)).sort((a, b) => (s.content.rules.ai.resources?.roundRobin?(a.actionsSpent??0)-(b.actionsSpent??0):0)||a.id.localeCompare(b.id))[0];
    if (!u)
        return { type: 'endPhase' };
    const copied=runtime(s).copies[u.id]?.weapon;
    if(copied){const shots=ruleActions(s,u.id).filter((c):c is Extract<Command,{type:'attack'}>=>c.type==='attack'&&c.weaponId===copied).sort((a,b)=>rulesForecast(s,u.id,b.targetId,copied).expectedDamage-rulesForecast(s,u.id,a.targetId,copied).expectedDamage);if(shots[0])return shots[0];}
    const fs = configOf(s.stage).units[u.id]?.forms;
    if (phase(s) === 'player' && fs?.length && u.transformedRound !== s.round && !(u.moved&&configOf(s.stage).units[u.id]?.transformBeforeMove)) {
        const best = [...fs].sort((a, b) => { const ma = s.content.mechs.find(m => m.id === a.mech)!, mb = s.content.mechs.find(m => m.id === b.mech)!; return Math.max(...mb.weapons.map(w => s.content.weapons.find(d => d.id === w)!.power), 0) + (b.attack ?? 0) - Math.max(...ma.weapons.map(w => s.content.weapons.find(d => d.id === w)!.power), 0) - (a.attack ?? 0); })[0];
        if (best.id !== formName(s, u))
            return { type: 'transform', unitId: u.id, formId: best.id };
    }
    const base = wallProjection(rulesProjection(s, u.id));
    const query = { ...base, content:{...base.content,aiVariables:runtime(s).vars}, stage: { ...base.stage, scenario: false } };
    return chooseAICommand(query, u.id);
}
/** 두 기체를 먼저 이동한 뒤 주공격자를 다시 고른다. 파트너의 대기가 합체기를 막지 않는다. */
function comboAI(s: BattleState): Command | undefined {
    const priority=(c:ComboRule)=>s.units.some(u=>(runtime(s).barriers[u.id]??0)>0&&configOf(s.stage).units[u.id]?.breakBy===c.id)?1:0;
    for (const c of [...configOf(s.stage).combos].sort((a,b)=>priority(b)-priority(a))) {
        if(c.participants){
          const members=comboMembers(c).map(id=>s.units.find(u=>u.id===id));
          if(!comboUnlocked(s,c)||members.some((u,i)=>!u?.alive||u.acted||hasActed(u)||faction(u)!==phase(s)||effectiveMorale(s,u)<(c.morale??0)||u.en<(c.costs?.[i]??0)))continue;
          const ready=ruleActions(s,c.lead).filter((k):k is Extract<Command,{type:'attack'}>=>k.type==='attack'&&k.weaponId===c.virtual).sort((a,b)=>rulesForecast(s,c.lead,b.targetId,c.virtual).expectedDamage-rulesForecast(s,c.lead,a.targetId,c.virtual).expectedDamage)[0];if(ready&&rulesForecast(s,c.lead,ready.targetId,c.virtual).expectedDamage>0)return ready;
          const lead=members[0]!,target=s.units.filter(t=>hostile(lead,t)).sort((a,b)=>Math.abs(a.x-lead.x)+Math.abs(a.y-lead.y)-Math.abs(b.x-lead.x)-Math.abs(b.y-lead.y))[0];
          // Attached participants pay and act, but do not attract spatial assembly.
          const spatial=(members as Unit[]).filter(u=>!c.virtualParticipants?.includes(u.id));
          if(c.virtualParticipants?.length&&spatial.length===2&&target){
            const cells=(u:Unit)=>u.moved?[{x:u.x,y:u.y,cost:0}]:reachable(wallProjection(rulesProjection(s,u.id)),u.id);
            const [a,b]=spatial,wa=effectiveWeapon(s,a,s.content.weapons.find(w=>w.id===c.weapon)!);
            const ac=cells(a),bc=cells(b),plans=ac.flatMap(p=>bc.filter(q=>Math.abs(p.x-q.x)+Math.abs(p.y-q.y)===1&&Math.abs(p.x-target.x)+Math.abs(p.y-target.y)>=wa.range[0]&&Math.abs(p.x-target.x)+Math.abs(p.y-target.y)<=wa.range[1]).map(q=>({p,q,cost:p.cost+q.cost}))).sort((x,y)=>x.cost-y.cost||x.p.y-y.p.y||x.p.x-y.p.x||x.q.y-y.q.y||x.q.x-y.q.x);
            const plan=plans[0];if(plan){if(plan.p.x!==a.x||plan.p.y!==a.y)return {type:'move',unitId:a.id,x:plan.p.x,y:plan.p.y};if(plan.q.x!==b.x||plan.q.y!==b.y)return {type:'move',unitId:b.id,x:plan.q.x,y:plan.q.y};}
          }
          for(const member of spatial){if(member.moved)continue;const others=spatial.filter(u=>u!==member),gap=(u:{x:number;y:number})=>Math.min(...others.map(v=>Math.abs(v.x-u.x)+Math.abs(v.y-u.y)));
            const cells=reachable(wallProjection(rulesProjection(s,member.id)),member.id).filter(p=>p.x!==member.x||p.y!==member.y).sort((a,b)=>gap(a)-gap(b)||(target?Math.abs(a.x-target.x)+Math.abs(a.y-target.y)-Math.abs(b.x-target.x)-Math.abs(b.y-target.y):0));
            const best=cells[0];if(best&&(gap(best)<gap(member)||gap(best)===1&&target&&Math.abs(best.x-target.x)+Math.abs(best.y-target.y)<Math.abs(member.x-target.x)+Math.abs(member.y-target.y)))return {type:'move',unitId:member.id,x:best.x,y:best.y};
          }
          continue;
        }
        const r = runtime(s), a = s.units.find(u => u.id === c.lead), b = s.units.find(u => u.id === c.partner);
        if (!a?.alive || !b?.alive || a.acted || b.acted || faction(a) !== phase(s) || faction(b) !== phase(s) || (r.vars[c.flag]!==true&&r.vars[c.flag]!==1))
            continue;
        const targets = s.units.filter(t => hostile(a, t)).sort((x, y) => Number(configOf(s.stage).units[y.id]?.breakBy === c.id) - Number(configOf(s.stage).units[x.id]?.breakBy === c.id) || x.hp - y.hp);
        const cells = (u: Unit) => u.moved ? [{ x: u.x, y: u.y }] : reachable(wallProjection(rulesProjection(s, u.id)), u.id);
        const dist = (x: {
            x: number;
            y: number;
        }, y: {
            x: number;
            y: number;
        }) => Math.abs(x.x - y.x) + Math.abs(x.y - y.y);
        for (const p of cells(a).filter(p => dist(p, b) === 1)) {
            const at = { ...s, units: s.units.map(u => u.id === a.id ? { ...u, x: p.x, y: p.y, moved: u.moved || dist(p, u) > 0 } : u) };
            if (comboProblem(at, c))
                continue;
            for (const t of targets) {
                const cmd = ruleActions(at, a.id).find(k => k.type === 'attack' && k.weaponId === c.virtual && k.targetId === t.id);
                if (cmd && rulesForecast(at, a.id, t.id, c.virtual).expectedDamage > 0)
                    return dist(p, a) > 0 ? { type: 'move', unitId: a.id, x: p.x, y: p.y } : cmd;
            }
        }
        const target = targets.find(t => configOf(s.stage).units[t.id]?.breakBy === c.id && (r.barriers[t.id] ?? 0) > 0);
        if (!target)
            continue;
        if (!a.moved) {
            const possible = cells(b), best = cells(a).filter(p => possible.some(q => dist(p, q) === 1)).sort((p, q) => dist(p, target) - dist(q, target) || dist(p, b) - dist(q, b))[0];
            if (best && dist(best, a) > 0)
                return { type: 'move', unitId: a.id, x: best.x, y: best.y };
        }
        if (!b.moved) {
            const best = cells(b).filter(p => dist(p, a) === 1).sort((p, q) => dist(p, target) - dist(q, target))[0];
            if (best && dist(best, b) > 0)
                return { type: 'move', unitId: b.id, x: best.x, y: best.y };
        }
        if (!b.moved) {
            const best = cells(b).sort((p, q) => dist(p, a) - dist(q, a) || dist(p, target) - dist(q, target))[0];
            if (best && dist(best, a) < dist(b, a))
                return { type: 'move', unitId: b.id, x: best.x, y: best.y };
        }
        if (!a.moved) {
            const best = cells(a).sort((p, q) => dist(p, b) - dist(q, b) || dist(p, target) - dist(q, target))[0];
            if (best && dist(best, b) < dist(a, b))
                return { type: 'move', unitId: a.id, x: best.x, y: best.y };
        }
    }
}
function changeForm(s: BattleState, id: string, form: string, events: BattleEvent[], forced: boolean): void {
    const u = s.units.find(u => u.id === id), f = configOf(s.stage).units[id]?.forms?.find(f => f.id === form);
    if (!u || !f)
        throw Error('없는 폼: ' + id + ' ' + form);
    if(!forced&&u.moved&&configOf(s.stage).units[id]?.transformBeforeMove)throw Error('이동 후 변형 불가');
    if (!forced && (faction(u) !== phase(s) || !u.alive || u.transformedRound === s.round))
        throw Error('폼 체인지는 자기 페이즈에 턴당 1회입니다.');
    const old = effectiveMech(s, u), hp = u.hp / old.hp, en = u.en / old.en, from = formName(s, u) ?? '';
    u.formId = form;
    u.transformedRound = s.round;
    const dead = !u.alive && !u.removed;
    u.removed = false;
    perks(s);
    const next = effectiveMech(s, u);
    u.hp = dead ? next.hp : Math.max(1, Math.floor(next.hp * hp));
    u.en = dead ? next.en : Math.floor(next.en * en);
    u.alive = true;
    for (const id of next.weapons) {
        const w = s.content.weapons.find(w => w.id === id)!;
        if (w.ammo !== undefined && u.ammo[id] === undefined)
            u.ammo[id] = w.ammo;
    }
    if (u.moved) {
        u.moveOrigin = null;
        u.moveCommitted = true;
    }
    events.push({ type: 'transform', unitId: id, from, to: form });
    emit(events, { type: 'v2-form', unitId: id, form });
}
function drawGacha(s: BattleState, r: Runtime, unit: Unit, events: BattleEvent[]): void {
    for (const g of configOf(s.stage).gachas) {
        if (r.drawn.includes(g.id) || !g.regions.some(id => { const a = s.stage.areas?.[id]; return a && unit.x >= a[0] && unit.y >= a[1] && unit.x <= a[2] && unit.y <= a[3]; }))
            continue;
        const draw = nextRandom(s.rng);
        s.rng = draw.state;
        const p = g.prizes[Math.floor(draw.value * g.prizes.length)];
        r.drawn.push(g.id);
        r.vars[g.flag] = !['blank', 'move'].includes(p.kind);
        const m = effectiveMech(s, unit);
        if (p.kind === 'hp')
            unit.hp = Math.min(m.hp, unit.hp + Math.floor(m.hp * p.value / 100));
        if (p.kind === 'en')
            unit.en = Math.min(m.en, unit.en + Math.floor(m.en * p.value / 100));
        if (p.kind === 'credits')
            s.credits = (s.credits ?? 0) + p.value;
        if (p.kind === 'move')
            unit.effects.push({ id: 'v2-gacha-' + g.id, source: 'v2-gacha', duration: { unit: 'round', remaining: (p.turns ?? 1) + 1 }, atoms: [{ type: 'moveAdd', value: p.value }], hooks: {} });
        unit.moveOrigin = null;
        unit.moveCommitted = true;
        emit(events, { type: 'v2-notice', unitId: unit.id, text: `가챠 · ${p.label === '꽝' ? '꽝! 다음 기회에!' : p.label}` });
    }
}
export function applyRules(input: BattleState, command: Command): ApplyResult {
    const enabled = input.stage.units.some(u => u.tags?.some(t => t.startsWith('v2-rules:'))) || input.units.flatMap(u => u.effects).some(e => e.id === STATE);
    if (!enabled && !operation(command))
        return apply(input, command);
    const op = operation(command), s = prepareRules(structuredClone(input)), r = runtime(s), events: BattleEvent[] = [];
    r.phase = phase(s);
    if (op) {
        if (op.kind === 'exhaust') {
            const u = s.units.find(u => u.id === op.id);
            if (!u)
                throw Error('소진 대상 없음');
            u.en = 0;
            u.sp = 0;
            emit(events, { type: 'v2-notice', unitId: op.id, text: term('exhaust') });
        }
        if (op.kind === 'barrier') {
            if (!s.units.some(u => u.id === op.id))
                throw Error('배리어 대상 없음');
            r.barriers[op.id] = op.value;
            emit(events, { type: 'v2-notice', unitId: op.id, text: op.value ? '배리어 전개' : '배리어 해제' });
        }
        if (op.kind === 'form')
            changeForm(s, op.id, op.form, events, true);
        if (op.kind === 'passage') {
            const [x, y, xx, yy] = op.rect;
            if (x < 0 || y < 0 || xx >= s.stage.map.w || yy >= s.stage.map.h || x > xx || y > yy)
                throw Error('통행 범위 오류');
            const cells = new Set(r.blocked);
            for (let row = y; row <= yy; row++)
                for (let col = x; col <= xx; col++)
                    op.blocked ? cells.add(`${col},${row}`) : cells.delete(`${col},${row}`);
            r.blocked = [...cells];
            emit(events,{type:'v2-passage',cells:r.blocked});
            emit(events, { type: 'v2-notice', text: op.blocked ? '통행 차단' : '통행 개방' });
        }
        transitions(s,r,events);storeRuntime(s, r);
        return { state: s, events };
    }
    if (command.type === 'transform' && configOf(s.stage).units[command.unitId]?.forms) {
        changeForm(s, command.unitId, command.formId, events, false);
        storeRuntime(s, r);
        return { state: s, events };
    }
    // 제3은 enemy와 태그로 저장하고, 별도 적대 페이즈에서만 진영을 투영한다.
    if (command.type === 'endPhase' && r.phase === 'enemy' && s.units.some(u => u.alive && faction(u) === 'third')) {
        for (const u of s.units)
            if (faction(u) === 'enemy') {
                finishAction(s,u,true);
            }
        r.phase = 'third';
        for (const u of s.units)
            if (faction(u) === 'third') {
                resetActions(s,u);
                u.effects = u.effects.filter(e => e.lifetime !== 'turn');
            }
        beginPhase(s, r, events);
        emit(events, { type: 'v2-phase', phase: 'third', round: s.round });
        storeRuntime(s, r);
        return { state: s, events };
    }
    const attack = command.type === 'attack' ? command : command.type === 'respond' && s.pending ? { unitId: s.pending.attackerId, targetId: s.pending.targetId, weaponId: s.pending.weaponId } : undefined;
    const candidateCombo = attack ? comboFor(s, attack.weaponId) : undefined;
    const copiedCombo=attack&&candidateCombo&&attack.unitId!==candidateCombo.lead&&runtime(s).copies[attack.unitId]?.weapon===attack.weaponId;
    const combo = copiedCombo ? undefined : candidateCombo;
    if (combo) {
        const problem = comboProblem(s, combo);
        if (problem || attack!.unitId !== combo.lead)
            throw Error(problem ?? '합체기 주공격 기체 오류');
    }
    if (command.type === 'attack' && combo) {
        const c = configOf(s.stage).units[command.targetId];
        if (c?.breakBy === combo.id) {
            r.barriers[command.targetId] = 0;
            storeRuntime(s, r);
            emit(events, { type: 'v2-notice', unitId: command.targetId, text: '합체기 · 배리어 파훼!' });
        }
    }
    const query = command.type === 'system' || command.type === 'endPhase' ? s : rulesProjection(s, attack?.unitId ?? ('unitId' in command ? command.unitId : undefined), attack?.targetId, attack?.weaponId??(command.type==='mapAttack'?command.weaponId:undefined));
    let resolved=command;
    if(attack&&configOf(s.stage).units[attack.unitId]?.copy){
        if(command.type==='respond')counterResistance(query,s,attack.unitId,command.response);
        else if(command.type==='attack'){
            const a=query.units.find(u=>u.id===attack.unitId)!,d=query.units.find(u=>u.id===attack.targetId)!;
            if(!(a.side==='enemy'&&d.side==='player'&&!query.options.autoResponse)){
                if(!ruleActions(s,a.id).some(c=>c.type==='attack'&&c.targetId===d.id&&c.weaponId===command.weaponId))throw Error('복사 유닛의 유효하지 않은 공격');
                const response=chooseResponse(query,d.id,a.id);
                counterResistance(query,s,a.id,response);
                const helper=command.supportAttackerId??(a.side==='enemy'?supportAttackCandidates(query,a.id,d.id)[0]?.unitId:undefined);
                query.pending={type:'response',attackerId:a.id,targetId:d.id,weaponId:command.weaponId,...(helper?{supportAttackerId:helper}:{})};
                resolved={type:'respond',response,...(aiSupportDefender(query,a.id,d.id,command.weaponId)?{supportDefenderId:aiSupportDefender(query,a.id,d.id,command.weaponId)}:{})};
            }
        }
    }
    const result = apply(query, resolved);
    if (query !== s)
        restoreProjection(result.state, s, r);
    const next = result.state;
    if(result.events.some(e=>e.type==='attack')){for(const u of next.units)u.revealed=s.units.find(v=>v.id===u.id)?.revealed;revealCombat(next,result.events,u=>faction(u)==='player');}
    events.push(...result.events);
    if (command.type === 'endPhase') {
        r.phase = next.phase;
        beginPhase(next, r, events);
    }
    const participants = new Set<string>();
    for (const event of result.events) {
        if (event.type === 'unit-defeated') {
            const u = s.units.find(u => u.id === event.unitId);
            if (u)
                r.defeated[`${u.id}.${formName(s, u) ?? ''}`] = true;
        }
        if (event.type !== 'attack')
            continue;
        participants.add(event.attackerId);
        participants.add(event.targetId);
        const a = event as RuleAttack, value = r.barriers[event.targetId] ?? 0;
        if (value)
            a.barrier = value >= 100 ? 'immune' : 'reduce';
        if (combo && event.attackerId === combo.lead)
            a.combo = combo.id;
        const copy = configOf(s.stage).units[event.targetId]?.copy;
        if (copy !== undefined) {
            const old = r.copies[event.targetId], order = ['player', 'enemy', 'third'], own = faction(next.units.find(u => u.id === event.targetId)!);
            r.copies[event.targetId] = { weapon: old?.weapon, ammo: old?.ammo, pending: event.weaponId, ready: next.round + (order.indexOf(own) > order.indexOf(phase(input)) ? 0 : 1), last: event.weaponId };
            emit(events, { type: 'v2-notice', unitId: event.targetId, text: `무기 복사 · ${s.content.weapons.find(w => w.id === event.weaponId)?.name ?? event.weaponId}${configOf(s.stage).units[event.targetId]?.copyLine ? '\n' + configOf(s.stage).units[event.targetId].copyLine : ''}` });
        }
    }
    if (result.events.some(e => e.type === 'attack') && combo) {
        const w = s.content.weapons.find(w => w.id === combo.weapon)!;
        for(const [i,id]of comboMembers(combo).entries()){
          const u=next.units.find(u=>u.id===id)!;
          if(i>0)u.en-=combo.costs?.[i]??Math.floor((w.en??0)/2);
          finishAction(next,u,true);
        }
    }
    for (const id of participants) {
        r.battles[id] = (r.battles[id] ?? 0) + 1;
        const threshold = configOf(s.stage).units[id]?.counter;
        if (threshold && r.battles[id] >= threshold.count && !r.fired.includes(id)) {
            r.fired.push(id);
            emit(events, { type: 'v2-scene', scene: threshold.scene });
        }
    }
    if (command.type === 'move') {
        const u = next.units.find(u => u.id === command.unitId)!;
        if (faction(u) === 'player')
            drawGacha(next, r, u, events);
    }
    if(command.type==='system'&&command.action.kind==='join')for(const id of command.action.ids){const u=next.units.find(u=>u.id===id);if(u)u.tags=u.tags?.filter(t=>t!==THIRD);}
    perks(next);transitions(next,r,events);updatePatternAlerts(next,events,r.vars);
    storeRuntime(next, r);
    return { state: next, events };
}
function transitions(s:BattleState,r:Runtime,events:BattleEvent[]):void {
  for(const t of configOf(s.stage).transitions??[]){const key='transition:'+t.id;if(r.fired.includes(key))continue;
    if(t.barrierBroken&&(r.barriers[t.barrierBroken]??100)>0)continue;
    if(t.form){const u=s.units.find(u=>u.id===t.form!.unit);if(!u||u.formId!==t.form.id||t.form.hpPct!==undefined&&u.hp/effectiveMech(s,u).hp>t.form.hpPct/100)continue;}
    r.fired.push(key);applySystem(s,{kind:'spawn',units:t.spawns},events);
  }
}
