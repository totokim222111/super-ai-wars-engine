import {formName,faction,unitName,type RuleAttack} from '../rules/runtime';
import {BattleLinePicker,type BattleLines,type ComboDialogue} from '../battle/lines';
import {configOf} from '../rules/config';
/**
 * 계산이 끝난 코어 이벤트 → 연출 자료. I/O나 전투 난수 소비, 콘텐츠 import가 없다.
 * before는 공격 전 상태, events는 한 교전의 전체 이벤트(response/support 포함).
 * resolve()를 직접 불러 response 이벤트가 없다면 options.response로 당시 선택을 준다.
 */
import { effectiveMech, unitById } from '../../core';
import type { BattleEvent, BattleState, Mech, Pilot, Response, Unit, Weapon as CoreWeapon } from '../../core';
import type { Exchange, Fighter, Lines, Side, Strike, Weapon } from '../battle/types';

export interface BattleLookup {
  mech(mech: Mech, unit: Unit): Pick<Fighter, 'height' | 'faces' | 'image' | 'anchors'>;
  /** 공용 무인 파일럿은 표시 이름만 기체의 cast 이름으로 덮을 수 있다. */
  pilot(pilot: Pilot, unit: Unit): Pick<Fighter, 'portrait' | 'cutin'> & { pilot?: string };
  weapon(weapon: CoreWeapon, unit: Unit): Pick<Weapon, 'anim' | 'cutin' | 'video'>;
  /** neutral 등 콘텐츠 팩의 진영 정책. 기본 player→ally, enemy→enemy; neutral은 필수. */
  side?(unit: Unit): Side;
  castId?(unit:Unit,pilot:Pilot):string;
  lineWeapon?:(id:string)=>string;
  battleLines?(unit:Unit,pilot:Pilot):BattleLines|undefined;
  text?(text:string):string;
  comboDialogue?(id:string):ComboDialogue|undefined;
  lines?(event: Extract<BattleEvent, { type: 'attack' }>): Lines | undefined;
}

export interface BattleOptions {
  background?: Exchange['background'];
  area?:Exchange['area'];
  changedForms?:ReadonlySet<string>;
  response?: { unitId: string; response: Response };
}

export function battleExchange(before: BattleState, events: readonly BattleEvent[], lookup: BattleLookup, options: BattleOptions = {}): Exchange {
  const picker=new BattleLinePicker(before.rng),hp=new Map(before.units.map(u=>[u.id,u.hp]));
  const responses = new Map<string, Response>();
  if (options.response) responses.set(options.response.unitId, options.response.response);
  // response는 apply가 resolve 앞에 붙인다. 부가 이벤트의 순서에 의존하지 않는다.
  for (const e of events) if (e.type === 'response') responses.set(e.unitId, e.response);
  let support: Extract<BattleEvent, { type: 'support' }> | undefined;
  const strikes: Strike[] = [];
  for (const e of events) {
    if (e.type === 'support') { support = e; continue; }
    if (e.type !== 'attack') continue;
    const cover = support?.kind === 'defense' && support.unitId === e.targetId ? support : undefined;
    const helper = support?.kind === 'attack' && support.unitId === e.attackerId ? support : undefined;
    const unit = unitById(before, e.attackerId), weapon = before.content.weapons.find(w => w.id === e.weaponId);
    if (!weapon) throw new Error(`없는 코어 무기: ${e.weaponId}`);
    const defender=unitById(before,e.targetId),pilot=(u:Unit)=>before.content.pilots.find(p=>p.id===u.pilotId)!;
    const left=Math.max(0,(hp.get(defender.id)??0)-e.hpDamage);hp.set(defender.id,left);
    const guard=!!cover || !e.counter && !helper && responses.get(e.targetId)?.type === 'defend';
    const cast=(u:Unit)=>lookup.castId?.(u,pilot(u))??u.pilotId;
    const pick=(u:Unit,situation:Parameters<BattleLinePicker['pick']>[1],other:Unit)=>{const line=picker.pick(lookup.battleLines?.(u,pilot(u)),situation,lookup.lineWeapon?.(e.weaponId)??e.weaponId,cast(other),{form:formName(before,u)??u.formId,mech:effectiveMech(before,u).id,formChanged:options.changedForms?.has(u.id)});return line?{...line,text:lookup.text?.(line.text)??line.text}:undefined;};
    const animation=lookup.weapon(weapon,unit);
    const lines:Lines=lookup.lines?.(e)??{
      before:pick(unit,animation.cutin||animation.anim.template==='finisher'?'finisher':'attack',defender),
      ...(!e.hit?{dodge:pick(defender,'dodge',unit)}:left===0?{lastWords:pick(defender,'defeated',unit),after:pick(unit,'victory',defender)}:{reaction:pick(defender,guard?'guard':left/effectiveMech(before,defender).hp<=.25||e.hpDamage/effectiveMech(before,defender).hp>=.3?'hitHeavy':'hitLight',unit)}),
    };
    strikes.push({
      effects:events.flatMap(v=>v.type==='weapon-effect'&&v.unitId===e.attackerId&&v.weaponId===e.weaponId?[{targetId:v.targetId,text:v.label.replaceAll('{en}',before.content.terms?.en??'EN')+(v.amount!==undefined?' '+(v.kind==='drain'?'−':'+')+v.amount:'')}]:[]),
      attacker: e.attackerId, target: cover?.targetId ?? e.targetId,
      ...(cover ? { cover: cover.unitId } : {}),
      weapon: { id:weapon.id,kind:weapon.map?'map':weapon.kind,name: weapon.name, cost: weapon.en ?? 0, ...animation },
      outcome: { hit: e.hit, damage: e.hpDamage, critical: e.critical,
        barrier:(e as RuleAttack).barrier, guard },
      ...(helper ? { banner: '원호 공격' } : e.counter ? { banner: '반격' } : {}),
      ...(Object.values(lines).some(Boolean)?{lines}:{}),
    });
    const combo=(e as RuleAttack).combo?configOf(before.stage).combos.find(c=>c.id===(e as RuleAttack).combo):undefined;if(combo){const p=unitById(before,combo.partner),m=effectiveMech(before,p),pilot=before.content.pilots.find(a=>a.id===p.pilotId)!;strikes[strikes.length-1].combo={partner:{id:p.id,side:'ally',name:unitName(before,p),pilot:pilot.name,hp:p.hp,hpMax:m.hp,en:p.en,enMax:m.en,...lookup.mech(m,p),...lookup.pilot(pilot,p)},line:combo.line};
      const dialogue=lookup.comboDialogue?.(combo.id);if(dialogue){const castOf=(u:Unit)=>lookup.castId?.(u,before.content.pilots.find(p=>p.id===u.pilotId)!)??u.pilotId;
       const allowed=dialogue.binding!.participants,steps=[...dialogue.participants,dialogue.finish].flatMap(row=>{if(!allowed.includes(row.cast))return [];const u=before.units.find(u=>u.alive&&!u.removed&&castOf(u)===row.cast);if(!u)return [];const m=effectiveMech(before,u),pilot=before.content.pilots.find(p=>p.id===u.pilotId)!;return [{fighter:{id:u.id,side:'ally' as const,name:unitName(before,u),pilot:pilot.name,hp:u.hp,hpMax:m.hp,en:u.en,enMax:m.en,...lookup.mech(m,u),...lookup.pilot(pilot,u)},line:{...row.speech,text:lookup.text?.(row.speech.text)??row.speech.text}}];});strikes[strikes.length-1].combo!.dialogue=steps;if(steps.length&&strikes[strikes.length-1].lines)delete strikes[strikes.length-1].lines!.before;
      }
    }
    support = undefined;
  }
  const ids = [...new Set(strikes.flatMap(s => [s.attacker, s.target, ...(s.cover ? [s.cover] : [])]))];
  const first=strikes.length?unitById(before,strikes[0].attacker):undefined;
  const hasThird=ids.some(id=>faction(unitById(before,id))==='third');
  const fighters = ids.map(id => {
    const unit = unitById(before, id), mech = effectiveMech(before, unit), pilot = before.content.pilots.find(p => p.id === unit.pilotId);
    if (!pilot) throw new Error(`없는 코어 파일럿: ${unit.pilotId}`);
    const firstSide=faction(first!)==='player'?'ally':'enemy';
    const side = hasThird&&first?(faction(unit)===faction(first)?firstSide:firstSide==='ally'?'enemy':'ally'):lookup.side?.(unit) ?? (unit.side === 'player' ? 'ally' : unit.side === 'enemy' ? 'enemy' : undefined);
    if (!side) throw new Error(`neutral 진영 조회가 필요합니다: ${id}`);
    const revealed=faction(unit)==='player'||!!unit.revealed||events.some(e=>e.type==='attack'&&(e.attackerId===id&&faction(unitById(before,e.targetId))==='player'||e.targetId===id&&faction(unitById(before,e.attackerId))==='player'));
    return { id, side,revealed, name: unitName(before,unit), pilot: pilot.name, hp: unit.hp, hpMax: mech.hp, en: unit.en, enMax: mech.en,
      ...lookup.mech(mech, unit), ...lookup.pilot(pilot, unit) } satisfies Fighter;
  });
  return { ...(options.area?{area:options.area}:{}),...(options.background ? { background: options.background } : {}), fighters, strikes };
}
