import type {Pack,UnitDef} from './load';
import {packUnit} from './load';
import {configOf} from '../rules/config';
import {definitions} from '../../scenario/compile';
import type {AssetGroup} from '../media-cache';
import type {Cue} from '../director';
import {storyMusic,unitTheme} from '../game/music';
/** Conservative stage closure, including optional events/forms, without other stages' CGs. */
export function assetPlan(p:Pack):{boot:AssetGroup;stages:Record<string,AssetGroup>}{
 const art=p.game.art.files,slots=p.game.musicRules?.slots??{};
 const group=()=>({images:new Set<string>(),audio:new Set<string>(),videos:new Set<string>()});
 type Group=ReturnType<typeof group>;
 const image=(g:Group,id?:string)=>{if(id&&art[id])g.images.add(art[id]);};
 const cast=(g:Group,id:string)=>{const c=p.cast[id];if(c){image(g,c.bust);Object.values(c.moods??{}).forEach(a=>image(g,a));image(g,c.moodSheet?.art);}};
 const audio=(g:Group,id?:string)=>{if(!id)return;const seen=new Set<string>();while(slots[id]&&!seen.has(id)){seen.add(id);id=slots[id];}g.audio.add(id);};
 const unit=(g:Group,id:string,side:'player'|'enemy')=>{const d=packUnit(p,id,side);const visit=(v:UnitDef)=>{image(g,v.art);image(g,v.icon);if(v.recolor)image(g,v.recolor.from);if(v.pilotCast)cast(g,v.pilotCast);Object.values(v.forms??{}).forEach(visit);Object.values(v.tacticalForms??{}).forEach(visit);};visit(d);};
 const video=(g:Group,id:string)=>{const v=p.game.cinematics?.videos[id];if(v?.file)g.videos.add(v.file);image(g,v?.fallback);};
 const cue=(g:Group,c:Cue)=>{if(c.do==='video')video(g,c.id);if('who'in c)cast(g,c.who);if(c.do==='bg'||c.do==='cg')image(g,c.image);if(c.do==='music')audio(g,c.id);if(c.do==='typed')cue(g,c.cue);if(c.do==='choice')c.choices.forEach(ch=>ch.effects.forEach(c=>cue(g,c)));};
 const walk=(g:Group,value:unknown)=>{if(typeof value==='string')image(g,value);else if(Array.isArray(value))value.forEach(x=>walk(g,x));else if(value&&typeof value==='object')Object.values(value).forEach(x=>walk(g,x));};
 const finish=(g:Group):AssetGroup=>({images:[...g.images].sort(),audio:[...g.audio].sort(),videos:[...g.videos].sort(),files:[]});
 const boot=group();image(boot,p.game.titleArt.background);image(boot,p.game.titleArt.character);audio(boot,p.game.music.title);
 if(p.game.cinematics?.opening)video(boot,p.game.cinematics.opening.id);
 const first=p.game.episodes[0];for(const c of p.stories[first?.id]?.scenes['도입']??[])cue(boot,c);audio(boot,first&&p.stories[first.id]?storyMusic(p.stories[first.id],'도입',first.id,p.game.music,p.game.musicRules):p.game.music.map);
 const stages:Record<string,AssetGroup>={};
 for(const [index,ep]of p.game.episodes.entries()){
  const g=group(),stage=p.campaign.stages[ep.stage]?.stage;
  if(stage)for(const u of definitions(stage)){unit(g,u.mechId,u.side==='player'?'player':'enemy');const pilot=p.rules.pilots.find(p=>p.id===u.pilotId),id=p.game.pilotCasts?.[u.pilotId]??pilot?.character??'',c=p.cast[id];cast(g,id);audio(g,unitTheme({content:p.rules} as Parameters<typeof unitTheme>[0],u as Parameters<typeof unitTheme>[1],p.game.music,p.game.musicRules,()=>u.side==='enemy'&&c?.enemyTheme?{theme:c.enemyTheme,priority:c.enemyThemePriority}:c?.theme?{theme:c.theme,priority:c.themePriority}:undefined)?.theme);}
  if(stage)for(const u of definitions(stage)){const mech={...p.rules.mechs.find(m=>m.id===u.mechId),...stage.contentOverrides?.mechs?.[u.mechId]};for(const id of [...mech.weapons??[],...mech.forms?.flatMap(f=>f.overrides.weapons??[])??[]]){const v=p.weapons[id]?.video;if(v)video(g,v);}}
  if(stage)for(const c of configOf(stage).combos){const v=p.weapons[c.weapon]?.video;if(v)video(g,v);}
  for(const c of Object.values(p.stories[ep.id]?.scenes??{}).flat())cue(g,c);
  if(index===p.game.episodes.length-1)for(const c of Object.values(p.stories[p.game.ending?.episode??'']?.scenes??{}).flat())cue(g,c);
  for(const preset of p.players.presets)if(preset.cast)cast(g,preset.cast);
  for(const fallback of [p.game.fallbacks.ally,p.game.fallbacks.enemy]){cast(g,fallback.cast);image(g,fallback.art);image(g,fallback.icon);}
  image(g,p.game.fallbacks.background);image(g,p.game.fallbacks.terrain);image(g,ep.battleBackground);image(g,p.stageScripts?.[ep.stage]?.mapArt);
  const setting=p.stageScripts?.[ep.stage]?.setting??p.game.defaultMap;walk(g,setting?p.maps?.[setting]:undefined);
  for(const id of ['map','enemy-phase','battle','victory','gameover','intermission','upgrade','save'])audio(g,p.game.music[id]);
  audio(g,ep.mapMusic);audio(g,p.game.musicRules?.story?.default);audio(g,p.game.musicRules?.bossEntrance);audio(g,p.game.musicRules?.stages?.[ep.stage]?.map);Object.values(p.game.musicRules?.stages?.[ep.stage]?.appear??{}).forEach(id=>audio(g,id));audio(g,p.game.musicRules?.battleOpening?.slot);
  for(const c of Object.values(p.cast))if(g.images.has(art[c.bust??''])||g.images.has(art[c.moodSheet?.art??''])){audio(g,c.theme);audio(g,c.enemyTheme);}
  const storyIds=[ep.id,...index===p.game.episodes.length-1?[p.game.ending?.episode??'']:[]];
  for(const [key,value]of Object.entries(p.game.musicRules?.story?.scenes??{}))if(storyIds.some(id=>key.startsWith(id+':')))audio(g,value);
  for(const [key,tags]of Object.entries(p.game.musicRules?.story?.sceneTags??{}))if(storyIds.some(id=>key.startsWith(id+':')))for(const tag of tags)audio(g,p.game.musicRules?.story?.tags?.[tag]);
  image(g,p.game.menuArt??p.game.titleArt.character);stages[ep.id]=finish(g);
 }
 return{boot:finish(boot),stages};
}
