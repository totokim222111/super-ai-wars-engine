import {W,H}from'./stage';
export function canvasScale():number{const r=typeof document==='undefined'?undefined:document.querySelector?.('canvas')?.getBoundingClientRect?.();return r?Math.min(r.width/W,r.height/H):1;}
let touch=false;
export function touchInput():boolean{return touch||typeof matchMedia!=='undefined'&&matchMedia('(pointer: coarse)').matches;}
export function inputDevice(kind:string):void{touch=kind==='touch'||kind==='pen';}
export const percent=(n:number)=>`${Math.round(n)}%`;
export type UiSize='auto'|'normal'|'large';
let preference:UiSize='auto';
export function setUiSize(value:UiSize):void{preference=value;}
export function resolveUiSize(value:UiSize=preference,touch=touchInput(),scale=canvasScale()):'normal'|'large'{return value==='auto'?(touch||scale<.7?'large':'normal'):value;}
export const largeUi=()=>resolveUiSize()==='large';
export const readable=(size:number)=>Math.max(largeUi()?21:14,size);
export function uiMetrics(){const large=largeUi();return{large,font:large?24:22,small:large?21:14,button:large?84:56,row:large?84:56,gap:large?16:8,pager:large?84:40,tab:large?84:56};}
