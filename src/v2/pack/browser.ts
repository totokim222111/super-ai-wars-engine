import { ImageStore } from './images';
import { recolorId } from './load';
import { loadPack,validatePack,resolvePath, type Pack } from './load';
import {compileStage} from '../story/stage';
import {parseStory} from '../story/parse';
import {packText,defaultPack} from './files';
export {assetUrl} from './files';
import {assetUrl} from './files';
const cache = new Map<string, Promise<Pack>>();
export function currentPack(name = new URLSearchParams(globalThis.location?.search ?? '').get('pack') ?? defaultPack): Promise<Pack> { const cached = cache.get(name); if (cached)
    return cached;const loading=(async()=>{
      const deferred=new Set<string>();
      const p=await loadPack(`content/packs/${name}`,async path=>{
        if(import.meta.env.PROD&&path.endsWith('.story')){try{const outline=JSON.parse(await packText(path+'.outline.json'))as {text:string};deferred.add(path);return outline.text;}catch{/* 견본·이전 팩은 원문으로 읽는다. */}}
        return packText(path);
      },undefined,{examples:import.meta.env.DEV,gallery:import.meta.env.DEV});
      let examples:Promise<void>|undefined=p.examples?.length?Promise.resolve():undefined,gallery:Promise<void>|undefined;
      p.ensureGallery=()=>gallery??=(async()=>{if(typeof p.game.gallery==='string')p.game.gallery=JSON.parse(await packText(resolvePath(p.root,p.game.gallery)));})().catch(e=>{gallery=undefined;throw e;});
      p.ensureExamples=()=>examples??=(async()=>{
        let text:string;try{text=await packText(`${p.root}/samples.json`);}catch{return;}
        const index=JSON.parse(text)as {id:string;title:string;stage:string;story:string}[],entries:NonNullable<Pack['examples']>=[];
        for(const entry of index){const path=`${p.root}/${entry.story}`,text=await packText(path),parsed=parseStory(text,path,{cast:p.cast,images:Object.keys(p.game.art.files),affectionAliases:p.game.story?.affectionAliases});if(!parsed.stage)throw new Error(`규칙 없는 견본: ${path}`);
          const compiled=compileStage(parsed.stage,{id:entry.stage,name:entry.title,content:p.rules,roster:Object.values(p.campaign.stages).flatMap(s=>s.stage.units.filter(u=>u.side==='player')),cast:p.cast,units:p.units,scenes:parsed.scenes,defaultMap:p.game.defaultMap,defaultPilot:p.game.defaultPilot},path);
          if(parsed.issues.length||compiled.issues.length)throw new Error(JSON.stringify([...parsed.issues,...compiled.issues]));entries.push({...entry,parsed,compiled});p.sources[path]=text;
        }p.examples=entries;
      })().catch(e=>{examples=undefined;throw e;});
      const pending=new Map<string,Promise<void>>();p.storyLoaded=id=>!deferred.has(`${p.root}/${p.game.episodes.find(e=>e.id===id)?.story}`);
      p.ensureStory=id=>{
        const ep=p.game.episodes.find(e=>e.id===id);if(!ep||p.storyLoaded!(id))return Promise.resolve();const cached=pending.get(id);if(cached)return cached;
        const path=`${p.root}/${ep.story}`,task=packText(path).then(text=>{
          const story=parseStory(text,path,{cast:p.cast,images:Object.keys(p.game.art.files),affectionAliases:p.game.story?.affectionAliases}),checked:Pack={...p,stories:{[id]:story},errors:[...story.issues],warnings:[]};validatePack(checked);
          if(checked.errors.length)throw new Error(JSON.stringify(checked.errors));Object.assign(p.stories[id],story);p.sources[path]=text;deferred.delete(path);
          for(const w of checked.warnings)if(!p.warnings.some(old=>old.file===w.file&&old.line===w.line&&old.message===w.message))p.warnings.push(w);
        });pending.set(id,task);void task.catch(()=>pending.delete(id));return task;
      };return p;
    })();cache.set(name,loading);void loading.catch(()=>cache.delete(name));return loading; }
/** 팩에 '/v2/art/…'처럼 적힌 경로를 지금 페이지 기준 주소로 바꾼다. 페이지가 사이트 맨 위에 있지 않아도(하위 경로, 아티팩트) 그림과 소리를 찾는다. */
export const activePack=()=>currentPack();
const stores=new WeakMap<Pack,ImageStore>();
export function adoptImages(pack:Pack,store:ImageStore):void {for(const [id,u]of Object.entries(pack.units)){if(u.recolor)store.definitions[recolorId(id)]=u.recolor;for(const [form,d]of Object.entries(u.forms??{}))if(d.recolor)store.definitions[recolorId(id,form)]=d.recolor;}stores.set(pack,store);}
export function packImageStore(pack:Pack):ImageStore {
    let store=stores.get(pack);if(store)return store;
    const definitions:Record<string,import('./images').ImageDefinition>={...pack.game.art.files};
    for(const [id,u]of Object.entries(pack.units)){if(u.recolor)definitions[recolorId(id)]=u.recolor;for(const [form,d]of Object.entries(u.forms??{}))if(d.recolor)definitions[recolorId(id,form)]=d.recolor;}
    store=new ImageStore(definitions,assetUrl);stores.set(pack,store);return store;
}
/** 호환 진입점. 참조만 돌려주고 실제 요청은 화면의 prepare가 한다. */
export async function packImages(pack:Pack):Promise<Record<string,HTMLImageElement|undefined>> {return packImageStore(pack).images;}
