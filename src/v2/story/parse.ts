import { CG_TONES, type CgTone, type Cue } from '../director';
import {stageSyntax,type StageSource} from './stage';
export interface Issue {
    file: string;
    line: number;
    message: string;
    fix: string;
    kind?: string;
}
export type Value = string | number | boolean;
export interface Condition {
    subject: 'variable' | 'affection' | 'type' | 'highest-affection';
    name: string;
    op: '==' | '>=' | '<=' | '>' | '<' | '!=';
    value: Value;
}
export interface Choice {
    text: string;
    type?: string;
    line?: number;
    effects: Cue[];
    target?: string;
}
export interface Story {
    stage?:StageSource;
    title: string;
    file: string;
    scenes: Record<string, Cue[]>;
    issues: Issue[];
    locations: {
        scene: string;
        index: number;
        line: number;
    }[];
}
export interface StoryCatalog {affectionAliases?:Record<string,string>;
    cast?: Record<string, {
        name?: string;
        aliases?: string[];
        moodNames?: Record<string, string>;
        moods?: Record<string, string>;
        moodSheet?: { order: string[] };
    }>;
    images?: readonly string[];
}
/** 대본에서 쓰는 우리말 표정 이름. 같은 표정을 부르는 말이 여럿이어도 받아 준다(작가마다 쓰는 말이 다르다). */
export const MOODS: Record<string, string> = {
    기본: 'default', 평소: 'default', 미소: 'smile', 웃음: 'laugh', 공격: 'attack', 기합: 'attack', 진지: 'serious',
    당황: 'hit', 피격: 'hit', 충격: 'shock', 경악: 'shock', 놀람: 'shock', 슬픔: 'sad', 시무룩: 'sad',
    분노: 'angry', 화남: 'angry', 부끄러움: 'shy', 쑥스러움: 'shy',
};
export function value(text: string): Value { if (text === 'true')
    return true; if (text === 'false')
    return false; if (/^[-+]?\d+(\.\d+)?$/.test(text))
    return Number(text); return text.replace(/^(["'])(.*)\1$/, '$2'); }
export function condition(text: string): Condition | undefined {
    const m = /^(?:(호감)\s+)?(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/.exec(text);
    if (!m)
        return;
    return { subject: m[1] ? 'affection' : m[2].trim() === '최고호감' ? 'highest-affection' : m[2].trim() === '타입' ? 'type' : 'variable', name: m[2].trim(), op: m[3] as Condition['op'], value: value(m[4].trim()) };
}
/** 한 줄은 대사 또는 지시. 오류를 모으며 다음 줄을 계속 읽는다. */
export function parseStory(source: string, file = '<story>', catalog: StoryCatalog = {}): Story {
    const result: Story = { title: '', file, scenes: Object.create(null) as Record<string, Cue[]>, issues: [], locations: [] };
    let scene = '', choices: Choice[] | undefined;
    const special=new Set<string>();
    const aliases = new Map<string, string>();
    // 대본에서 인물을 부르는 길은 셋이다: id, 이름(name), 별명(aliases). 사람이 쓰는 대본은 보통 이름을 쓴다.
    for (const [id, c] of Object.entries(catalog.cast ?? {})) {
        aliases.set(id, id);
        if (c.name && !aliases.has(c.name)) aliases.set(c.name, id);
        for (const a of c.aliases ?? [])
            aliases.set(a, id);
    }
    const issue = (line: number, message: string, fix: string) => result.issues.push({ file, line, message, fix });
    const who = (s: string, line: number): string => { const id = aliases.get(s) ?? s; if (catalog.cast && !catalog.cast[id])
        issue(line, `모르는 인물: ${s}`, 'cast.json에 있는 인물의 이름(name), 별명(aliases), id 중 하나를 쓰세요. 새 인물이면 cast.json에 먼저 더하세요.'); return id; };
    const image = (s: string, line: number): string => { if (catalog.images && !catalog.images.includes(s))
        issue(line, `없는 그림: ${s}`, 'game.json의 art.files에 그림 id를 등록하세요.'); return s; };
    const mood = (id:string,s:string):string => {const c=catalog.cast?.[id],names=c?.moodNames??{};if(Object.values(MOODS).includes(s)||c?.moods?.[s]||c?.moodSheet?.order.includes(s))return s;return names[s]?(MOODS[names[s]]??names[s]):MOODS[s]??Object.entries(names).find(([,label])=>label===s)?.[0]??s;};
    function instruction(raw: string, line: number): Cue | undefined {
        const t = /^\[([^\]]+)\]\s*(.*)$/.exec(raw);
        if (!t) {
            const d = /^([^:()]+?)(?:\(([^)]*)\))?\s*:\s*(.+)$/.exec(raw);
            if (!d) {
                issue(line, '서술 문장 또는 잘못된 대사', '인물: 대사 또는 [지시] 값으로 쓰세요.');
                return;
            }
            const id = who(d[1].trim(), line), attrs = (d[2] ?? '').split(',').map(s => s.trim());
            return { do: 'say', who: id, text: d[3], face: mood(id, attrs.find(s => s && s !== '속마음') ?? 'default'), thought: attrs.includes('속마음'), paged: true };
        }
        const [_, cmd, arg] = t, a = arg.trim();
        if (cmd.startsWith('타입 ')) {
            const cue = instruction(a, line);
            return cue && { do: 'typed', type: cmd.slice(3), cue };
        }
        const need = (): boolean => { if (!a)
            issue(line, `${cmd} 값이 없습니다.`, '지시 뒤에 값을 적으세요.'); return !!a; };
        switch (cmd) {
            case '영상': return need()?{do:'video',id:a}:undefined;
            case '배경': return need() ? { do: 'bg', image: image(a, line) } : undefined;
            case '장소': return need() ? { do: 'place', text: a } : undefined;
            case '제목 카드': {
                // [제목 카드] 제1화 | 로그인: 헬로 월드
                const [chapter, ...rest] = a.split('|').map(part => part.trim());
                return need() ? { do: 'title', chapter, title: rest.join(' | ') } : undefined;
            }
            case '등장': {
                const m = /^(.+?)\s+(왼쪽|오른쪽)(?:\s+(\S+))?$/.exec(a);
                if (!m) {
                    issue(line, '등장 구문 오류', '[등장] 인물 왼쪽|오른쪽 [표정]');
                    return;
                }
                const id = who(m[1], line);
                return { do: 'enter', who: id, side: m[2] === '왼쪽' ? 'left' : 'right', face: m[3] && mood(id, m[3]) };
            }
            case '퇴장': return need() ? { do: 'exit', who: who(a, line) } : undefined;
            case '표정': {
                const m = /^(.+?)\s+(\S+)$/.exec(a);
                if (m) {
                    const id = who(m[1], line);
                    return { do: 'face', who: id, face: mood(id, m[2]) };
                }
                issue(line, '표정 구문 오류', '[표정] 인물 표정');
                return;
            }
            case '번쩍': return { do: 'flash' };
            case '흔들림':
            case '잠깐': {
                const n = a ? Number(a) : cmd === '흔들림' ? 16 : NaN;
                if (!Number.isFinite(n) || n < 0) {
                    issue(line, '0 이상의 숫자가 필요합니다.', '예: [잠깐] 0.5');
                    return;
                }
                return cmd === '흔들림' ? { do: 'shake', power: n } : { do: 'wait', seconds: n };
            }
            case '암전': return { do: 'dark', alpha: 1 };
            case '밝아짐': return { do: 'dark', alpha: 0 };
            case '음악': return need() ? { do: 'music', id: a === '끔' ? undefined : a } : undefined;
            case '효과음': return need() ? { do: 'sound', id: a } : undefined;
            case '삽화': {
                const [asset, name, title, tone, description] = a.split('|').map(s => s.trim());
                if(tone&&!CG_TONES.includes(tone as CgTone))issue(line,'삽화 톤 오류: '+tone,'강림 / 개그 / 섬뜩 / 감성 중 하나를 쓰세요.');
                return need() ? { do: 'cg', image: image(asset, line), name: name ?? '', sub: title ?? '', alone: !name, ...(tone?{tone:tone as CgTone}:{}), ...(description?{description}:{} ) } : undefined;
            }
            case '이동': return need() ? { do: 'jump', scene: a } : undefined;
            case '끝': return { do: 'end' };
            case '합류': return need() ? { do: 'recruit', unit: a } : undefined;
            case '선택':
                choices = [];
                return { do: 'choice', choices };
            case '호감': {
                const m = /^(\S+)\s+([-+]?\d+)$/.exec(a);
                if (m)
                    return { do: 'affection', who: who(m[1], line), amount: Number(m[2]) };
                issue(line, '호감 구문 오류', '[호감] 인물 +1');
                return;
            }
            case '변수': {
                const m = /^(\S+)\s*=\s*(.+)$/.exec(a);
                if (m)
                    return { do: 'variable', name: m[1], value: value(m[2]) };
                issue(line, '변수 구문 오류', '[변수] 이름 = 값');
                return;
            }
            case '조건': {
                const m = /^(.+?)\s*->\s*(.+)$/.exec(a), test = m && condition(m[1].trim());
                if (test) {
                    if (test.subject === 'affection')
                        test.name = who(test.name, line);
                    if (test.subject === 'highest-affection') {
                        test.value = catalog.affectionAliases?.[who(String(test.value),line)]??who(String(test.value),line);
                        if (!['==', '!='].includes(test.op)) issue(line, '최고호감은 == 또는 !=로 비교합니다.', '[조건] 최고호감 == cast-id -> 장면');
                    }
                    return { do: 'condition', test, scene: m![2].trim() };
                }
                issue(line, '조건 구문 오류', '[조건] 변수 == 값 -> 장면');
                return;
            }
            case '맵': {
                const exhaust=/^소진 ([\w-]+)$/.exec(a);if(exhaust)return {do:'map',action:'소진',unit:exhaust[1]};
                const barrier=/^배리어 (해제|무적|\d+) ([\w-]+)$/.exec(a);if(barrier){const n=barrier[1]==='해제'?0:barrier[1]==='무적'?100:+barrier[1];if(n>100){issue(line,'배리어 범위 오류','0~100 또는 무적/해제');return;}return {do:'map',action:'배리어',unit:barrier[2],barrier:n};}
                const form=/^폼 ([\w-]+) (\S+)$/.exec(a);if(form)return {do:'map',action:'폼',unit:form[1],form:form[2]};
                const passage=/^통행 (\d+),(\d+)~(\d+),(\d+) (막힘|열림)$/.exec(a);if(passage)return {do:'map',action:'통행',rect:[+passage[1],+passage[2],+passage[3],+passage[4]],blocked:passage[5]==='막힘'};

                const m = /^(보기|이동|등장|폭발|퇴장|합류)\s+(?:(\S+)\s+)?(?:(\d+),(\d+)|(\S+))$/.exec(a);
                if (m) {
                    const action = m[1] as '보기' | '이동' | '등장' | '폭발' | '퇴장' | '합류';
                    if ((action === '이동' || action === '등장') && !m[2] || action === '퇴장' && !m[5]) {
                        issue(line, '맵 대상이 없습니다.', '[맵] 이동 유닛id 1,2 / [맵] 퇴장 유닛id');
                        return;
                    }
                    return { do: 'map', action, unit: m[2] ?? m[5], cell: m[3] ? [Number(m[3]), Number(m[4])] : undefined };
                }
                issue(line, '맵 구문 오류', '[맵] 보기 1,2 / 이동 유닛id 1,2 / 등장 유닛id 1,2 / 폭발 1,2 / 퇴장 유닛id');
                return;
            }
            default:
                issue(line, `모르는 지시: ${cmd}`, '문서 2절의 지시 이름을 사용하세요.');
                return;
        }
    }
    source.replace(/^\uFEFF/, '').split(/\r?\n/).forEach((raw, i) => {
        const s = raw.trim(), line = i + 1;
        if (!s || s.startsWith('//'))
            return;
        if((scene==='규칙'||scene==='맵')&&!s.startsWith('@ ')){result.stage![scene==='규칙'?'rules':'map'].push({text:s,line});return;}
        if (s.startsWith('# ')) {
            if (result.title)
                issue(line, '제목이 중복됩니다.', '파일에 # 제목은 한 번만 쓰세요.');
            else
                result.title = s.slice(2).trim();
            return;
        }
        if (s.startsWith('@ ')) {
            scene = s.slice(2).trim();
            choices = undefined;
            if(scene==='규칙'||scene==='맵'){
                result.stage??={rules:[],map:[],line};
                if(special.has(scene))issue(line,`중복 특별 장면: ${scene}`,'@ 규칙과 @ 맵은 파일마다 한 번만 쓰세요.');special.add(scene);
                return;
            }
            if (result.scenes[scene])
                issue(line, `중복 장면: ${scene}`, '장면 이름을 바꾸세요.');
            else
                result.scenes[scene] = [];
            return;
        }
        if (!scene) {
            issue(line, '장면 밖의 줄', '먼저 @ 장면 이름을 쓰세요.');
            return;
        }
        if (s.startsWith('- ')) {
            if (!choices) {
                issue(line, '선택 밖의 보기', '먼저 [선택]을 쓰세요.');
                return;
            }
            const target = /\s+->\s*(.+)$/.exec(s);
            let text = s.slice(2, target?.index).trim();
            const effectsBlock = /\s+\{([^{}]*)\}$/.exec(text);
            const effectText = effectsBlock && /^(?:\[|호감\s|변수\s|\S+\s*=)/.test(effectsBlock[1].trim()) ? effectsBlock[1] : '';
            if (effectText) text = text.slice(0, effectsBlock!.index).trim();
            const typed = /^\[타입 ([^\]]+)\]\s*/.exec(text);
            if (typed) text = text.slice(typed[0].length);
            const effects: Cue[] = [];
            for (const effect of effectText.split(';').map(x => x.trim()).filter(Boolean)) {
                const c = instruction(effect.startsWith('[') ? effect : effect.startsWith('호감 ') ? `[호감] ${effect.slice(3)}` : `[변수] ${effect}`, line);
                if (c)
                    effects.push(c);
            }
            choices.push({ text, ...(typed ? { type: typed[1] as string } : {}), line, effects, target: target?.[1].trim() });
            return;
        }
        choices = undefined;
        const cue = instruction(s, line);
        if (cue) {
            result.locations.push({ scene, index: result.scenes[scene].length, line });
            result.scenes[scene].push(cue);
        }
    });
    function validate(c: Cue, line: number): void { if (c.do === 'typed') {
        validate(c.cue, line);
        return;
    } if (c.do === 'choice') {
        if (!c.choices.length)
            issue(line, '빈 선택지', '- 보기 줄을 하나 이상 쓰세요.');
        for (const choice of c.choices) {
            if (choice.target && !result.scenes[choice.target])
                issue(choice.line ?? line, `없는 장면: ${choice.target}`, '같은 파일에 @ 장면을 추가하거나 이동 이름을 고치세요.');
        }
        return;
    } if ((c.do === 'jump' || c.do === 'condition') && !result.scenes[c.scene])
        issue(line, `없는 장면: ${c.scene}`, '같은 파일에 @ 장면을 추가하거나 이동 이름을 고치세요.'); }
    for (const loc of result.locations)
        validate(result.scenes[loc.scene][loc.index], loc.line);
    if(result.stage)result.issues.push(...stageSyntax(result.stage,file));
    return result;
}
export const parse = parseStory;
