/** 가격·육성의 자료 계약과 검사. 전투 공식은 코어에 둔다. */
import type {Content, Pilot, BattleState, Unit} from '../../core';
import type {Issue} from '../story/parse';
export type PilotStat=keyof Pilot['stats'];
export interface Economy {
  items:Record<string,{price:number;fromEpisode:number}>;
  sellRatio:number;
  maxQuantity:number;
  /** defeat는 전멸 기준 예산이며 자동 지급하지 않는다. clear는 기존 대본 지급분 포함. */
  income:Record<string,{defeat:number;clear:number;rosterClear?:Record<string,number>}>;
}
export type Recruitment=Record<string,{unit:string;persuader?:string;affection?:{id:string;amount:number};flag?:string;afterClear?:boolean}[]>;
export interface Training {
  clearReward?:number;
  rewards:Record<'grunt'|'elite'|'boss'|'named',number>;
  classification:{bossSizes:string[];eliteSizes:string[];bossTags:string[];eliteTags:string[];namedPilots:string[]};
  stats:Partial<Record<PilotStat,{label:string;step:number;costs:number[];fromEpisode?:number}>>;
  skills:Record<string,{costs:number[];fromEpisode:number}>;
}
export interface Progression {game?:{recruitment?:Recruitment};stageRewards?:Record<string,Record<string,number>>;story?:{affectionAliases?:Record<string,string>};economy?:Economy;training?:Training}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const integer=(v:unknown,min=0):v is number=>Number.isSafeInteger(v)&&Number(v)>=min;
const costs=(v:unknown):v is number[]=>Array.isArray(v)&&v.length>0&&v.every((n,i)=>integer(n,1)&&(!i||n>v[i-1]));
export function progressionIssues(data:Progression,content:Content,root:string,sources:Record<string,string>,paths:{economy?:string;training?:string}={}):Issue[]{
  const issues:Issue[]=[];
  const add=(file:'economy'|'training',id:string,message:string,fix:string)=>{const path=paths[file]??`${root}/${file}.json`,s=sources[path]??'',at=s.indexOf(`"${id}"`);issues.push({file:path,line:at<0?1:s.slice(0,at).split('\n').length,message,fix});};
  const e=data.economy;
  if(e){
    if(!object(e.items))add('economy','items','상점 품목은 객체여야 합니다.','items: { "hull": { "price": 900, "fromEpisode": 1 } }로 적으세요.');
    else for(const [id,v]of Object.entries(e.items)){
      if(!content.parts?.some(p=>p.id===id))add('economy',id,`없는 플러그인: ${id}`,'rules의 parts에 있는 id를 쓰세요.');
      if(!object(v)||!integer(v.price,1)||!integer(v.fromEpisode,1))add('economy',id,'가격·진열 화는 양의 정수여야 합니다.','price와 fromEpisode를 양의 정수로 적으세요.');
    }
    if(typeof e.sellRatio!=='number'||!Number.isFinite(e.sellRatio)||e.sellRatio<=0||e.sellRatio>1)add('economy','sellRatio','판매 비율은 0 초과 1 이하여야 합니다.','반값은 0.5로 적으세요.');
    if(!integer(e.maxQuantity,1)||e.maxQuantity>999)add('economy','maxQuantity','거래 수량 한도는 1~999 정수여야 합니다.','maxQuantity를 99로 적으세요.');
    if(!object(e.income))add('economy','income','화별 수입 객체가 없습니다.','income에 스테이지별 defeat·clear를 적으세요.');
    else for(const [id,v]of Object.entries(e.income))if(!object(v)||!integer(v.defeat)||!integer(v.clear))add('economy',id,'수입은 0 이상의 정수여야 합니다.','defeat(전멸 예산)와 clear(클리어 지급)를 적으세요.');
  }
  for(const [id,row]of Object.entries(e?.income??{}))if(row.rosterClear!==undefined&&(!object(row.rosterClear)||Object.values(row.rosterClear).some(v=>!integer(v))))add('economy',id,'부대별 정규 클리어 지급액 오류입니다.','rosterClear에 유닛 id별 0 이상의 정수를 적으세요.');
  const t=data.training;
  if(t){
    if(t.clearReward!==undefined&&!integer(t.clearReward))add('training','clearReward','클리어 육성치는 0 이상의 정수입니다.','clearReward를 확인하세요.');
    if(!object(t.rewards)||['grunt','elite','boss','named'].some(k=>!integer(t.rewards[k as keyof Training['rewards']])))add('training','rewards','격파 보상 네 종류가 필요합니다.','grunt·elite·boss·named를 0 이상의 정수로 적으세요.');
    const c=t.classification;
    if(!object(c)||['bossSizes','eliteSizes','bossTags','eliteTags','namedPilots'].some(k=>!Array.isArray(c[k as keyof typeof c])||c[k as keyof typeof c].some(v=>typeof v!=='string')))add('training','classification','등급 분류는 문자열 배열이어야 합니다.','bossSizes·eliteSizes·bossTags·eliteTags·namedPilots를 배열로 적으세요.');
    else {
      for(const id of c.namedPilots)if(!content.pilots.some(p=>p.id===id))add('training',id,`없는 파일럿: ${id}`,'rules의 pilots에 있는 id를 쓰세요.');
      if([...c.bossSizes,...c.eliteSizes].some(s=>!['SS','S','M','L','LL'].includes(s)))add('training','classification','알 수 없는 기체 크기입니다.','SS·S·M·L·LL 중에서 고르세요.');
    }
    if(!object(t.stats)||!Object.keys(t.stats).length)add('training','stats','육성 능력치 객체가 필요합니다.','melee·shoot·skill·defense·hit·evade 중에서 적으세요.');
    else for(const [id,v]of Object.entries(t.stats))if(!['melee','shoot','skill','defense','hit','evade'].includes(id)||!object(v)||typeof v.label!=='string'||!v.label.trim()||!integer(v.step,1)||!costs(v.costs))add('training',id,`육성 능력치 형식 오류: ${id}`,'코어 능력치 id, label, 양의 정수 step, 매 단계 증가하는 costs 배열을 적으세요.');
    if(!object(t.skills))add('training','skills','육성 기술은 객체여야 합니다.','skills에 코어 기술 id와 costs·fromEpisode를 적으세요.');
    else for(const [id,v]of Object.entries(t.skills)){
      const skill=content.skills?.find(s=>s.id===id);
      if(!skill)add('training',id,`없는 기술: ${id}`,'rules의 skills에 있는 id를 쓰세요.');
      if(!object(v)||!costs(v.costs)||!integer(v.fromEpisode,1))add('training',id,'기술 비용·해금 화 형식 오류입니다.','매 단계 증가하는 costs와 양의 정수 fromEpisode를 적으세요.');
      else if(skill&&(skill.levels?v.costs.some((_,i)=>!skill.levels![String(i+1)]):v.costs.length!==1))add('training',id,'코어가 지원하지 않는 기술 단계입니다.','levels에 있는 연속 단계까지만 costs를 적으세요. 단일 기술은 비용 하나만 적으세요.');
    }
  }
  return issues;
}
export function defeatPoints(t:Training|undefined,state:BattleState,target:Unit):number {
  if(!t)return 0;
  const c=t.classification,m=state.content.mechs.find(m=>m.id===target.mechId)!;
  if(!(m.exp??0)&&!(m.credits??0))return 0;
  const category=c.namedPilots.includes(target.pilotId)?'named':c.bossSizes.includes(m.size)||target.tags?.some(s=>c.bossTags.includes(s))?'boss':c.eliteSizes.includes(m.size)||target.tags?.some(s=>c.eliteTags.includes(s))?'elite':'grunt';
  return t.rewards[category];
}
