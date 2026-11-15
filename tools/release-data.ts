import type {Plugin} from 'vite';
import type {StageAssets} from '../src/v2/media-cache.ts';
import {readFile,readdir} from 'node:fs/promises';
import {relative,resolve,join,extname} from 'node:path';
import {engineRoot,packSources,selectedPack,dataFiles,readSource,packMedia,inside,type PackSource} from './pack-sources.ts';
import {artifactFilesPrune} from './release-public.ts';
const runtime='\0release-data-runtime',prefix='\0release-json:';
// This plugin is also imported by Node's native config loader. Resolve the game
// module graph through Vite, as the CLI tools do, rather than Node's TS loader.
async function stageAssets(source:PackSource):Promise<StageAssets>{const {createServer}=await import('vite');const server=await createServer({root:engineRoot,configFile:false,optimizeDeps:{noDiscovery:true,entries:[]},server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'silent'});try{const module=await server.ssrLoadModule('/tools/stage-assets.ts');return await module.stageAssets(source);}finally{await server.close();}}
export function releaseData():Plugin{
 const manifests=new Map<string,Awaited<ReturnType<typeof stageAssets>>>();
 let build=false,outDir=resolve('dist'),packs:PackSource[]=[];const groups=new Map<string,Record<string,unknown>>(),refs=new Map<string,string>(),index:Record<string,string>={},emitted=new Set<string>();
 // Outlines and engine defaults share the pack bucket, leaving room for local media under the artifact file cap.
 const category=(p:string)=>p.endsWith('/game.json')?'boot':p.endsWith('.story')?'story-'+p.split('/').at(-1)!.replace('.story',''):p.endsWith('.outline.json')?'pack':p.includes('/packs/')?/\/(gallery|samples|art-info)\.json$/.test(p)||p.includes('/samples/')?'gallery':'pack':'pack';
 return {name:'release-data',enforce:'pre',configResolved(c){build=c.command==='build';outDir=resolve(c.root??engineRoot,c.build?.outDir??'dist');},
 async configureServer(server){packs=await packSources();for(const p of packs)manifests.set(p.id,await stageAssets(p));server.watcher.add(packs.map(p=>p.dir));server.middlewares.use((req,res,next)=>{void(async()=>{const path=decodeURIComponent((req.url??'').split('?')[0]);let file:string|undefined;const pack=packs.find(p=>path.startsWith('/'+p.root+'/')||path.startsWith('/packs/'+p.id+'/'));if(pack&&path==='/'+pack.root+'/assets.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(manifests.get(pack.id)));return;}if(pack){const start=path.startsWith('/packs/')?'/packs/'+pack.id+'/':'/'+pack.root+'/';file=await inside(pack.dir,path.slice(start.length));}else if(['/LICENSE','/THIRD_PARTY_NOTICES.md'].includes(path))file=join(process.env.NOTICE_DIR??engineRoot,path.slice(1));if(!file){next();return;}const bytes=await readFile(file),mime:Record<string,string>={'.json':'application/json','.story':'text/plain','.md':'text/plain','.webp':'image/webp','.png':'image/png','.ogg':'audio/ogg','.mp3':'audio/mpeg','.m4a':'audio/mp4','.mp4':'video/mp4'};res.statusCode=200;res.setHeader('Content-Type',(mime[extname(file)]??'text/plain')+'; charset=utf-8');res.end(bytes);})().catch(next);});},
 async buildStart(){packs=await packSources();if(!build)return;groups.clear();refs.clear();for(const k of Object.keys(index))delete index[k];
 const add=async(path:string)=>{this.addWatchFile(path);const text=await readSource(packs,path),key=category(path),data=groups.get(key)??{};data[path]=path.endsWith('.story')?text:JSON.parse(text);groups.set(key,data);index[path]=key;};
 for(const pack of packs){for(const p of await dataFiles(pack))await add(p);if(pack.game.audio?.pack){const path=join(pack.root,pack.game.audio.pack).replaceAll('\\','/');if(!index[path])await add(path);}}
 for(const pack of packs){const path=pack.root+'/assets.json',key='asset-index-'+pack.id;groups.set(key,{[path]:await stageAssets(pack)});index[path]=key;}
 // Engine defaults remain available to explicit JSON imports.
 for(const e of await readdir(resolve(engineRoot,'content/rules')))if(e.endsWith('.json'))await add('content/rules/'+e);
 for(const [key,data]of groups)refs.set(key,this.emitFile({type:'asset',name:'data-'+key+'.json',source:JSON.stringify(data)}));
 const files=[];for(const p of packs)for(const url of(await packMedia(p)).keys())files.push(url.replace(/^\//,''));
 this.emitFile({type:'asset',fileName:'pack-manifest.json',source:JSON.stringify({format:1,defaultPack:selectedPack(packs),packs:packs.map(p=>({id:p.id,root:p.root})),files:[...new Set(files)]},null,2)});
 },
 async resolveId(source,importer,options){if(source==='virtual:release-data')return runtime;if(!build||!importer||!source.endsWith('.json')||source.includes('?'))return;const found=await this.resolve(source,importer,{...options,skipSelf:true});if(found){const path=relative(engineRoot,found.id).replaceAll('\\','/');if(index[path])return prefix+path+'.js';}},
 load(id){if(id.startsWith(prefix))return `import {readData} from 'virtual:release-data';export default await readData(${JSON.stringify(id.slice(prefix.length,-3))});`;if(id!==runtime)return;
 const registry=`export const packNames=${JSON.stringify(packs.map(p=>p.id))};export const defaultPack=${JSON.stringify(selectedPack(packs))};`;
 if(!build)return registry+`export async function readData(path){const r=await fetch('/'+path.replace(/^public\\//,''));if(!r.ok)throw Error(path+': HTTP '+r.status);return path.endsWith('.story')?r.text():r.json();}`;
 const urls=[...refs].map(([key,ref])=>`${JSON.stringify(key)}:import.meta.ROLLUP_FILE_URL_${ref}`).join(',');return registry+`const urls={${urls}},index=${JSON.stringify(index)},cache=new Map();export async function readData(path){const key=index[path];if(!key)throw Error('없는 파일: '+path);let p=cache.get(key);if(!p){p=fetch(urls[key]).then(r=>{if(!r.ok)throw Error(key+': HTTP '+r.status);return r.json()});cache.set(key,p);p.catch(()=>cache.delete(key));}const data=await p;return data[path];}`;
 },
 async transformIndexHtml(html){if(!packs.length)packs=await packSources();const game=packs.find(p=>p.id===selectedPack(packs))!.game;const title=String(game.title).replace(/[<>&"']/g,'');return html.replace(/<title>.*?<\/title>/,()=>'<title>'+title+'</title>').replace(/(<canvas[^>]*aria-label=")[^"]*(")/,(_,a,b)=>a+title+'. 화면을 눌러 조작합니다.'+b).replace(/<span>[^<]*가로 화면에서 플레이합니다\.<\/span>/,'<span>'+title+' · 가로 화면에서 플레이합니다.</span>');},
 generateBundle(_options,bundle){emitted.clear();for(const key of Object.keys(bundle))emitted.add(key);},
 async writeBundle(_options,bundle){if(build)await artifactFilesPrune(outDir,new Set(Object.keys(bundle)),packs);},
 };
}
