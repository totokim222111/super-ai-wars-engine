import { H,W } from './stage';
export function canvasScale():number{const r=typeof document==='undefined'?undefined:document.querySelector?.('canvas')?.getBoundingClientRect?.();return r?Math.min(r.width/W,r.height/H):1;}
let touch=false;
export function touchInput():boolean{return touch||typeof matchMedia!=='undefined'&&matchMedia('(pointer: coarse)').matches;}
export function inputDevice(kind:string):void{touch=kind==='touch'||kind==='pen';}
export const percent=(n:number)=>`${Math.round(n)}%`;
/** Legacy preference values are accepted but never affect the single game layout. */
export type UiSize='auto'|'normal'|'large';
export function setUiSize(_value:UiSize):void{}
export function resolveUiSize(_value?:UiSize,_touch?:boolean,_scale?:number):'normal'{return 'normal';}
export const largeUi=()=>false;
/** Battle HUD readability is independent of menu density. */
export const battleCompact=()=>touchInput()||canvasScale()<.7;
export const battleReadable=(size:number)=>Math.max(battleCompact()?21:14,size);
export const readable=(size:number)=>size;
export function uiMetrics(){return{large:false,font:22,small:15,button:56,row:62,gap:6,pager:56,tab:56};}
