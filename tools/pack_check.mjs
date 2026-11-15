import {execFileSync} from 'node:child_process';import {createServer} from 'vite';import {readFile} from 'node:fs/promises';
import {packSources,readSource,mediaFile} from './pack-sources.ts';
const selected=process.argv.slice(2).find(a=>!a.startsWith('--')),sources=await packSources(selected);
const server=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,entries:[]},server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'silent'});
try{const {loadPack}=await server.ssrLoadModule('/src/v2/pack/load.ts'),{assetWarnings}=await server.ssrLoadModule('/src/v2/pack/asset-check.ts'),all=[];
for(const source of sources){const pack=await loadPack(source.root,p=>readSource(sources,p),async p=>{try{await readFile(await mediaFile(source,p));return true;}catch{return false;}}),sheets=Object.fromEntries(Object.values(pack.cast).filter(c=>c.moodSheet&&c.moodSheet.cols>0&&c.moodSheet.rows>0).map(c=>[c.moodSheet.art,c.moodSheet])),paths={};
for(const[id,path]of Object.entries(pack.game.art.files))try{paths[id]=await mediaFile(source,path);}catch{}
const metadata=JSON.parse(execFileSync(process.env.PYTHON||'python',['-X','utf8','tools/art_ingest.py','--inspect-art'],{input:JSON.stringify({files:pack.game.art.files,sheets,paths}),encoding:'utf8',maxBuffer:4*1024*1024}));assetWarnings(pack,metadata);all.push({pack:source.id,errors:pack.errors,warnings:pack.warnings});}
if(process.argv.includes('--json'))console.log(JSON.stringify(all,null,2));else for(const p of all){console.log(`${p.pack}: 오류 ${p.errors.length}, 경고 ${p.warnings.length}`);if(p.errors.length)console.table(p.errors);for(const kind of new Set(p.warnings.map(w=>w.kind))){const list=p.warnings.filter(w=>w.kind===kind);console.log(kind+' ('+list.length+')');console.table(list);}}
if(all.some(p=>p.errors.length))process.exitCode=1;}finally{await server.close();}
