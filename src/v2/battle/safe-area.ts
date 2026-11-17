import {W} from '../stage';
export interface Box{x:number;y:number;w:number;h:number}
/** All battle captions share this contract with the two central controls and HUD. */
export const BATTLE_CONTROLS:Box={x:W/2-70,y:4,w:140,h:196};
export const BATTLE_HUD:Box[]=[{x:0,y:0,w:576,h:122},{x:704,y:0,w:576,h:122}];
export const overlaps=(a:Box,b:Box)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
export function safeCaption(x:number,y:number,w:number,h:number,heads:Box[]=[]):Box{
 const box={x:Math.max(24,Math.min(W-w-24,x-w/2)),y:Math.max(130,y-h/2),w,h};
 for(const area of [BATTLE_CONTROLS,...BATTLE_HUD])if(overlaps(box,area))box.y=Math.max(box.y,area.y+area.h+12);
 if(heads.some(head=>overlaps(box,head))){const candidates=heads.flatMap(head=>[head.x-w-16,head.x+head.w+16]).map(left=>({...box,x:left})).filter(b=>b.x>=24&&b.x+b.w<=W-24&&![...heads,BATTLE_CONTROLS,...BATTLE_HUD].some(a=>overlaps(b,a))).sort((a,b)=>Math.abs(a.x-box.x)-Math.abs(b.x-box.x));if(candidates[0])box.x=candidates[0].x;else for(const head of heads)if(overlaps(box,head))box.y=Math.max(box.y,head.y+head.h+12);}
 return box;
}
