import {definitions} from '../../scenario/compile';
import type {Pack} from './load';
import type {Cue} from '../director';
/** 호환 표시는 현재 사용 중인 항목의 누락을 가리지 못한다. */
export function packUsage(p:Pack):{units:Set<string>;cast:Set<string>}{
  const units=new Set([...Object.values(p.campaign.stages).flatMap(s=>definitions(s.stage).map(u=>u.mechId)),...(p.examples??[]).flatMap(e=>definitions(e.compiled.stage).map(u=>u.mechId))]),cast=new Set<string>();
  const visit=(c:Cue):void=>{if('who'in c)cast.add(c.who);if(c.do==='typed')visit(c.cue);if(c.do==='choice')c.choices.forEach(ch=>ch.effects.forEach(visit));};
  Object.values(p.stories).forEach(s=>Object.values(s.scenes).flat().forEach(visit));
  (p.examples??[]).forEach(e=>Object.values(e.parsed.scenes).flat().forEach(visit));
  for(const u of Object.values(p.units))if(u.pilotCast)cast.add(u.pilotCast);
  for(const f of [p.game.fallbacks.ally,p.game.fallbacks.enemy])if(f?.cast)cast.add(f.cast);
  const gallery=(p.game as unknown as {gallery?:{cast?:string[];fighters?:{cast:string}[]}}).gallery;
  gallery?.cast?.forEach(id=>cast.add(id));gallery?.fighters?.forEach(f=>cast.add(f.cast));
  return {units,cast};
}
