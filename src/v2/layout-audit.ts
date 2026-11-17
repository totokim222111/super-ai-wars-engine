/** Development-only geometry check. Captures supply glyph bounds after clipping and transforms. */
export interface LayoutBox {id:string;kind:'text'|'button';x:number;y:number;w:number;h:number;owner?:string;text?:string}
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
