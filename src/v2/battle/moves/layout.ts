import {W,H} from '../../stage';
import {GROUND} from '../scene';
import type {StrikeContext} from '../template';
/** All move geometry follows the shared stage, foot line and actual rendered sprite. */
export function battleLayout(c:StrikeContext){
 const canvas=typeof document==='undefined'?undefined:document.querySelector('canvas');
 const rect=canvas?.getBoundingClientRect(),scale=Math.min((rect?.width||W)/W,(rect?.height||H)/H);
 const mobile=!!rect&&rect.width<900,css=(n:number)=>n/Math.max(.1,scale);
 const h=c.defender.sprite.height,ah=c.attacker.sprite.height;
 return {w:W,h:H,ground:GROUND,height:h,attackerHeight:ah,width:c.defender.sprite.width,scale,mobile,
  projectileMin:css(mobile?22:28),fragmentMin:css(mobile?18:24),held:h*.65,large:h*1.8,cloneSpacing:Math.max(40,Math.min(60,h*.18)),
  safe:{left:W*.08,right:W*.92,top:H*.19,bottom:Math.min(GROUND-h*.08,H*.70)},
  particleCount:(requested:number,dense=false,quality=1)=>Math.max(dense?20:4,Math.round(Math.min(requested,mobile?32:44)*quality))};
}
export const clamp=(n:number,a=0,b=1)=>Math.max(a,Math.min(b,n));
export const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
export const smooth=(a:number,b:number,t:number)=>{const p=clamp((t-a)/(b-a));return p*p*(3-2*p)};
