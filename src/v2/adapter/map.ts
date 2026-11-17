import {supportWeaponActions} from '../../core/weapon-effects';
import {effectiveMorale} from '../../core/modifiers';
import {prepareRules,rulesProjection,rulesForecast,ruleActions,nextRulesAI,phase,faction,runtime,unitName,setRuleVariable,type RuleEvent} from '../rules/runtime';
import {configOf} from '../rules/config';
import { portraitImages } from '../portrait';
import {terrainImages,type MapTerrain} from '../map/terrain';
import {stageApply,wallProjection} from '../story/stage-core';
/** MapModel의 규칙 구현. 조회는 이동을 가정한 복사본, 확정은 코어 apply만 사용한다. */
import { apply, availableActions, availableWeapons, effectiveMech, effectivePilot, effectiveWeapon,
   mapAttackCommands, mapForecast, responseOptions,  pathTo, reachable, snapshot, spiritProblem, terrainAt, unitById, weaponProblem, weaponRange } from '../../core';
import type { BattleEvent, BattleState, Command as CoreCommand, Mech, Spirit as CoreSpirit, Unit } from '../../core';
import type { Cell, Command, Forecast, MapEvent, MapModel, Team, UnitView } from '../map/model';
import type { Spirit } from '../spirit';
import { battleExchange, type BattleLookup } from './battle';
import {actionsLeft,actionLimit,hasActed,deviceProblem,crewPilot,spiritCost} from '../../core';
import {weaponResources,weaponReason,hitBonus} from './resources';
import {BattleLinePicker} from '../battle/lines';

export interface MapChange { before: BattleState; after: BattleState; command: CoreCommand; events: readonly BattleEvent[] }

export interface MapLookup {
  unitInfo?:{stats?:Record<string,{name:string;desc:string}>};
  variable?:(name:string)=>string|number|boolean;
  terrainFor?(state:BattleState):MapTerrain|undefined;
  aiCommand?(state:BattleState,normal:CoreCommand):CoreCommand;
  defeatReward?(before:BattleState,event:Extract<BattleEvent,{type:'unit-defeated'}>):{name:string;amount:number}|undefined;
  persuadeTargets?:(state:BattleState,unitId:string)=>string[];
  afterCommand?: (change:MapChange)=>{state:BattleState;changes:MapChange[];scenes:string[];beforeScenes?:string[]};
  onChange?(state: BattleState, changes: readonly MapChange[]): void;
  battle: BattleLookup;
  unit(mech: Mech, unit: Unit): Pick<UnitView, 'icon'|'iconCrop'|'iconFit'>;
  terrain?: HTMLImageElement;
  background?: HTMLImageElement;
  /** 스테이지별 전투 배경. 생략하면 기존 background를 쓴다. */
  backgroundFor?(stageId: string): HTMLImageElement | undefined;
  spirit(definition: CoreSpirit): Spirit;
}
const cell = (p: { x: number; y: number }): Cell => ({ col: p.x, row: p.y });
const point = (p: Cell) => ({ x: p.col, y: p.row });
const LABELS: Record<string, string> = { move: '이동', undoMove: '이동 취소', useItem: '강화 파츠', transform: '변형', combine: '합체', split: '분리', persuade: '설득', mapAttack: '맵 병기', spirit: '대상 지정 정신기' };

export class CoreMap implements MapModel {
  private current: BattleState;
  private changedForms=new Set<string>();
  private journal: MapChange[] = [];
  private previews = new Map<string, BattleState>();
  private aimCache=new Map<string,Extract<CoreCommand,{type:'mapAttack'}>[]>();
  constructor(state: BattleState, private readonly lookup: MapLookup,private readonly options:{manualResponse?:boolean}={}) { this.current = prepareRules(structuredClone(state));for(const u of this.current.units)if(u.transformedRound===this.current.round&&!u.acted)this.changedForms.add(u.id);if(options.manualResponse)this.current.options.autoResponse=false; }
  get cols(): number { return this.current.stage.map.w; }
  get rows(): number { return this.current.stage.map.h; }
  get terrain(): HTMLImageElement | undefined { return this.lookup.terrain; }
  terrainPaint():MapTerrain|undefined{return this.lookup.terrainFor?.(this.current);}
  /** 저장에는 코어 snapshot만 쓴다. 어댑터에 별도 난수나 AI 진행 상태는 없다. */
  save(): string { return snapshot(this.current); }
  /** Lightweight presentation snapshot: the map redraw must not clone the whole rules catalog. */
  hintStatus(){const s=this.current;return {stageId:s.stage.id,round:s.round,units:s.units.map(({id,x,y,alive,removed})=>({id,x,y,alive,removed})),pending:[...(s.stage.definitions??[]),...Object.values(s.stage.waves??{}).flat()].map(u=>u.id)};}
  private syncVariables(state=this.current):void {
    if(!this.lookup.variable)return;
    const p=state.stage.aiPatterns,behaviors=[p?.default,...Object.values(p?.units??{}),...(p?.groups??[]).map(g=>g.behavior)];
    const names=new Set([...configOf(state.stage).combos.map(c=>c.flag),...behaviors.flatMap(b=>b?.when?.flatMap(t=>t.variable?[t.variable.name]:[])??[])]);
    for(const name of names)setRuleVariable(state,name,this.lookup.variable(name));
  }
  state(): BattleState { this.syncVariables();return structuredClone(this.current); }
  private team(u: Unit): Team {
    if(faction(u)==='third')return 'third';
    const side = this.lookup.battle.side?.(u) ?? (u.side === 'player' ? 'ally' : u.side === 'enemy' ? 'enemy' : undefined);
    if(u.side==='neutral')return 'neutral';
    if (!side) throw new Error(`neutral 진영 조회가 필요합니다: ${u.id}`);
    return side;
  }
  private view(s: BattleState, u: Unit): UnitView {
    const m = effectiveMech(s, u), p = effectivePilot(s, u), display = this.lookup.battle.pilot(p, u);
    return { ...(s.content.rules.actions?{actionsRemaining:actionsLeft(u),actionsMax:actionLimit(s,u)+(u.extraActionsUsed??0)}:{}),revealed:faction(u)==='player'||!!u.revealed, level:u.level,id: u.id, team: this.team(u), cell: cell(u), name: unitName(s,u), barrier:runtime(s).barriers[u.id]??0, pilot: display.pilot ?? p.name, hp: u.hp, hpMax: m.hp,
      en: u.en, enMax: m.en, heat: effectiveMorale(s,u), acted: u.acted, ...this.lookup.unit(m, u), portrait: display.portrait };
  }
  details(id:string):import('../map/model').UnitDetails {
    const s=rulesProjection(this.current,id),u=unitById(s,id),real=unitById(this.current,id),m=effectiveMech(s,u),p=effectivePilot(s,u),unit=this.view(this.current,real),known=faction(real)==='player'||!!real.revealed;
    const display=this.lookup.battle.pilot(p,real),mech=this.lookup.battle.mech(m,real),value=(v:unknown)=>known?String(typeof v==='number'&&Number.isFinite(v)?Number(v.toFixed(2)):v):'???';
    const adapt=(v:Record<string,string>)=>Object.entries(v).map(([k,v])=>`${({air:'공중',ground:'지상',sea:'수중',space:'우주'} as Record<string,string>)[k]??k} ${value(v)}`).join(' · ');
    const names:Record<string,string>={hp:'HP',en:s.content.terms?.en??'EN',sp:s.content.terms?.sp??'SP',weapons:'무기 위력',melee:'격투',shoot:'사격',hit:'명중',evade:'회피',skill:'기량',defense:'방어',armor:'장갑',mobility:'운동성',move:'이동력',exp:'획득 경험치',credits:'획득 자금',costClass:'비용 등급',partSlots:'파츠 칸',moveType:'이동 유형'};
    Object.assign(names,Object.fromEntries(Object.entries(this.lookup.unitInfo?.stats??{}).map(([id,d])=>[id,d.name])));
    const skills=known?(p.skills??[]).map(ref=>`${s.content.skills?.find(d=>d.id===ref.id)?.name??ref.id}${ref.level?' Lv '+ref.level:''}`):['???'];
    const configuredForms=configOf(this.current.stage).units[id]?.forms??[];
    const formLabel=(f:typeof configuredForms[number])=>{const name=s.content.mechs.find(m=>m.id===f.mech)?.name??f.id;return configuredForms.filter(v=>v.mech===f.mech).length>1?`${name} · ${f.id}`:name;};
    const forms=[...configuredForms.map(formLabel),...(m.forms??[]).map(f=>f.name)];
    const currentForm=configuredForms.find(f=>f.id===real.formId)??configuredForms[0];
    const formTitle=currentForm?formLabel(currentForm):m.forms?.find(f=>f.id===real.formId)?.name??forms[0];
    const upgrades: [string,string][]|undefined=unit.team==='ally'?(['hp','en','armor','mobility','weapons'] as const).map(k=>[k==='weapons'?'무기':names[k],String(real.upgrades?.[k]??0)]):undefined;
    const parts=(real.parts??[]).filter((id):id is string=>!!id).map(id=>s.content.parts?.find(p=>p.id===id)?.name??id);
    const startMorale=Math.max(s.content.rules.morale.min,Math.min(s.content.rules.morale.max,p.startMorale??s.content.rules.morale.start));
    const effects=known?[...(s.content.rules.actions?[`남은 행동 ${actionsLeft(real)} / ${actionLimit(s,u)+(real.extraActionsUsed??0)} · 완료 ${real.actionsSpent??0}`]:[]),...(m.devices??[]).map(d=>`${d.name} ${d.uses===null?'∞':(real.deviceUses?.[d.id]??0)+'/'+d.uses}`),...(real.subPilots??[]).map(sub=>`보조 · ${crewPilot(s,real,sub.pilotId).pilot.name} · ${s.content.terms?.sp??'SP'} ${sub.sp}/${crewPilot(s,real,sub.pilotId).pilot.sp}`),...(unit.team==='ally'?[`장착 파츠 · ${parts.join(' / ')||'없음'}`]:[]),`배리어 ${runtime(this.current).barriers[id]??0}%`,...(forms.length?[`형태 ${formTitle} · ${forms.join(' / ')}`]:[]),...(m.hpRecovery?[`HP 회복 · ${m.hpRecovery.pct??0}% + ${m.hpRecovery.flat??0}`]:[]),...(m.enRecovery?[`${s.content.terms?.en??'EN'} 회복 · ${m.enRecovery.pct??0}% + ${m.enRecovery.flat??0}`]:[]),...real.effects.filter(e=>e.id!=='v2-rules-state').map(e=>{
      const name=[...(s.content.spirits??[]),...(s.content.parts??[]),...(s.content.skills??[]),...s.content.weapons].find(d=>d.id===e.definitionId)?.name??(e.source==='v2-form'?'형태 효과':'효과');
      const labels:Record<string,string>={hitAdd:'명중',evadeAdd:'회피',hitSet:'명중 고정',damageMul:'공격 배율',takenMul:'피해 배율',takenSet:'피해 고정',critSet:'크리티컬',moveAdd:'이동력',rangeAdd:'사거리',moraleAdd:s.content.terms?.morale??'기력',moraleOffset:s.content.terms?.morale??'기력',supportAttack:'원호 공격',supportDefense:'원호 방어',spRegen:'SP 회복',evadeAll:'회피 보장',extraAction:'추가 행동'};
      return name+' · '+(e.atoms??[]).map(a=>(labels[a.type]??'능력 보정')+('value'in a?' '+(typeof a.value==='object'?Object.entries(a.value).map(([k,v])=>`${names[k]??k} ${v}`).join(' · '):a.value):'')).join(', ');
    })]:['???'];
    return {unit,known,tips:known?{stats:Object.fromEntries(Object.entries(names).map(([id,name])=>[name,{id,desc:this.lookup.unitInfo?.stats?.[id]?.desc}])),skills:(p.skills??[]).map(ref=>s.content.skills?.find(d=>d.id===ref.id)?.desc??''),spirits:this.spirits(id).map(d=>({name:d.name,cost:d.cost,desc:d.desc,duration:d.duration,target:d.target,reason:d.reason}))}:undefined,portrait:{...display.portrait,crop:{x:0,y:0,w:1,h:1}},level:value(real.level??1),morale:value(effectiveMorale(s,real)),sp:value(real.sp),spMax:value(p.sp),pilotStats:Object.entries(p.stats).map(([k,v])=>[names[k]??k,value(v)]),pilotAdapt:adapt(p.adapt),skills,
      spirits:known?this.spirits(id).map(d=>({name:d.pilotId&&d.pilotId!==u.pilotId?`${d.pilot} · ${d.name}`:d.name,cost:String(d.cost),usable:d.usable})):[{name:'???',cost:'???',usable:false}],
      mech:{...mech,upgrades,stats:Object.entries(m).filter(([k,v])=>typeof v==='number'&&!['hp','en','cheerHp',...(unit.team!=='enemy'?['exp','credits','costClass']:[])].includes(k)).map(([k,v]):[string,string]=>[names[k]??k,value(v)]).concat([['이동 유형',known?m.moveType.map(v=>({air:'공중',ground:'지상',sea:'수중',space:'우주'})[v]).join('/'):'???']]),size:value(m.size),adapt:adapt(m.adapt),hp:known?real.hp:0,hpMax:known?m.hp:0,en:known?real.en:0,enMax:known?m.en:0},effects,
      weapons:known?m.weapons.map(id=>{const w=effectiveWeapon(s,u,s.content.weapons.find(w=>w.id===id)!);return{reason:weaponReason(s,weaponProblem(s,u,w)),name:w.name,power:String(w.power),range:w.range.join('–'),hit:hitBonus(w.hit)||'0',critical:String(w.crit),cost:w.ammo!==undefined?`잔탄 ${u.ammo[id]??0}/${w.ammo}`:(w.en??0)>0?`${s.content.terms?.en??'EN'} ${w.en}`:'무소모',traits:[({melee:'격투',shoot:'사격',beam:'빔',missile:'미사일',map:'맵 병기'})[w.kind],w.postMove?'이동 후 가능':'이동 전',w.moraleReq&&w.moraleReq>startMorale?(s.content.terms?.morale??'기력')+' '+w.moraleReq:'',w.special?w.special.label.replaceAll('{en}',s.content.terms?.en??'EN'):'',w.map?`${({burst:'주위',line:'직선',area:'지역'})[w.map.shape]} ${w.map.size}`:'',adapt(w.adapt)].filter(Boolean).join(' · ')};}):[{name:'???',power:'???',range:'???',hit:'???',critical:'???',cost:'???',traits:'???'}]};
  }
  images(): (HTMLImageElement|undefined)[] {const paint=this.terrainPaint();return [...(paint?terrainImages(paint):[this.lookup.terrain]),this.lookup.backgroundFor?.(this.current.stage.id)??this.lookup.background,...this.current.units.flatMap(u=>{const m=effectiveMech(this.current,u),p=effectivePilot(this.current,u);return [this.lookup.unit(m,u).icon,this.lookup.battle.mech(m,u).image,...portraitImages(this.lookup.battle.pilot(p,u).portrait)];})];}
  turn(): { team: Team; number: number } { return { team: phase(this.current)==='third'?'third':this.current.phase === 'player' ? 'ally' : 'enemy', number: this.current.round }; }
  units(): UnitView[] { return this.current.units.filter(u => u.alive && !u.removed).map(u => this.view(this.current, u)); }
  terrainAt(at: Cell) { const t = terrainAt(this.current, point(at)); return { name: t.name, defense: -t.damageMod, evade: -t.hitMod }; }
  reach(id: string): Cell[] {this.syncVariables();return reachable(wallProjection(rulesProjection(this.current,id)), id).map(cell); }
  blockedCells():Cell[]{return runtime(this.current).blocked.map(v=>{const [col,row]=v.split(',').map(Number);return {col,row};});}
  route(id: string, at: Cell): Cell[] { return (pathTo(wallProjection(rulesProjection(this.current,id)), id, point(at)) ?? []).map(cell); }
  private preview(id: string, at: Cell): BattleState {
    this.syncVariables();const key = `${id}:${at.col},${at.row}`;
    let state = this.previews.get(key);
    if (!state) {
      const u = unitById(this.current, id);
      state = u.x === at.col && u.y === at.row ? this.current : stageApply(this.current, { type: 'move', unitId: id, ...point(at) }).state;
      this.previews.set(key, state);
    }
    return state;
  }
  commands(id: string, at: Cell): Command[] {
    const s = this.preview(id, at), menuState=structuredClone(s);unitById(menuState,id).acted=false;
    const actions = ruleActions(menuState, id), result: Command[] = [];
    const spirits = actions.filter(c => c.type === 'spirit');
    result.push({ id: 'attack', label: '공격', disabled: !actions.some(c => c.type === 'attack') });
    result.push({ id: 'spirit', label: '정신기', disabled: !spirits.length });
    if(actions.some(c=>c.type==='mapAttack'))result.push({id:'mapAttack',label:'맵 병기'});
    result.push({ id: 'wait', label: '대기', disabled: !actions.some(c => c.type === 'wait') });
    for(const [type,label]of [['transform','변형'],['combine','합체'],['split','분리']] as const)if(actions.some(c=>c.type===type)||type==='transform'&&configOf(s.stage).units[id]?.forms?.length){const blocked=!actions.some(c=>c.type===type);result.push({id:type,label:(type==='transform'&&configOf(s.stage).units[id]?.forms?'폼 체인지':label)+(blocked&&unitById(s,id).moved?' · 이동 후 불가':''),disabled:blocked});}
    for(const d of effectiveMech(s,unitById(s,id)).devices??[])result.push({id:'device:'+d.id,label:`${d.name} · ${d.uses===null?'∞':(unitById(s,id).deviceUses?.[d.id]??0)+'/'+d.uses}`,disabled:!actions.some(c=>c.type==='device'&&c.deviceId===d.id)});
    for(const c of actions)if(c.type==='useItem')result.push({id:'item:'+c.slot,label:s.content.parts?.find(p=>p.id===unitById(s,id).parts?.[c.slot])?.name??'회복 파츠'});
    // 아직 화면이 다루지 않는 코어 명령만 비활성 항목으로 남긴다.
    for(const c of supportWeaponActions(rulesProjection(s,id),id))result.push({id:'weaponSkill:'+c.weaponId,label:s.content.weapons.find(w=>w.id===c.weaponId)!.name});
    const extras = new Map<string, Command>();
    for (const c of actions) {
      if (c.type==='weaponSkill'||c.type==='device'||c.type==='useItem'||c.type === 'attack' || c.type === 'wait' || c.type === 'spirit'||c.type==='mapAttack'||c.type==='transform'||c.type==='combine'||c.type==='split') continue;
      const detail = 'formId' in c ? c.formId : 'combinationId' in c ? c.combinationId : 'weaponId' in c ? c.weaponId : 'slot' in c ? String(c.slot) : '';
      const key = `${c.type}${detail ? ':' + detail : ''}`;
      extras.set(key, { id: key, label: `${LABELS[c.type] ?? c.type}${detail ? ' · ' + detail : ''}`, disabled: true });
    }
    if(this.persuadeTargets(id,at).length)result.push({id:'persuade',label:'설득'});
    result.push(...extras.values());
    result.push({id:'inspect',label:'능력 보기'});
    if(unitById(s,id).acted)for(const c of result)if(c.id!=='inspect'&&!(c.id==='spirit'&&s.content.options?.spiritAfterAction&&ruleActions(s,id).some(a=>a.type==='spirit')))c.disabled=true;
    return result;
  }
  range(id: string, at: Cell): Cell[] {
    const s = rulesProjection(this.preview(id, at),id), cells = new Map<string, Cell>();
    for (const w of availableWeapons(s, id).filter(w => !w.map)) for (const p of weaponRange(s, id, w.id)) cells.set(`${p.x},${p.y}`, cell(p));
    return [...cells.values()];
  }
  targets(id: string, at: Cell): string[] {
    const s = this.preview(id, at);
    return [...new Set(ruleActions(s, id).filter(c => c.type === 'attack').map(c => c.targetId))];
  }
  weapons(id: string, at: Cell, targetId: string) {
    const s = rulesProjection(this.preview(id, at),id,targetId), u = unitById(s, id), d = unitById(s, targetId), m = effectiveMech(s, u);
    const active = availableActions(s, id).some(c => c.type === 'wait');
    return m.weapons.map(weaponId => {
      const raw = s.content.weapons.find(w => w.id === weaponId)!, w = effectiveWeapon(s, u, raw);
      return { id: w.id, name: w.name, power: w.power, range: w.range.join('–'), cost: w.en ?? 0, resources:weaponResources(s,u,w),reason:weaponReason(s,weaponProblem(s,u,raw,d)),usable: active && !weaponProblem(s, u, raw, d) };
    });
  }
  forecast(id: string, at: Cell, weaponId: string, targetId: string): Forecast {
    const s = this.preview(id, at);
    const f = rulesForecast(s, id, targetId, weaponId), name = (id: string) => s.content.weapons.find(w => w.id === id)!.name;
    // expectedDamage는 코어가 계산한 명중·크리티컬 포함 기대 피해다. 화면의 정수 표시에만 반올림한다.
    return { attacker: { unitId: id, weapon: name(weaponId),resources:weaponResources(s,unitById(s,id),s.content.weapons.find(w=>w.id===weaponId)!), hit: f.hitRate, damage: Math.round(f.expectedDamage), critical: f.critRate },
      defender: { unitId: targetId, ...(f.counter && f.response.type === 'counter' ? { weapon: name(f.response.weaponId), resources:weaponResources(s,unitById(s,targetId),s.content.weapons.find(w=>w.id===(f.response as {weaponId:string}).weaponId)!),hit: f.counter.hitRate, damage: Math.round(f.counter.expectedDamage), critical: f.counter.critRate } : {}) } };
  }
  spirits(id: string) {
    const s=this.current,u=unitById(s,id);
    return [undefined,...(u.subPilots??[]).map(p=>p.pilotId)].flatMap(pilotId=>{
      const crew=crewPilot(s,u,pilotId);
      return (crew.pilot.spirits??[]).filter(ref=>ref.level<=crew.level).map(ref=>{
        const d=s.content.spirits!.find(d=>d.id===ref.id)!,key=pilotId?pilotId+'::'+d.id:d.id;
        const targeted=!['self','allAllies'].includes(d.target),targets=targeted?this.spiritTargets(id,key):[],cost=spiritCost(s,u,d.id,pilotId);
        const problem=spiritProblem(s,id,d.id,targets[0],pilotId);
        const reason=(s.content.rules.actions?hasActed(u):u.acted)&&!s.content.options?.spiritAfterAction?'행동 후 사용 불가':crew.pool.sp<cost?`${s.content.terms?.sp??'SP'} 부족 · 사용 불가`:targeted&&!targets.length?'대상 없음 · 사용 불가':problem?(problem==='spirit already active'?'이미 적용 중 · 사용 불가':problem.includes('round limit')?'이번 턴 사용 완료 · 사용 불가':'현재 사용 불가'):undefined;
        return {id:key,name:d.name,cost,desc:d.desc,duration:d.duration,target:d.target,reason,targeted,usable:!reason,pilotId:crew.pilot.id,pilot:crew.pilot.name,sp:crew.pool.sp,spMax:crew.pilot.sp};
      });
    });
  }
  /** 스크립트의 증원·강제 이동도 같은 변환 경로를 쓴다. 화면에 직접 노출하는 명령은 아니다. */
  execute(command: CoreCommand): MapEvent[] { return this.transaction(s => this.step(s, command)); }
  private transaction(run: (s: BattleState) => { state: BattleState; events: MapEvent[] }): MapEvent[] {
    this.syncVariables();this.journal = [];
    let result: { state: BattleState; events: MapEvent[] };
    try { result = run(this.current); } catch (error) { this.journal = []; throw error; }
    this.current = result.state; this.previews.clear();this.aimCache.clear(); this.lookup.onChange?.(this.state(), this.journal); this.journal = []; return result.events;
  }
  private step(before: BattleState, command: CoreCommand): { state: BattleState; events: MapEvent[] } {
    const result = stageApply(before, command);
    const change={before,after:result.state,command,events:result.events};this.journal.push(change);
    const extra=this.lookup.afterCommand?.(change);const events:MapEvent[]=[...(extra?.beforeScenes??[]).map(scene=>({type:'story' as const,scene})),...this.convert(before,result.state,result.events,command)];
    if(extra){for(const c of extra.changes){this.journal.push(c);events.push(...this.convert(c.before,c.after,c.events,c.command));}const end=events.findIndex(e=>e.type==='end');events.splice(end<0?events.length:end,0,...extra.scenes.map(scene=>({type:'story' as const,scene})));}
    return {state:extra?.state??result.state,events};
  }
  private convert(before: BattleState, after: BattleState, events: readonly BattleEvent[],command?:CoreCommand): MapEvent[] {
    for(const e of events)if(e.type==='transform')this.changedForms.add(e.unitId);
    const out: MapEvent[] = [], hasBattle = events.some(e => e.type === 'attack'); let played = false;
    for (const e of events) {
      if (hasBattle && !played && ['response', 'support', 'attack', 'map-attack'].includes(e.type)) {
        const area=command?.type==='mapAttack'?mapForecast(rulesProjection(before,command.unitId,undefined,command.weaponId),command.unitId,command.weaponId,command.point,command.direction).cells:undefined;
        const exchange = battleExchange(before, events, this.lookup.battle, {changedForms:this.changedForms, area,background: this.lookup.backgroundFor?.(before.stage.id)??this.lookup.background });
        const rewards=new Map<string,number>();for(const e of events)if(e.type==='unit-defeated'){const reward=this.lookup.defeatReward?.(before,e);if(reward)rewards.set(reward.name,(rewards.get(reward.name)??0)+reward.amount);}if(rewards.size)exchange.rewards=[...rewards].map(([name,amount])=>({name,amount}));
        const earned=events.filter(e=>('unitId'in e)&&before.units.find(u=>u.id===e.unitId)?.side==='player');exchange.settlement={exp:earned.reduce((n,e)=>n+(e.type==='exp-gained'?e.amount:0),0),credits:earned.reduce((n,e)=>n+(e.type==='credits-gained'?e.amount:0),0),levels:earned.flatMap(e=>e.type==='level-up'?[{name:before.content.pilots.find(p=>p.id===(e.pilotId??before.units.find(u=>u.id===e.unitId)?.pilotId))?.name??e.unitId,from:e.from,to:e.to}]:[])};
        if (events.some(e => e.type === 'map-attack')) exchange.strikes.forEach((s, i) => { if (i) s.weapon.cost = 0; });
        out.push({ type: 'battle', exchange });for(const e of events)if(e.type==='attack')this.changedForms.delete(e.attackerId);played = true;
      }
      const v=e as unknown as RuleEvent;if(v.type==='v2-passage'){out.push({type:'passage',cells:v.cells.map(p=>{const[col,row]=p.split(',').map(Number);return {col,row};})});continue;}if(v.type==='v2-notice'){if(v.unitId)out.push(this.changed(after,v.unitId));out.push({type:'notice',text:v.text,unitId:v.unitId});continue;}if(v.type==='v2-form')continue;if(v.type==='v2-phase'){out.push({type:'phase',team:'third',turn:v.round});continue;}
      switch (e.type) {
        case 'weapon-effect':if(!hasBattle){out.push(this.changed(after,e.targetId),{type:'notice',unitId:e.targetId,text:e.label.replaceAll('{en}',before.content.terms?.en??'EN')+(e.amount!==undefined?' +'+e.amount:''),sound:'gauge'});}break;
        case 'transform':case 'combine':case 'split':out.push(this.changed(after,e.unitId));break;
        case 'persuade':out.push({type:'look',cell:cell(unitById(after,e.targetId))});break;
        case 'pending-response':if(this.options.manualResponse)out.push({type:'look',cell:cell(unitById(after,e.targetId))},{type:'response'});break;
        case 'move':
          if (faction(unitById(before, e.unitId)) !== 'player') out.push({ type: 'look', cell: cell(e.path[0]) });
          out.push({ type: 'move', unitId: e.unitId, path: e.path.map(cell) }); break;
        case 'unit-defeated': out.push({ type: 'defeat', unitId: e.unitId,...(this.lookup.defeatReward?{reward:this.lookup.defeatReward(before,e)}:{}) }); break;
        case 'phase-start': if(!(phase(after)==='third'&&e.phase==='enemy'))out.push({ type: 'phase', team: e.phase === 'player' ? 'ally' : 'enemy', turn: e.round }); break;
        case 'outcome': out.push({ type: 'end', won: e.outcome === 'victory' }); break;
        case 'device':{
          const line=this.supportSpeech(before,e.unitId,e.kind);if(line)out.push(line);
          out.push({type:'notice',sound:e.kind==='repair'?'gauge':'servo',unitId:e.targetId,text:`${before.content.mechs.find(m=>m.id===unitById(before,e.unitId).mechId)?.devices?.find(d=>d.id===e.deviceId)?.name??e.kind} · 잔여 ${e.remaining??'∞'}`});break;
        }
        case 'spirit': {
          const def = before.content.spirits!.find(d => d.id === e.spiritId)!;
          const kind=def.effects.some(a=>a.type==='resupply')?'resupply':def.effects.some(a=>a.type==='hpRestore')?'repair':undefined;
          if(kind){const line=this.supportSpeech(before,e.unitId,kind,e.pilotId);if(line)out.push(line);}
          for (const id of e.targetIds) out.push({ type: 'spirit', unitId: id, spirit: this.lookup.spirit(def) });
          break;
        }
        case 'system':
          if(e.action.kind==='join'&&e.ids[0])out.push(this.changed(after,e.ids[0]));
          if(e.action.kind==='retreat'||e.action.kind==='leave')for(const id of e.ids)out.push({type:'defeat',unitId:id});
          if (e.action.kind === 'spawn' || e.action.kind === 'reinforce') for (const id of e.ids) out.push({ type: 'spawn', unit: this.view(after, unitById(after, id)) });
          break;
      }
    }
    if(command?.type==='weaponSkill'){const line=this.supportSpeech(before,command.unitId,'attack',undefined,this.lookup.battle.lineWeapon?.(command.weaponId)??command.weaponId);if(line)out.unshift(line);}
    for(const id of new Set(events.filter((e):e is Extract<BattleEvent,{type:'attack'}>=>e.type==='attack'&&e.hit).map(e=>e.targetId))){const u=unitById(after,id),m=effectiveMech(after,u);if(u.alive&&m.cheerHp!==undefined&&u.hp/m.hp<m.cheerHp)for(const sub of u.subPilots??[]){const line=this.supportSpeech(before,id,'cheer',sub.pilotId);if(line)out.push(line);}}
    // Each committed command has its own presentation snapshot. Never read the
    // already advanced whole-turn model while replaying an earlier recovery.
    const gains=after.units.flatMap(u=>{const old=before.units.find(v=>v.id===u.id);if(!old||!u.alive||u.removed)return [];
      const recover=events.filter((e):e is Extract<BattleEvent,{type:'recover'}>=>e.type==='recover'&&e.unitId===u.id);
      const hp=Math.max(0,recover.length?recover.reduce((n,e)=>n+e.hp,0):u.hp-old.hp),en=Math.max(0,recover.length?recover.reduce((n,e)=>n+e.en,0):u.en-old.en),ammo=Object.entries(u.ammo).some(([id,n])=>n>(old.ammo[id]??0));
      return hp||en||ammo?[{unitId:u.id,hp,en,ammo}]:[];});
    const boundary=out.findIndex(e=>e.type==='phase'||e.type==='end');out.splice(boundary<0?out.length:boundary,0,{type:'status',units:after.units.filter(u=>u.alive&&!u.removed).map(u=>this.view(after,u)),gains});
    return out;
  }
  private supportSpeech(s:BattleState,id:string,kind:'resupply'|'repair'|'cheer'|'attack',pilotId?:string,weapon?:string):MapEvent|undefined {
    const u=unitById(s,id),crew=crewPilot(s,u,pilotId),actor={...u,pilotId:crew.pilot.id},line=new BattleLinePicker(s.rng).pick(this.lookup.battle.battleLines?.(actor,crew.pilot),kind,weapon,undefined,{form:u.formId??configOf(s.stage).units[id]?.forms?.[0]?.id,mech:u.mechId});
    if(!line)return;return {type:'speech',name:crew.pilot.name,portrait:this.lookup.battle.pilot(crew.pilot,actor).portrait,text:this.lookup.battle.text?.(line.text)??line.text,mood:line.mood??'default'};
  }
  private moved(s: BattleState, id: string, at: Cell) {
    const u = unitById(s, id);
    return u.x === at.col && u.y === at.row ? { state: s, events: [] as MapEvent[] } : this.step(s, { type: 'move', unitId: id, ...point(at) });
  }
  private commit(id: string, at: Cell, command: CoreCommand): MapEvent[] {
    return this.transaction(s => {
      const move = this.moved(s, id, at);if(move.state.outcome)return move;const action = this.step(move.state, command);
      return { state: action.state, events: [...move.events, ...action.events] };
    });
  }
  wait(id: string, at: Cell): MapEvent[] { return this.commit(id, at, { type: 'wait', unitId: id }); }
  attack(id: string, at: Cell, weaponId: string, targetId: string): MapEvent[] { return this.commit(id, at, { type: 'attack', unitId: id, targetId, weaponId }); }
  transformations(id:string,at:Cell):import('../map/model').UnitAction[]{const s=this.preview(id,at),base=s.content.mechs.find(m=>m.id===unitById(s,id).mechId)!;return ruleActions(s,id).flatMap(c=>c.type==='transform'?[{id:c.formId,label:base.forms?.find(f=>f.id===c.formId)?.name??'변형'}]:[]);}
  combinations(id:string,at:Cell):import('../map/model').UnitAction[]{const s=this.preview(id,at);return availableActions(s,id).flatMap(c=>c.type==='combine'?[{id:c.combinationId,label:s.content.mechs.find(m=>m.id===s.content.combinations?.find(d=>d.id===c.combinationId)?.result)?.name??'합체'}]:[]);}
  transform(id:string,at:Cell,formId:string):MapEvent[]{return this.commit(id,at,{type:'transform',unitId:id,formId});}
  combine(id:string,at:Cell,combinationId:string):MapEvent[]{return this.commit(id,at,{type:'combine',unitId:id,combinationId});}
  split(id:string,at:Cell):MapEvent[]{return this.commit(id,at,{type:'split',unitId:id});}
  private changed(s:BattleState,id:string):MapEvent{return {type:'change',units:s.units.filter(u=>u.alive&&!u.removed).map(u=>this.view(s,u)),focus:cell(unitById(s,id))};}
  persuadeTargets(id:string,at:Cell):string[]{const s=this.preview(id,at),allowed=this.lookup.persuadeTargets?.(s,id);return s.units.filter(u=>{if(allowed&&!allowed.includes(u.id))return false;try{apply(s,{type:'persuade',unitId:id,targetId:u.id});return true;}catch{return false;}}).map(u=>u.id);}
  persuade(id:string,at:Cell,targetId:string):MapEvent[]{if(!this.persuadeTargets(id,at).includes(targetId))throw new Error('설득할 수 없는 대상');return this.commit(id,at,{type:'persuade',unitId:id,targetId});}
  weaponSkill(id:string,at:Cell,weaponId:string):MapEvent[]{return this.commit(id,at,{type:'weaponSkill',unitId:id,weaponId});}
  deviceTargets(id:string,at:Cell,deviceId:string):string[]{const s=this.preview(id,at);return s.units.filter(v=>!deviceProblem(rulesProjection(s,id),id,deviceId,v.id)).map(v=>v.id);}
  device(id:string,at:Cell,deviceId:string,targetId:string):MapEvent[]{return this.commit(id,at,{type:'device',unitId:id,deviceId,targetId});}
  item(id:string,at:Cell,slot:number):MapEvent[]{return this.commit(id,at,{type:'useItem',unitId:id,slot});}
  private aimCommands(id:string,at:Cell,weaponId:string){const key=`${id}:${at.col},${at.row}:${weaponId}`;let result=this.aimCache.get(key);if(!result){result=mapAttackCommands(this.preview(id,at),id).filter(c=>c.weaponId===weaponId);this.aimCache.set(key,result);}return result;}
  private aimId(c:Extract<CoreCommand,{type:'mapAttack'}>):string{return c.direction??(c.point?`${c.point.x},${c.point.y}`:'burst');}
  mapWeapons(id:string,at:Cell){const s=this.preview(id,at),u=unitById(s,id);return effectiveMech(s,u).weapons.map(w=>effectiveWeapon(s,u,s.content.weapons.find(d=>d.id===w)!)).filter(w=>w.map).map(w=>({id:w.id,name:w.name,power:w.power,range:w.range.join('–'),cost:w.en??0,resources:weaponResources(s,u,w),reason:weaponReason(s,weaponProblem(s,u,w)),usable:this.aimCommands(id,at,w.id).length>0}));}
  mapAims(id:string,at:Cell,weaponId:string):import('../map/model').MapAim[]{const labels={up:'위쪽',left:'왼쪽',right:'오른쪽',down:'아래쪽'};return this.aimCommands(id,at,weaponId).map(c=>({id:this.aimId(c),label:c.direction?labels[c.direction]:c.point?`${c.point.x}, ${c.point.y}`:'자기 주위',...(c.point?{cell:cell(c.point)}:{})}));}
  mapPreview(id:string,at:Cell,weaponId:string,aimId:string):import('../map/model').MapPreview{const c=this.aimCommands(id,at,weaponId).find(c=>this.aimId(c)===aimId);if(!c)throw new Error('유효하지 않은 맵 병기 조준');const p=mapForecast(rulesProjection(this.preview(id,at),id,undefined,weaponId),id,weaponId,c.point,c.direction);return {cells:p.cells.map(cell),targets:p.targets.map(t=>({unitId:t.unitId,damage:Math.round(t.expectedDamage),hit:t.hitRate,friendly:t.friendly})),friendlyFire:p.friendlyFire};}
  mapAttack(id:string,at:Cell,weaponId:string,aimId:string):MapEvent[]{const c=this.aimCommands(id,at,weaponId).find(c=>this.aimId(c)===aimId);if(!c)throw new Error('유효하지 않은 맵 병기 조준');return this.commit(id,at,c);}
  spiritTargets(id:string,spiritId:string):string[]{const [pilotId,actual]=spiritId.includes('::')?spiritId.split('::'):[undefined,spiritId];return this.current.units.filter(u=>!spiritProblem(rulesProjection(this.current,id),id,actual!,u.id,pilotId)).map(u=>u.id);}
  cast(id:string,spiritId:string,targetId?:string):MapEvent[]{const [pilotId,actual]=spiritId.includes('::')?spiritId.split('::'):[undefined,spiritId];return this.execute({type:'spirit',unitId:id,spiritId:actual!,...(pilotId?{pilotId}:{}),...(targetId?{targetId}:{})});}
  response():import('../map/model').ResponsePrompt|undefined {
    const s=this.current,p=s.pending;if(!p)return;
    const name=(id:string)=>s.content.weapons.find(w=>w.id===id)!.name;
    return {attacker:this.view(s,unitById(s,p.attackerId)),defender:this.view(s,unitById(s,p.targetId)),choices:responseOptions(rulesProjection(s,p.attackerId,p.targetId,p.weaponId)).map(r=>{const f=rulesForecast(s,p.attackerId,p.targetId,p.weaponId,r);return {id:r.type==='counter'?`counter:${r.weaponId}`:r.type,label:r.type==='counter'?`반격 · ${name(r.weaponId)}`:r.type==='defend'?'방어':'회피',forecast:{attacker:{unitId:p.attackerId,weapon:name(p.weaponId),resources:weaponResources(s,unitById(s,p.attackerId),s.content.weapons.find(w=>w.id===p.weaponId)!),hit:f.hitRate,damage:Math.round(f.expectedDamage),critical:f.critRate},defender:{unitId:p.targetId,...(f.counter&&r.type==='counter'?{weapon:name(r.weaponId),resources:weaponResources(s,unitById(s,p.targetId),s.content.weapons.find(w=>w.id===r.weaponId)!),hit:f.counter.hitRate,damage:Math.round(f.counter.expectedDamage),critical:f.counter.critRate}:{})}}};})};
  }
  respond(id:string):MapEvent[]{const p=this.response();if(!p?.choices.some(c=>c.id===id))throw new Error('선택할 수 없는 대응입니다.');return this.execute({type:'respond',response:id.startsWith('counter:')?{type:'counter',weaponId:id.slice(8)}:{type:id as 'defend'|'evade'}});}
  private advanceAI(state:BattleState):{state:BattleState;events:MapEvent[]} {
    let result={state,events:[] as MapEvent[]},count=0;const events:MapEvent[]=[];
    while(!result.state.outcome&&(phase(result.state)!=='player'||result.state.pending)){
      if(this.options.manualResponse&&result.state.pending)break;
      if(++count>10000)throw new Error('코어 AI가 적 페이즈를 끝내지 못했습니다.');
      this.syncVariables(result.state);
      const normal=nextRulesAI(result.state);if(!normal)break;const command=this.lookup.aiCommand?.(result.state,normal)??normal;
      result=this.step(result.state,command);events.push(...result.events);
    }return {state:result.state,events};
  }
  continueTurn():MapEvent[]{if(this.current.pending)throw new Error('대응을 먼저 고르세요.');return this.transaction(s=>this.advanceAI(s));}
  endTurn(): MapEvent[] {
    if (this.current.phase !== 'player' || this.current.pending) throw new Error('아군 페이즈에서만 턴을 종료할 수 있습니다.');
    return this.transaction(s=>{const start=this.step(s,{type:'endPhase'}),next=this.advanceAI(start.state);return {state:next.state,events:[...start.events,...next.events]};});
  }
}
