/** v2 규칙 자료. 코어 수치 파일을 편집하지 않고 팩의 선언을 정적 자료로 컴파일한다. */
import type { Content, Stage, Mech } from '../../core';
import type { Issue } from '../story/parse';
export const CONFIG = 'v2-rules:';
export const THIRD = 'v2-third';
export interface FormRule {
    id: string;
    mech: string;
    attack?: number;
    armor?: number;
    evade?: number;
    counter?: number;
    support?: number;
    restore?: number;
}
export interface UnitRule {
    transformBeforeMove?:boolean;
    barrierStates?:{active:import('../../core').EffectAtom[];inactive:import('../../core').EffectAtom[]};
    barrier?: number;
    breakBy?: string;
    copy?: number;
    copyLine?: string;
    arms?: Record<string, string[]>;
    forms?: FormRule[];
    counter?: {
        count: number;
        scene: string;
    };
    third?: boolean;
}
export interface ComboRule {
    joined?:string;powerMultiplier?:number;virtualParticipants?:string[];
    participants?:string[];
    costs?:number[];
    morale?:number;
    postMove?:boolean;
    affection?:{id:string;min:number};
    id: string;
    name: string;
    lead: string;
    partner: string;
    weapon: string;
    flag: string;
    line: string;
    virtual: string;
}
export type Prize = {
    kind: 'hp' | 'en' | 'credits' | 'move' | 'blank';
    value: number;
    turns?: number;
    label: string;
};
export interface RulesConfig {
    version: 1;
    units: Record<string, UnitRule>;
    combos: ComboRule[];
    transitions?:{id:string;barrierBroken?:string;form?:{unit:string;id:string;hpPct?:number};spawns:import('../../core').StageUnit[]}[];
    gachas: {
        id: string;
        flag: string;
        regions: string[];
        prizes: Prize[];
    }[];
    haste: Record<string, number>;
}
export const emptyConfig = (): RulesConfig => ({ version: 1, units: {}, combos: [], gachas: [], haste: {} });
const configs = new WeakMap<Stage, RulesConfig>();
export function configOf(stage: Stage): RulesConfig { const cached = configs.get(stage); if (cached)
    return cached; const tag = stage.units.flatMap(u => u.tags ?? []).find(t => t.startsWith(CONFIG)); const value = tag ? JSON.parse(decodeURIComponent(tag.slice(CONFIG.length))) : emptyConfig(); configs.set(stage, value); return value; }
export function replaceConfig(stage:Stage,config:RulesConfig):void{configs.set(stage,config);if(stage.units[0])stage.units[0].tags=[...(stage.units[0].tags??[]).filter(t=>!t.startsWith(CONFIG)),CONFIG+encodeURIComponent(JSON.stringify(config))];}
export const ruleLine = (s: string) => /^(변형 이동전 |배리어 |형태 |형태효과 |합체기 |가챠 |가챠지역 |가속 |전투 사건 |전투 추적 |복사 |제3세력:)/.test(s);
export function compileRules(lines: {
    text: string;
    line: number;
}[], stage: Stage, content: Content, art: Record<string, unknown> | undefined, file: string): Issue[] {
    const config = emptyConfig(), issues: Issue[] = [], defs = [...stage.units, ...(stage.definitions ?? []), ...Object.values(stage.waves ?? {}).flat()];
    const fail = (line: number, message: string) => issues.push({ file, line, message, fix: 'v2-content-pack.md의 범용 기믹 문법과 유닛·무장 id를 확인하세요.' });
    const unit = (id: string, line: number) => { if (!defs.some(u => u.id === id))
        fail(line, '없는 기믹 유닛: ' + id); return config.units[id] ??= {}; };
    for (const { text, line } of lines) {
        let m: RegExpExecArray | null;
        if((m=/^변형 이동전 ([\w-]+)$/.exec(text))){unit(m[1],line).transformBeforeMove=true;}
        else if ((m = /^배리어 ([\w-]+) (무적|\d+)(?: 합체기 ([\w-]+))?$/.exec(text))) {
            const r = unit(m[1], line);
            r.barrier = m[2] === '무적' ? 100 : +m[2];
            if (r.barrier < 0 || r.barrier > 100)
                fail(line, '배리어는 0~100 또는 무적입니다.');
            r.breakBy = m[3];
        }
        else if ((m = /^형태 ([\w-]+) = (.+)$/.exec(text))) {
            const r = unit(m[1], line);
            r.forms = m[2].split(' / ').map(s => { const pair = /^(\S+):([\w-]+)$/.exec(s); if (!pair) {
                fail(line, '형태는 이름:기체id로 적으세요.');
                return { id: s, mech: '' };
            } if (!content.mechs.some(x => x.id === pair[2]))
                fail(line, '없는 형태 기체: ' + pair[2]); return { id: pair[1], mech: pair[2] }; });
            if (new Set(r.forms.map(f => f.id)).size !== r.forms.length)
                fail(line, '형태 이름 중복');
        }
        else if ((m = /^형태효과 ([\w-]+) (\S+): (.+)$/.exec(text))) {
            const f = unit(m[1], line).forms?.find(f => f.id === m![2]);
            if (!f) {
                fail(line, '먼저 해당 형태를 선언하세요.');
                continue;
            }
            for (const s of m[3].split(' / ')) {
                const p = /^(공격|장갑|회피|반격|지원|공급) (-?\d+)$/.exec(s);
                if (!p) {
                    fail(line, '형태효과 문법 오류');
                    continue;
                }
                const key = { 공격: 'attack', 장갑: 'armor', 회피: 'evade', 반격: 'counter', 지원: 'support', 공급: 'restore' }[p[1]] as 'attack';
                f[key] = +p[2];
            }
        }
        else if ((m = /^합체기 ([\w-]+) = ([\w-]+(?: \+ [\w-]+)+) 무장 ([\w-]+) 조건 (변수 \S+|호감 \S+ >= \d+)(?: 이름 (.+?))?(?: 기력 (\d+))?(?: 비용 (\d+(?:,\d+)+))?(?: 이동후 (가능|불가))?(?: 대사 (.+))?$/.exec(text))) {
            const ids=m[2].split(' + '),condition=m[4].split(' '),costs=m[7]?.split(',').map(Number);
            ids.forEach(id=>unit(id,line));if(new Set(ids).size!==ids.length)fail(line,'합체기 참가자가 중복됩니다.');
            if(!content.weapons.some(w=>w.id===m![3]))fail(line,'없는 합체 무장: '+m[3]);
            if(config.combos.some(c=>c.id===m![1]))fail(line,'중복 합체기');
            if(costs&&costs.length!==ids.length)fail(line,'참가자마다 비용 하나가 필요합니다.');
            config.combos.push({id:m[1],name:m[5]??m[1],lead:ids[0],partner:ids[1],...(ids.length>2?{participants:ids}:{}),weapon:m[3],flag:condition[0]==='변수'?condition[1]:'affection:'+condition[1],...(condition[0]==='호감'?{affection:{id:condition[1],min:+condition[3]}}:{}),...(costs?{costs}:{}),...(m[6]?{morale:+m[6]}:{}),...(m[8]?{postMove:m[8]==='가능'}:{}),line:m[9]??'',virtual:`v2-combo-${stage.id}-${m[1]}`});
        }
        else if ((m = /^복사 ([\w-]+) 경감 (\d+)(?: 대사 (.+))?$/.exec(text))) {
            unit(m[1], line).copy = +m[2];
            unit(m[1], line).copyLine = m[3];
            if (+m[2] > 100)
                fail(line, '복사 경감은 0~100입니다.');
        }
        else if ((m = /^전투 추적 ([\w-]+)$/.exec(text))) {
            unit(m[1], line);
        }
        else if ((m = /^전투 사건 ([\w-]+) (\d+) → (.+)$/.exec(text))) {
            unit(m[1], line).counter = { count: +m[2], scene: m[3] };
            if (+m[2] < 1)
                fail(line, '전투 횟수는 양수입니다.');
        }
        else if ((m = /^제3세력: (.+)$/.exec(text))) {
            for (const id of m[1].split(/\s*,\s*/))
                unit(id, line).third = true;
        }
        else if ((m = /^가속 ([\w-]+) 이동 (\d+)$/.exec(text))) {
            if (!content.terrain.some(t => t.id === m![1]))
                fail(line, '없는 가속 지형');
            config.haste[m[1]] = +m[2];
        }
        else if ((m = /^가챠 ([\w-]+) 변수 (\S+) = (.+)$/.exec(text))) {
            const prizes: Prize[] = m[3].split(' / ').map(s => { const p = /^(\S+)(?: (-?\d+))?(?: (\d+))?$/.exec(s); if (!p) {
                fail(line, '가챠 효과 문법 오류');
                return { kind: 'blank', value: 0, label: s };
            } const kind=({HP:'hp',[content.terms?.en??'EN']:'en',[content.terms?.funds??'자금']:'credits',이동:'move',[content.terms?.blank??'없음']:'blank'}as Record<string,Prize['kind']>)[p[1]];if(!kind)fail(line,'알 수 없는 가챠 자원: '+p[1]);return {kind:kind??'blank', value: +(p[2] ?? 0), turns: +(p[3] ?? 1), label: s }; });
            config.gachas.push({ id: m[1], flag: m[2], prizes, regions: [] });
        }
        else if ((m = /^가챠지역 ([\w-]+) = (.+)$/.exec(text))) {
            const g = config.gachas.find(g => g.id === m![1]);
            if (!g)
                fail(line, '가챠 표를 먼저 선언하세요.');
            else {
                g.regions = m[2].split(/\s*,\s*/);
                for (const id of g.regions)
                    if (!stage.areas?.[id])
                        fail(line, '없는 가챠 지역: ' + id);
            }
        }
        else if (ruleLine(text))
            fail(line, '기믹 문법 오류: ' + text);
    }
    for (const [id, r] of Object.entries(config.units))
        if (r.breakBy && !config.combos.some(c => c.id === r.breakBy))
            fail(1, '없는 배리어 합체기: ' + id + ' ' + r.breakBy);
    if (issues.length)
        return issues;
    for (const c of config.combos) {
        const base = content.weapons.find(w => w.id === c.weapon)!;
        if (!content.weapons.some(w => w.id === c.virtual))
            content.weapons.push({ ...structuredClone(base), id: c.virtual, name: `합체기 · ${c.name}`, en: c.costs?.[0]??Math.ceil((base.en ?? 0) / 2), moraleReq: c.morale??0, postMove: c.postMove??true, map: undefined, ammo: undefined });
    }
    for (const [id, r] of Object.entries(config.units)) {
        const u = defs.find(u => u.id === id)!;
        if (r.third) {
            u.side = 'enemy';
            u.tags = [...(u.tags ?? []), THIRD];
        }
        if (r.forms?.length) {
            const original = content.mechs.find(m => m.id === u.mechId)!, synthetic = `v2-forms-${stage.id}-${id}`;
            const forms = r.forms.map(f => { const m = content.mechs.find(m => m.id === f.mech)!; return { id: f.id, name: f.id, overrides: Object.fromEntries(['hp', 'en', 'armor', 'mobility', 'move', 'moveType', 'adapt', 'weapons', 'size'].map(k => [k, structuredClone(m[k as keyof Mech])])) }; });
            const mech = { ...structuredClone(original), id: synthetic, forms, aiForm: undefined };
            if(original.allyStats){mech.allyStats={...original.allyStats,forms:r.forms.map(f=>{const m=content.mechs.find(m=>m.id===f.mech)!,a={...m,...m.allyStats};return{id:f.id,name:f.id,overrides:Object.fromEntries(['hp','en','armor','mobility','move','moveType','adapt','weapons','size'].map(k=>[k,structuredClone(a[k as keyof Mech])]))};}),weaponPower:Object.assign({},original.allyStats.weaponPower,...r.forms.map(f=>content.mechs.find(m=>m.id===f.mech)?.allyStats?.weaponPower))};}
            const old = content.mechs.findIndex(m => m.id === synthetic);
            if (old < 0)
                content.mechs.push(mech as Mech);
            else
                content.mechs[old] = mech as Mech;
            if (art) {
                const src = (art[r.forms[0].mech]??art[original.id]) as Record<string, unknown>;
                const look = (f: FormRule) => {
                    const base = art[f.mech] as Record<string, unknown> | undefined;
                    const variants = base?.tacticalForms as Record<string, object> | undefined;
                    return { ...base, ...variants?.[f.id] };
                };
                art[synthetic] = { ...src, ...look(r.forms[0]), forms: Object.fromEntries(r.forms.map(f => [f.id, look(f)])) };
            }
            u.mechId = synthetic;
        }
        const combinations = config.combos.filter(c => c.lead === id);
        if (r.copy !== undefined || combinations.length) {
            const original = content.mechs.find(m => m.id === u.mechId)!, synthetic = `v2-armed-${stage.id}-${id}`, mech = structuredClone(original);
            r.arms = { '': [...original.weapons], ...Object.fromEntries((original.forms ?? []).map(f => [f.id, [...(f.overrides.weapons ?? original.weapons)]])) };
            const pool = r.copy !== undefined ? content.weapons.map(w => w.id) : combinations.map(c => c.virtual);
            mech.id = synthetic;
            mech.weapons = [...new Set([...mech.weapons, ...pool])];
            if(mech.allyStats){mech.allyStats.weapons=[...new Set([...(mech.allyStats.weapons??mech.weapons),...pool])];if(mech.allyStats.forms)mech.allyStats.forms=mech.allyStats.forms.map(f=>({...f,overrides:{...f.overrides,weapons:[...new Set([...(f.overrides.weapons??mech.weapons),...pool])]}}));}
            if (mech.forms)
                mech.forms = mech.forms.map(f => ({ ...f, overrides: { ...f.overrides, weapons: [...new Set([...(f.overrides.weapons ?? original.weapons), ...pool])] } }));
            const old = content.mechs.findIndex(m => m.id === synthetic);
            if (old < 0)
                content.mechs.push(mech);
            else
                content.mechs[old] = mech;
            if (art)
                art[synthetic] = structuredClone(art[original.id]??{});
            u.mechId = synthetic;
        }
    }
    if (stage.units[0] && lines.some(r => ruleLine(r.text)))
        stage.units[0].tags = [...(stage.units[0].tags ?? []).filter(t => !t.startsWith(CONFIG)), CONFIG + encodeURIComponent(JSON.stringify(config))];
    return issues;
}
