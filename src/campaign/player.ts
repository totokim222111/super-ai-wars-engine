import type { CampaignState } from './state';
export type Persona = string;
export interface PlayerConfig {
  unitId?:string; pilotId?:string; actor?:string;startLabel?:string;
  name:{default:string;min:number;max:number;characters?:string;pattern?:string};
  presets:{id:string;type:string;name:string;description:string;cast?:string;portrait?:string;flags?:string[];alternative?:number}[];
  lines:{id:string;name:string;description?:string;unitName?:string;flags?:string[];mechs?:Record<string,string>}[];
  placeholders?:Record<string,'name'|'unitName'>;
}
export const defaultPlayers:PlayerConfig={name:{default:'플레이어',min:1,max:24},presets:[{id:'default',type:'default',name:'기본',description:''}],lines:[{id:'default',name:'기본'}]};
export interface PlayerSetup {name:string;preset:number;line:string}
export const personaOf=(c:CampaignState):string=>c.persona??'';
export function validPlayerName(name:string,config:PlayerConfig['name']):boolean {
  const chars=Array.from(name);return chars.length>=config.min&&chars.length<=config.max&&name.trim()===name&&chars.every(c=>! /\s/.test(c)&&(!config.characters||config.characters.includes(c)))&&(!config.pattern||new RegExp(config.pattern,'u').test(name));
}
export function setPlayer(c:CampaignState,draft:PlayerSetup,config:PlayerConfig=defaultPlayers):void {
  const preset=config.presets[draft.preset],line=config.lines.find(l=>l.id===draft.line);
  if(!preset||!line||!validPlayerName(draft.name,config.name))throw new Error('잘못된 플레이어 설정');
  c.persona=preset.id;c.player={name:draft.name,preset:preset.id,type:preset.type,line:line.id,cast:preset.cast,actor:config.actor,unitId:config.unitId,pilotId:config.pilotId,unitName:line.unitName,alternative:preset.alternative??0,placeholders:config.placeholders};
  for(const flag of [...(preset.flags??[]),...(line.flags??[])])c.flags[flag]=true;
}
export function playerName(c:CampaignState):string{return c.player?.name??'플레이어';}
export function interpolate(text:string,c:CampaignState):string {
  return text.replace(/\{([^{}]+)\}/g,(original,key:string)=>{const field=c.player?.placeholders?.[key];if(field)return c.player?.[field]??original;const choices=key.split('/');return choices.length>1?choices[c.player?.alternative??0]??choices[0]:original;});
}

export function validatePlayers(config:PlayerConfig):void{
 const ids=new Set<string>(),types=new Set<string>();if(!config?.name||!Array.isArray(config.presets)||!config.presets.length||!Array.isArray(config.lines)||!config.lines.length)throw Error('플레이어 이름·타입·계열을 선언하세요.');
 if(!Number.isSafeInteger(config.name.min)||config.name.min<1||!Number.isSafeInteger(config.name.max)||config.name.max<config.name.min||!validPlayerName(config.name.default,config.name))throw Error('플레이어 이름 규칙 오류');
 for(const p of config.presets){if(!p.id||!p.type||typeof p.name!=='string'||typeof p.description!=='string'||ids.has(p.id)||types.has(p.type))throw Error('플레이어 타입 오류 또는 중복');ids.add(p.id);types.add(p.type);}
 ids.clear();for(const l of config.lines){if(!l.id||typeof l.name!=='string'||ids.has(l.id))throw Error('플레이어 계열 오류 또는 중복');ids.add(l.id);}
}
