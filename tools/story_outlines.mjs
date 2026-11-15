/** 원문 줄 번호·규칙·맵·장면 이름만 남긴 배포용 색인. 대사 원문은 바꾸지 않는다. */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
/** 교전 추적을 암시하는 조건은 규칙 컴파일에 필요하므로 줄 번호 그대로 남긴다. */
export function outlineStory(text){let data=false;return text.split('\n').map(line=>{const match=/^\s*@\s+(.+?)\s*$/.exec(line);if(match){data=['규칙','맵'].includes(match[1]);return line;}return data||line.startsWith('#')||/^\s*(?:\[타입 [^\]]+\]\s*)?\[조건\] 전투횟수 /.test(line)?line:'';}).join('\n');}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
const {packSources,inside}=await import('./pack-sources.ts');
for(const pack of await packSources())for(const ep of pack.game.episodes??[]){const path=await inside(pack.dir,ep.story),text=await readFile(path,'utf8');await writeFile(path+'.outline.json',JSON.stringify({text:outlineStory(text)})+'\n');}
}
