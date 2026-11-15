import { error, lex } from './lexer';
import type { Condition, EventBlock, Location, Node, Selector, Token, Trigger } from './types';
export function selector(value: string, loc: Location): Selector {
  const m = /^(unit|tag|side):([\w-]+)$/.exec(value);
  if (!m || (m[1] === 'side' && !['player', 'enemy', 'neutral'].includes(m[2]))) error(loc, `잘못된 선택자 '${value}'`);
  return { kind: m[1] as Selector['kind'], id: m[2], loc: { file: loc.file, line: loc.line, column: loc.column } };
}
export function condition(tokens: Token[], fallback: Location): Condition {
  const split = (word: string): number => tokens.findIndex(t => !t.quoted && t.value === word);
  for (const word of ['or', 'and'] as const) {
    const i = split(word);
    if (i >= 0) return { kind: word, left: condition(tokens.slice(0, i), fallback), right: condition(tokens.slice(i + 1), tokens[i]) };
  }
  const a = tokens.map(t => t.value), loc = tokens[0] ?? fallback;
  if(a.length===2&&a[0]==='persona')return {kind:'persona',value:a[1] as string,not:false};
  if(a.length===3&&a[0]==='not'&&a[1]==='persona')return {kind:'persona',value:a[2] as string,not:true};
  if (a.length === 2 && a[0] === 'flag') return { kind: 'flag', id: a[1], not: false };
  if (a.length === 3 && a[0] === 'not' && a[1] === 'flag') return { kind: 'flag', id: a[2], not: true };
  if (a.length === 2 && (a[0] === 'alive' || a[0] === 'dead')) return { kind: a[0], selector: selector(a[1], tokens[1]) };
  if (a.length === 3 && ['round', 'credits'].includes(a[0]) && ['>', '>=', '<', '<=', '=='].includes(a[1]) && /^\d+$/.test(a[2])) return { kind: a[0] as 'round' | 'credits', op: a[1], value: Number(a[2]) };
  error(loc, '조건식이 잘못되었습니다 (flag, alive/dead, round/credits 비교, and/or)');
}
function trigger(tokens: Token[], loc: Location): Trigger {
  const a = tokens.map(t => t.value), repeat = a.at(-1) === 'repeat'; if (repeat) a.pop();
  const t: Trigger = { kind: a[0], repeat };
  const sel = (i: number): Selector => selector(a[i] ?? '', tokens[i] ?? loc);
  if (a[0] === 'start' && a.length === 1) return t;
  if (a[0] === 'round' && /^\d+$/.test(a[1]) && Number(a[1]) > 0 && a.length >= 2 && a.length <= 3 && (!a[2] || ['player', 'enemy'].includes(a[2]))) return { ...t, round: Number(a[1]), phase: (a[2] ?? 'player') as 'player' | 'enemy' };
  if (a[0] === 'phase' && a.length === 2 && ['player', 'enemy'].includes(a[1])) return { ...t, phase: a[1] as 'player' | 'enemy' };
  if (['defeated', 'all-defeated'].includes(a[0]) && a.length === 2) return { ...t, selector: sel(1) };
  if (a[0] === 'enter' && a.length === 4 && a[2] === 'area') return { ...t, selector: sel(1), area: a[3] };
  if (a[0] === 'hp-below' && a.length === 3 && /^\d+%$/.test(a[2]) && Number(a[2].slice(0, -1)) <= 100) return { ...t, selector: sel(1), percent: Number(a[2].slice(0, -1)) };
  if (a[0] === 'talk' && a.length === 3) return { ...t, selector: sel(1), target: sel(2) };
  error(loc, `트리거 문법이 잘못되었습니다 '${a.join(' ')}'`);
}
export function parse(source: string, file?: string): EventBlock[] {
  const lines = lex(source, file); let p = 0;
  function block(indent: number): Node[] {
    const nodes: Node[] = [];
    while (p < lines.length && lines[p].indent >= indent) {
      const line = lines[p], [head, ...rest] = line.tokens;
      if (line.indent !== indent) error(line.loc, `들여쓰기는 공백 ${indent}칸이어야 합니다`);
      if (head.value === 'else' || head.value === 'end') error(head, 'else/end의 들여쓰기가 if와 같아야 합니다');
      p++;
      if (head.value === 'if') {
        const test = condition(rest, head), yes = block(indent + 2); let no: Node[] = [];
        if (lines[p]?.indent === indent && lines[p].tokens[0].value === 'else') {
          if (lines[p].tokens.length !== 1) error(lines[p].loc, 'else 뒤에는 인수를 쓸 수 없습니다');
          p++; no = block(indent + 2);
        }
        if (lines[p]?.indent !== indent || lines[p].tokens[0].value !== 'end' || lines[p].tokens.length !== 1) error(line.loc, 'if 블록을 닫는 end가 필요합니다');
        p++; nodes.push({ op: 'if', condition: test, yes, no, loc: head });
      } else {
        if (['talk', 'narrate', 'objective'].includes(head.value) && !rest.at(-1)?.quoted) error(rest.at(-1) ?? head, '문장은 큰따옴표로 감싸야 합니다');
        if (rest.some((t, i) => t.quoted && (!['talk', 'narrate', 'objective', 'choice'].includes(head.value) || head.value!=='choice'&&i !== rest.length - 1))) error(head, '인수에 잘못된 문자열이 있습니다');
        nodes.push({ op: head.value, args: rest.map(t => t.value), loc: head });
      }
    }
    return nodes;
  }
  const events: EventBlock[] = [];
  while (p < lines.length) {
    const line = lines[p++], [head, ...rest] = line.tokens;
    if (line.indent !== 0 || head.value !== 'on') error(line.loc, '최상위에는 on 트리거가 필요합니다');
    events.push({ trigger: trigger(rest, head), body: block(2), loc: head });
    if (!events.at(-1)!.body.length) error(head, '트리거 안에 명령이 필요합니다');
  }
  return events;
}
