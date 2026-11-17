/** Development-only geometry check. Captures supply glyph bounds after clipping and transforms. */
export interface LayoutBox {id:string;kind:'text'|'button';x:number;y:number;w:number;h:number;owner?:string;text?:string;fontSize?:number}
export interface LayoutException {id:string;reason:string;allows:(a:LayoutBox,b:LayoutBox)=>boolean}
export const LAYOUT_EXCEPTIONS:LayoutException[]=[
 {id:'control-label',reason:'A button contains its own semantic label.',allows:(a,b)=>{const t=a.kind==='text'?a:b,c=a.kind==='button'?a:b;return a.kind!==b.kind&&!!t.owner&&t.owner===c.owner&&t.x>=c.x&&t.y>=c.y&&t.x+t.w<=c.x+c.w&&t.y+t.h<=c.y+c.h;}},
 {id:'text-shadow',reason:'The same lettering is deliberately painted twice for contrast.',allows:(a,b)=>a.kind==='text'&&b.kind==='text'&&a.text===b.text&&!!a.owner&&a.owner===b.owner&&Math.abs(a.x-b.x)<=8&&Math.abs(a.y-b.y)<=8},
];
export function layoutOverlaps(boxes:LayoutBox[],exceptions=LAYOUT_EXCEPTIONS){
 const violations:{a:LayoutBox;b:LayoutBox}[]=[],allowed:{a:string;b:string;exception:string}[]=[];
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
  const a=boxes[i],b=boxes[j],x=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x),y=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);
  if(x<=0||y<=0)continue;
  const rule=exceptions.find(e=>e.allows(a,b));if(rule)allowed.push({a:a.id,b:b.id,exception:rule.id});else violations.push({a,b});
 }
 return{violations,allowed};
}

/** Measured visible content counts; presentation controls are not content items. */
export type UiDensity=Record<string,Record<string,number>>;
export function densityRegressions(alpha:UiDensity,current:UiDensity){return Object.entries(alpha).flatMap(([screen,blocks])=>Object.entries(blocks).flatMap(([block,expected])=>{const actual=current[screen]?.[block]??0;return actual<expected?[{screen,block,expected,actual}]:[]}));}
export const UI_LIMITS={buttonHeight:26,gap:0,label:11,auxiliary:10,absoluteFont:10} as const;

export function layoutGaps(boxes:LayoutBox[],minimum:number=UI_LIMITS.gap){const buttons=boxes.filter(b=>b.kind==='button'),violations:{a:LayoutBox;b:LayoutBox;gap:number}[]=[];for(let i=0;i<buttons.length;i++)for(let j=i+1;j<buttons.length;j++){const a=buttons[i],b=buttons[j],dx=Math.max(a.x-b.x-b.w,b.x-a.x-a.w,0),dy=Math.max(a.y-b.y-b.h,b.y-a.y-a.h,0),gap=Math.hypot(dx,dy);if(gap<minimum-.01)violations.push({a,b,gap});}return violations;}
export function layoutSizes(boxes:LayoutBox[]){return boxes.flatMap<{box:LayoutBox;reason:string;minimum:number}>(box=>{if(box.kind==='button')return box.h<UI_LIMITS.buttonHeight-.01?[{box,reason:'hit height',minimum:UI_LIMITS.buttonHeight}]:[];if(box.fontSize===undefined)return[];const label=boxes.some(b=>b.kind==='button'&&b.owner===box.owner&&b.text===box.text),number=/^[0-9.,/ +→%~–−-]+$/.test(box.text??''),decor=/^[✓▶◀▲▼✕—!?]+$/.test(box.text??''),minimum=label||number?UI_LIMITS.label:decor?UI_LIMITS.absoluteFont:UI_LIMITS.auxiliary;return box.fontSize<minimum?[{box,reason:label?'label font':number?'number font':'auxiliary font',minimum}]:[];});}

/** Actual canvas paint order, including translucent fills and lines, supplied by the browser probe. */
export interface PaintBox {id:string;owner:string;kind:'text'|'panel'|'line'|'image';x:number;y:number;w:number;h:number;order:number;alpha:number;text?:string;clip?:{x:number;y:number;w:number;h:number};protected?:{name:string;x:number;y:number;w:number;h:number}[]}
export interface PaintException {id:string;reason:string;allows:(covered:PaintBox,cover:PaintBox)=>boolean}
const intersection=(a:{x:number;y:number;w:number;h:number},b:{x:number;y:number;w:number;h:number})=>({w:Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)),h:Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y))});
export function paintOcclusions(ops:PaintBox[],exceptions:PaintException[]=[]){
 const violations:{covered:PaintBox;cover:PaintBox;reason:string}[]=[],allowed:{covered:string;cover:string;exception:string}[]=[];
 for(const covered of ops){if(covered.kind!=='text'&&!covered.protected?.length)continue;
  for(const cover of ops){if(cover.alpha<.04||cover.id===covered.id||!['panel','line'].includes(cover.kind))continue;
   const visible=(b:PaintBox)=>{const c=b.clip;if(!c)return b;const x=Math.max(b.x,c.x),y=Math.max(b.y,c.y);return{x,y,w:Math.min(b.x+b.w,c.x+c.w)-x,h:Math.min(b.y+b.h,c.y+c.h)-y};};
   const a=visible(covered),b=visible(cover);if(a.w<.75||a.h<.75||b.w<.75||b.h<.75)continue;const hit=intersection(a,b);if(hit.w<.75||hit.h<.75)continue;
   const text=covered.kind==='text',later=cover.order>covered.order;
   const textCovered=text&&(later||cover.kind==='line'&&cover.owner===covered.owner),imageCovered=!text&&later&&covered.protected!.some(r=>{const i=intersection(r,b);return i.w>2&&i.h>2;});
   if(!textCovered&&!imageCovered)continue;
   if(textCovered&&cover.kind==='line'&&!later){const hitArea={x:Math.max(a.x,b.x),y:Math.max(a.y,b.y),w:hit.w,h:hit.h};if(ops.some(o=>o.kind==='panel'&&o.alpha>=.9&&o.order>cover.order&&o.order<covered.order&&o.x<=hitArea.x&&o.y<=hitArea.y&&o.x+o.w>=hitArea.x+hitArea.w&&o.y+o.h>=hitArea.y+hitArea.h))continue;}
   const rule=exceptions.find(e=>e.allows(covered,cover));if(rule)allowed.push({covered:covered.id,cover:cover.id,exception:rule.id});
   else violations.push({covered,cover,reason:text?'paint over text':'panel over protected illustration'});
  }
 }
 return{violations,allowed};
}
export function clippedText(ops:PaintBox[]){return ops.filter(o=>{if(o.kind!=='text'||!o.clip)return false;const i=intersection(o,o.clip);return i.w>.5&&i.h>.5&&(i.w<o.w-.75||i.h<o.h-.75);});}
export function inconsistentInventoryText(texts:string[],owned:number){return owned>0&&texts.some(t=>/보유한 (?:플러그인|파츠)[이가]? 없습니다/.test(t));}
