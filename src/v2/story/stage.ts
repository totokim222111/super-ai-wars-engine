import type {MapHint} from '../map/hints';
import {runtime,formName,faction} from '../rules/runtime';
import {compileRules,ruleLine,configOf} from '../rules/config';
/** 글로 쓴 배치·규칙을 기존 Stage / sai-1 Program으로 낮춘다. 규칙 계산은 기존 코어가 한다. */
import type {AIType,BattleState,Content,Stage,StageUnit,Terrain,Side} from '../../core';
import {validateStage} from '../../core';
import type {Condition,Instruction,Location,Program,Trigger} from '../../scenario/types';
import type {Issue} from './parse';
import type {Objectives} from '../map/objectives';
export interface StageLine {text:string;line:number}
export interface StageSource {rules:StageLine[];map:StageLine[];line:number}
export interface CompiledStage {
  stage:Stage;program:Program;setting:string;mapArt?:string;objectives:Objectives;
  hints?:MapHint[];
  markers:Record<string,string[]>;
  ai:Record<string,{kind:'defend'|'track'|'reach';target?:string}>;
  facts:{id:string;kind:'reach'|'kills'|'defeated'|'adjacent'|'form'|'form-defeated'|'side-dead';side?:string;form?:string;unit?:string;target?:string;area?:string;count?:number}[];
  issues:Issue[];
}
interface UnitRow {unit:StageUnit;line:number;pending:boolean;point:boolean;rosterOnly?:boolean}
interface Rule {text:string;line:number}
interface Spawn {triggers:Rule[];units:{id:string;x:number;y:number}[];share:string;line:number}
interface Region {label?:string;danger?:boolean;marker?:boolean;name:string;area:[number,number,number,number];selector:string;repeat:boolean;deadline?:number;alive?:string;event:string;share?:string;line:number}
export interface StageCatalog {
  id:string;name:string;content:Content;base?:Stage;roster:StageUnit[];defaultMap?:string;defaultPilot?:string;
  cast?:Record<string,{name:string}>;units?:Record<string,{pilotCast?:string}>;
  scenes?:Record<string,unknown>;
}
const and=(a:Condition,b:Condition):Condition=>({kind:'and',left:a,right:b});
const or=(a:Condition,b:Condition):Condition=>({kind:'or',left:a,right:b});
function invert(c:Condition):Condition {
  if('left'in c)return {kind:c.kind==='and'?'or':'and',left:invert(c.left),right:invert(c.right)};
  if('selector'in c)return {...c,kind:c.kind==='alive'?'dead':'alive'};
  if('not'in c)return {...c,not:!c.not};
  return {...c,op:({'>' : '<=', '>=' : '<', '<' : '>=', '<=' : '>'}as Record<string,string>)[c.op]??'=='};
}
const flag=(id:string,not=false):Condition=>({kind:'flag',id,not});
const dead=(kind:'unit'|'side',id:string):Condition=>({kind:'dead',selector:{kind,id}});
const parts=(text:string)=>text.split('/').map(s=>s.trim()).filter(Boolean);
const positive=(s:string)=>Number.isSafeInteger(+s)&&+s>0;
export function stageSyntax(source:StageSource,file:string):Issue[]{return source.rules.filter(r=>!ruleLine(r.text)&&! /^(무대|맵 그림|아군|합류 아군|중립|적|대기 중립|대기 아군|대기 제3|제3|대기|승리|패배|증원|보상|목표|시작|효과|안내 목표)\s*:/.test(r.text)&&!/^지역\s+.+\s*\(/.test(r.text)).map(r=>({file,line:r.line,message:'모르는 스테이지 규칙',fix:'무대·맵 그림·아군·적·대기·승리·패배·증원·지역·보상·목표 중 하나로 쓰세요.'}));}
export function compileStage(source:StageSource,catalog:StageCatalog,file:string):CompiledStage {
  const {content}=catalog,issues:Issue[]=[],markers:CompiledStage['markers']={},ai:CompiledStage['ai']={},facts:CompiledStage['facts']=[];
  const fail=(line:number,message:string,fix:string)=>issues.push({file,line,message,fix});
  const loc=(line:number):Location=>({file,line,column:1});
  const rows:UnitRow[]=[],spawns:Spawn[]=[],regions:Region[]=[],wins:Rule[]=[],losses:Rule[]=[],rewards:{trigger:string;amount:number;line:number}[]=[],effects:{trigger:string;unit:string;effect:string;line:number}[]=[],starts:{id:string;line:number}[]=[];
  const inlineRules:{text:string;line:number}[]=[],thirdIds:string[]=[];
  const objectives:Objectives={win:[],lose:[]};let setting=catalog.defaultMap??'',mapArt:string|undefined;
  const allBase=[...(catalog.base?.units??[]),...Object.values(catalog.base?.waves??{}).flat(),...(catalog.base?.definitions??[])];
  const readUnit=(text:string,side:Side,pending:boolean,line:number,rosterOnly=false):void=>{
    const m=/^([\w-]+)(?:\s*=\s*([\w-]+))?(?:\s+(\d+),(\d+))?(.*)$/.exec(text);
    if(!m){fail(line,`배치 구문 오류: ${text}`,'id = 기체id 3,5 레벨 2 공격 파일럿 pilot-id 꼴로 쓰세요.');return;}
    const [,id,mech,x,y,tail]=m,base=allBase.find(u=>u.id===id)??catalog.roster.find(u=>u.id===id);
    if(id.startsWith('__v2_'))fail(line,'예약된 유닛 id입니다.','__v2_로 시작하지 않는 id를 쓰세요.');
    if(!mech&&side!=='player'){fail(line,`기체 id 없음: ${id}`,'적·대기는 id = 기체id로 적으세요.');return;}
    if(!mech&&!base){fail(line,`편성에 없는 아군: ${id}`,'기체와 파일럿을 명시하거나 캠페인의 아군 id를 쓰세요.');return;}
    if((!pending||rosterOnly)&&x===undefined){fail(line,`배치 좌표 없음: ${id}`,'유닛 id 뒤에 열,행을 적으세요.');return;}
    const unit:StageUnit=!mech&&base?structuredClone(base):{id,mechId:mech!,pilotId:catalog.defaultPilot??'',x:0,y:0,side,level:1,tags:[],ai:'aggressive'};
    Object.assign(unit,{id,mechId:mech??unit.mechId,side,...(x!==undefined?{x:Number(x),y:Number(y)}:{})});
    let rest=tail.trim();const barrier=/배리어\s+(무적|\d+)/.exec(rest);if(barrier){inlineRules.push({text:`배리어 ${id} ${barrier[1]}`,line});rest=rest.replace(barrier[0],'');}const level=/\b레벨\s+(\d+)/.exec(rest)??/레벨\s+(\d+)/.exec(rest),pilot=/파일럿\s+([\w-]+)/.exec(rest),tags=/태그\s+([\w,-]+)/.exec(rest);
    if(level){unit.level=Number(level[1]);rest=rest.replace(level[0],'');}if(pilot){unit.pilotId=pilot[1];rest=rest.replace(pilot[0],'');}if(tags){unit.tags=tags[1].split(',').filter(Boolean);rest=rest.replace(tags[0],'');}
    rest=rest.trim();const reach=/^도달\s+([\w-]+)$/.exec(rest);const track=/^추적\s+([\w-]+)$/.exec(rest);
    if(reach){unit.ai='aggressive';ai[id]={kind:'reach',target:reach[1]};}
    else if(track){unit.ai='aggressive';ai[id]={kind:'track',target:track[1]};}
    else if(rest==='방어'){unit.ai='hold';ai[id]={kind:'defend'};}
    else if(rest){const map:Record<string,AIType>={공격:'aggressive',대기:'hold'};if(!map[rest])fail(line,`모르는 AI: ${rest}`,'공격·대기·방어·추적 대상id 중에서 쓰세요.');else unit.ai=map[rest];}
    if(rows.some(r=>r.unit.id===id))fail(line,`중복 유닛: ${id}`,'배치와 대기 전체에서 유닛 id를 다르게 쓰세요.');
    if(!content.mechs.some(m=>m.id===unit.mechId))fail(line,`없는 기체: ${unit.mechId}`,'rules.json이 읽는 기체 id를 쓰세요.');
    if(!content.pilots.some(p=>p.id===unit.pilotId))fail(line,`없는 파일럿: ${unit.pilotId}`,'파일럿 id를 확인하세요. 팩의 기본 파일럿이나 명시한 파일럿을 쓰세요.');
    if(!Number.isSafeInteger(unit.level)||unit.level!<1||unit.level!>content.rules.levelMax)fail(line,`레벨 범위 오류: ${id}`,`레벨은 1~${content.rules.levelMax} 정수로 적으세요.`);
    rows.push({unit,line,pending,point:x!==undefined,...(rosterOnly?{rosterOnly}: {})});
  };
  for(const row of source.rules){
    const {text,line}=row;
    const region=/^지역\s+(.+?)\s*\((\d+),(\d+)~(\d+),(\d+)\)(?:\s+표시\s+(.+?))?\s*:\s*(.+?)\s+진입(\s+반복)?(?:\s+기한\s+(\d+))?(?:\s+생존\s+([\w-]+))?\s*→\s*사건\s+(.+?)(?:\s+공유\s+([\w-]+))?$/.exec(text);
    if(region){const [,name,x,y,xx,yy,display,selector,repeat,deadline,alive,event,share]=region;const options=display?.match(/(?:\s+(?:위험|표식없음))+$/)?.[0]??'';if(regions.some(r=>r.name===name))fail(line,`중복 지역: ${name}`,'지역 이름을 다르게 쓰세요.');regions.push({...(display?{label:display.slice(0,display.length-options.length).trim(),danger:options.includes(' 위험'),marker:!options.includes(' 표식없음')}:{}),name,area:[+x,+y,+xx,+yy],selector,repeat:!!repeat,...(deadline?{deadline:+deadline}:{}),...(alive?{alive}:{}),event,share,line});continue;}
    const pair=/^([^:]+):\s*(.*)$/.exec(text);if(!pair)continue;const key=pair[1].trim(),value=pair[2].trim();
    if(key==='무대'){setting=value||catalog.defaultMap||'';continue;}
    if(key==='맵 그림'){if(mapArt)fail(line,'맵 그림이 두 번 있습니다.','맵 그림 줄은 하나만 적으세요.');if(!/^[a-zA-Z0-9_-]+$/.test(value))fail(line,'맵 그림 id 오류','game.json art.files의 그림 id를 쓰세요.');mapArt=value;continue;}
    if(['아군','합류 아군','중립','적','대기','대기 중립','대기 아군','제3','대기 제3'].includes(key)){for(const item of parts(value))readUnit(item,key==='아군'||key==='합류 아군'||key==='대기 아군'?'player':key==='중립'||key==='대기 중립'||key==='제3'||key==='대기 제3'?'neutral':'enemy',key.startsWith('대기')||key==='합류 아군',line,key==='합류 아군');if(key.includes('제3'))for(const item of parts(value))thirdIds.push(item.split(/\s/)[0]);continue;}
    if(key==='승리'||key==='패배'){for(const text of parts(value))(key==='승리'?wins:losses).push({text,line});continue;}
    if(key==='목표'){if(value)for(const item of parts(value)){const m=/^(승리|패배)\s+(.+)$/.exec(item);if(m)objectives[m[1]==='승리'?'win':'lose'].push(m[2]);else fail(line,'목표 구문 오류','목표: 승리 문장 / 패배 문장으로 적거나 줄을 생략하세요.');}continue;}
    if(key==='시작'){for(const item of parts(value)){const m=/^변수\s+([\w-]+)$/.exec(item);if(m)starts.push({id:m[1],line});else fail(line,'시작 구문 오류','시작: 변수 connected / 변수 server-scene으로 적으세요.');}continue;}
    if(key==='증원'){
      const m=/^(.+?)\s*→\s*(.+?)(?:\s+공유\s+([\w-]+))?$/.exec(value);if(!m){fail(line,'증원 구문 오류','증원: 적 턴 3 → inpainting 10,6으로 적으세요.');continue;}
      const units:{id:string;x:number;y:number}[]=[];const pattern=/([\w-]+)\s+(\d+),(\d+)(?:\s*,\s*|\s*$)/g;let found:RegExpExecArray|null;while((found=pattern.exec(m[2])))units.push({id:found[1],x:+found[2],y:+found[3]});
      if(!units.length||m[2].replace(pattern,'').trim())fail(line,'증원 대상·좌표 구문 오류','id 10,6, id-2 11,6처럼 적으세요.');
      spawns.push({triggers:parts(m[1]).map(text=>({text,line})),units,share:m[3]??`v2-stage-wave-${units.map(u=>u.id).join('-')}`,line});continue;
    }
    if(key==='보상'){const m=/^(.+?)\s*→\s*(\S+)\s+(\d+)$/.exec(value);if(m&&m[2]===(content.terms?.funds??'자금')&&Number.isSafeInteger(+m[3]))rewards.push({trigger:m[1],amount:+m[3],line});else fail(line,'보상 구문 오류',`보상: 승리 → ${content.terms?.funds??'자금'} 1200으로 적으세요.`);continue;}
    if(key==='효과'){const m=/^(.+?)\s*→\s*([\w-]+)\s+(dummy-sure-hit|dummy-quarter-damage)$/.exec(value);if(m)effects.push({trigger:m[1],unit:m[2],effect:m[3],line});else fail(line,'효과 구문 오류','효과: 턴 2 → unit-id dummy-sure-hit으로 적으세요.');continue;}
    if(key==='지역'||text.startsWith('지역 '))fail(line,'지역 구문 오류','지역 seed (5,3~6,4): 아군 진입 반복 → 사건 seed로 적으세요.');
  }
  const terrain=content.terrain as (Terrain&{char?:string})[],legend=new Map(terrain.filter(t=>t.char).map(t=>[t.char!,t.id]));
  const map=source.map.map(row=>{const tokens=row.text.split(/\s+/);for(const token of tokens)if(token.length!==1||!legend.has(token))fail(row.line,`모르는 지형 글자: ${token}`,'지형 자료의 char 한 글자를 공백으로 나누어 적으세요.');return tokens.map(t=>legend.get(t)??terrain[0]?.id??'');});
  const w=map[0]?.length??0,h=map.length;if(!w||!h)fail(source.line,'맵이 없습니다.','@ 맵 아래에 칸마다 지형 글자를 적으세요.');
  source.map.forEach((r,i)=>{if(map[i].length!==w)fail(r.line,`맵 줄 길이 불일치: ${map[i].length}칸 (첫 줄 ${w}칸)`,'모든 맵 줄의 칸 수를 같게 맞추세요.');});
  const stage:Stage={...(catalog.base?structuredClone(catalog.base):{}),id:catalog.id,name:catalog.name,scenario:true,map:{...(catalog.base?.map.asset?{asset:catalog.base.map.asset}:{}),w,h,tiles:map},units:rows.filter(r=>!r.pending).map(r=>r.unit),areas:Object.fromEntries(regions.map(r=>[r.name,r.area])),waves:{},definitions:[]};
  if(rows.some(r=>r.rosterOnly))stage.rosterDeployments={...stage.rosterDeployments,...Object.fromEntries(rows.filter(r=>r.rosterOnly).map(r=>[r.unit.id,[r.unit.x,r.unit.y] as [number,number]]))};
  const get=(id:string,line:number)=>{const row=rows.find(r=>r.unit.id===id);if(!row)fail(line,`없는 유닛: ${id}`,'아군·적·대기에서 선언한 유닛 id를 쓰세요.');return row;};
  const point=(x:number,y:number,line:number,id:string)=>{if(x<0||y<0||x>=w||y>=h){fail(line,`맵 밖 좌표: ${id} ${x},${y}`,`좌표는 0~${w-1}, 0~${h-1} 안으로 적으세요.`);return;}const t=terrain.find(t=>t.id===map[y]?.[x]);if(t&&Object.values(t.moveCost).every(c=>c===null))fail(line,`벽 위 배치: ${id}`,'이동 가능한 지형으로 좌표를 옮기세요.');};
  const occupied=new Set<string>();for(const r of rows){if(!r.pending){point(r.unit.x,r.unit.y,r.line,r.unit.id);const k=`${r.unit.x},${r.unit.y}`;if(occupied.has(k))fail(r.line,`배치 칸 중복: ${k}`,'처음 등장하는 유닛은 서로 다른 칸에 놓으세요.');occupied.add(k);}const track=ai[r.unit.id]?.target;if(track){if(ai[r.unit.id]?.kind==='reach'){if(!stage.areas?.[track])fail(r.line,`없는 지역: ${track}`,'지역을 선언하세요.');}else get(track,r.line);}}
  for(const r of regions){const [x,y,xx,yy]=r.area;if(x>xx||y>yy||x<0||y<0||xx>=w||yy>=h)fail(r.line,`지역 범위 오류: ${r.name}`,'왼쪽 위~오른쪽 아래 좌표를 맵 안에 적으세요.');if(!['아군','적'].includes(r.selector))get(r.selector,r.line);if(r.alive)get(r.alive,r.line);if(catalog.scenes&&!catalog.scenes[`사건 ${r.event}`])fail(r.line,`없는 사건 장면: ${r.event}`,`같은 파일에 @ 사건 ${r.event} 장면을 더하세요.`);}
  const assigned=new Map<string,{wave:string;x:number;y:number}>();
  for(const s of spawns){const wave=s.units[0]?.id??`wave-${s.line}`,units:StageUnit[]=[];for(const p of s.units){const r=get(p.id,s.line);if(!r?.pending){if(r)fail(s.line,`증원 대상이 대기에 없습니다: ${p.id}`,'처음부터 놓는 적은 적:, 증원은 대기:에 선언하세요.');continue;}point(p.x,p.y,s.line,p.id);const old=assigned.get(p.id);if(old&&(old.wave!==wave||old.x!==p.x||old.y!==p.y))fail(s.line,`증원 위치가 서로 다릅니다: ${p.id}`,'같은 대기 유닛은 같은 묶음·좌표로 증원하세요.');assigned.set(p.id,{wave,x:p.x,y:p.y});r.unit.x=p.x;r.unit.y=p.y;units.push({...r.unit,x:p.x,y:p.y});}stage.waves![wave]=units;}
  stage.definitions=rows.filter(r=>r.pending&&!assigned.has(r.unit.id)).map(r=>r.unit);
  for(const r of rows.filter(r=>r.pending&&!assigned.has(r.unit.id)))if(r.point)point(r.unit.x,r.unit.y,r.line,r.unit.id);
  const name=(id:string)=>{const u=rows.find(r=>r.unit.id===id)?.unit;if(!u)return id;const cast=catalog.units?.[u.mechId]?.pilotCast??u.pilotId;return catalog.cast?.[cast]?.name??(u.pilotId===catalog.defaultPilot?content.mechs.find(m=>m.id===u.mechId)?.name:content.pilots.find(p=>p.id===u.pilotId)?.name)??id;};
  const label=(r:Rule)=>/^격파 수 \d+$/.test(r.text)?r.text.replace(/^격파 수 (\d+)$/,'적 $1기 격파'):r.text.replace(/^격파\s+(.+)$/,(_,ids:string)=>ids.split(/\s*,\s*/).map(name).join(', ')+' 격파').replace(/^도달\s+([\w-]+)\s+(.+)$/,(_,id:string,area:string)=>`${name(id)} ${area} 도달`);
  if(!objectives.win.length&&wins.length)objectives.win=[wins.map(label).join(' 또는 ')];if(!objectives.lose.length&&losses.length)objectives.lose=[losses.map(label).join(' 또는 ')];
  if(!wins.length)fail(source.line,'승리 조건이 없습니다.','승리: 적 전멸 또는 다른 승리 조건을 적으세요.');if(!losses.length)fail(source.line,'패배 조건이 없습니다.','패배: 아군 전멸 / 격파 player를 적으세요.');
  const resolveCondition=(r:Rule):{condition:Condition;triggers:Trigger[]} | undefined=>{
    if(r.text.includes(' & ')){const values=r.text.split(' & ').map(text=>resolveCondition({...r,text}));if(values.some(v=>!v))return;return {condition:values.map(v=>v!.condition).reduce(and),triggers:values.flatMap(v=>v!.triggers)};}
    const form=/^(형태|격파형태) ([\w-]+) (\S+)$/.exec(r.text);if(form){get(form[2],r.line);const id=`v2-stage-form-${facts.length}`,area=`__v2-form-${facts.length}`;facts.push({id,kind:form[1]==='형태'?'form':'form-defeated',unit:form[2],form:form[3]});stage.areas![area]=[0,0,w-1,h-1];return {condition:flag(id),triggers:[{kind:'defeated',selector:{kind:'unit',id:form[2]},repeat:true},{kind:'enter',selector:{kind:'side',id:'player'},area,repeat:true}]};}
    const adjacent=/^인접\s+([\w-]+)\s+([\w-]+)$/.exec(r.text);if(adjacent){const [,unit,target]=adjacent;get(unit,r.line);get(target,r.line);const id=`v2-stage-adjacent-${facts.length}`,area=`__v2-adjacent-${facts.length}`;facts.push({id,kind:'adjacent',unit,target});stage.areas![area]=[0,0,w-1,h-1];return {condition:flag(id),triggers:[unit,target].map(id=>({kind:'enter',selector:{kind:'unit' as const,id},area,repeat:true}))};}
    if(['제3 전멸','적대 전멸'].includes(r.text)||r.text==='적 전멸'&&(thirdIds.length||source.rules.some(r=>r.text.startsWith('제3세력:')))){const id=`v2-stage-faction-${facts.length}`;facts.push({id,kind:'side-dead',side:r.text==='제3 전멸'?'third':r.text==='적 전멸'?'enemy':'hostile'});return {condition:flag(id),triggers:[{kind:'defeated',selector:{kind:'side',id:'enemy'},repeat:true}]};}
    if(r.text==='적 전멸'||r.text==='아군 전멸'){const side=r.text==='적 전멸'?'enemy':'player';return {condition:dead('side',side),triggers:[{kind:'all-defeated',selector:{kind:'side',id:side},repeat:true}]};}
    let m=/^격파\s+([\w-]+(?:\s*,\s*[\w-]+)*)$/.exec(r.text);if(m){const ids=m[1].split(/\s*,\s*/);const conditions=ids.map(unit=>{const row=get(unit,r.line);if(!row?.pending&&row?.unit.side!=='neutral')return dead('unit',unit);const id=`v2-stage-dead-${facts.length}`;facts.push({id,kind:'defeated',unit});return flag(id);});return {condition:conditions.reduce(and),triggers:ids.map(id=>({kind:'defeated',selector:{kind:'unit' as const,id},repeat:true}))};}
    m=/^턴\s+(\d+)\s+버티기$/.exec(r.text);if(m&&positive(m[1]))return {condition:{kind:'round',op:'>=',value:+m[1]+1},triggers:[{kind:'round',phase:'player',round:+m[1]+1,repeat:false}]};
    m=/^도달\s+([\w-]+)\s+(.+)$/.exec(r.text);if(m){get(m[1],r.line);if(!stage.areas?.[m[2]])fail(r.line,`없는 지역: ${m[2]}`,'지역 이름 (좌표): ... 줄을 먼저 적으세요.');const id=`v2-stage-reach-${facts.length}`;facts.push({id,kind:'reach',unit:m[1],area:m[2]});return {condition:flag(id),triggers:[{kind:'enter',selector:{kind:'unit',id:m[1]},area:m[2],repeat:true},{kind:'start',repeat:false}]};}
    m=/^격파 수\s+(\d+)$/.exec(r.text);if(m&&positive(m[1])){const id=`v2-stage-kills-${facts.length}`;facts.push({id,kind:'kills',count:+m[1]});return {condition:flag(id),triggers:[{kind:'defeated',selector:{kind:'side',id:'enemy'},repeat:true}]};}
    fail(r.line,`조건 구문 오류: ${r.text}`,'격파 a, b / 적 전멸 / 아군 전멸 / 턴 3 버티기 / 도달 player exit / 격파 수 4 중에서 쓰세요.');return;
  };
  const loss=losses.map(r=>({...r,value:resolveCondition(r)})),win=wins.map(r=>({...r,value:resolveCondition(r)}));
  const lossCondition=loss.flatMap(r=>r.value?[r.value.condition]:[]).reduce<Condition|undefined>((a,b)=>a?or(a,b):b,undefined);
  const program:Program={version:'sai-1',events:[]};
  const command=(op:string,args:string[],line:number):Instruction=>({op,args,loc:loc(line)});
  const guarded=(condition:Condition|undefined,code:Instruction[],line:number):Instruction[]=>condition?[{op:'branch',condition,to:code.length+1,loc:loc(line)},...code.map(c=>'to'in c?{...c,to:c.to+1}:c)]:code;
  const emit=(trigger:Trigger,code:Instruction[],line:number,scenes:string[]=[],condition?:Condition)=>{
    // 분기 점프는 이 블록 안의 절대 pc를 사용한다. 독립 코드 덩어리를 이어 붙이지 않는다.
    const body=[...code],event=program.events.length;if(scenes.length){markers[`${event}:${body.length+(condition?1:0)}`]=scenes;body.push(command('wait',['0'],line));}
    const code2=guarded(condition,body,line);program.events.push({trigger,code:code2,loc:loc(line)});
  };
  const turnScene=(text:string)=>/^적 턴 \d+$/.test(text)||/^턴 \d+$/.test(text)?[text]:[];
  const trigger=(r:Rule):Trigger|undefined=>{let m=/^(적 )?턴\s+(\d+)$/.exec(r.text);if(m&&positive(m[2]))return {kind:'round',phase:m[1]?'enemy':'player',round:+m[2],repeat:false};m=/^격파\s+([\w-]+)$/.exec(r.text);if(m){get(m[1],r.line);return {kind:'defeated',selector:{kind:'unit',id:m[1]},repeat:false};}if(r.text==='적 전멸')return {kind:'all-defeated',selector:{kind:'side',id:'enemy'},repeat:true};m=/^지역\s+(.+)\s+아군 진입$/.exec(r.text);if(m){if(!stage.areas?.[m[1]])fail(r.line,`없는 지역: ${m[1]}`,'지역을 먼저 선언하세요.');return {kind:'enter',selector:{kind:'side',id:'player'},area:m[1],repeat:false};}fail(r.line,`트리거 구문 오류: ${r.text}`,'턴 N / 적 턴 N / 격파 id / 사건 이름 / 지역 이름 아군 진입으로 쓰세요.');return;};
  const objectivesCode=[...objectives.win.map(s=>command('objective',['win',s],source.line)),...objectives.lose.map(s=>command('objective',['lose',s],source.line)),...starts.map(s=>command('set',['flag',s.id],s.line))];emit({kind:'start',repeat:false},objectivesCode,source.line);
  for(const r of loss)if(r.value)for(const t of r.value.triggers)emit(t,[command('lose',[],r.line)],r.line,[],r.value.condition);
  // 지역 사건의 종속 보상·증원을 같은 트리거로 펼친다. 명령은 native run()이 순서대로 실행한다.
  const eventTriggers=(name:string,line:number):Region[]=>{const found=regions.filter(r=>r.event===name);if(!found.length)fail(line,`없는 규칙 사건: ${name}`,'지역 ... → 사건 이름을 먼저 선언하세요.');return found;};
  const regionTrigger=(r:Region):Trigger=>({kind:'enter',selector:{kind:r.selector==='아군'||r.selector==='적'?'side':'unit',id:r.selector==='아군'?'player':r.selector==='적'?'enemy':r.selector},area:r.name,repeat:r.repeat});
  for(const r of regions){
    const code:Instruction[]=r.share?[command('set',['flag',r.share],r.line)]:[];
    for(const s of spawns.filter(s=>s.triggers.some(t=>t.text===`사건 ${r.event}`))){let condition=flag(s.share,true);if(lossCondition)condition=and(condition,invert(lossCondition));const body=guarded(condition,[command('reinforce',[s.units[0]?.id??''],s.line),command('set',['flag',s.share],s.line)],s.line),offset=code.length;code.push(...body.map(c=>'to'in c?{...c,to:c.to+offset}:c));}
    for(const reward of rewards.filter(x=>x.trigger===`사건 ${r.event}`))code.push(command('give',['credits',String(reward.amount)],reward.line));
    let gate:Condition|undefined=r.share?flag(r.share,true):undefined;
    if(r.deadline){const limit:Condition={kind:'round',op:'<=',value:r.deadline};gate=gate?and(gate,limit):limit;}
    if(r.alive){const alive:Condition={kind:'alive',selector:{kind:'unit',id:r.alive}};gate=gate?and(gate,alive):alive;}
    emit(regionTrigger(r),code,r.line,[`사건 ${r.event}`],gate);
  }
  for(const s of spawns)for(const r of s.triggers){const t=/^사건\s+(.+)$/.exec(r.text);if(t){eventTriggers(t[1],r.line);continue;}const tr=trigger(r);if(tr){const code=[command('reinforce',[s.units[0]?.id??''],s.line),command('set',['flag',s.share],s.line)];let condition=flag(s.share,true);if(lossCondition)condition=and(condition,invert(lossCondition));emit(tr,code,s.line,turnScene(r.text),condition);}}
  for(const e of effects){get(e.unit,e.line);const t=trigger({text:e.trigger,line:e.line});if(t)emit(t,[command('effect',[`unit:${e.unit}`,e.effect],e.line)],e.line,turnScene(e.trigger));}
  for(const r of rewards.filter(r=>r.trigger!=='승리')){const m=/^사건\s+(.+)$/.exec(r.trigger);if(!m)fail(r.line,'보상 트리거 오류','승리 또는 사건 이름을 쓰세요.');else eventTriggers(m[1],r.line);}
  const winReward=rewards.filter(r=>r.trigger==='승리').map(r=>command('give',['credits',String(r.amount)],r.line));
  for(const r of win)if(r.value)for(const tr of r.value.triggers){const code=[...winReward],condition=lossCondition?and(r.value.condition,invert(lossCondition)):r.value.condition,event=program.events.length;const scenes=catalog.scenes?.['격파 enemy']&&r.text.startsWith('격파 ')?['격파 enemy']:[];if(scenes.length){markers[`${event}:${1+code.length}`]=scenes;code.push(command('wait',['0'],r.line));}code.push(command('win',[],r.line));emit(tr,code,r.line,[],condition);}
  for(const cues of Object.values(catalog.scenes??{})){if(!Array.isArray(cues))continue;for(const value of cues){const c=value.do==='typed'?value.cue:value;if(c.do==='condition'&&c.test.name.startsWith('전투횟수 '))inlineRules.push({text:'전투 추적 '+c.test.name.slice(5),line:source.line});}}
  if(thirdIds.length)inlineRules.push({text:'제3세력: '+thirdIds.join(', '),line:source.line});
  issues.push(...compileRules([...source.rules,...inlineRules],stage,content,catalog.units,file));
  for(const [id,r]of Object.entries(configOf(stage).units))if(r.counter&&catalog.scenes&&!catalog.scenes[r.counter.scene])fail(source.line,'없는 전투 사건: '+id+' '+r.counter.scene,'카운터의 사건 장면을 선언하세요.');
  try{if(!issues.length){validateStage(stage,content);for(const r of rows.filter(r=>r.pending&&(r.point||assigned.has(r.unit.id))))validateStage({...stage,units:[r.unit]},content);}}catch(e){fail(source.line,String(e),'배치·지형·유닛 수치를 확인하세요.');}
  const explicit=source.rules.find(r=>r.text.startsWith('안내 목표:'))?.text.slice(6).trim();
  const targets=explicit!==undefined?explicit.split(/\s*,\s*/).filter(Boolean):[...new Set(wins.flatMap(r=>(/^격파 [\w-]+(?:\s*,\s*[\w-]+)*$/.test(r.text))?r.text.slice(3).split(/\s*,\s*/):[]))];
  for(const id of targets)if(!rows.some(r=>r.unit.id===id))fail(source.line,'없는 안내 목표: '+id,'배치·대기 유닛 id를 쓰세요.');
  const hints:MapHint[]=[...targets.flatMap(id=>{const u=rows.find(r=>r.unit.id===id)?.unit;return u?[{id:'victory:'+id,name:name(id),kind:'victory' as const,unit:id,cell:{col:u.x,row:u.y},marker:false}]:[];}),...regions.filter(r=>r.label).map(r=>({id:r.name,name:r.label!,kind:r.danger?'danger' as const:'optional' as const,cell:{col:r.area[0],row:r.area[1]},area:r.area,scene:'사건 '+r.event,share:r.share,untilTurn:r.deadline,alive:r.alive,marker:r.marker}))];
  return {stage,program,setting,hints,...(mapArt?{mapArt}:{}),objectives,markers,ai,facts,issues};
}
/** 코어 Condition에 없는 위치·격파 수만 boolean 자료로 투영한다. 난수는 쓰지 않는다. */
export function stageFacts(compiled:CompiledStage,state:BattleState,flags:Record<string,boolean>):void {
  const deadSide=(side:string)=>{const us=state.units.filter(u=>side==='hostile'?['enemy','third'].includes(faction(u)):faction(u)===side);return us.length>0&&!us.some(u=>u.alive&&!u.removed);};
  for(const fact of compiled.facts){const u=state.units.find(u=>u.id===fact.unit),area=state.stage.areas?.[fact.area??''];const target=state.units.find(v=>v.id===fact.target);const yes=fact.kind==='side-dead'?deadSide(fact.side!):fact.kind==='form'?!!u&&formName(state,u)===fact.form:fact.kind==='form-defeated'?!!runtime(state).defeated[`${fact.unit}.${fact.form}`]:fact.kind==='adjacent'?!!u?.alive&&!!target?.alive&&!u.removed&&!target.removed&&Math.abs(u.x-target.x)+Math.abs(u.y-target.y)===1:fact.kind==='kills'?state.units.filter(u=>u.side==='enemy'&&!u.alive&&!u.removed).length>=fact.count!:fact.kind==='defeated'?!!u&&!u.alive&&!u.removed:!!u?.alive&&!!area&&u.x>=area[0]&&u.y>=area[1]&&u.x<=area[2]&&u.y<=area[3];if(yes)flags[fact.id]=true;else delete flags[fact.id];}
}
