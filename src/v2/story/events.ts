/** 기존 사건 실행기는 규칙 명령만 실행한다. 대사·지문·선택 UI는 .story가 맡는다. */
import { playerName } from '../../campaign/player';
import { enqueue, run, resume } from '../../scenario/runner';
import type { Program, ScenarioEvent } from '../../scenario/types';
import type { BattleState, BattleEvent, Command } from '../../core';
import type { CoreCampaign } from '../adapter/campaign';
import type { MapChange } from '../adapter/map';
import type { Pack } from '../pack/load';
import type { StoryState } from './play';
import {stageApply} from './stage-core';
import {stageFacts} from './stage';
import {prepareRules,runtime,setRuleVariable,formName,phase,faction,type RuleEvent} from '../rules/runtime';
import {configOf} from '../rules/config';
const visual = new Set(['talk', 'narrate', 'choice', 'fade', 'wait', 'camera', 'bgm']);
export class StoryEvents {
    readonly state: StoryState;
    private facts: Record<string, string|number|boolean> = {};
    private activeFacts?:Record<string,string|number|boolean>;
    constructor(readonly pack: Pack, readonly model: CoreCampaign, readonly episode: string) { this.state = {speakerName:id=>id===pack.players.actor||id===model.session.campaign.player?.cast?playerName(model.session.campaign):undefined, placeholders:pack.players.placeholders,unitName:()=>model.session.campaign.player?.unitName??'',recruit: id => model.storyRecruit(id), playerName: () => playerName(model.session.campaign), choose: (n, i) => model.storyChoice(n, i), type: () => model.session.campaign.player?.type??pack.players.presets[0].type, candidates:pack.game.story?.affection,actor:id=>id===pack.players.actor?model.session.campaign.player?.cast??id:id, get: name => name === '턴' ? (model.session.game?.battle.round ?? 0) : name in (this.activeFacts??this.facts) ? (this.activeFacts??this.facts)[name] : typeof model.storyValue('v2:fact:' + name) === 'string' ? JSON.parse(String(model.storyValue('v2:fact:' + name))) : model.storyValue(name), set: (n, v) => model.setStoryValue(n, v), affection: (n, a) => model.storyAffection(n, a) }; }
    private factQueue():{scene:string;facts:Record<string,string|number|boolean>}[]{try{return JSON.parse(String(this.model.storyValue(`v2:scene-facts:${this.episode}`)||'[]'));}catch{return [];}}
    activateScene(scene:string):void{this.activeFacts=this.factQueue().find(s=>s.scene===scene)?.facts??{...this.facts};}
    finishScene(scene:string):void{const q=this.factQueue(),i=q.findIndex(s=>s.scene===scene);if(i>=0)q.splice(i,1);this.model.setStoryValue(`v2:scene-facts:${this.episode}`,JSON.stringify(q));this.activeFacts=undefined;}
    process(change?: MapChange): {
        state: BattleState;
        changes: MapChange[];
        scenes: string[];
        beforeScenes: string[];
    } {
        const game = this.model.session.game!;
        const runner = game.scenario!.runner, program = game.scenario!.program;
        let state = change?.after ?? game.battle;
        prepareRules(state);
        for(const c of configOf(state.stage).combos)if(c.requiresFlag)setRuleVariable(state,c.requiresFlag,this.model.storyValue(c.requiresFlag));
        for(const c of configOf(state.stage).combos)setRuleVariable(state,c.flag,c.flag.startsWith('affection:')?this.model.storyAffection(c.flag.slice(10)):this.model.storyValue(c.flag));
        for(const [key,value]of Object.entries(runtime(state).vars))if(!configOf(state.stage).combos.some(c=>c.flag===key))this.model.setStoryValue(key,value);
        const candidate=this.pack.stageScripts?.[state.stage.id],compiled=candidate&&program.events.some(e=>e.loc.file===this.pack.stories[this.episode]?.file)?candidate:undefined;
        if(compiled)stageFacts(compiled,state,this.model.session.campaign.flags);
        const markedScenes:string[]=[];

        const masked: Program = { ...program, events: program.events.map((e,i) => ({ ...e, code: e.code.map((c,pc) => 'args' in c && visual.has(c.op)&&!compiled?.markers[`${i}:${pc}`] ? { ...c, op: 'noop' } : c) })) };
        enqueue(runner, masked, change ? [...change.events] as ScenarioEvent[] : [{ type: 'start' }, { type: 'phase-start', phase: state.phase, round: state.round }], state);
        const changes: MapChange[] = [];
        if(change?.command.type==='persuade')for(const r of this.pack.game.recruitment?.[state.stage.id]??[])if(r.unit===change.command.targetId&&r.persuader===change.command.unitId){const cmd:Command={type:'system',unitId:'',action:{kind:'join',ids:[r.unit]}},joined=stageApply(state,cmd);changes.push({before:state,after:joined.state,command:cmd,events:joined.events});state=joined.state;if(compiled)stageFacts(compiled,state,this.model.session.campaign.flags);enqueue(runner,masked,joined.events,state);if(r.flag)this.model.setStoryValue(r.flag,1);if(r.affection)this.model.storyAffection(r.affection.id,r.affection.amount);}
        const commands: Command[] = [], events: BattleEvent[] = [];
        let guard = 0;
        while ((runner.queue.length || runner.waiting) && !state.outcome) {
            if (++guard > 10000)
                throw new Error('사건 실행 제한');
            if (runner.waiting){const task=runner.queue[0];if(task)markedScenes.push(...compiled?.markers[`${task.event}:${task.pc-1}`]??[]);}
            if (runner.waiting)
                resume(runner);
            const previous = state;
            const count = commands.length, ec = events.length;
            state = run(runner, masked, state, this.model.session.campaign, commands, events);
            for (const [i, command] of commands.slice(count).entries())
                changes.push({ before: previous, after: state, command, events: i === commands.length - count - 1 ? events.slice(ec) : [] });
        }
        for(const scene of markedScenes)this.model.setStoryValue(`v2:hint-fired:${this.episode}:${scene}`,true);
        const scenes=markedScenes.filter(s=>!!this.pack.stories[this.episode]?.scenes[s]);
        const beforeScenes: string[] = [];
        const source = this.pack.stories[this.episode];
        for (const e of [...(change?.events ?? []), ...events]) {
            let scene: string | undefined;
            if (e.type === 'phase-start'&&!(e.phase==='enemy'&&phase(state)==='third'))
                scene = `${e.phase === 'enemy' ? '적 턴' : '턴'} ${e.round}`;
            if (e.type === 'unit-defeated'){
                const by=state.units.find(u=>u.id===e.by);this.facts['격파자 '+e.unitId]=e.by;this.facts['격파진영 '+e.unitId]=by?faction(by):'';
                const unit=state.units.find(u=>u.id===e.unitId),form=unit&&formName(state,unit);
                scene = form&&source.scenes[`격파 ${e.unitId} ${form}`]?`격파 ${e.unitId} ${form}`:`격파 ${e.unitId}`;
            }
            const rule=e as unknown as RuleEvent;
            if(rule.type==='v2-scene')scene=rule.scene;
            if(rule.type==='v2-phase')scene=`제3 턴 ${rule.round}`;
            if (e.type === 'outcome')
                scene = e.outcome === 'victory' ? '승리' : '패배';
            if (scene && source.scenes[scene] && !scenes.includes(scene))
                scenes.push(scene);
            if (e.type === 'attack')
                for (const id of [e.attackerId, e.targetId]) {
                    const scene = `조우 ${id}`, key = `v2:encounter:${this.episode}:${id}`;
                    if (source.scenes[scene] && !this.model.storyValue(key)) {
                        this.model.setStoryValue(key, true);
                        beforeScenes.push(scene);
                    }
                }
        }
        for(const cues of Object.values(source.scenes))for(const cue of cues){if(cue.do!=='condition'||!cue.test.name.startsWith('인접 '))continue;const [,a,b]=cue.test.name.split(' '),u=state.units.find(u=>u.id===a),v=state.units.find(u=>u.id===b);this.facts[cue.test.name]=!!u?.alive&&!!v?.alive&&!u.removed&&!v.removed&&Math.abs(u.x-v.x)+Math.abs(u.y-v.y)===1;}
        for(const u of state.units){this.facts['생존 '+u.id]=u.alive&&!u.removed;this.facts['격파 '+u.id]=!u.alive&&!u.removed;this.facts['전투횟수 '+u.id]=runtime(state).battles[u.id]??0;this.facts['형태 '+u.id]=formName(state,u)??'';}
        for(const key of Object.keys(runtime(state).defeated))this.facts['격파형태 '+key.replace('.', ' ')]=true;
        const pendingKey = `v2:pending:${this.episode}`, pending = JSON.parse(String(this.model.storyValue(pendingKey) || '[]')) as string[];
        const queued=[...beforeScenes,...new Set(scenes)],facts=this.factQueue();facts.push(...queued.map(scene=>({scene,facts:{...this.facts}})));this.model.setStoryValue(`v2:scene-facts:${this.episode}`,JSON.stringify(facts));
        pending.push(...queued);
        this.model.setStoryValue(pendingKey, JSON.stringify(pending));
        for (const [name, fact] of Object.entries(this.facts))
            this.model.setStoryValue('v2:fact:' + name, JSON.stringify(fact));
        game.battle = state;
        return { state, changes, scenes: [...new Set(scenes)], beforeScenes };
    }
    /** 인터미션 조건은 선택으로 바뀌므로 매번 현재 값을 조회한다. */
    intermissionState():StoryState{return {...this.state,get:name=>this.model.storyValue(name)};}
}
