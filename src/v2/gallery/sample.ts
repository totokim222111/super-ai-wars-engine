import {configureImageFocus} from '../image-layout';
/** Presentation examples are data belonging to the selected pack. */
import {visibleContent,castPortrait,packActors,type Pack} from '../pack/load';
import type {Exchange,Fighter,Strike,Weapon} from '../battle/types';
import type {Actor,Cue} from '../director';
import type {Spirit} from '../spirit';
import type {Portrait} from '../ui';
export type Images=Record<string,HTMLImageElement|undefined>;
export interface GalleryData{kit?:{pages?:[string,string][][];gauge?:Pick<Fighter,'name'|'pilot'|'hp'|'hpMax'|'en'|'enMax'>;parts?:{label:string;value?:string;disabled?:boolean}[]};fx?:{destroyLine?:string};art?:Record<string,string>;moods?:Record<string,string>;opening?:Cue[];weapons?:Record<string,Weapon>;spirits?:Spirit[];moves?:{label:string;kind:string;strikes:Strike[];enemyHp?:number;allyEnergy?:number}[];situations?:{label:string;about:string;strikes:Strike[];spamHp?:number}[];cast?:string[];fighters?:any[];roles?:Record<string,string>}
export interface Sample{images:Images;pack:Pack;gallery:GalleryData;roles:Record<string,string>;cast:Record<string,Actor>;faces:{name:string;faces:Images;square:boolean;moodNames?:Record<string,string>;moodSheet?:Portrait['moodSheet']}[];leadPortrait:Portrait;exchange(strikes:Strike[],enemyHp?:number,allyEnergy?:number):Exchange}
export function buildSample(images:Images,pack:Pack):Sample{
 configureImageFocus(images,pack.game.art.focus);
 const hidden=(id:string)=>!visibleContent(pack,'cast',id)||!visibleContent(pack,'units',id)||!visibleContent(pack,'images',id);
 const mentionsHidden=(v:unknown):boolean=>typeof v==='string'?hidden(v):Array.isArray(v)?v.some(mentionsHidden):!!v&&typeof v==='object'?Object.entries(v).some(([k,x])=>hidden(k)||mentionsHidden(x)):false;
 const filter=(v:any):any=>Array.isArray(v)?v.filter(x=>!mentionsHidden(x)).map(filter):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([k,x])=>!hidden(k)&&!(typeof x==='string'&&hidden(x))).map(([k,x])=>[k,filter(x)])):v;
 const gallery=filter(typeof pack.game.gallery==='object'?pack.game.gallery:{})as GalleryData,roles=gallery.roles??{},cast=pack.cast,actors=packActors(pack,images),lead=gallery.fighters?.find(f=>f.id===roles.ally)??gallery.fighters?.[0],empty:Portrait={faces:{},crop:{x:0,y:0,w:1,h:1}};
 return {images,pack,gallery,roles,cast:actors,leadPortrait:lead&&cast[lead.cast]?castPortrait(cast[lead.cast],images):empty,
 faces:(gallery.cast??Object.keys(cast)).filter(id=>actors[id]&&!cast[id].voiceOnly&&visibleContent(pack,'cast',id)).map(id=>({name:cast[id].name,faces:actors[id].faces??{},moodNames:cast[id].moodNames,moodSheet:actors[id].moodSheet,square:id===roles.enemy})),
 exchange:(strikes,enemyHp,allyEnergy)=>({background:images[roles.battleBackground??pack.game.fallbacks.background],fighters:(gallery.fighters??[]).map(f=>({...f,image:images[f.art],portrait:cast[f.cast]?castPortrait(cast[f.cast],images):empty,anchors:Object.values(pack.units).find(u=>u.art===f.art)?.anchors,hp:f.id===roles.enemy&&enemyHp!==undefined?enemyHp:f.hp,en:f.id===roles.ally&&allyEnergy!==undefined?allyEnergy:f.en}))as Fighter[],strikes})};
}
