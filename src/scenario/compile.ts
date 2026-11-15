import type { Content, Stage, StageUnit } from '../core';
import { validateStage } from '../core';
import { error } from './lexer';
import { parse, selector } from './parser';
import type { CompileContext, Condition, Instruction, Location, Node, Program, Selector } from './types';

export function definitions(stage: Stage): StageUnit[] { return [...stage.units, ...Object.values(stage.waves ?? {}).flat(), ...(stage.definitions ?? [])]; }
/** The authoring spelling pilot/mech is translated once at the content boundary. */
export function normalizeStage(raw: unknown, content: Content): Stage {
  const value = structuredClone(raw) as Stage & { units: (StageUnit & { pilot?: string; mech?: string })[] };
  const normalize = (u: StageUnit & { pilot?: string; mech?: string }): StageUnit => {
    const { pilot, mech, ...rest } = u; return { ...rest, pilotId: pilot ?? u.pilotId, mechId: mech ?? u.mechId };
  };
  value.units = value.units.map(normalize);
  value.waves = Object.fromEntries(Object.entries(value.waves ?? {}).map(([k, us]) => [k, us.map(normalize)]));
  value.definitions = (value.definitions ?? []).map(normalize); value.scenario = true;
  validateStage(value, content);
  for (const unit of definitions(value)) validateStage({ ...value, units: [unit] }, content);
  const ids = definitions(value).map(u => u.id);
  if (new Set(ids).size !== ids.length) throw new Error('유닛 id가 중복되었습니다');
  for (const [id, area] of Object.entries(value.areas ?? {})) {
    if (area.length !== 4 || area.some(n => !Number.isSafeInteger(n)) || area[0] < 0 || area[1] < 0 || area[2] >= value.map.w || area[3] >= value.map.h || area[0] > area[2] || area[1] > area[3]) throw new Error(`잘못된 영역 '${id}'`);
  }
  for (const unit of definitions(value)) if (unit.tags && (!Array.isArray(unit.tags) || unit.tags.some(tag => typeof tag !== 'string' || !tag.length))) throw new Error(`유닛 '${unit.id}'의 태그 목록이 잘못되었습니다`);
  for (const [id, p] of Object.entries(value.rosterDeployments ?? {})) if (!Array.isArray(p) || p.length !== 2 || !p.every(Number.isSafeInteger) || p[0] < 0 || p[1] < 0 || p[0] >= value.map.w || p[1] >= value.map.h) throw new Error(`합류 유닛 '${id}'의 출격 좌표가 잘못되었습니다`);
  return value;
}
export function compile(source: string, context: CompileContext, file = 'events.sai'): Program {
  const events = parse(source, file), units = definitions(context.stage);
  function refSel(sel: Selector, loc: Location): void {
    loc = sel.loc ?? loc;
    if (sel.kind === 'unit' && !units.some(u => u.id === sel.id)) error(loc, `존재하지 않는 유닛 '${sel.id}'`);
    if (sel.kind === 'tag' && !units.some(u => u.tags?.includes(sel.id))) error(loc, `존재하지 않는 태그 '${sel.id}'`);
  }
  function checkCondition(c: Condition, loc: Location): void {
    if ('selector' in c) refSel(c.selector, loc);
    if ('left' in c) { checkCondition(c.left, loc); checkCondition(c.right, loc); }
  }
  function code(nodes: Node[]): Instruction[] {
    const result: Instruction[] = [];
    function emit(nodes: Node[]): void {
      for (const node of nodes) {
        if ('condition' in node) {
          checkCondition(node.condition, node.loc);
          const branch = { op: 'branch' as const, condition: node.condition, to: 0, loc: node.loc }; result.push(branch);
          emit(node.yes); const jump = { op: 'jump' as const, to: 0, loc: node.loc }; result.push(jump);
          branch.to = result.length; emit(node.no); jump.to = result.length; continue;
        }
        const { op, args: a, loc } = node, n = a.length;
        const at = (i: number): Location => ({ ...loc, column: loc.column + op.length + 1 + a.slice(0, i).reduce((n, v) => n + v.length + 1, 0) });
        const syntax = (ok: boolean): void => { if (!ok) error(loc, `'${op}' 명령의 인수 또는 문법이 잘못되었습니다`); };
        const sel = (i = 0): void => refSel(selector(a[i] ?? '', at(i)), at(i));
        const point = (v: string): void => { syntax(/^\d+,\d+$/.test(v)); const [x, y] = v.split(',').map(Number); syntax(x < context.stage.map.w && y < context.stage.map.h); };
        switch (op) {
          case 'talk': {
            syntax(n === 3); const character = context.characters.find(c => c.id === a[0]);
            if (!character) error(at(0), `존재하지 않는 화자 '${a[0]}'`);
            if (!character.expressions.includes(a[1])) error(at(1), `화자 '${a[0]}'에게 없는 표정 '${a[1]}'`); break;
          }
          case 'choice': syntax(n>=3&&n<=5&&/^[\w-]+$/.test(a[0])); break;
          case 'affection': syntax(n===2&&/^[\w-]+$/.test(a[0])&&/^\d+$/.test(a[1])); break;
          case 'narrate': syntax(n === 1); break;
          case 'fade': syntax(n === 1 && ['in', 'out'].includes(a[0])); break;
          case 'wait': syntax(n === 1 && /^\d+$/.test(a[0]) && Number.isSafeInteger(Number(a[0]))); break;
          case 'camera': syntax(n === 1); if (a[0].startsWith('unit:')) sel(); else point(a[0]); break;
          case 'bgm': syntax(n === 1); break;
          case 'objective': syntax(n === 2 && ['win', 'lose'].includes(a[0])); break;
          case 'reinforce': syntax(n === 1); if (!context.stage.waves?.[a[0]]) error(at(0), `존재하지 않는 웨이브 '${a[0]}'`); break;
          case 'spawn': syntax(n === 3 && a[1] === 'at'); refSel({ kind: 'unit', id: a[0] }, at(0)); point(a[2]); break;
          case 'move': syntax(n === 3 && a[1] === 'to'); sel(); point(a[2]); break;
          case 'retreat': case 'join': case 'leave': syntax(n === 1); sel(); break;
          case 'set-ai': syntax(n === 2 && ['aggressive', 'hold', 'defensive'].includes(a[1])); sel(); break;
          case 'set': case 'clear': syntax(n === 2 && a[0] === 'flag' && /^[\w-]+$/.test(a[1])); break;
          case 'give': syntax(n === 2 && (['credits','exp'].includes(a[0]) ? /^\d+$/.test(a[1]) && Number.isSafeInteger(Number(a[1])) : a[0] === 'part'));
            if (a[0] === 'part' && !context.parts.includes(a[1])) error(at(1), `존재하지 않는 파츠 '${a[1]}'`); break;
          case 'effect': syntax(n === 2); sel(); if (!context.effects.includes(a[1])) error(at(1), `존재하지 않는 효과 '${a[1]}'`); break;
          case 'win': case 'lose': syntax(n === 0); break;
          default: error(loc, `알 수 없는 명령 '${op}'`);
        }
        result.push(node);
      }
    }
    emit(nodes); return result;
  }
  const compiled = events.map(event => {
    const t = event.trigger;
    if (t.selector) refSel(t.selector, event.loc); if (t.target) refSel(t.target, event.loc);
    if (t.area && !context.stage.areas?.[t.area]) error({ ...event.loc, column: event.loc.column + 3 + t.kind.length + 1 + `${t.selector!.kind}:${t.selector!.id}`.length + 6 }, `존재하지 않는 영역 '${t.area}'`);
    return { trigger: t, code: code(event.body), loc: event.loc };
  });
  for (const [side, op] of [['enemy', 'win'], ['player', 'lose']]) {
    if (!compiled.some(e => e.trigger.kind === 'all-defeated' && e.trigger.selector?.kind === 'side' && e.trigger.selector.id === side)) {
      const loc = { file, line: 1, column: 1 };
      compiled.push({ trigger: { kind: 'all-defeated', selector: { kind: 'side', id: side }, repeat: false }, code: [{ op, args: [], loc }], loc });
    }
  }
  return { version: 'sai-1', events: compiled };
}
