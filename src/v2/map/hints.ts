import type {Cell} from './model';
export type HintKind='victory'|'optional'|'danger';
export interface MapHint {id:string;name:string;kind:HintKind;cell:Cell;area?:[number,number,number,number];scene?:string;share?:string;untilTurn?:number;alive?:string;unit?:string;marker?:boolean;objective?:string;appearsTurn?:number}
export interface HintOptions {order?:HintKind[];persistent?:boolean}
export const hintRole=(kind:HintKind):string=>({victory:'승리 목표',optional:'보조 목표',danger:'위험 지역'})[kind];
export const hintLabel=(hint:MapHint):string=>`${hint.objective??hint.name} · ${hintRole(hint.kind)}${hint.objective&&hint.objective!==hint.name?' · '+hint.name:''}${hint.appearsTurn?' · '+hint.appearsTurn+'턴 등장':''}`;
/** Only presentation data is filtered here; no scenario flags or battle RNG are written. */
export function activeHints(hints:MapHint[],seen:(scene:string)=>boolean,flag:(id:string)=>boolean,turn:number,alive:(id:string)=>boolean):MapHint[]{
 return hints.filter(h=>!(h.scene&&seen(h.scene))&&!(h.share&&flag(h.share))&&!(h.untilTurn&&turn>h.untilTurn)&&!(h.alive&&!alive(h.alive))&&!(h.unit&&!alive(h.unit)));
}
export function hintOrder(hints:MapHint[],options:HintOptions={}):MapHint[]{const order=options.order??['victory','optional','danger'];const seen=new Set<string>();return order.flatMap(kind=>hints.filter(h=>h.kind===kind)).filter(h=>{const key=h.share??h.id;if(seen.has(key))return false;seen.add(key);return true;});}
