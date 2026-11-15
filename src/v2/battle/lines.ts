/** Presentation-only speech. Combat RNG and rule values are never changed here. */
export interface BattleLine {text:string;mood?:string;when?:{forms?:string[];mechs?:string[]}}
export type Speech=string|BattleLine;
export type BattleSituation='attack'|'finisher'|'hitLight'|'hitHeavy'|'dodge'|'guard'|'defeated'|'victory'|'resupply'|'repair'|'cheer';
export type BattleLineSet=Partial<Record<BattleSituation,BattleLine[]>>&{weapons?:Record<string,BattleLine[]>;afterFormChange?:BattleLine[]};
export type BattleLines=BattleLineSet&{mode?:'sequence'|'random';opponentChance?:number;opponents?:Record<string,BattleLineSet>;forms?:Record<string,BattleLineSet>};
export interface BattleLineContext {form?:string;mech?:string;formChanged?:boolean}
export interface ComboDialogue {name:string;participants:{cast:string;speech:BattleLine}[];finish:{cast:string;speech:BattleLine};binding?:{ids:string[];participants:string[]}}
export interface PackBattleDialogue {defaults?:{enemy?:BattleLines};combos?:ComboDialogue[]}
const situations:BattleSituation[]=['attack','finisher','hitLight','hitHeavy','dodge','guard','defeated','victory','resupply','repair','cheer'];
export function battleLineIssues(value:unknown,moods:string[]):string[]{
 const errors:string[]=[];
 const set=(value:unknown,path:string,root=false)=>{
  if(!value||typeof value!=='object'||Array.isArray(value)){errors.push(path+': 객체가 필요합니다.');return;}
  const o=value as Record<string,unknown>;
  for(const key of Object.keys(o))if(![...situations,'weapons','afterFormChange',...(root?['mode','opponents','forms','opponentChance']:[])].includes(key))errors.push(path+'.'+key+': 알 수 없는 항목');
  const rows=(v:unknown,p:string)=>{if(!Array.isArray(v)){errors.push(p+': 문장 목록이 필요합니다.');return;}for(const [i,line]of v.entries()){
   if(!line||typeof line!=='object'||Array.isArray(line)||typeof line.text!=='string'||!line.text.trim()||Object.keys(line).some(k=>!['text','mood','when'].includes(k)))errors.push(`${p}[${i}]: 비어 있지 않은 text와 선택 mood/when을 적으세요.`);
   else{if(line.mood!==undefined&&(typeof line.mood!=='string'||!moods.includes(line.mood)))errors.push(`${p}[${i}]: 없는 표정 ${String(line.mood)}`);
    if(line.when!==undefined&&(!line.when||typeof line.when!=='object'||Array.isArray(line.when)||Object.entries(line.when).some(([k,v])=>!['forms','mechs'].includes(k)||!Array.isArray(v)||!v.length||v.some(x=>typeof x!=='string'))))errors.push(p+': when.forms/mechs 문자열 배열이 필요합니다.');
   }
  }};
  for(const key of [...situations,'afterFormChange'])if(o[key]!==undefined)rows(o[key],path+'.'+key);
  if(o.weapons!==undefined){if(!o.weapons||typeof o.weapons!=='object'||Array.isArray(o.weapons))errors.push(path+'.weapons: 무장 id별 객체가 필요합니다.');else for(const [k,v]of Object.entries(o.weapons))rows(v,path+'.weapons.'+k);}
  if(root){if(o.mode!==undefined&&!['sequence','random'].includes(String(o.mode)))errors.push(path+'.mode: sequence 또는 random');
   if(o.opponentChance!==undefined&&(typeof o.opponentChance!=='number'||!Number.isFinite(o.opponentChance)||o.opponentChance<0||o.opponentChance>1))errors.push(path+'.opponentChance: 0~1 확률');
   for(const key of ['opponents','forms'])if(o[key]!==undefined){if(!o[key]||typeof o[key]!=='object'||Array.isArray(o[key]))errors.push(path+'.'+key+': id별 객체가 필요합니다.');else for(const [k,v]of Object.entries(o[key]))set(v,path+'.'+key+'.'+k);}
  }
 };
 set(value,'battleLines',true);return errors;
}
export function lineMatches(line:BattleLine,context:BattleLineContext):boolean{const w=line.when;return !w||!w.forms&&!w.mechs||!!w.forms?.includes(context.form??'')||!!w.mechs?.includes(context.mech??'');}
/** One selector per exchange: no sentence repeats through counters, support or second attacks. */
export class BattleLinePicker {
 private used=new Set<string>();private random:number;
 constructor(seed=1){this.random=seed>>>0||1;}
 private next():number{this.random^=this.random<<13;this.random^=this.random>>>17;this.random^=this.random<<5;return this.random>>>0;}
 pick(bank:BattleLines|undefined,situation:BattleSituation,weapon?:string,opponent?:string,context:BattleLineContext={}):BattleLine|undefined{
  if(!bank)return;
  const attack=situation==='attack'||situation==='finisher',candidate=opponent?bank.opponents?.[opponent]:undefined;
  const rival=candidate&&attack&&(bank.opponentChance===undefined||this.next()/0x100000000<bank.opponentChance)?candidate:undefined,form=context.form?bank.forms?.[context.form]:undefined;
  const fallback=situation==='finisher'?'attack':situation==='hitHeavy'?'hitLight':undefined;
  const pools=[attack&&weapon?rival?.weapons?.[weapon]:undefined,rival?.[situation],fallback?rival?.[fallback]:undefined,attack&&context.formChanged?form?.afterFormChange??bank.afterFormChange:undefined,attack&&weapon?form?.weapons?.[weapon]:undefined,form?.[situation],fallback?form?.[fallback]:undefined,attack&&weapon?bank.weapons?.[weapon]:undefined,bank[situation],fallback?bank[fallback]:undefined];
  for(const pool of pools){const available=pool?.filter(line=>line.text.trim()&&!this.used.has(line.text)&&lineMatches(line,context));if(!available?.length)continue;
   const line=available[bank.mode==='random'?this.next()%available.length:0];this.used.add(line.text);return {...line};
  }
 }
}
