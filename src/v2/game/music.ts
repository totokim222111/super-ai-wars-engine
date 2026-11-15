import type {BattleState,Unit} from '../../core';
import type {Exchange} from '../battle/types';
import type {Story} from '../story/parse';
export interface Theme {theme:string;priority?:number}
export interface MusicRules {
 lastBossPrefixes?:string[];bossTags?:string[];bossSizes?:string[];slots?:Record<string,string>;
 pilots?:Record<string,Theme>;bossPriority?:number;lastBossPriority?:number;bossEntrance?:string;
 battleOpening?:{slot:string;seconds?:number};stages?:Record<string,{map?:string;appear?:Record<string,string>}>;
 story?:{default?:string;scenes?:Record<string,string>;tags?:Record<string,string>;sceneTags?:Record<string,string[]>};
}
export function resolveMusic(id:string|undefined,slots:Record<string,string>={}):string|undefined{const seen=new Set<string>();while(id&&slots[id]&&!seen.has(id)){seen.add(id);id=slots[id];}return id;}
export function unitTheme(state:BattleState,u:Unit,music:Record<string,string>,rules:MusicRules={},cast?:(u:Unit)=>Theme|undefined):Theme|undefined {
 const explicit=cast?.(u)??rules.pilots?.[u.pilotId];if(explicit)return explicit;
 if(u.side==='enemy'&&rules.lastBossPrefixes?.some(p=>u.mechId.startsWith(p)))return {theme:music.lastboss??music.boss??music.battle,priority:rules.lastBossPriority??100};
 if(u.side==='enemy'&&(rules.bossTags?.some(t=>u.tags?.includes(t))||rules.bossSizes?.includes(state.content.mechs.find(m=>m.id===u.mechId)?.size??'')))return{theme:music.boss??music.battle,priority:rules.bossPriority??50};
 return u.side==='player'?{theme:music.battle,priority:1}:undefined;
}
/** Enemy initiation still uses the allied pilot; a higher-priority rival/boss can override. */
export function battleMusic(state:BattleState,exchange:Exchange,music:Record<string,string>,rules:MusicRules={},cast?:(u:Unit)=>Theme|undefined):string|undefined{
 const units=exchange.fighters.map(f=>state.units.find(u=>u.id===f.id)).filter((u):u is Unit=>!!u),ally=units.find(u=>u.side==='player');
 let chosen=ally?unitTheme(state,ally,music,rules,cast):undefined;
 for(const u of units.filter(u=>u.side==='enemy')){const t=unitTheme(state,u,music,rules,cast);if(t&&(t.priority??0)>(chosen?.priority??0))chosen=t;}
 return chosen?.theme??music.battle;
}
export function storyMusic(story:Story,scene:string,episode:string,music:Record<string,string>,rules:MusicRules={}):string|undefined{
 const explicit=story.scenes[scene]?.find(c=>c.do==='music');if(explicit?.do==='music')return explicit.id;
 const key=episode+':'+scene,r=rules.story;
 return r?.scenes?.[key]??r?.sceneTags?.[key]?.map(t=>r.tags?.[t]).find(Boolean)??r?.default??music.map;
}
/** Presentation-only turn state, separate from saved combat rules. */
export class MapMusic {
 private joined?:{round:number;theme:string};
 constructor(private readonly normal:string|undefined,private readonly enemy:string|undefined){}
 join(round:number,theme:string|undefined):void{if(theme)this.joined={round,theme};}
 phase(team:string,round:number):string|undefined{if(team!=='ally')return this.enemy;if(this.joined?.round===round)return this.joined.theme;this.joined=undefined;return this.normal;}
}
