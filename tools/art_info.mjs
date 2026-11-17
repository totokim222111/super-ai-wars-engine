import {writeFile,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {packSources,mediaFile,inside} from './pack-sources.ts';
for(const source of await packSources()){
 const game=source.game;if(!game.art.metadata)continue;const cast=JSON.parse(await readFile(await inside(source.dir,'cast.json'),'utf8')),sheets=Object.fromEntries(Object.values(cast).filter(c=>c.moodSheet).map(c=>[c.moodSheet.art,c.moodSheet])),paths=Object.fromEntries(await Promise.all(Object.entries(game.art.files).map(async([id,path])=>[id,await mediaFile(source,path)])));
 const out=execFileSync(process.env.PYTHON||'python',['-I','-X','utf8','tools/art_ingest.py','--inspect-art'],{input:JSON.stringify({files:game.art.files,sheets,paths}),encoding:'utf8',maxBuffer:4*1024*1024});const info=JSON.parse(out),animation=typeof game.animationArt==='string'?JSON.parse(await readFile(await inside(source.dir,game.animationArt),'utf8')):game.animationArt;if(animation?.provenance)for(const [id,page]of Object.entries(animation.pages??{}))if(info[id])Object.assign(info[id],{source:animation.provenance.title,license:animation.provenance.license,sha256:page.sha256});await writeFile(await inside(source.dir,game.art.metadata),JSON.stringify(info,null,2)+'\n');
}
