import {readdir,unlink,copyFile,mkdir} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {engineRoot,packSources,packMedia,type PackSource} from './pack-sources.ts';
/** Only the build copy is pruned; pack and public originals are untouched. */
export async function artifactFilesPrune(dist:string,emitted:ReadonlySet<string>,sources?:PackSource[]):Promise<void>{
 const packs=sources??await packSources(),keep=new Set<string>(emitted);
 for(const name of ['LICENSE','THIRD_PARTY_NOTICES.md']){await copyFile(join(process.env.NOTICE_DIR??engineRoot,name),join(dist,name));keep.add(name);}
 for(const pack of packs)for(const [url,file]of await packMedia(pack)){const key=url.replace(/^\//,''),dest=resolve(dist,key);if(!dest.startsWith(resolve(dist)+'/')&&!dest.startsWith(resolve(dist)+'\\'))throw Error('Unsafe release path');await mkdir(dirname(dest),{recursive:true});await copyFile(file,dest);keep.add(key);}
 async function walk(dir:string,prefix=''){for(const e of await readdir(dir,{withFileTypes:true})){const key=prefix+e.name,p=join(dir,e.name);if(e.isDirectory())await walk(p,key+'/');else if(!keep.has(key))await unlink(p);}}await walk(dist);
}
