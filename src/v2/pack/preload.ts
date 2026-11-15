/** I/O를 연출 시간과 잇는 작은 경계. 캐시 적중이면 한 프레임도 기다리지 않는다. */
import { preloadImages } from './images';
import type { Show } from '../fx';
import type { Step } from '../flow';
import type { Actor, Cue } from '../director';
import { portraitImages } from '../portrait';
export function* waitForImages(_show:Show,images:readonly (HTMLImageElement|undefined)[]):Step {
  const task=preloadImages(images);if(!task)return;
  console.warn('[assets] 구간 안 그림 준비 누락: 이전 화면을 유지하며 백그라운드 수신');void task.catch(error=>console.warn('[assets] 그림 준비 실패',error));
}
export function cueImages(cues:readonly Cue[],cast:Record<string,Actor>,images:Record<string,HTMLImageElement|undefined>):(HTMLImageElement|undefined)[]{
  return cues.flatMap(c=>{if(c.do==='typed')return cueImages([c.cue],cast,images);if(c.do==='choice')return c.choices.flatMap(choice=>cueImages(choice.effects,cast,images));
    if('who'in c&&cast[c.who]){const a=cast[c.who];return portraitImages({faces:a.faces??{},moodSheet:a.moodSheet});}
    return c.do==='bg'||c.do==='cg'?[images[c.image]]:[];
  });
}
export function sceneImages(story:{scenes:Record<string,Cue[]>},scene:string,cast:Record<string,Actor>,images:Record<string,HTMLImageElement|undefined>):(HTMLImageElement|undefined)[]{
  const seen=new Set<string>();const collect=(name:string):(HTMLImageElement|undefined)[]=>{if(seen.has(name))return [];seen.add(name);const cues=story.scenes[name]??[];
    const destinations=(c: Cue):string[]=>c.do==='typed'?destinations(c.cue):c.do==='jump'||c.do==='condition'?[c.scene]:c.do==='choice'?c.choices.flatMap(ch=>[...(ch.target?[ch.target]:[]),...ch.effects.flatMap(destinations)]):[];
    return [...cueImages(cues,cast,images),...cues.flatMap(destinations).flatMap(collect)];};return collect(scene);
}

export function sceneAudio(story:{scenes:Record<string,Cue[]>},scene:string):string[]{const ids:string[]=[];const visit=(c:Cue)=>{if(c.do==='music'&&c.id)ids.push(c.id);if(c.do==='typed')visit(c.cue);if(c.do==='choice')c.choices.forEach(ch=>ch.effects.forEach(visit));};(story.scenes[scene]??[]).forEach(visit);return [...new Set(ids)];}
export function* waitForAudio(show:Show,ids:readonly string[]):Step{if(!ids.length)return;const task=show.sound?.preload?.(ids);if(!task)return;void task.catch(error=>console.warn('[assets] 소리 준비 실패',error));}
