/** Public sequence vocabulary. Durations include anticipation, contact stop and recovery. */
export const MOVE_SECONDS = {
  "jab-rush": 1.6,
  "uppercut": 0.9,
  "slam-down": 0.9,
  "hammer-smash": 1.8,
  "ram": 2.2,
  "headbutt": 1.3,
  "slash": 1.6,
  "iai": 1.4,
  "thrust": 1.3,
  "whip": 1.6,
  "spin": 1.5,
  "stamp": 1.2,
  "cling": 1.6,
  "sweep": 1.2,
  "vulcan": 2.4,
  "cannon": 2.2,
  "beam": 2.8,
  "sweep-beam": 2.6,
  "sky-beam": 2.4,
  "missiles": 2.8,
  "mortar": 3.2,
  "scatter": 1.8,
  "bits": 3.0,
  "lob": 2.0,
  "stream": 2.4,
  "swarm": 2.4,
  "popup-storm": 2.4,
  "drop": 2.0,
  "text-drop": 2.6,
  "wave": 2.0,
  "storm": 2.6,
  "bind": 2.0,
  "mirage": 2.2,
  "summon": 2.4,
  "serpent": 2.4
} as const;
export type MoveId=keyof typeof MOVE_SECONDS;
export const PROP_IDS = ["fist", "keycap", "enter-key", "hammer", "wrench", "chip", "cooler-fan", "radiator", "plug", "cable", "battery", "server", "drill", "saw", "gear", "anchor", "shield", "sword", "dagger", "rapier", "lance", "hairpin", "folding-fan", "broom", "shuriken", "missile", "bomb", "satellite", "bike-wheel", "drum", "window", "error-window", "terms-window", "cursor", "magnifier", "bell", "badge-number", "heart", "thumb", "star", "speech", "mail", "link", "cookie", "check-badge", "coin", "paper", "scroll", "book", "stamp", "gavel", "play-button", "spinner", "token", "pixel", "hashtag", "note-tag", "red-underline", "flame", "droplet", "snowflake", "icicle", "bolt", "swirl", "whale", "llama", "cat-paw", "teddy", "cake", "thermos", "shrimp", "turkey-leg", "banana", "parcel", "smile-mask", "eye", "tentacle", "crown", "crescent", "dragon-head", "worm-head", "net", "chain", "cage", "patch", "spray-can", "needle", "picture", "music-note", "feather", "bao", "fork", "six-hand", "galleon", "crab", "fish-hook", "thumbnail", "sandbag", "glasses", "claw", "vacuum", "chest", "cube", "blanket"] as const;
export type PropId=typeof PROP_IDS[number];
export const CLOSER_SECONDS = {"none": 0.0, "nova": 1.2, "blackout": 1.4, "terminal": 1.6, "rainbow": 1.2, "verdict": 1.2, "confetti": 1.0} as const;
export type CloserId=keyof typeof CLOSER_SECONDS;
export const ELEMENT_IDS = ["fire", "ice", "volt", "water", "wind", "light", "dark", "data", "paper", "sugar", "gold", "rgb", "sand", "impact"] as const;
export type ElementId=typeof ELEMENT_IDS[number];
export const CONTACT_MOVES = new Set<MoveId>(["jab-rush", "uppercut", "slam-down", "hammer-smash", "ram", "headbutt", "slash", "iai", "thrust", "whip", "spin", "stamp", "cling", "sweep"]);
export interface MoveDef {move:MoveId;prop?:PropId;hits?:number;count?:number;words?:string[]}
export interface SequenceAnim {template:'sequence';moves:MoveDef[];element:ElementId;closer:CloserId;tier:1|2|3;color?:string}
export const launchSeconds=(m:MoveDef):number=>Math.max(.3,MOVE_SECONDS[m.move]*.32);
export const impactSeconds=(m:MoveDef):number=>Math.max(MOVE_SECONDS[m.move]*.68,m.move==='stamp'?1.12:m.move==='lob'?1.65:0);
export const needsBridge=(before:MoveDef,after:MoveDef):boolean=>!CONTACT_MOVES.has(before.move)&&CONTACT_MOVES.has(after.move);
export function sequenceSeconds(a:SequenceAnim):number{return launchSeconds(a.moves[0])+a.moves.reduce((n,m)=>n+impactSeconds(m),0)+CLOSER_SECONDS[a.closer]+a.moves.slice(1).filter((m,i)=>needsBridge(a.moves[i],m)).length*.2;}
/** One source for pack validation and tooling; reject malformed input before indexing it. */
export function sequenceIssues(value:unknown):string[]{
 const errors:string[]=[];if(!value||typeof value!=='object'||Array.isArray(value))return ['sequence object required'];const a=value as Record<string,unknown>;
 for(const key of Object.keys(a))if(!['template','moves','element','closer','tier','color'].includes(key))errors.push('unknown sequence field: '+key);
 if(a.template!=='sequence')errors.push('template must be sequence');
 if(!ELEMENT_IDS.includes(a.element as ElementId))errors.push('unknown element');if(!Object.hasOwn(CLOSER_SECONDS,String(a.closer)))errors.push('unknown closer');
 if(![1,2,3].includes(a.tier as number))errors.push('tier must be 1..3');if(a.color!==undefined&&(typeof a.color!=='string'||!/^#[0-9a-f]{6}$/i.test(a.color)))errors.push('color must be #RRGGBB');
 if(!Array.isArray(a.moves)||a.moves.length<1||a.moves.length>3)return [...errors,'moves must contain 1..3 entries'];
 for(const [i,m]of a.moves.entries()){
  if(!m||typeof m!=='object'||Array.isArray(m)){errors.push('invalid move '+i);continue;}
  for(const key of Object.keys(m))if(!['move','prop','hits','count','words'].includes(key))errors.push('unknown move field: '+key);
  if(!Object.hasOwn(MOVE_SECONDS,m.move))errors.push('unknown move: '+m.move);if(m.prop!==undefined&&!PROP_IDS.includes(m.prop))errors.push('unknown prop: '+m.prop);
  for(const [key,max]of [['hits',12],['count',40]]as const)if(m[key]!==undefined&&(!Number.isInteger(m[key])||m[key]<1||m[key]>max))errors.push(key+' must be integer 1..'+max);
  if(m.words!==undefined&&(!Array.isArray(m.words)||m.words.length>3||m.words.some((w:unknown)=>typeof w!=='string'||Array.from(w).length<1||Array.from(w).length>4)))errors.push('words: at most 3 strings of 1..4 characters');
 }
 if(!errors.length&&sequenceSeconds(a as unknown as SequenceAnim)>(a.closer==='none'?4:8))errors.push('sequence exceeds '+(a.closer==='none'?4:8)+' seconds');return errors;
}
