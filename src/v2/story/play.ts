import { Director,Taps,type Actor,type Cue } from '../director';
import { until,wait,type Step } from '../flow';
import { burst } from '../fx';
import type { InputEvent } from '../input';
import { Button,MenuList,label,toast,windowFrame } from '../kit';
import type { Board } from '../map/board';
import type { UnitView } from '../map/model';
import { preloadImages } from '../pack/images';
import { sceneAudio,sceneImages,waitForAudio,waitForImages } from '../pack/preload';
import { Screen } from '../screen';
import type { Condition,Story,Value } from './parse';
export interface StoryState {
    speakerName?: (id: string) => string | undefined;
    type: () => string;
    actor?: (id: string) => string;
    candidates?: {
        id: string;
        flag?: string;
    }[];
    playerName?: () => string;
    unitName?: () => string;
    placeholders?: Record<string, 'name' | 'unitName'>;
    get: (name: string) => Value;
    set: (name: string, value: Value) => void;
    affection: (who: string, amount?: number) => number;
    choose?: (name: string, index: number) => void;
    recruit?: (unit: string) => void;
    map?: (cue: Extract<Cue, {
        do: 'map';
    }>) => import('../map/model').MapEvent[];
}
export function memoryStoryState(type: string = 'default', candidates: StoryState['candidates'] = []): StoryState { const vars: Record<string, Value> = {}, love: Record<string, number> = {}; return { candidates, type: () => type, get: n => vars[n] ?? false, set: (n, v) => { vars[n] = v; }, affection: (n, a = 0) => love[n] = (love[n] ?? 0) + a }; }
/** 동점 우선순위는 이 순서로 고정한다. 히든은 카본 원문의 합류 변수와 연결한다. */
export function highestAffection(s: StoryState): string {
    const candidates = (s.candidates ?? []).filter(c => !c.flag || s.get(c.flag) === true || s.get(c.flag) === 1).map(c => c.id);
    return candidates.reduce((best, id) => !best || s.affection(id) > s.affection(best) ? id : best, '');
}
export function storyText(text: string, state: StoryState): string { return text.replace(/\{([^{}]+)\}/g, (token, key: string) => { const field = state.placeholders?.[key]; return field === 'name' ? state.playerName?.() ?? token : field === 'unitName' ? state.unitName?.() ?? token : token; }); }
export function storyChoices(choices: import('./parse').Choice[], state: StoryState) { return choices.filter(c => !c.type || c.type === state.type()).map(c => ({ ...c, text: storyText(c.text, state) })); }
export function testCondition(c: Condition, s: StoryState): boolean {
    const a = c.subject === 'highest-affection' ? highestAffection(s) : c.subject === 'type' ? s.type() : c.subject === 'affection' ? s.affection(c.name) : s.get(c.name), b = c.value;
    switch (c.op) {
        case '==': return a === b;
        case '!=': return a !== b;
        case '>=': return a >= b;
        case '<=': return a <= b;
        case '>': return a > b;
        case '<': return a < b;
    }
}
export function logEntries(lines: string[]) { return lines.map(line => { const at = line.indexOf(':'); return { speaker: at < 0 ? '' : line.slice(0, at), text: at < 0 ? line : line.slice(at + 1).trimStart() }; }); }
export interface LogPageEntry { speaker:string; lines:string[] }
/** Whole utterances stay together; exceptionally long utterances split only at line boundaries. */
export function paginateLog(entries:ReturnType<typeof logEntries>,wrapText:(text:string)=>string[],height=452):LogPageEntry[][]{
    const pages:LogPageEntry[][]=[[]];let used=0;
    const maxLines=Math.max(1,Math.floor(height/24));
    for(const entry of entries){const all=wrapText(entry.text);if(!all.length)all.push('');
        for(let offset=0;offset<all.length;offset+=maxLines){const lines=all.slice(offset,offset+maxLines),h=lines.length*24;
            if(used+h>height&&pages.at(-1)!.length){pages.push([]);used=0;}
            pages.at(-1)!.push({speaker:entry.speaker,lines});used+=h+14;
        }
    }return pages;
}
export class LogScreen extends Screen {
    opaque=false;
    constructor(private readonly lines:string[]){super();}
    enter():void{
        this.stage.ui.add(Object.assign(windowFrame('지난 대사',1120,570),{x:80,y:95}));
        this.ui.setNavigation({kind:'close',bounds:{x:80,y:95,w:1120,h:570},onBack:()=>this.app.pop('none')});
        const rows=logEntries(this.lines).flatMap(e=>pagesOf(e.text,76).map(text=>({label:e.speaker,description:text,labelSize:20})));
        this.ui.add(Object.assign(new MenuList(rows,()=>undefined,{w:1060,rows:4,rowHeight:90}),{x:110,y:207}));
    }
}
/** 같은 재생기를 독립 화면과 맵 위에서 쓴다. 규칙 상태는 주입받는다. */
/**
 * 긴 대사를 대사창 한 쪽 분량으로 나눈다.
 * 문장이 끝나는 곳(. ! ? … 뒤)에서 나누고, 그런 곳이 없으면 띄어쓰기에서 나눈다. 낱말 한가운데서는 나누지 않는다.
 */
export function pagesOf(text: string, limit = 76): string[] {
    const pages: string[] = [];
    let rest = text.trim();
    while (Array.from(rest).length > limit) {
        const head = Array.from(rest).slice(0, limit).join('');
        // 쪽의 뒤쪽 절반 안에서 가장 늦은 문장 끝을 찾는다. 없으면 가장 늦은 띄어쓰기.
        let cut = -1;
        for (const m of head.matchAll(/[.!?…~♡」』)]+["'”’]?\s/g))
            if (m.index! + m[0].length > head.length * 0.45)
                cut = m.index! + m[0].length;
        if (cut < 0)
            cut = head.lastIndexOf(' ') + 1;
        if (cut <= 0)
            cut = head.length;
        pages.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
    }
    if (rest)
        pages.push(rest);
    return pages;
}
export class StoryPlayback {
    /** Optional pack policy, also applied when a choice jumps to another scene. */
    sceneMusic?: (scene: string) => string | undefined;
    eventMusic?: (event: import('../map/model').MapEvent) => string | undefined;
    readonly taps = new Taps();
    active = false;
    auto = false;
    skip = false;
    readonly log: string[] = [];
    private director: Director;
    private jump?: string;
    private ended = false;
    private choosing = false;
    private session = 0;
    private controls: Button[] = [];
    private choiceList?: MenuList;
    constructor(readonly screen: Screen, readonly cast: Record<string, Actor>, readonly images: Record<string, HTMLImageElement | undefined>, readonly state: StoryState, readonly board?: Board, private readonly units?: () => UnitView[]) { this.cast = Object.fromEntries(Object.entries(cast).map(([id, c]) => [id, { ...c, name: state.speakerName?.(id) ?? c.name }])); this.director = new Director(screen.show, this.cast, images, this.taps, c => this.extra(c)); this.director.onLineVisible = visible => this.controls.forEach(b => b.visible = visible); }
    input(event: InputEvent): boolean {
        if (!this.active)
            return false;
        if (event.kind === 'action' && event.action === 'skip') {
            this.skip = !this.skip;
            if (this.controls[1]) {
                this.controls[1].label = this.skip ? 'SKIP 중' : 'SKIP';
                this.controls[1].toggled = this.skip;
            }
            return true;
        }
        if (event.kind === 'action' && (event.action === 'auto' || event.key?.toLowerCase() === 'a')) {
            this.auto = !this.auto;
            if (this.controls[0])
                this.controls[0].label = this.auto ? 'AUTO ✓' : 'AUTO';
            return true;
        }
        if (event.kind === 'action' && event.action === 'log') {
            this.screen.app.push(new LogScreen(this.log), 'none');
            return true;
        }
        if (this.screen.ui.input(event, this.choiceList ? [this.choiceList, ...this.controls] : this.controls))
            return true;
        if (!this.choosing && ((event.kind === 'pointer' && event.phase === 'up') || (event.kind === 'action' && event.action === 'confirm'))) {
            if (this.controls.some(c => c.visible))
                this.screen.app.sound.play('confirm', .5);
            this.taps.press();
        }
        return true;
    }
    private *extra(c: Cue): Step {
        switch (c.do) {
            case 'video': {
                this.director.clearLine();
                if (!this.skip) {
                    let done = false;
                    void this.screen.app.cinematics?.play(c.id).finally(() => done = true);
                    if (this.screen.app.cinematics)
                        yield* until(() => done);
                }
                break;
            }
            case 'end':
                this.ended = true;
                break;
            case 'jump':
                this.director.clearLine();
                this.jump = c.scene;
                break;
            case 'condition':
                if (testCondition(c.test, this.state)) {
                    this.director.clearLine();
                    this.jump = c.scene;
                }
                break;
            case 'typed':
                if (this.state.type() === c.type)
                    yield* this.perform(c.cue);
                break;
            case 'variable':
                this.state.set(c.name, c.value);
                break;
            case 'recruit':
                this.state.recruit?.(c.unit);
                break;
            case 'affection':
                this.state.affection(c.who, c.amount);
                // 호감이 바뀐 것은 대사가 아니라 알림으로 보여 준다("시스템: 호감도가 올랐습니다" 같은 줄을 대신한다).
                if (c.amount)
                    toast(this.screen, `${this.director.nameOf(c.who)} 호감 ${c.amount > 0 ? '+' : ''}${c.amount}`);
                break;
            case 'choice': {
                this.choosing = true;
                this.director.dimLine(.45);
                this.controls.forEach(b => b.visible = false);
                let selected = -1;
                const choices = storyChoices(c.choices, this.state);
                const items = choices.map(x => ({ sound: 'important' as const, label: x.text, wrapLabel: true, labelSize: 21 }));
                const list = this.screen.ui.add(Object.assign(new MenuList(items, i => { selected = i; }, { w: 1040, rows: 3, rowHeight: 94 }), { x: 120, y: 175, z: 80 }));
                this.choiceList = list;
                this.screen.ui.focusOn(list, true);
                yield* until(() => selected >= 0);
                this.screen.ui.remove(list);
                this.choiceList = undefined;
                this.choosing = false;
                this.director.dimLine(1);
                this.controls.forEach(b => { b.y = 516; }); // 대사창 안 오른쪽 위: 인물을 가리지 않는다
                const choice = choices[selected];
                const flag = choice.effects.find(e => e.do === 'variable' && /-\d+$/.test(e.name));
                if (flag?.do === 'variable')
                    this.state.choose?.(flag.name.replace(/-\d+$/, ''), selected + 1);
                for (const effect of choice.effects)
                    yield* this.perform(effect);
                if (choice.target)
                    this.jump = choice.target;
                break;
            }
            case 'map': {
                const b = this.board;
                if (!b)
                    break;
                if (this.state.map && ['이동', '등장', '퇴장', '합류', '배리어', '폼', '통행', '소진'].includes(c.action)) {
                    for (const event of this.state.map(c)) {
                        const music = this.eventMusic?.(event);
                        if (music) {
                            yield* waitForAudio(this.screen.show, [music]);
                            this.screen.app.sound.music(music);
                        }
                        if (event.type === 'passage')
                            b.blockedCells = event.cells;
                        if (event.type === 'status')
                            b.status(event.units);
                        if (event.type === 'spawn')
                            yield* b.spawn(event.unit);
                        if (event.type === 'move')
                            yield* b.moveAlong(event.unitId, event.path);
                        if (event.type === 'defeat')
                            yield* b.defeat(event.unitId);
                        if (event.type === 'change') {
                            burst(this.screen.show, b.onScreen(event.focus).x, b.onScreen(event.focus).y, 90, '#7cfaff');
                            b.sync(event.units);
                            yield* wait(.3);
                        }
                        if (event.type === 'notice') {
                            toast(this.screen, event.text);
                            this.screen.app.sound.play('confirm');
                            yield* wait(.35);
                        }
                    }
                    break;
                }
                const at = c.cell ? { col: c.cell[0], row: c.cell[1] } : undefined;
                if (c.action === '보기' && at)
                    yield* b.look(at);
                if (c.action === '이동' && at && c.unit) {
                    yield* b.moveAlong(c.unit, [b.unitAt(b.cursor)?.cell ?? b.cursor, at]);
                    b.place(c.unit, at);
                }
                if (c.action === '퇴장' && c.unit)
                    yield* b.defeat(c.unit);
                if (c.action === '등장' && c.unit && at) {
                    const unit = this.units?.().find(u => u.id === c.unit);
                    if (unit)
                        yield* b.spawn({ ...unit, cell: at });
                }
                if (c.action === '폭발' && at) {
                    yield* b.look(at);
                    const pos = b.center(at);
                    burst(this.screen.show, pos.x, pos.y, 120, '#ff9c3f');
                    yield* wait(.4);
                }
                break;
            }
        }
    }
    private *perform(c: Cue): Step {
        if (c.do === 'music' && c.id)
            yield* waitForAudio(this.screen.show, [c.id]);
        if ('who' in c && this.state.actor)
            c = { ...c, who: this.state.actor(c.who) };
        if (c.do === 'say') {
            c = { ...c, text: storyText(c.text, this.state) };
            const who = this.state.actor?.(c.who) ?? c.who;
            this.log.push(`${this.cast[who]?.name ?? who}: ${c.text}`);
            if (c.paged) {
                for (const page of pagesOf(c.text))
                    yield* this.director.perform({ ...c, who, text: page, paged: false });
                return;
            }
            yield* this.director.perform({ ...c, who });
            return;
        }
        if (['bg', 'dark', 'title', 'place', 'cg'].includes(c.do))
            this.director.clearLine();
        // 삽화가 떠 있는 동안 AUTO·SKIP·LOG 버튼이 그림을 가리지 않게 숨긴다.
        if (c.do === 'cg') {
            for (const b of this.controls)
                b.visible = false;
            try {
                yield* this.director.perform(c);
            }
            finally {
                for (const b of this.controls)
                    b.visible = false;
            }
            return;
        }
        yield* this.director.perform(c);
    }
    *play(story: Story, scene: string): Step {
        if (!story.scenes[scene])
            return;
        yield* waitForAudio(this.screen.show, sceneAudio(story, scene));
        yield* waitForImages(this.screen.show, sceneImages(story, scene, this.cast, this.images));
        const hud = this.board ? this.screen.stage.ui.nodes.map(node => ({ node, visible: node.visible })) : [];
        for (const { node } of hud)
            node.visible = false;
        this.active = true;
        try {
            this.ended = false;
            const auto = this.screen.ui.add(Object.assign(new Button('AUTO', () => { this.auto = !this.auto; auto.label = this.auto ? 'AUTO ✓' : 'AUTO'; }, { w:96,h:32 }), { x: 866, y: 516, z: 90, canFocus: false }));
            const skip = this.screen.ui.add(Object.assign(new Button('SKIP', () => { this.skip = !this.skip; skip.label = this.skip ? 'SKIP 중' : 'SKIP'; skip.toggled = this.skip; }, { w:96,h:32 }), { x: 970, y: 516, z: 90, canFocus: false }));
            const log = this.screen.ui.add(Object.assign(new Button('LOG', () => this.screen.app.push(new LogScreen(this.log), 'none'), { w:96,h:32 }), { x:1074,y:516, z: 90, canFocus: false }));
            auto.label = this.auto ? 'AUTO ✓' : 'AUTO';
            skip.label = this.skip ? 'SKIP 중' : 'SKIP';
            skip.toggled = this.skip;
            {
                auto.label += ' [A]';
                skip.label += ' [Ctrl]';
                log.label += ' [L]';
            }
            this.controls = [auto, skip, log];
            this.controls.forEach(b => b.visible = false);
            const self = this, session = ++this.session;
            this.screen.run((function* (): Step {
                while (self.active && self.session === session) {
                    yield* wait(self.skip || self.screen.app.fastHeld ? .06 : 1.8);
                    if (self.session === session && !self.choosing && (self.skip || self.screen.app.fastHeld || self.auto))
                        self.taps.press();
                }
            })());
            let current = scene, budget = 10000;
            while (!this.ended && budget-- > 0) {
                this.jump = undefined;
                const music = this.sceneMusic?.(current);
                if (music) {
                    yield* waitForAudio(this.screen.show, [music]);
                    this.screen.app.sound.music(music);
                }
                yield* waitForAudio(this.screen.show, sceneAudio(story, current));
                for (const c of story.scenes[current] ?? []) {
                    yield* this.perform(c);
                    if (this.ended || this.jump)
                        break;
                }
                if (this.jump)
                    current = this.jump;
                else
                    break;
            }
            if (budget <= 0)
                throw Error('대본 이동이 10000회를 넘었습니다.');
        }
        finally {
            this.director.dispose();
            for (const c of this.controls)
                this.screen.ui.remove(c);
            this.active = false;
            for (const { node, visible } of hud)
                node.visible = visible;
        }
    }
}
export class PackStoryScreen extends Screen {
    playback!: StoryPlayback;
    constructor(private readonly story: Story, private readonly scene: string, private readonly cast: Record<string, Actor>, private readonly images: Record<string, HTMLImageElement | undefined>, private readonly state: StoryState, private readonly done: () => void, private readonly options: {
        music?: string;
        sceneMusic?: (scene: string) => string | undefined;
    } = {}) { super(); this.music = options.music; }
    prepare(): Promise<void> | void { const images = preloadImages(sceneImages(this.story, this.scene, this.cast, this.images)), audio = this.app?.sound?.preload?.([...sceneAudio(this.story, this.scene), ...(this.music ? [this.music] : [])]); if (images || audio)
        return Promise.all([images, audio]).then(() => undefined); }
    enter(): void {
        this.playback = new StoryPlayback(this, this.cast, this.images, this.state);
        this.playback.sceneMusic = this.options.sceneMusic;
        const self = this;
        this.run((function* (): Step { yield* self.playback.play(self.story, self.scene); self.done(); })());
        if (Object.values(this.story.scenes).flat().some(c => { while (c.do === 'typed')
            c = c.cue; return c.do === 'enter' && this.cast[c.who]?.height === 0; }))
            this.stage.ui.add(Object.assign(label('임시 그림 · 일부 인물은 음성만 표시', 16, { color: '#ffd23f' }), { x: 110, y: 90 }));
    }
    input(e: InputEvent): void { this.playback.input(e); }
}
