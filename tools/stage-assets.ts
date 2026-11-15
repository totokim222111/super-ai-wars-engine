import {loadingLines} from '../src/v2/loading-screen';
import {mediaPath} from '../src/v2/pack/paths';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {loadPack} from '../src/v2/pack/load';
import {assetPlan} from '../src/v2/pack/asset-plan';
import {readSource,packMedia,type PackSource} from './pack-sources';
import type {StageAssets} from '../src/v2/media-cache';
export async function stageAssets(source:PackSource):Promise<StageAssets>{
 const p=await loadPack(source.root,path=>readSource([source],path),undefined,{examples:false,gallery:false});if(p.errors.length)throw Error(JSON.stringify(p.errors));
 const plan=assetPlan(p),entries:StageAssets['entries']={},media=await packMedia(source),sha=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
 for(const [url,path]of media){const b=await readFile(path);entries[url]={file:url,hash:sha(b),bytes:b.byteLength,kind:/\.mp4$/.test(path)?'video':/\.(mp3|m4a|ogg|wav)$/.test(path)?'audio':/\.(webp|png|jpg)$/.test(path)?'image':'metadata'};}
 const audio=p.game.audio.pack?JSON.parse(await readSource([source],source.root+'/'+p.game.audio.pack)):{};
 const base=p.game.audio.base,common=Object.values(audio.sfx??{}).map((e:any)=>base+e.file);
 for(const g of [plan.boot,...Object.values(plan.stages)])g.files=[...new Set([...g.images,...g.audio.flatMap(id=>audio.bgm?.[id]?[base+audio.bgm[id].file]:[]),...common,base+'pack.json'])].filter(f=>entries[f]).sort();
 const slides=(rows:typeof p.game.loadingScreens)=> (rows??[]).flatMap(row=>{const image=p.game.art.files[row.image]??mediaPath(p.game.id,row.image),c=p.cast[row.cast];return entries[image]&&c?[{...row,focus:row.focus??p.game.art.focus?.[row.image],image,name:c.name,color:c.color,lines:loadingLines(c.battleLines)}]:[];});
 const loading={screens:slides(p.game.loadingScreens),fallbacks:slides(p.game.loadingScreenFallbacks),playerName:p.players.name.default,placeholders:p.players.placeholders??{}};
 for(const group of Object.values(plan.stages)){const paths=[...loading.screens,...loading.fallbacks].map(s=>s.image);group.images=[...new Set([...group.images,...paths])].sort();group.files=[...new Set([...group.files,...paths])].sort();}
 return{version:sha(JSON.stringify(entries)).slice(0,20),pack:source.id,entries,...plan,loading};
}
