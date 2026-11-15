import {fileURLToPath} from 'node:url';
export const engineRoot=fileURLToPath(new URL('../',import.meta.url));
/** One filesystem boundary for dev, build and command-line pack tools. */
import {readFile,readdir,stat,realpath} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute,sep,posix} from 'node:path';
export interface PackSource{id:string;dir:string;root:string;game:any}
export async function inside(dir:string,name:string):Promise<string>{
 const file=resolve(dir,name),rel=relative(resolve(dir),file);if(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))throw Error('Pack path escapes its directory: '+name);
 const actual=await realpath(file),base=await realpath(dir),real=relative(base,actual);if(real==='..'||real.startsWith('..'+sep)||isAbsolute(real))throw Error('Pack symlink escapes its directory: '+name);return actual;
}
export async function packSources(selected?:string):Promise<PackSource[]>{
 const external=process.env.PACK_DIR||(selected&&(/[\\/]/.test(selected)||isAbsolute(selected))?selected:undefined);
 const dirs=external?[resolve(external)]:await readdir(resolve(engineRoot,'packs'),{withFileTypes:true}).then(a=>a.filter(d=>d.isDirectory()).map(d=>resolve(engineRoot,'packs',d.name)));
 const packs:PackSource[]=[];for(const dir of dirs.sort()){const game=JSON.parse(await readFile(await inside(dir,'game.json'),'utf8')),id=game.id??dir.replaceAll('\\','/').split('/').at(-1);if(typeof id!=='string'||! /^[\w-]+$/.test(id))throw Error('Invalid pack id');if(packs.some(p=>p.id===id))throw Error('Duplicate pack id: '+id);game.id=id;packs.push({id,dir,root:'content/packs/'+id,game});}
 const result=selected&&!external?packs.filter(p=>p.id===selected):packs;if(!result.length)throw Error('No content pack found');return result;
}
export function selectedPack(packs:PackSource[]):string{const id=process.env.DEFAULT_PACK??packs[0]?.id;if(!packs.some(p=>p.id===id))throw Error('Unknown DEFAULT_PACK');return id;}
export async function readSource(packs:PackSource[],name:string):Promise<string>{
 const source=packs.find(p=>name===p.root||name.startsWith(p.root+'/'));const file=source?await inside(source.dir,name.slice(source.root.length+1)):await inside(engineRoot,name);const text=await readFile(file,'utf8');return source&&name===source.root+'/game.json'?JSON.stringify({...JSON.parse(text),id:source.id}):text;
}
export function mediaUrl(pack:PackSource,name:string):string{if(/^(?:https?:|data:|blob:)/.test(name)||name.startsWith('/'))return name;return '/packs/'+pack.id+'/'+posix.normalize(name).replace(/^\.\//,'');}
export async function mediaFile(pack:PackSource,name:string):Promise<string>{const prefix='/packs/'+pack.id+'/';return name.startsWith(prefix)?inside(pack.dir,name.slice(prefix.length)):name.startsWith('/')?inside(resolve(engineRoot,'public'),name.slice(1)):inside(pack.dir,name);}
export async function packMedia(pack:PackSource):Promise<Map<string,string>>{
 const files=new Map<string,string>();for(const name of Object.values(pack.game.art?.files??{})as string[]){if(/^(?:https?:|data:|blob:)/.test(name))throw Error('Release assets must be local');files.set(mediaUrl(pack,name),await mediaFile(pack,name));}
 if(pack.game.audio?.pack){const logical=posix.normalize(pack.root+'/'+pack.game.audio.pack),audio=JSON.parse(await readSource([pack],logical)),base=pack.game.audio.base;files.set(mediaUrl(pack,base+'pack.json'),await mediaFile(pack,base+'pack.json'));
 for(const e of Object.values({...audio.sfx,...audio.bgm})as {file:string}[])files.set(mediaUrl(pack,base+e.file),await mediaFile(pack,base+e.file));
 for(const notice of ['LICENSES.md','README.md']){try{const file=await mediaFile(pack,base+notice);await stat(file);files.set(mediaUrl(pack,base+notice),file);}catch(error){if(notice==='LICENSES.md')throw error;}}
 }for(const row of [...pack.game.loadingScreens??[],...pack.game.loadingScreenFallbacks??[]]as {image:string}[]){const name=pack.game.art?.files?.[row.image]??row.image;if(/^(?:https?:|data:|blob:)/.test(name)||! /\.(webp|png|jpe?g)$/i.test(name))throw Error('Loading image must be local raster art');try{files.set(mediaUrl(pack,name),await mediaFile(pack,name));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}for(const v of Object.values(pack.game.cinematics?.videos??{})as {file?:string}[]){if(!v.file)continue;if(!v.file.endsWith('.mp4')||/^(?:https?:|data:|blob:)/.test(v.file))throw Error('Video must be a local MP4');try{files.set(mediaUrl(pack,v.file),await mediaFile(pack,v.file));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}return files;
}
export async function dataFiles(pack:PackSource):Promise<string[]>{const out:string[]=[];async function walk(dir:string,prefix=''){for(const e of await readdir(dir,{withFileTypes:true})){const key=prefix+e.name;if(e.isDirectory())await walk(join(dir,e.name),key+'/');else if(/\.(json|story)$/.test(key))out.push(pack.root+'/'+key);}}await walk(pack.dir);return out;}
