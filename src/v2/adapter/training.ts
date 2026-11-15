/** 육성 기록은 기존 캠페인의 JSON 확장 플래그에 보관한다. 원본 Pilot은 고치지 않는다. */
import type {Content} from '../../core';
import type {Training} from '../pack/progression';
export interface PilotGrowth {points:number;stats:Record<string,number>;skills:Record<string,number>}
export interface Growth {pilots:Record<string,PilotGrowth>;stage?:{id:string;earned:Record<string,number>;seen:string[];clearAwarded?:boolean;clearRecipients?:string[];settled?:boolean}}
export const emptyGrowth=():Growth=>({pilots:{}});
export function growthFromFlags(flags:Record<string,boolean>|undefined):Growth {
  const prefix='v2:value:'+encodeURIComponent('v2:training')+':',key=Object.keys(flags??{}).find(k=>k.startsWith(prefix));
  if(!key)return emptyGrowth();try{return readGrowth(JSON.parse(decodeURIComponent(key.slice(prefix.length))));}catch{return emptyGrowth();}
}
export function readGrowth(value:unknown):Growth {if(typeof value!=='string')return emptyGrowth();try{const g=JSON.parse(value) as Growth;if(!g||typeof g.pilots!=='object'||!g.pilots||Array.isArray(g.pilots))return emptyGrowth();for(const p of Object.values(g.pilots))if(!Number.isSafeInteger(p.points)||p.points<0||!p.stats||!p.skills||Object.values({...p.stats,...p.skills}).some(n=>!Number.isSafeInteger(n)||n<0))return emptyGrowth();return g;}catch{return emptyGrowth();}}
export function trainedContent(content:Content,g:Growth,t?:Training):Content {
  if(!t||!Object.values(g.pilots).some(p=>Object.keys(p.stats).length||Object.keys(p.skills).length))return content;
  const mechs=content.mechs.map(m=>{const o=m.pilotOverrides,trained=o?.pilotId?g.pilots[o.pilotId]:undefined;if(!o||!trained)return m;const stats={...o.stats};for(const key of Object.keys(stats)as (keyof typeof stats)[]){const rule=t.stats[key];if(rule)stats[key]=(stats[key]??0)+Math.min(trained.stats[key]??0,rule.costs.length)*rule.step;}return {...m,pilotOverrides:{...o,stats}};});
  return {...content,mechs,pilots:content.pilots.map(p=>{
    const trained=g.pilots[p.id];if(!trained)return p;
    const stats={...p.stats};for(const key of Object.keys(stats)as (keyof typeof stats)[]){const rule=t.stats[key];if(rule)stats[key]+=Math.min(trained.stats[key]??0,rule.costs.length)*rule.step;}
    const skills=structuredClone(p.skills??[]);
    for(const [id,n]of Object.entries(trained.skills)){const rule=t.skills[id];if(!rule||!content.skills?.some(s=>s.id===id))continue;const ref=skills.find(s=>s.id===id),level=Math.min(n,rule.costs.length);if(!level)continue;if(ref)ref.level=Math.max(ref.level??1,level);else skills.push({id,level});}
    const statCurves=structuredClone(p.statCurves);if(statCurves)for(const [key,curve]of Object.entries(statCurves)){const rule=t.stats[key as keyof typeof t.stats];if(rule&&curve)for(const point of curve)point.value+=Math.min(trained.stats[key]??0,rule.costs.length)*rule.step;}
    return {...p,stats,skills,...(statCurves?{statCurves}:{})};
  })};
}
