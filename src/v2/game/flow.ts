import {setUiSize} from '../presentation';
import {playerName} from '../../campaign/player';
import {activeHints} from '../map/hints';
import {waitForAudio} from '../pack/preload';
import {ruleCommand} from '../rules/runtime';
import {battleMusic,unitTheme,storyMusic,MapMusic,type Theme} from './music';
import {terrainImages} from '../map/terrain';
import {talkTargets} from '../../scenario/runner';
import { definitions } from '../../scenario/compile';
import type { Pack } from '../pack/load';
import { packActors,packUnit } from '../pack/load';
import { StoryEvents } from '../story/events';
import { PackStoryScreen, StoryPlayback } from '../story/play';
/** 타이틀 → 맵 → 결과 → 인터미션 → 다음 화. 대본은 실행하지 않는다. */
import { CoreCampaign } from '../adapter/campaign';
import { CoreMap } from '../adapter/map';
import { ConfirmScreen } from '../dialogs';
import { label, toast } from '../kit';
import { MapScreen } from '../map/screen';
import { TitleScreen, IntermissionScreen, UpgradeScreen } from '../menus/screens';
import { PartsScreen } from '../menus/parts';
import { PilotScreen } from '../menus/pilots';
import { ShopScreen } from '../menus/shop';
import { SaveScreen } from '../menus/saves';
import { SettingsScreen } from '../menus/settings';
import { ResultScreen } from '../menus/result';
import { CreditsScreen } from '../menus/credits';
import { NewGameScreen } from '../menus/new-game';
import { options, at, type MenuLook } from '../menus/common';
import type { App } from '../screen';
import type { Sample } from '../gallery/sample';
class GameMapScreen extends MapScreen {
    constructor(readonly rules: CoreMap, private readonly campaign: CoreCampaign, flow: GameFlow) {
        super(rules, {speed:()=>campaign.settings().speed,tutorial:()=>!!flow.pack&&rules.state().stage.id===flow.pack.game.episodes[0]?.stage&&!campaign.session.campaign.cycle&&!campaign.settings().helpSeen&&campaign.settings().tutorial!==false,onTutorialDone:()=>campaign.setSettings({...campaign.settings(),helpSeen:true}), ...flow.storyOptions(),hintOptions:flow.pack?.game.mapHints,hints:()=>{const s=rules.hintStatus(),ep=flow.pack?.game.episodes.find(e=>e.stage===s.stageId)?.id;return activeHints((flow.pack?.stageScripts?.[s.stageId]?.hints??[]).map(h=>{const u=h.unit&&s.units.find(u=>u.id===h.unit);return{...h,name:flow.displayName(h.name),objective:h.objective?flow.displayName(h.objective):undefined,...(u?{cell:{col:u.x,row:u.y}}:{})};}),scene=>!!campaign.storyValue(`v2:hint-fired:${ep}:${scene}`)||!!campaign.storyValue(`v2:story:${ep}:${scene}`),id=>!!campaign.session.campaign.flags[id]||!!campaign.storyValue(id),s.round,id=>{const u=s.units.find(u=>u.id===id);return u?u.alive&&!u.removed:s.pending.includes(id);});},animation:()=>campaign.settings().animation,setAnimation:value=>campaign.setSettings({...campaign.settings(),animation:value}),objectives:flow.displayObjectives(rules.state().stage.id),opening:!!flow.pack&&!campaign.storyValue(`v2:sortie:${flow.pack.game.episodes.find(e=>e.stage===rules.state().stage.id)?.id}`), onExit: () => flow.askTitle(), onEnd: () => flow.finish(), phaseMusic:team=>flow.mapMusic?.phase(team,rules.state().round),eventMusic:event=>flow.eventMusic(event),battle: exchange => ({ ...options(campaign), music: flow.pack?battleMusic(rules.state(),exchange,flow.pack.game.music,flow.pack.game.musicRules,u=>flow.castTheme(u)):undefined,opening:flow.pack?.game.musicRules?.battleOpening }),
            menu: [{ label: '저장', run: () => flow.save() }, { label: '설정', run: () => flow.settings() }] });
        const ep=flow.pack?.game.episodes.find(e=>e.stage===rules.state().stage.id);flow.mapMusic=new MapMusic(ep?.mapMusic??flow.pack?.game.musicRules?.stages?.[rules.state().stage.id]?.map??flow.pack?.game.music.map,flow.pack?.game.music['enemy-phase']);flow.musicUnits=new Map(rules.units().map(u=>[u.id,u.team]));this.music=flow.mapMusic.phase(rules.turn().team,rules.state().round);
    }
    enter(): void { super.enter();const paint=this.rules.terrainPaint();if(paint&&terrainImages(paint).some(i=>!i?.naturalWidth))this.stage.ui.add(at(label('임시 지형 · 맵 재료 준비 중',18,{color:'#ffd23f',align:'right'}),1200,76)); this.stage.camera.shakeScale = this.campaign.settings().shake / 10; }
}
export class GameFlow {
    displayName(value:string):string{const p=this.pack;if(!p)return value;const aliases=[...new Set([p.cast[p.players.actor??'']?.name,...p.players.presets.flatMap(v=>v.cast?[p.cast[v.cast]?.name]:[])].filter((n):n is string=>!!n))];return aliases.reduce((s,n)=>s.replaceAll(n,playerName(this.model.session.campaign)),value);}
    displayObjectives(stage:string):import('../map/objectives').Objectives|undefined{const o=this.pack?.game.episodes.find(e=>e.stage===stage)?.objectives;if(o)return{...o,win:[...new Set(o.win.map(v=>this.displayName(v)))],lose:[...new Set(o.lose.map(v=>this.displayName(v)))]};}
    map?: CoreMap;
    storyEvents?: StoryEvents;
    playback?: StoryPlayback;
    mapMusic?:MapMusic;musicUnits=new Map<string,string>();
    castTheme(u:import('../../core').Unit):Theme|undefined{const pilot=this.map?.state().content.pilots.find(p=>p.id===u.pilotId)??this.model.content.pilots.find(p=>p.id===u.pilotId);if(!pilot||!this.pack)return;const id=this.model.lookup.battle.castId?.(u,pilot),cast=id?this.pack.cast[id]:undefined;return u.side==='enemy'&&cast?.enemyTheme?{theme:cast.enemyTheme,priority:cast.enemyThemePriority}:cast?.theme?{theme:cast.theme,priority:cast.themePriority}:this.pack.game.musicRules?.pilots?.[u.pilotId];}
    eventMusic(event:import('../map/model').MapEvent):string|undefined{if(!this.map||!this.pack)return;const s=this.map.state(),rows=event.type==='spawn'?[event.unit]:event.type==='change'?event.units:[];let music:string|undefined;for(const v of rows){const old=this.musicUnits.get(v.id);this.musicUnits.set(v.id,v.team);const u=s.units.find(u=>u.id===v.id);if(!u)continue;if(v.team==='ally'&&old!=='ally'){const theme=unitTheme(s,u,this.pack.game.music,this.pack.game.musicRules,x=>this.castTheme(x))?.theme;this.mapMusic?.join(s.round,theme);music=theme;}else if(event.type==='spawn'&&v.team==='enemy'){const configured=this.pack.game.musicRules?.stages?.[s.stage.id]?.appear?.[u.id];music=configured??(this.pack.game.musicRules?.bossEntrance&&(unitTheme(s,u,this.pack.game.music,this.pack.game.musicRules,x=>this.castTheme(x))?.priority??0)>1?this.pack.game.musicRules.bossEntrance:undefined);}}return music;}
    private episode(): string { return this.pack?.game.episodes.find(e => e.stage === (this.model.session.game?.battle.stage.id??this.model.session.campaign.cleared.at(-1)))?.id ?? this.pack?.game.episodes[0]?.id??''; }
    storyOptions(): import('../map/screen').MapOptions { return !this.pack ? {} : { story: (scene, screen, board) => { if (this.storyEvents)
            this.storyEvents.state.map = cue => { const map = this.map!, at = cue.cell, state = map.state(); if(cue.action==='소진'&&cue.unit)return map.execute(ruleCommand({kind:'exhaust',id:cue.unit}));if(cue.action==='배리어'&&cue.unit)return map.execute(ruleCommand({kind:'barrier',id:cue.unit,value:cue.barrier??0}));if(cue.action==='폼'&&cue.unit&&cue.form)return map.execute(ruleCommand({kind:'form',id:cue.unit,form:cue.form}));if(cue.action==='통행'&&cue.rect)return map.execute(ruleCommand({kind:'passage',rect:cue.rect,blocked:!!cue.blocked})); if (!cue.unit)
                return []; if (cue.action === '이동' && at)
                return map.execute({ type: 'system', unitId: '', action: { kind: 'move', ids: [cue.unit], x: at[0], y: at[1] } }); if (cue.action === '퇴장')
                return map.execute({ type: 'system', unitId: '', action: { kind: 'retreat', ids: [cue.unit] } }); if (cue.action === '합류')
                return map.execute({ type: 'system', unitId: '', action: { kind: 'join', ids: [cue.unit] } }); if (cue.action === '등장' && at) {
                if (map.units().some(u => u.id === cue.unit))
                    return [];
                const unit = definitions(state.stage).find(u => u.id === cue.unit);
                if (!unit)
                    throw new Error(`대기 기체 없음: ${cue.unit}`);
                return map.execute({ type: 'system', unitId: '', action: { kind: 'spawn', units: [{ ...unit, x: at[0], y: at[1] }] } });
            } return []; }; this.playback ??= new StoryPlayback(screen, packActors(this.pack!, this.sample.images), this.sample.images, this.storyEvents!.state, board, () => this.map!.units()); this.playback.eventMusic=event=>{const music=this.eventMusic(event);if(music)screen.music=music;return music;};this.playback.sceneMusic=name=>storyMusic(this.pack!.stories[this.episode()],name,this.episode(),this.pack!.game.music,this.pack!.game.musicRules); const flow = this; return (function* (): import('../flow').Step { const outcomeBefore=flow.map!.state().outcome; flow.storyEvents!.activateScene(scene); const chosen=storyMusic(flow.pack!.stories[flow.episode()],scene,flow.episode(),flow.pack!.game.music,flow.pack!.game.musicRules);if(chosen){yield* waitForAudio(screen.show,[chosen]);screen.app.sound.music(chosen);}yield* flow.playback!.play(flow.pack!.stories[flow.episode()], scene);flow.storyEvents!.finishScene(scene); flow.model.setStoryValue(`v2:story:${flow.episode()}:${scene}`, true); const key = `v2:pending:${flow.episode()}`, pending = JSON.parse(String(flow.model.storyValue(key) || '[]')) as string[]; const i = pending.indexOf(scene); if (i >= 0)
            pending.splice(i, 1); flow.model.setStoryValue(key, JSON.stringify(pending)); if(!outcomeBefore&&flow.map!.state().outcome)flow.finish(); })(); }, storyInput: e => this.playback?.input(e) ?? false }; }
    private story(scene: string, done: () => void, episode = this.episode(), intermission = false): void { const p = this.pack, story = p?.stories[episode]; if (!p || !story?.scenes[scene]) {
        done();
        return;
    } const key = `v2:story:${episode}:${scene}`; const seenFlag = p.game.episodes.find(e => e.id === episode)?.seenFlags?.[scene]; if (this.model.storyValue(key) || seenFlag && this.model.storyValue(seenFlag)) {
        done();
        return;
    } const events = this.storyEvents ?? new StoryEvents(p, this.model, episode);events.activateScene(scene); this.app.push(new PackStoryScreen(story, scene, packActors(p, this.sample.images), this.sample.images, intermission ? events.intermissionState() : events.state, () => {events.finishScene(scene); this.model.setStoryValue(key, true); this.app.pop('none'); done(); },{music:storyMusic(story,scene,episode,p.game.music,p.game.musicRules),sceneMusic:name=>storyMusic(story,name,episode,p.game.music,p.game.musicRules)}), 'none'); }
    readonly look: MenuLook;
    constructor(readonly app: App, readonly model: CoreCampaign, private readonly sample: Pick<Sample,'images'>, private readonly leave?: () => void, readonly pack?: Pack) {
        if(pack)pack.progressFlag=flag=>model.storyValue(flag);
        if(app.loadingScreen)app.loadingScreen.flagValue=flag=>model.storyValue(flag);
        this.look = {lineImages:Object.fromEntries((pack?.players.lines??[]).map(l=>{const id=Object.values(l.mechs??{})[0];return[l.id,id&&pack?sample.images[packUnit(pack,id,'player').art??'']:undefined];})), background: sample.images[pack?.game.titleArt.background??''], portraits: (pack?.players.presets??[]).map(p=>sample.images[p.portrait??'']), temporary: !!pack&&pack.players.presets.some(p=>pack.cast[p.cast??'']?.temporary) };
        model.onSettings = s => { setUiSize(s.uiSize??'auto'); app.flashScale=(s.flash??7)/10; if(app.cinematics)app.cinematics.enabled=s.cinematic!==false; app.sound.sfxVolume = s.sfx / 10; app.sound.musicVolume = s.music / 10; };
        model.onSettings(model.settings());
    }
    /** 현재 진행은 model에 보존한 채 화면 쌓기만 걷는다. */
    private clear(): void {if(this.app.reset){this.app.reset();return;} while (this.app.top)
        this.app.pop('none'); }
    title(): void {
        this.clear();
        this.app.push(new TitleScreen({ title: this.pack?.game.title ?? '전략 RPG', subtitle: this.pack?.game.subtitle ?? '', footer:this.model.storageNotice??this.pack?.game.titleFooter, background: this.look.background, art: this.sample.images[this.pack?.game.titleArt.character ?? ''], music: this.pack?.game.music.title, items: this.titleItems() }), 'none');
    }
    private titleItems():import('../menus/screens').TitleOptions['items'] {
        const latest=this.model.saves.latest();return [
                { label: '새 게임', run: () => this.app.push(new NewGameScreen(this.model, () => {if(this.pack?.game.cinematics?.opening?.when==='new-game'&&this.app.cinematics)void this.app.cinematics.opening('new-game').then(()=>this.show());else this.show(); void this.model.autoSave(); }, this.look)) },
                { label: '이어하기'+((latest?.file?.campaign.cycle??1)>1?' · '+latest!.file!.campaign.cycle+'회차':''), disabled: !latest, run: () => { if (latest)
                        void this.model.load(latest.id).then(() => this.show()).catch(e => toast(this.app.top!, String(e))); } },
                { label: '불러오기', run: () => this.app.push(new SaveScreen(this.model, 'load', () => this.show(), this.look)) },
                { label: '설정', run: () => this.settings() }, { label: '크레딧', run: () => this.app.push(new CreditsScreen(this.model, this.look)) },
                ...(this.pack?.game.cinematics?.opening?[{label:'오프닝 보기',run:()=>{void this.app.cinematics?.play(this.pack!.game.cinematics!.opening!.id);}}]:[]),
                ...(this.leave ? [{ label: '진열장으로', run: this.leave }] : []),
            ];
    }
    openTitle(label:string):void{const item=this.titleItems().find(i=>i.label===label||label==='이어하기'&&i.label.startsWith(label));if(item&&!item.disabled)item.run();else toast(this.app.top!,'이어할 저장이 없습니다.');}
    private atBoundary(kind:import('../loading-screen').LoadingBoundary,task:()=>Promise<void>,done:()=>void):void{if(this.app.boundary)void this.app.boundary(kind,task,done);else this.app.load(task().then(done));}
    show(): void {
        const ep=this.episode(),assets=this.model.session.screen==='title'?undefined:this.pack?.assets?.ensure(ep,(n,total)=>this.app.progress?.(n,total));if(assets){this.atBoundary('story-end',()=>assets,()=>this.show());return;}if(this.model.session.screen!=='title'&&this.pack?.ensureStory&&!this.pack.storyLoaded?.(ep)){this.atBoundary('story-end',()=>this.pack!.ensureStory!(ep),()=>this.show());return;}
        if(this.model.migrationNotice){const text=this.model.migrationNotice;this.model.migrationNotice=undefined;this.app.notify?.(text);}
        if (this.model.session.screen !== 'title')
            void this.model.autoSave();
        this.clear();
        if (this.model.session.screen === 'result') {
            this.result();
            return;
        }
        if (this.model.session.screen === 'intermission' || this.model.session.screen === 'roster') {
            if(this.model.session.campaign.retryNode!==undefined){this.hub();return;}
            this.story('인터미션', () => this.hub(), this.pack?.game.episodes.find(e => e.stage === this.model.session.campaign.cleared.at(-1))?.id ?? this.episode(), true);
            return;
        }
        if (this.model.session.screen === 'end') {
            const ending=this.pack?.game.ending;
            if(ending){this.storyEvents=undefined;this.story(ending.scene,()=>{this.clear();this.app.push(new CreditsScreen(this.model,this.look,()=>{if(this.model.newGamePlus()){this.app.sound.play('important');void this.model.autoSave().then(()=>this.title());}else {this.model.session.screen='title';this.title();}}),'none');},ending.episode,true);return;}
            this.title();
            return;
        }
        const game = this.model.session.game;
        if (!game) {
            this.title();
            return;
        }
        if (game.battle.outcome) {
            game.mode = 'outcome';
            this.finish();
            return;
        }
        // v4 저장의 대화/게시판 대기 자료는 보존한다. 이번 화면은 대본을 틀지 않는다.
        if (this.pack && !this.model.storyValue(`v2:story:${this.episode()}:도입`)) {
            this.storyEvents = new StoryEvents(this.pack, this.model, this.episode());
            const boot = this.storyEvents.process();
            this.model.acceptBattle(boot.state, boot.changes);
            this.story('도입', () => this.show());
            return;
        }
        const state = structuredClone(game.battle);
        state.stage.scenario = !!this.pack && game.scenario!.program.events.some(e => e.code.some(c => 'args' in c && (c.op === 'win' || c.op === 'lose')));
        this.playback = undefined;
        if (this.pack)
            this.storyEvents = new StoryEvents(this.pack, this.model, this.episode());
        const lookup = { ...this.model.lookup,variable:(n:string)=>n.startsWith('affection:')?this.model.storyAffection(n.slice(10)):this.model.storyValue(n),defeatReward:(before:import("../../core").BattleState,event:Extract<import("../../core").BattleEvent,{type:"unit-defeated"}>)=>this.model.rewardForDefeat(before,event),persuadeTargets:(state:typeof game.battle,id:string)=>[...(game.scenario?talkTargets(game.scenario.runner,game.scenario.program,state,id).map(u=>u.id):[]),...(this.pack?.game.recruitment?.[state.stage.id]??[]).filter(r=>r.persuader===id&&state.units.some(u=>u.id===r.unit&&u.alive&&u.side!=='player')).map(r=>r.unit)], ...(this.storyEvents ? { afterCommand: (change: import('../adapter/map').MapChange) => this.storyEvents!.process(change) } : {}), onChange: (state: typeof game.battle, changes: Parameters<CoreCampaign['acceptBattle']>[1]) => { this.model.acceptBattle(state, changes); void this.model.autoSave(); } };
        this.map = new CoreMap(state, lookup,{manualResponse:true});
        const screen = new GameMapScreen(this.map, this.model, this);
        this.app.push(screen, 'none');
        if(state.pending){screen.present([{type:'response'}]);return;}
        const pending = this.pack ? JSON.parse(String(this.model.storyValue(`v2:pending:${this.episode()}`) || '[]')) as string[] : [];
        if (pending.length) {
            screen.present(pending.map(scene => ({ type: 'story' as const, scene })));
            return;
        }
        if (this.pack && !this.model.storyValue(`v2:sortie:${this.episode()}`)) {
            this.model.setStoryValue(`v2:sortie:${this.episode()}`, true);
            screen.present([{ type: 'story', scene: '출격' },{type:'objectives'},{type:'hints'},{type:'phase',team:'ally',turn:this.map.turn().number}]);
        }
    }
    /** 로컬 검수 도구용. 일반 조작에는 노출하지 않는다. */
    debugWin(): void { if (!import.meta.env.DEV || !this.map)
        throw new Error('개발 맵에서만 사용할 수 있습니다.'); const events = this.map.execute({ type: 'system', unitId: '', action: { kind: 'win' } }); if (this.pack && this.app.top instanceof MapScreen)
        this.app.top.present(events);
    else
        this.finish(); }
    private finishing=false;
    finish(): void {if(this.finishing)return;const finish=()=>{this.model.finish();this.clear();this.result();this.finishing=false;},play=()=>{if(this.pack)this.story(this.map?.state().outcome==='defeat'?'패배':'승리',finish);else finish();};
      const assets=this.pack?.assets;if(assets){this.finishing=true;const ep=this.episode(),next=this.pack!.game.episodes[this.pack!.game.episodes.findIndex(e=>e.id===ep)+1]?.id;this.atBoundary('stage-end',async()=>{if(next)await this.pack!.ensureStory?.(next);await assets.transition(ep,next,(n,t)=>this.app.progress(n,t));},play);}else play();
    }
    private result(): void { this.app.push(new ResultScreen(this.model, () => { if (this.model.result().won) {
        this.model.advance();
        this.show();
    }
    else if(this.model.canRetry())
        void this.model.retry().then(()=>this.show()).catch(e=>toast(this.app.top!,String(e)));
    else
        this.title(); }, { ...this.look,music:this.pack?.game.music[this.model.result().won?'victory':'gameover'] },()=>this.title()), 'none'); }
    private hub(): void {
        const open = (screen: import('../screen').Screen) => this.app.push(screen);
        const routes = { sortie: () => this.app.push(new ConfirmScreen(this.model.session.campaign.retryNode!==undefined?'준비를 마치고 다시 출격할까요?':'준비를 마치고 다음 화로 출격할까요?', () => { this.model.advance(); this.show(); },{yes:'출격',no:'아니오',important:true}), 'none'),
            upgrade: () => open(new UpgradeScreen(this.model, {...this.look,music:this.pack?.game.music.upgrade??this.pack?.game.music.intermission})), parts: () => open(new PartsScreen(this.model, this.look)), pilot: () => open(new PilotScreen(this.model, this.look)),
            shop: () => open(new ShopScreen(this.model, this.look)), save: () => this.save(), load: () => open(new SaveScreen(this.model, 'load', () => this.show(), this.look)), settings: () => this.settings() };
        const hub = new IntermissionScreen(this.model, routes, { ...this.look, music: this.pack?.game.music.intermission, art: this.sample.images[this.pack?.game.menuArt??this.pack?.game.titleArt.character??''] });
        this.app.push(hub, 'none');
        hub.ui.setNavigation({kind:'back',onBack:()=>this.askTitle()});

    }
    save(): void { this.app.push(new SaveScreen(this.model, 'save', undefined, {...this.look,music:this.pack?.game.music.save??this.pack?.game.music.intermission})); }
    settings(): void { this.app.push(new SettingsScreen(this.model,this.look,()=>{if(this.app.top instanceof MapScreen)this.app.top.replayTutorial();})); }
    askTitle(): void { this.app.push(new ConfirmScreen('타이틀로 돌아갈까요?\n저장하지 않은 진행은 이어하기에 반영되지 않습니다.', () => this.title()), 'none'); }
}
