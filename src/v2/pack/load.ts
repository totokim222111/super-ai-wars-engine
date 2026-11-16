import {battleLineIssues,type BattleLines,type PackBattleDialogue} from '../battle/lines';
import {mediaPath} from './paths';
import {resolveMusic} from '../game/music';
import {defaultPlayers,validatePlayers,type PlayerConfig} from '../../campaign/player';
import {configOf,replaceConfig,type RulesConfig} from '../rules/config';
import type { MoodSheet, Portrait } from '../portrait';
import {packUsage} from './usage';
import type { Recolor } from './images';
import type {SoundPack} from '../sound';
import {progressionIssues,type Economy,type Training} from './progression';
import {compileStage,type CompiledStage} from '../story/stage';
import type {MapTheme} from '../map/terrain';
import {stageAI} from '../story/stage-ai';
import type {Unit} from '../../core';
import { loadRules, validateContent, validateStage, type Content } from '../../core';
import { definitions } from '../../scenario/compile';
import type { CampaignContent } from '../../campaign/content';
import type { Actor } from '../director';
import type { Anchors, WeaponAnim } from '../battle/types';
import { TEMPLATES } from '../battle/templates';
import type { MapLookup } from '../adapter/map';
import type { Spirit } from '../spirit';
import { parseStory, type Issue, type Story } from '../story/parse';

export interface CastDef {
    theme?:string;themePriority?:number;enemyTheme?:string;enemyThemePriority?:number;
    battleLines?:BattleLines;
    moodAliases?:Record<string,string>;
    name: string;
    aliases?: string[];
    color: string;
    bust?: string;
    height: number;
    moods: Record<string, string>;
    moodSheet?: MoodSheet;
    moodNames?: Record<string, string>;
    framing?: Actor['framing'];
    framingByArt?:Record<string,NonNullable<Actor['framing']>>;
    face?: number[];
    cutin?: number[];
    /** 다른 인물의 그림을 빌려 쓰는 중이면 true. 검사 도구의 경고 목록에 남는다. */
    temporary?: boolean;
    /** 그림 없이 이름과 대사만 나오는 방송·시스템 음성. 등장 지시는 쓰지 않는다. */
    voiceOnly?: boolean;
}
export interface UnitDef {
    forms?:Record<string,Omit<UnitDef,'forms'>>;
    /** Presentation overrides for the stage's named tactical forms; no rule values. */
    tacticalForms?:Record<string,Omit<UnitDef,'forms'|'tacticalForms'>>;
    art?: string;
    icon?: string;
    iconCrop?: [number,number,number,number];
    recolor?: Recolor;
    height?: number;
    faces?: 'left' | 'right';
    anchors?: Anchors;
    pilotCast?: string;
    temporary?: boolean;
}
interface Fallback {
    anchors?: Anchors;
    art: string;
    icon: string;
    cast: string;
    faces: 'left' | 'right';
    height: number;
}
export interface StageAdjustment {enemyPilotScaling?:import('../../core').EnemyPilotScaling;content?:import('../../core').Stage['contentOverrides'];units?:Record<string,Partial<import('../../core').StageUnit>>;rules?:Partial<RulesConfig>;enemyUpgradeLevel?:number;aliases?:Record<string,string>}
export interface PackGame {
    visibility?:{flag:string;cast?:string[];units?:string[];images?:string[];scenes?:string[]}[];
    recruitment?:import('./progression').Recruitment;
    loadingScreens?:import('../loading-screen').LoadingEntry[];
    loadingScreenFallbacks?:import('../loading-screen').LoadingEntry[];
    cinematics?:import('../screen').CinematicConfig;
    enemyAI?:string;
    stageRewards?:Record<string,Record<string,number>>;
    stageAdjustments?:string|Record<string,StageAdjustment>;
    battleRules?:Omit<Partial<import('../../core').Rules>,'ai'|'k'|'morale'>&{ai?:Partial<import('../../core').Rules['ai']>;k?:Partial<import('../../core').Rules['k']>;morale?:Partial<import('../../core').Rules['morale']>};
    saveMigrations?:string;
    battleDialogue?:string;
    mapHints?:import('../map/hints').HintOptions;
    unitInfo?:{stats?:Record<string,{name:string;desc:string}>};
    rules?:{spiritAfterAction?:boolean};
    musicRules?:import('../game/music').MusicRules;
    id:string;players?:string;defaultMap?:string;defaultPilot?:string;anonymousPilots?:string[];pilotCasts?:Record<string,string>;menuArt?:string;
    credits?:{title:string;detail:string}[];
    story?:{affection?:{id:string;flag?:string}[];affectionAliases?:Record<string,string>};
    gallery?:string|{cast?:string[];fighters?:{cast:string}[];[key:string]:unknown};
    compatibility?:{units?:Record<string,string>;cast?:Record<string,string>};
    maps?:Record<string,string>;
    economy?:string;
    training?:string;
    titleFooter?:string;
    title: string;
    subtitle: string;
    terms: Record<string, string>;
    titleArt: {
        background: string;
        character: string;
    };
    art: {
        focus?:Record<string,import('../image-layout').ImageFocus>;
        metadata?:string;
        base: string;
        files: Record<string, string>;
    };
    audio: {
        base: string;
        credits?: string;
        pack?: string;
    };
    music: Record<string, string>;
    ending?: { episode: string; scene: string };
    episodes: {
        id: string;
        titleFooter?:string;
    title: string;
        stage: string;
        story: string;
        seenFlags?: Record<string, string>;
        intermission?: boolean;
        mapMusic?:string;
        minimumLevel?:number;
        objectives?: import('../map/objectives').Objectives;
        battleBackground?: string;
    }[];
    fallbacks: {
        ally: Fallback;
        enemy: Fallback;
        terrain: string;
        background: string;
    };

}
export interface Pack {
    progressFlag?:(flag:string)=>string|number|boolean;
    assets?:import('./assets').StageLoader;
    stageRewards?:Record<string,Record<string,number>>;
    battleDialogue?:PackBattleDialogue;
    /** 배포 브라우저 전용. 규칙 색인은 먼저, 대사 본문은 화를 열 때 읽는다. */
    storyLoaded?:(episode:string)=>boolean;
    ensureStory?:(episode:string)=>Promise<void>;
    ensureExamples?:()=>Promise<void>;
    ensureGallery?:()=>Promise<void>;
    maps?:Record<string,MapTheme>;
    stageScripts?:Record<string,CompiledStage>;
    players:PlayerConfig;
    examples?:{id:string;title:string;stage:string;story:string;parsed:Story;compiled:CompiledStage}[];
    economy?:Economy;
    training?:Training;
    audio?:SoundPack;
    root: string;
    game: PackGame;
    cast: Record<string, CastDef>;
    units: Record<string, UnitDef>;
    weapons: Record<string, {
        anim: WeaponAnim;
        cutin?: boolean;
        video?:string;
        lineSource?:string;
    }>;
    spirits: Record<string, Omit<Spirit, 'name'>>;
    rules: Content;
    campaign: CampaignContent;
    stories: Record<string, Story>;
    errors: Issue[];
    warnings: Issue[];
    sources: Record<string, string>;
}
export type ReadText = (path: string) => Promise<string>;
/** 경로는 프로젝트 루트 기준 POSIX 경로다. I/O는 호출하는 쪽이 준다. */
export function resolvePath(root: string, path: string): string { const parts: string[] = []; for (const x of `${root}/${path}`.split('/')) {
    if (x === '..')
        parts.pop();
    else if (x && x !== '.')
        parts.push(x);
} return parts.join('/'); }
export async function loadPack(root: string, read: ReadText, exists?: (path: string) => Promise<boolean>,options:{examples?:boolean;gallery?:boolean}={}): Promise<Pack> {
    const errors: Issue[] = [], warnings: Issue[] = [], sources: Record<string, string> = {};
    let audio:SoundPack|undefined;
    async function json(path: string): Promise<unknown> { try {
        sources[path] = await read(path);
        return JSON.parse(sources[path].replace(/^\uFEFF/, ''));
    }
    catch (e) {
        errors.push({ file: path, line: 1, message: `자료를 읽을 수 없습니다: ${String(e)}`, fix: '파일 경로와 JSON 구문을 확인하세요.' });
        return {};
    } }
    const names = ['game', 'cast', 'units', 'weapons', 'spirits', 'rules'];
    const values = await Promise.all(names.map(n => json(`${root}/${n}.json`)));
    for (let i=0;i<values.length;i++) if (!values[i] || typeof values[i]!=='object' || Array.isArray(values[i])) {errors.push({file:`${root}/${names[i]}.json`,line:1,message:'최상위 값은 JSON 객체여야 합니다.',fix:'{ "id": { ... } } 형태로 적으세요.'});values[i]={};}
    const [game, cast, units, weapons, spirits, refs] = values as [
        PackGame,
        Pack['cast'],
        Pack['units'],
        Pack['weapons'],
        Pack['spirits'],
        Record<string, string | string[]>
    ];
    game.id??=root.split('/').at(-1)!;const media=(path:string)=>mediaPath(game.id,path);
    for(const [id,path]of Object.entries(game.art?.files??{}))game.art.files[id]=media(path);if(game.audio?.base)game.audio.base=media(game.audio.base);for(const v of Object.values(game.cinematics?.videos??{}))if(v.file)v.file=media(v.file);
    const progression:{economy?:Economy;training?:Training}={};
    for(const name of ['economy','training'] as const)if(game[name]!==undefined){
        if(typeof game[name]!=='string'||!game[name])errors.push({file:`${root}/game.json`,line:1,message:`${name} 파일 경로는 문자열이어야 합니다.`,fix:`"${name}": "${name}.json"을 적으세요.`});
        else {const value=await json(resolvePath(root,game[name]));if(value&&typeof value==='object'&&!Array.isArray(value))Object.assign(progression,{[name]:value});else errors.push({file:resolvePath(root,game[name]),line:1,message:'최상위 값은 JSON 객체여야 합니다.',fix:'자료를 { ... } 객체로 적으세요.'});}
    }
    const stageAdjustments=typeof game.stageAdjustments==='string'?await json(resolvePath(root,game.stageAdjustments))as Record<string,StageAdjustment>:game.stageAdjustments??{};
    const battleDialogue=game.battleDialogue?await json(resolvePath(root,game.battleDialogue))as PackBattleDialogue:undefined;
    let players=game.players?await json(resolvePath(root,game.players))as PlayerConfig:structuredClone(defaultPlayers);try{validatePlayers(players);}catch(e){errors.push({file:resolvePath(root,game.players??'game.json'),line:1,message:String(e),fix:'중복 없는 타입·계열과 유효한 이름 규칙을 적으세요.'});players=structuredClone(defaultPlayers);}
    const defaults=loadRules(),overrides=game.battleRules;const battleRules={...defaults,...overrides,ai:{...defaults.ai,...overrides?.ai},k:{...defaults.k,...overrides?.k},morale:{...defaults.morale,...overrides?.morale}};
    const raw: Record<string, unknown> = { version: refs.version ?? 'pack-1', rules: battleRules,terms:game.terms,options:game.rules??{spiritAfterAction:false} };
    for (const [k, v] of Object.entries(refs)) {
        if (k === 'version' || k === 'stages')
            continue;
        const paths=Array.isArray(v)?v:[v];if(paths.some(p=>typeof p!=='string'||!resolvePath(root,p).startsWith(root+'/'))){errors.push({file:root+'/rules.json',line:1,message:'팩 밖 수치 경로: '+k,fix:'팩 안에 수치 파일을 두세요.'});continue;}raw[k] = Array.isArray(v) ? (await Promise.all(v.map(p => json(resolvePath(root, p))))).flat() : await json(resolvePath(root, v));
    }
    const campaign:CampaignContent={...(game.saveMigrations?{saveMigrations:await json(resolvePath(root,game.saveMigrations))as import('../../campaign/save-migration').SaveMigration[]}:{}),id:game.id??root.split('/').at(-1),players,characters:[],nodes:[],stages:{}};
    if(typeof game.gallery==='string'&&options.gallery!==false)game.gallery=await json(resolvePath(root,game.gallery))as Exclude<PackGame['gallery'],string>;
    const maps:Record<string,MapTheme>={},stageScripts:Record<string,CompiledStage>={};
    for(const [id,path]of Object.entries(game.maps??{})){if(typeof path!=='string'){errors.push({file:`${root}/game.json`,line:1,message:`무대 경로 오류: ${id}`,fix:'maps의 값은 maps/setting.json 같은 경로입니다.'});continue;}maps[id]=await json(resolvePath(root,path))as MapTheme;}
    try {
        validateContent(raw);
        for (const entry of Object.values(campaign.stages ?? {}))
            validateStage(entry.stage, raw);
    }
    catch (e) {
        errors.push({ file: `${root}/rules.json`, line: 1, message: String(e), fix: '기존 수치 파일의 id와 참조 경로를 확인하세요.' });
    }
    if (game.audio?.pack) {
        const path = resolvePath(root, game.audio.pack);audio = await json(path) as SoundPack;
        for (const [id, entry] of Object.entries({ ...audio.sfx, ...audio.bgm }))
            if (!entry.license || !entry.source)
                warnings.push({ file: path, line: (sources[path].slice(0, sources[path].indexOf(`"${id}"`)).match(/\n/g)?.length ?? 0) + 1, kind: '소리 출처', message: `라이선스·출처 없음: ${id}`, fix: 'license와 source를 적으세요.' });
    }
    const enemyAI=game.enemyAI?await json(resolvePath(root,game.enemyAI))as Record<string,import('../../core').AIPatterns>:{};
    const stories: Record<string, Story> = {};
    for (const ep of game.episodes ?? []) {
        const path = `${root}/${ep.story}`;
        try {
            const text = await read(path);
            sources[path] = text;
            stories[ep.id] = parseStory(text, path, {cast,images:Object.keys(game.art?.files??{}),affectionAliases:game.story?.affectionAliases});
            errors.push(...stories[ep.id].issues);
            if(stories[ep.id].stage){
                const compiled=compileStage(stories[ep.id].stage!,{id:ep.stage,name:ep.title,content:raw as unknown as Content,roster:Object.values(campaign.stages).flatMap(s=>[...s.stage.units,...(s.stage.definitions??[])]),defaultMap:game.defaultMap,defaultPilot:game.defaultPilot,cast,units,scenes:stories[ep.id].scenes},path);
                const adjustment=stageAdjustments[ep.stage];if(adjustment){const st=compiled.stage;if(adjustment.enemyPilotScaling)st.enemyPilotScaling=structuredClone(adjustment.enemyPilotScaling);if(adjustment.enemyUpgradeLevel!==undefined)st.enemyUpgradeLevel=adjustment.enemyUpgradeLevel;st.contentOverrides={...adjustment.content,aliases:adjustment.aliases};for(const u of definitions(st))Object.assign(u,structuredClone(adjustment.units?.[u.id]??{}));const rc={...configOf(st),...adjustment.rules,units:{...configOf(st).units,...adjustment.rules?.units}};for(const co of rc.combos){const base=(raw.weapons as Content['weapons']).find(w=>w.id===co.weapon)!;if(!(raw.weapons as Content['weapons']).some(w=>w.id===co.virtual))(raw.weapons as Content['weapons']).push({...base,id:co.virtual,en:co.costs?.[0]??base.en,map:undefined,ammo:undefined,postMove:co.postMove??true});}for(const t of rc.transitions??[])st.definitions!.push(...structuredClone(t.spawns));replaceConfig(st,rc);}
                if(enemyAI[ep.stage])compiled.stage.aiPatterns=structuredClone(enemyAI[ep.stage]);
                stageScripts[ep.stage]=compiled;if(ep.minimumLevel!==undefined)compiled.stage.minimumLevel=ep.minimumLevel;errors.push(...compiled.issues);
                if(compiled.mapArt&&!game.art.files[compiled.mapArt])errors.push({file:path,line:stories[ep.id].stage!.rules.find(r=>r.text.startsWith('맵 그림:'))?.line??1,message:`없는 맵 그림: ${compiled.mapArt}`,fix:'game.json art.files에 그림을 등록하세요.'});
                campaign.stages[ep.stage]={...campaign.stages[ep.stage],stage:compiled.stage,program:compiled.program};
                if(!maps[compiled.setting])errors.push({file:path,line:stories[ep.id].stage!.line,message:`없는 무대: ${compiled.setting}`,fix:'game.maps에 등록된 무대 이름을 쓰세요.'});
                ep.objectives=compiled.objectives;
                if(!campaign.nodes.some(n=>n.type==='stage'&&n.id===ep.stage))campaign.nodes.push({type:'stage',id:ep.stage},...(ep.intermission===false?[]:[{type:'intermission' as const}]));
            }
            if(!campaign.stages?.[ep.stage])errors.push({file:path,line:1,message:`없는 스테이지: ${ep.stage}`,fix:'@ 규칙과 @ 맵을 적으세요.'});
            const ids = new Set(campaign.stages?.[ep.stage] ? definitions(campaign.stages[ep.stage].stage).map(u => u.id) : []);
            for (const loc of stories[ep.id].locations) {
                const c = stories[ep.id].scenes[loc.scene][loc.index];
                if(c.do==='map'&&c.action==='폼'&&c.unit&&!configOf(campaign.stages[ep.stage].stage).units[c.unit]?.forms?.some(f=>f.id===c.form))errors.push({file:path,line:loc.line,message:'없는 폼: '+c.unit+' '+c.form,fix:'@ 규칙의 형태 목록을 확인하세요.'});
                if(c.do==='map'&&c.rect){const [x,y,xx,yy]=c.rect,map=campaign.stages[ep.stage].stage.map;if(x>xx||y>yy||xx>=map.w||yy>=map.h)errors.push({file:path,line:loc.line,message:'통행 범위 오류',fix:'맵 안의 왼쪽 위~오른쪽 아래를 쓰세요.'});}
                if (c.do === 'map' && c.unit && !ids.has(c.unit))
                    errors.push({ file: path, line: loc.line, message: `없는 맵 기체: ${c.unit}`, fix: '스테이지의 units·waves·defs에 있는 기체 id를 쓰세요.' });
            }
        }
        catch (e) {
            errors.push({ file: path, line: 1, message: String(e), fix: '화의 .story 파일을 만드세요.' });
        }
    }
    for(const field of ['loadingScreens','loadingScreenFallbacks'] as const)if(game[field]!==undefined){const list=game[field];if(!Array.isArray(list))errors.push({file:root+'/game.json',line:1,message:field+': 목록이 필요합니다.',fix:'image와 cast를 가진 목록을 적으세요.'});else for(const row of list)if(!row||typeof row.image!=='string'||!row.image||typeof row.cast!=='string'||!cast[row.cast])errors.push({file:root+'/game.json',line:1,message:field+': 그림 경로 또는 인물 오류',fix:'팩 안 그림 경로와 존재하는 cast id를 쓰세요.'});}
    if(game.mapHints?.order&&(!Array.isArray(game.mapHints.order)||game.mapHints.order.some(k=>!['victory','optional','danger'].includes(k))||new Set(game.mapHints.order).size!==game.mapHints.order.length))errors.push({file:root+'/game.json',line:1,message:'지도 안내 순서 오류',fix:'mapHints.order에 victory, optional, danger를 중복 없이 적으세요.'});
    for(const [id,d]of Object.entries(game.unitInfo?.stats??{}))if(!id||!d||typeof d.name!=='string'||typeof d.desc!=='string')errors.push({file:root+'/game.json',line:1,message:'추가 능력치 설명 오류: '+id,fix:'unitInfo.stats에 name, desc 문자열을 적으세요.'});
    const examples:NonNullable<Pack['examples']>=[];
    if(options.examples!==false)try {const indexText=await read(`${root}/samples.json`);sources[`${root}/samples.json`]=indexText;const index=JSON.parse(indexText)as {id:string;title:string;stage:string;story:string}[];for(const example of index){const path=`${root}/${example.story}`,text=await read(path),parsed=parseStory(text,path,{cast,images:Object.keys(game.art?.files??{}),affectionAliases:game.story?.affectionAliases});sources[path]=text;errors.push(...parsed.issues);if(!parsed.stage){errors.push({file:path,line:1,message:'견본의 @ 규칙이 없습니다.',fix:'@ 규칙과 @ 맵을 적으세요.'});continue;}const compiled=compileStage(parsed.stage,{id:example.stage,name:example.title,content:raw as unknown as Content,roster:Object.values(campaign.stages).flatMap(s=>s.stage.units.filter(u=>u.side==='player')),defaultMap:game.defaultMap,defaultPilot:game.defaultPilot,cast,units,scenes:parsed.scenes},path);errors.push(...compiled.issues);examples.push({...example,parsed,compiled});}}catch(e){if(sources[`${root}/samples.json`])errors.push({file:`${root}/samples.json`,line:1,message:String(e),fix:'견본 목록과 story 경로를 확인하세요.'});}
    for(const example of examples){const c=example.compiled;if(c.mapArt&&!game.art.files[c.mapArt])errors.push({file:`${root}/${example.story}`,line:example.parsed.stage!.rules.find(r=>r.text.startsWith('맵 그림:'))?.line??1,message:`없는 맵 그림: ${c.mapArt}`,fix:'game.json art.files에 그림을 등록하세요.'});if(!maps[c.setting])errors.push({file:`${root}/${example.story}`,line:example.parsed.stage!.line,message:`없는 무대: ${c.setting}`,fix:'game.maps의 무대 이름을 쓰세요.'});}
    for(const c of Object.values(stageScripts))for(const co of configOf(c.stage).combos)weapons[co.virtual]=structuredClone(weapons[co.weapon]);
    const pack: Pack = {stageRewards:game.stageRewards,battleDialogue, root, game, cast, units, weapons, spirits, rules: raw as unknown as Content, campaign, stories, errors, warnings, sources,maps,stageScripts,examples,players,...progression,...(audio?{audio}:{}) };
    const chars=new Set<string>();for(const t of (Array.isArray(raw.terrain)?raw.terrain:[])as (Content['terrain'][number]&{char?:string})[])if(t.char!==undefined){if(typeof t.char!=='string'||t.char.length!==1||chars.has(t.char))errors.push({file:`${root}/rules.json`,line:1,message:`지형 char 오류 또는 중복: ${t.id}`,fix:'terrain의 char는 지형마다 다른 한 글자로 적으세요.'});else chars.add(t.char);}
    for(const [id,theme]of Object.entries(maps)){
        const path=resolvePath(root,game.maps![id]),bad=(message:string,fix:string)=>errors.push({file:path,line:1,message,fix});
        if(!theme||typeof theme.ground!=='string'||typeof theme.color!=='string'||!theme.tiles||typeof theme.tiles!=='object'||Array.isArray(theme.tiles)){bad('무대 재료 형식 오류','ground·color·tiles를 적으세요.');continue;}
        const ids=[theme.ground];
        if(theme.propsAtlas){const a=theme.propsAtlas;if(typeof a.art!=='string'||!Number.isInteger(a.width)||a.width<=0||!Number.isInteger(a.height)||a.height<=0||!a.rects||typeof a.rects!=='object'||Array.isArray(a.rects))bad('소품 아틀라스 형식 오류','propsAtlas에 art, width, height, rects를 적으세요.');else {ids.push(a.art);for(const [key,r]of Object.entries(a.rects))if(!Array.isArray(r)||r.length!==4||r.some(n=>!Number.isInteger(n))||r[0]<0||r[1]<0||r[2]<=0||r[3]<=0||r[0]+r[2]>a.width||r[1]+r[3]>a.height)bad(`소품 아틀라스 좌표 오류: ${key}`,'rects의 [x,y,w,h]는 아틀라스 안의 정수 사각형입니다.');}}
        if(theme.buildings){const b=theme.buildings;if(typeof b.art!=='string'||b.cols!==4||b.rows!==2||!Array.isArray(b.sizes)||JSON.stringify(b.sizes)!=='[[1,1],[2,1],[2,2],[3,2]]')bad('건물 세트 형식 오류','buildings에 art, cols:4, rows:2, sizes:[[1,1],[2,1],[2,2],[3,2]]를 적으세요.');else ids.push(b.art);}
        for(const [terrain,tile]of Object.entries(theme.tiles)){
            if(!tile||typeof tile!=='object'||Array.isArray(tile)){bad(`지형 재료 형식 오류: ${terrain}`,'지형 id의 값은 surface·props·density 객체입니다.');continue;}
            if(!(raw.terrain as Content['terrain']).some(t=>t.id===terrain))bad(`없는 지형: ${terrain}`,'rules의 terrain id를 쓰세요.');
            if(tile.density!==undefined&&(!Number.isFinite(tile.density)||tile.density<0||tile.density>1))bad('소품 밀도 범위 오류','density는 0~1입니다.');
            if(tile.surface!==undefined&&typeof tile.surface!=='string')bad('바닥 그림 id 형식 오류','surface는 그림 id 문자열입니다.');else if(tile.surface)ids.push(tile.surface);
            if(tile.props!==undefined&&(!Array.isArray(tile.props)||tile.props.some(x=>typeof x!=='string')))bad('소품 그림 목록 형식 오류','props는 그림 id 문자열 배열입니다.');else ids.push(...(tile.props??[]).filter(key=>!theme.propsAtlas?.rects?.[key]));
            if(tile.edge!==undefined&&!['road','water'].includes(tile.edge))bad('경계 종류 오류','edge는 road 또는 water입니다.');
            if(tile.scale!==undefined&&(!Number.isFinite(tile.scale)||tile.scale<=0||tile.scale>2))bad('소품 크기 범위 오류','scale은 0 초과 2 이하입니다.');
        }
        const missing=ids.filter(id=>!game.art.files[id]);if(missing.length)warnings.push({file:path,line:1,kind:'맵 재료',message:`임시 단색 사용: ${id} (${missing.length}개)`,fix:'맵 재료가 완성되면 WebP로 넣고 같은 그림 id로 등록하세요.'});
    }
    if(battleDialogue){
      if(battleDialogue.defaults?.enemy)for(const m of battleLineIssues(battleDialogue.defaults.enemy,['default','hit',...Object.values(cast).flatMap(c=>[...Object.keys(c.moods??{}),...Object.keys(c.moodAliases??{}),...(c.moodSheet?.order??[])])]))errors.push({file:root+'/'+game.battleDialogue,line:1,message:m,fix:'공통 대사 형식을 확인하세요.'});
      for(const combo of battleDialogue.combos??[])for(const row of [...combo.participants,combo.finish]){const c=cast[row.cast];if(!c)errors.push({file:root+'/'+game.battleDialogue,line:1,message:'없는 합체기 화자: '+row.cast,fix:'cast id를 쓰세요.'});else for(const message of battleLineIssues({attack:[row.speech]},['default',...Object.keys(c.moods??{}),...Object.keys(c.moodAliases??{}),...(c.moodSheet?.order??[])]))errors.push({file:root+'/'+game.battleDialogue,line:1,message,fix:'합체기 대사·표정을 확인하세요.'});}
    }
    validatePack(pack);
    if (exists) {
        for(const [id,entry]of Object.entries({...audio?.sfx,...audio?.bgm}))if(!await exists(game.audio.base+entry.file))warnings.push({file:game.audio.pack??`${root}/game.json`,line:1,kind:'소리 파일',message:`소리 파일 없음: ${id}`,fix:`${game.audio.base+entry.file}에 승인 소리를 넣으세요.`});
        for (const [id, path] of Object.entries(game.art?.files ?? {}))
            if (!await exists(path)) {
                warnings.push({ file: `${root}/game.json`, line: 1, kind: '그림 파일', message: `그림 파일 없음: ${id}`, fix: `${path}에 그림을 넣으세요.` });
            }
    }
    return pack;
}
const parameters: Record<string, string[]> = { "artillery": ["count", "color"], "beam": ["color", "width", "ticks", "charge"], "charge-ram": ["charge", "color"], "finisher": ["hits", "color", "width", "text"], "funnel": ["count", "color"], "heavy-shot": ["color", "charge", "size"], "missile-salvo": ["from", "count", "color"], "punch-rush": ["hits", "color", "words"], "rapid-fire": ["rows", "shots", "labels", "color"], "slash-combo": ["hits", "words", "finisher", "finisherWord", "color"], "spread-shot": ["count", "spread", "color"], "word-slam": ["text", "size", "color"] };
export function validatePack(p: Pack): void {
    p.errors.push(...progressionIssues(p,p.rules,p.root,p.sources,{economy:p.game.economy?resolvePath(p.root,p.game.economy):undefined,training:p.game.training?resolvePath(p.root,p.game.training):undefined}));
    const add = (file: string, id: string, message: string, fix: string, kind?: string) => { const path = `${p.root}/${file}.json`, index = (p.sources[path] ?? '').indexOf(`"${id}"`), line = index < 0 ? 1 : (p.sources[path].slice(0, index).match(/\n/g)?.length ?? 0) + 1; (kind ? p.warnings : p.errors).push({ file: path, line, message, fix, ...(kind ? { kind } : {}) }); };
    const mechs = p.rules.mechs ?? [], weapons = p.rules.weapons ?? [];
    const art = p.game.art?.files ?? {};
    for(const[id,focus]of Object.entries(p.game.art?.focus??{}))if(!art[id]||!Array.isArray(focus)||focus.length!==2||focus.some(v=>!Number.isFinite(v)||v<0||v>1))add('game',id,'삽화 초점 오류','art.files의 id와 0~1 범위 [x,y]를 쓰세요.');
    const cinema=p.game.cinematics;
    const checkVideo=(id:string,file='game')=>{if(!cinema?.videos?.[id])add(file,id,'등록되지 않은 영상: '+id,'cinematics.videos에 id를 선언하세요.');};
    if(cinema){
      if(!cinema.videos||typeof cinema.videos!=='object'||Array.isArray(cinema.videos))add('game','cinematics','영상 목록 형 오류','videos 객체를 적으세요.');
      if(cinema.opening){checkVideo(cinema.opening.id);if(cinema.opening.when&&!['title','new-game'].includes(cinema.opening.when))add('game','cinematics','오프닝 시점 오류','title 또는 new-game을 쓰세요.');}
      for(const [id,v]of Object.entries(cinema.videos??{})){if(!v||typeof v!=='object'){add('game',id,'영상 정의 형 오류','file 또는 fallback을 적으세요.');continue;}if(v.file&&(typeof v.file!=='string'||!v.file.endsWith('.mp4')||/^(?:https?:|data:|blob:)/.test(v.file)||v.file.split('/').includes('..')))add('game',id,'영상은 팩 내부 MP4여야 합니다.','video/id.mp4 경로를 쓰세요.');if(v.fallback&&!art[v.fallback])add('game',id,'영상 대체 그림 없음','art.files의 id를 쓰세요.');if(v.seconds!==undefined&&(!Number.isFinite(v.seconds)||v.seconds<=0))add('game',id,'영상 대체 시간 오류','0보다 큰 초를 적으세요.');}
    }
    for(const w of Object.values(p.weapons))if(w.video)checkVideo(w.video,'weapons');
    const visitVideo=(c:import('../director').Cue):void=>{if(c.do==='video')checkVideo(c.id);if(c.do==='typed')visitVideo(c.cue);if(c.do==='choice')c.choices.forEach(ch=>ch.effects.forEach(visitVideo));};
    Object.values(p.stories).forEach(story=>Object.values(story.scenes).flat().forEach(visitVideo));
    const usage=packUsage(p),compat=p.game.compatibility;
    for(const kind of ['units','cast'] as const)for(const [id,reason]of Object.entries(compat?.[kind]??{})){
        if(typeof reason!=='string'||!reason.trim())add('game',id,'호환 항목 이유가 없습니다.','compatibility의 id마다 유지 이유를 적으세요.');
        if(!(kind==='units'?p.rules.mechs.some(m=>m.id===id):p.cast[id]))add('game',id,`없는 호환 id: ${id}`,'현재 규칙/인물 id를 쓰세요.');
        if(usage[kind].has(id))add('game',id,`사용 중인 호환 항목: ${id}`,'현재 화·대본·진열장·전투에서 쓰이면 compatibility에서 빼고 자료를 채우세요.');
    }
    for (const [id, u] of Object.entries(p.units)) {
        if(!u||typeof u!=='object'||Array.isArray(u)){add('units',id,`기체 자료 형 오류: ${id}`,'id의 값은 객체로 적으세요.');continue;}
        if (!mechs.some(m => m.id === id))
            add('units', id, `없는 기체 id: ${id}`, 'rules.json이 가리키는 기체 id를 쓰세요.');
        for(const [formId,form]of Object.entries(u.forms??{})) {
            if(!mechs.find(m=>m.id===id)?.forms?.some(f=>f.id===formId))add('units',id,`없는 변형 형태: ${id}.${formId}`,'수치 파일 forms의 id를 쓰세요.');
            for(const asset of [form.art,form.icon])if(asset&&!art[asset])add('units',id,`없는 형태 그림: ${id}.${formId}.${asset}`,'game.json art.files에 등록하세요.');
            for(const [name,anchor]of Object.entries(form.anchors??{}))if(!Array.isArray(anchor)||anchor.length!==2||anchor.some(n=>!Number.isFinite(n)||n<0||n>1))add('units',id,`형태 기준점 범위 오류: ${id}.${formId}.${name}`,'[x, y]를 각각 0~1로 적으세요.');
        }
        for(const [formId,form]of Object.entries(u.tacticalForms??{})) {
            for(const asset of [form.art,form.icon])if(asset&&!art[asset])add('units',id,`없는 전술 폼 그림: ${id}.${formId}.${asset}`,'game.json art.files에 등록하세요.');
            if(form.pilotCast&&!p.cast[form.pilotCast])add('units',id,`없는 전술 폼 인물: ${id}.${formId}.${form.pilotCast}`,'cast.json의 id를 쓰세요.');
            for(const [name,anchor]of Object.entries(form.anchors??{}))if(!Array.isArray(anchor)||anchor.length!==2||anchor.some(n=>!Number.isFinite(n)||n<0||n>1))add('units',id,`전술 폼 기준점 범위 오류: ${id}.${formId}.${name}`,'[x, y]를 각각 0~1로 적으세요.');
        }
        if (u.pilotCast && !p.cast[u.pilotCast])
            add('units', id, `없는 인물 id: ${u.pilotCast}`, 'cast.json의 id를 쓰세요.');
        for (const [name, v] of Object.entries(u.anchors ?? {}))
            if (!Array.isArray(v) || v.length !== 2 || v.some(n => typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1))
                add('units', id, `기준점 범위 오류: ${id}.${name}`, '[x, y]를 각각 0~1로 적으세요.');
        for (const idArt of [u.art, u.icon])
            if (idArt && !art[idArt])
                add('units', id, `없는 그림 id: ${idArt}`, 'game.json art.files에 등록하세요.');
    }
    for (const m of mechs) {
        if(compat?.units?.[m.id]&&!usage.units.has(m.id))continue;
        const u = p.units[m.id] ?? {};
        if ((!u.art && !u.recolor) || u.temporary)
            add('units', m.id, `전용 기체 그림 없음: ${m.id}`, '전용 그림을 넣고 temporary를 지우세요. 말은 기체 그림을 함께 씁니다.', '기체 그림');
        if (!u.anchors || !Object.keys(u.anchors).length)
            add('units', m.id, `기준점 없음: ${m.id}`, 'units.json에 muzzle, core 등의 기준점을 넣으세요.', '기준점');
    }
    const rectValid=(r:unknown):boolean=>Array.isArray(r)&&r.length===4&&r.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1)&&r[2]>0&&r[3]>0&&r[0]+r[2]<=1.00001&&r[1]+r[3]<=1.00001;
    for(const [id,u]of Object.entries(p.units))for(const d of u&&typeof u==='object'?[u,...Object.values(u.forms??{}),...Object.values(u.tacticalForms??{})]:[]){
        if(d.iconCrop&&!rectValid(d.iconCrop))add('units',id,`iconCrop 범위 오류: ${id}`,'[x,y,w,h]를 그림 안의 0~1 비율로 적으세요.');
        if(d.recolor){const r=d.recolor;if(!art[r.from]||!Number.isFinite(r.hue)||!Number.isFinite(r.sat)||r.sat<0||!Number.isFinite(r.light)||Math.abs(r.light)>1)add('units',id,`recolor 값 오류: ${id}`,'from은 그림 id, hue는 도, sat는 0 이상 배율, light는 -1~1로 적으세요.');}
    }
    for (const [id, c] of Object.entries(p.cast)) {
        if(!c||typeof c!=='object'||Array.isArray(c)){add('cast',id,`인물 자료 형 오류: ${id}`,'id의 값은 객체로 적으세요.');continue;}
        if(c.framing){const f=c.framing;if(['hairCrown','chin','faceCenterX'].some(k=>{const n=f[k as keyof typeof f];return typeof n!=='number'||!Number.isFinite(n)||n<0||n>1;})||f.chin<=f.hairCrown)add('cast',id,`framing 값 오류: ${id}`,'hairCrown·chin·faceCenterX를 원본 그림의 0~1 비율로 적고 chin은 hairCrown보다 아래에 두세요.');}
        for(const [key,f]of Object.entries(c.framingByArt??{})){if(!art[key]||!f||['hairCrown','chin','faceCenterX'].some(k=>{const n=f?.[k as keyof typeof f];return typeof n!=='number'||!Number.isFinite(n)||n<0||n>1;})||f.chin<=f.hairCrown||f.relativeHeight!==undefined&&(!Number.isFinite(f.relativeHeight)||f.relativeHeight<=0))add('cast',id,`framingByArt 값 오류: ${id}/${key}`,'등록된 그림별 0~1 기준점과 양수 relativeHeight를 적으세요.');}
        if(c.moodSheet){const m=c.moodSheet;if(!rectValid(m.rect)||!Number.isInteger(m.cols)||!Number.isInteger(m.rows)||m.cols<1||m.rows<1||!Array.isArray(m.order)||m.order.some(s=>typeof s!=='string')||m.order.length>m.cols*m.rows||new Set(m.order).size!==m.order.length)add('cast',id,`moodSheet 값 오류: ${id}`,'rect는 그림 안의 비율, cols/rows는 양의 정수, order는 중복 없는 표정 목록입니다.');}
        for(const [alias,target]of Object.entries(c.moodAliases??{}))if(!alias||!['default',...Object.keys(c.moods??{}),...(c.moodSheet?.order??[])].includes(target))add('cast',id,'없는 대체 표정: '+target,'moodAliases는 실제 표정으로 연결하세요.');
        if(c.battleLines)for(const message of battleLineIssues(c.battleLines,['default',...Object.keys(c.moods??{}),...(c.moodSheet?.order??[]),...Object.keys(c.moodAliases??{})]))add('cast',id,`${id}: ${message}`,'battleLines에 상황별 text·mood 목록을 적으세요.');
        const inactive=!!compat?.cast?.[id]&&!usage.cast.has(id);
        if(c.voiceOnly&&(c.bust||c.moodSheet||Object.keys(c.moods??{}).length))add('cast',id,'음성 전용 인물에 그림이 있습니다.','voiceOnly를 지우거나 그림 참조를 지우세요.');
        if (!inactive&&!c.voiceOnly&&(!c.bust || c.temporary))
            add('cast', id, `전용 인물 그림 없음: ${id}`, '전용 그림을 bust와 moods.default에 등록하고 temporary를 지우세요.', '인물 그림');
        for (const m of (inactive||c.voiceOnly?[]:/portrait/.test(c.bust??'')||c.moodSheet?.rect?.[2]===1&&c.moodSheet.rect[3]===1?['default','hit']:['default', 'smile', 'laugh', 'attack', 'serious', 'hit', 'shock', 'sad', 'angry', 'shy']))
            if (!c.moods?.[m] && !(Array.isArray(c.moodSheet?.order)&&c.moodSheet.order.includes(m)))
                add('cast', id, `${id}: 없는 표정 ${m}`, 'moods에 해당 표정 그림을 등록하세요.', '표정');
        for (const a of [c.bust, c.moodSheet?.art, ...Object.values(c.moods ?? {})])
            if (a && !art[a])
                add('cast', id, `없는 그림 id: ${a}`, 'game.json art.files에 등록하세요.');
    }
    for (const [id, w] of Object.entries(p.weapons)) {
        if(!w||typeof w!=='object'||Array.isArray(w)){add('weapons',id,`무기 자료 형 오류: ${id}`,'id의 값은 객체로 적으세요.');continue;}
        if (!weapons.some(x => x.id === id))
            add('weapons', id, `없는 무기 id: ${id}`, '수치 파일의 무기 id를 쓰세요.');
        if (!w.anim || !TEMPLATES[w.anim.template]) {
            add('weapons', id, `없는 연출 틀: ${w.anim?.template}`, '등록된 틀 이름을 쓰세요.');
            continue;
        }
        for (const [k, v] of Object.entries(w.anim)) {
            if (k === 'template')
                continue;
            const valid = parameters[w.anim.template]?.includes(k);
            const typed = ['words', 'labels'].includes(k) ? Array.isArray(v) && v.every(x => typeof x === 'string') : ['color', 'text', 'finisherWord', 'from'].includes(k) ? typeof v === 'string' : k === 'finisher' ? typeof v === 'boolean' : typeof v === 'number' && Number.isFinite(v) && v > 0;
            if (!valid || !typed)
                add('weapons', id, `틀 값 오류: ${id}.${k}`, '틀 머리말의 값 이름과 형을 사용하세요.');
        }
    }
    for (const w of weapons)
        if (!p.weapons[w.id])
            add('weapons', w.id, `연출 틀 없음: ${w.id}`, 'weapons.json에 anim을 넣으세요.', '무기 연출');
    for(const ep of p.game.episodes??[]) {if(ep.battleBackground!==undefined&&(typeof ep.battleBackground!=='string'||!art[ep.battleBackground]))add('game',ep.id,`없는 전투 배경: ${String(ep.battleBackground)}`,'battleBackground는 game.art.files의 그림 id를 쓰세요.');const o=ep.objectives;if(!o||!Array.isArray(o.win)||!Array.isArray(o.lose)||!o.win.length||!o.lose.length||[...o.win,...o.lose].some(s=>typeof s!=='string'||!s.trim()))p.warnings.push({file:`${p.root}/game.json`,line:(p.sources[`${p.root}/game.json`]?.slice(0,p.sources[`${p.root}/game.json`].indexOf(`"${ep.id}"`)).match(/\n/g)?.length??0)+1,kind:'작전 목표',message:`작전 목표 없음 또는 형 오류: ${ep.id}`,fix:'화에 objectives: { win: ["승리 조건"], lose: ["패배 조건"] }를 적으세요.'});}
    if(p.game.ending!==undefined){const e=p.game.ending;if(!e||typeof e.episode!=='string'||typeof e.scene!=='string'||!p.game.episodes.some(ep=>ep.id===e.episode))add('game','ending','엔딩 화 참조 오류','ending에 등록된 episode와 시작 scene을 적으세요.');else if(p.stories[e.episode]&&!p.stories[e.episode].scenes[e.scene])add('game','ending','엔딩 시작 장면 없음','ending.scene을 같은 화에 선언하세요.');}
    for(const ep of p.game.episodes)if(ep.intermission!==undefined&&typeof ep.intermission!=='boolean')add('game',ep.id,'intermission은 boolean이어야 합니다.','마지막 화의 인터미션을 생략하려면 false로 적으세요.');
    for (const story of Object.values(p.stories))
        for (const loc of story.locations) {
            let c = story.scenes[loc.scene][loc.index];
            while(c.do==='typed')c=c.cue;
            if(c.do==='recruit'&&!Object.values(p.campaign.stages).some(s=>[...s.stage.units,...(s.stage.definitions??[])].some(u=>u.id===c.unit&&u.side==='player')))p.errors.push({file:story.file,line:loc.line,message:`합류 아군 정의 없음: ${c.unit}`,fix:'이후 화의 @ 규칙에 합류 아군: id = 기체 좌표 파일럿 id를 선언하세요.'});
            if(c.do==='music'&&c.id&&!p.audio?.bgm?.[resolveMusic(c.id,p.game.musicRules?.slots)??''])p.warnings.push({file:story.file,line:loc.line,kind:'음악',message:`등록된 곡 없음: ${c.id}`,fix:'audio.pack의 bgm에 등록된 이름을 쓰세요. 없는 곡은 재생을 건너뜁니다.'});
            if(c.do==='enter'&&p.cast[c.who]?.voiceOnly)p.errors.push({file:story.file,line:loc.line,message:'음성 전용 인물은 등장할 수 없습니다.',fix:'등장 지시 없이 이름: 대사만 적으세요.'});
            if ((c.do === 'say' || c.do === 'face' || c.do === 'enter') && c.face && !p.cast[c.who]?.voiceOnly && !p.cast[c.who]?.moods?.[c.face] && !(Array.isArray(p.cast[c.who]?.moodSheet?.order)&&p.cast[c.who].moodSheet!.order.includes(c.face)))
                p.warnings.push({ file: story.file, line: loc.line, kind: '사용 표정', message: `${c.who}: 없는 표정 ${c.face} (default 사용)`, fix: 'cast.json moods에 표정 그림을 추가하세요.' });
        }
    if (!p.game.audio?.credits)
        p.warnings.push({ file: `${p.root}/game.json`, line: 1, kind: '소리 출처', message: '소리 출처가 없습니다.', fix: 'audio.credits에 출처와 이용 조건을 적으세요.' });
}
export function castPortrait(c: CastDef, images: Record<string, HTMLImageElement | undefined>): Portrait {
    const r=c.face??[0,0,1,1];
    return {moodAliases:c.moodAliases,faces:{default:images[c.bust??c.moods?.default??''],...Object.fromEntries(Object.entries(c.moods??{}).map(([m,a])=>[m,images[a]]))},crop:{x:r[0],y:r[1],w:r[2],h:r[3]},...(c.moodSheet?{moodSheet:{...c.moodSheet,image:images[c.moodSheet.art]}}:{})};
}
export function packActors(p: Pick<Pack, 'cast'>, images: Record<string, HTMLImageElement | undefined>): Record<string, Actor> { return Object.fromEntries(Object.entries(p.cast).map(([id,c])=>{const portrait=castPortrait(c,images);return [id,{name:c.name,color:c.color,height:c.height||(c.bust?(/portrait/.test(c.bust)?440:690):0),faces:portrait.faces,moodSheet:portrait.moodSheet,framingByImage:new Map(Object.entries(c.framingByArt??{}).flatMap(([id,frame])=>images[id]?[[images[id]!,frame] as const]:[])),framing:c.framing??(c.face&&c.face[3]<.8?{hairCrown:c.face[1],chin:c.face[1]+c.face[3],faceCenterX:c.face[0]+c.face[2]/2}:undefined)}];})); }
export const recolorId=(id:string,form?:string)=>`@recolor:${id}${form?':'+form:''}`;
export function packUnit(p:Pick<Pack,'units'|'game'>,id:string,side:string,formId?:string): UnitDef & {art:string; icon?:string} {
    const base=p.units[id]??{},u={...base,...(formId?base.forms?.[formId]:{})},f=side==='player'?p.game.fallbacks.ally:p.game.fallbacks.enemy;
    return {...f,...u,art:u.recolor?recolorId(id,formId&&base.forms?.[formId]?.recolor?formId:undefined):u.art??f.art,icon:u.icon??(u.art||u.recolor?undefined:f.icon)};
}
export function packLookup(p: Pick<Pack, 'cast' | 'units' | 'weapons' | 'spirits' | 'game'>&Partial<Pick<Pack,'maps'|'stageScripts'|'players'|'battleDialogue'|'rules'>>, images: Record<string, HTMLImageElement | undefined>, playerCast?: () => string|undefined,values?:()=>Record<string,string>): MapLookup {
    const portrait=(id:string)=>castPortrait(p.cast[id]??p.cast[p.game.fallbacks.enemy.cast]??Object.values(p.cast)[0],images);
    const unit=(id:string,side:string,form?:string)=>packUnit(p,id,side,form);
    const castId=(u:Unit,pilot:import('../../core').Pilot)=>{
      const mapped=p.game.pilotCasts?.[pilot.id],sub=p.rules?.mechs.find(m=>m.id===u.mechId)?.subPilots?.includes(pilot.id);
      if(sub&&mapped)return mapped;
      if(pilot.id===p.players?.pilotId&&playerCast?.())return playerCast()!;
      const form=u.formId?p.units[u.mechId]?.forms?.[u.formId]?.pilotCast:undefined;
      if(form&&p.cast[form])return form;
      if(mapped&&p.cast[mapped]&&!p.game.anonymousPilots?.includes(pilot.id))return mapped;
      const requested=unit(u.mechId,u.side,u.formId).pilotCast;
      return requested&&p.cast[requested]?.bust?requested:mapped??(pilot.id===p.players?.pilotId?p.players.presets[0]?.cast:undefined)??Object.keys(p.cast).find(id=>id===pilot.character||p.cast[id].aliases?.includes(pilot.character??''))??p.game.fallbacks.enemy.cast;
    };
    return {unitInfo:p.game.unitInfo,terrainFor:s=>{const theme=p.maps?.[p.stageScripts?.[s.stage.id]?.setting??p.game.defaultMap??Object.keys(p.maps??{})[0]];return theme?{tiles:s.stage.map.tiles,theme,images,painted:p.stageScripts?.[s.stage.id]?.mapArt}:undefined;},aiCommand:(s,c)=>stageAI(p.stageScripts?.[s.stage.id],s,c),terrain:images[p.game.fallbacks.terrain],background:images[p.game.fallbacks.background],backgroundFor:stageId=>images[p.game.episodes?.find(e=>e.stage===stageId)?.battleBackground??p.game.fallbacks.background],unit:(m,u)=>{const d=unit(m.id,u.side,u.formId);return {icon:images[d.icon??d.art],...(!d.icon?{iconFit:true}:{}),...(!d.icon&&d.iconCrop?{iconCrop:d.iconCrop}:{})};},battle:{mech:(m,u)=>{const d=unit(m.id,u.side,u.formId);return {image:images[d.art],height:d.height??335,faces:d.faces??(u.side==='player'?'left':'right'),anchors:d.anchors};},pilot:(pilot,u)=>{const requested=unit(u.mechId,u.side,u.formId).pilotCast;const id=castId(u,pilot);const r=p.cast[id]?.cutin;return {portrait:portrait(id),...(p.game.anonymousPilots?.includes(pilot.id)&&requested?{pilot:p.cast[id].name}:{}),...(r?{cutin:{x:r[0],y:r[1],w:r[2],h:r[3]}}:{})};},castId,lineWeapon:id=>p.weapons[id]?.lineSource??id,battleLines:(u,pilot)=>{const generic=p.game.anonymousPilots?.includes(pilot.id)?p.battleDialogue?.defaults?.enemy:undefined;return generic&&!unit(u.mechId,u.side,u.formId).pilotCast?generic:p.cast[castId(u,pilot)]?.battleLines??generic;},text:text=>text.replace(/\{([^{}]+)\}/g,(token,key:string)=>values?.()[p.players?.placeholders?.[key]??'']??token),comboDialogue:id=>p.battleDialogue?.combos?.find(c=>c.binding?.ids.includes(id)),side:u=>u.side==='enemy'?'enemy':'ally',weapon:w=>({...p.weapons[w.id],anim:p.weapons[w.id]?.anim??{template:'heavy-shot'},cutin:p.weapons[w.id]?.cutin??p.weapons[w.id]?.anim.template==='finisher'})},spirit:d=>({name:d.name,...(p.spirits[d.id]??{kind:'focus'})})};
}

export function visibleContent(pack:Pack,kind:'cast'|'units'|'images'|'scenes',id:string):boolean{return (pack.game.visibility??[]).filter(r=>r[kind]?.includes(id)).every(r=>pack.progressFlag?.(r.flag)===true||pack.progressFlag?.(r.flag)===1);}
