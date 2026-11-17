/** Ordinary static hosting output. Never touches historical artifact/upd directories. */
import{readdir,readFile,writeFile,mkdir,copyFile,rm,lstat}from'node:fs/promises';
import{resolve,join,relative,dirname,basename}from'node:path';
import{fileURLToPath,pathToFileURL}from'node:url';
const engine=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const cacheHeaders=`# Media URLs carry a content-hash ?v= parameter; changing data invalidates their caches.
/*.webp
  Cache-Control: public, max-age=31536000, immutable
/*.jpg
  Cache-Control: public, max-age=31536000, immutable
/*.png
  Cache-Control: public, max-age=31536000, immutable
/*.mp3
  Cache-Control: public, max-age=31536000, immutable
/*.m4a
  Cache-Control: public, max-age=31536000, immutable
/*.ogg
  Cache-Control: public, max-age=31536000, immutable
/*.mp4
  Cache-Control: public, max-age=31536000, immutable
/*.woff2
  Cache-Control: public, max-age=31536000, immutable
/*.js
  Cache-Control: public, max-age=31536000, immutable
/*.css
  Cache-Control: public, max-age=31536000, immutable
/*.json
  Cache-Control: public, max-age=0, must-revalidate
/*.html
  Cache-Control: public, max-age=0, must-revalidate
/
  Cache-Control: public, max-age=0, must-revalidate
/*/
  Cache-Control: public, max-age=0, must-revalidate
`;
export async function buildSite(dist,target){
 const source=resolve(dist),out=resolve(target),rel=relative(source,out);
 if(basename(out)!=='site'||out===source||!rel.startsWith('..')||source.startsWith(out+'/')||source.startsWith(out+'\\'))throw Error('Static output must be a separate site/ directory');
 await readFile(join(source,'game.html')); // Check the source before replacing an earlier generated site.
 try{if((await lstat(out)).isSymbolicLink())throw Error('Static output must not be a symlink');}catch(e){if(e.code!=='ENOENT')throw e;}
 const files=[];async function walk(dir,prefix=''){for(const e of await readdir(dir,{withFileTypes:true})){const key=prefix+e.name;if(e.isSymbolicLink())throw Error('Build contains a symlink: '+key);if(e.isDirectory())await walk(join(dir,e.name),key+'/');else if(e.isFile())files.push(key);}}await walk(source);
 await mkdir(out,{recursive:true});for(const entry of await readdir(out))await rm(join(out,entry),{recursive:true,force:true});
 for(const name of files){await mkdir(dirname(join(out,name)),{recursive:true});await copyFile(join(source,name),join(out,name));}
 // Both entry names load the same game, without a redirect or artifact iframe shell.
 await copyFile(join(source,'game.html'),join(out,'index.html'));
 await writeFile(join(out,'_headers'),cacheHeaders);
 const inventory=[];async function inventoryWalk(dir,prefix=''){for(const e of await readdir(dir,{withFileTypes:true})){const key=prefix+e.name;if(e.isDirectory())await inventoryWalk(join(dir,e.name),key+'/');else inventory.push({file:key,bytes:(await lstat(join(dir,e.name))).size});}}await inventoryWalk(out);
 inventory.sort((a,b)=>b.bytes-a.bytes);const result={directory:out,files:inventory.length,bytes:inventory.reduce((n,f)=>n+f.bytes,0),largest:inventory.slice(0,5),over25MiB:inventory.filter(f=>f.bytes>25*1024*1024),over1000Files:inventory.length>1000};
 await writeFile(join(dirname(out),'site-manifest.json'),JSON.stringify(result,null,2)+'\n');
 console.log(`Static site: ${result.files} files, ${result.bytes} bytes -> ${out}`);if(result.over25MiB.length||result.over1000Files)console.warn('Hosting budget review:',JSON.stringify({over25MiB:result.over25MiB,over1000Files:result.over1000Files}));return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await buildSite(process.env.OUT_DIR??join(engine,'dist'),process.env.SITE_DIR??join(engine,'tools/out/release/site'));
