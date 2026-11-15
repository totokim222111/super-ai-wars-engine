/** Normalized focal points belong to pack data; media pixels are never modified. */
export type ImageFocus=readonly[number,number];
export interface ImageRect{x:number;y:number;w:number;h:number}
const focusByImage=new WeakMap<HTMLImageElement,ImageFocus>();
export function imageFocus(image?:HTMLImageElement):ImageFocus{return image&&focusByImage.get(image)||[.5,1/3];}
export function configureImageFocus(images:Record<string,HTMLImageElement|undefined>,focus:Record<string,ImageFocus>={}):void{for(const[id,p]of Object.entries(focus)){const image=images[id];if(image)focusByImage.set(image,p);}}
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
/** Contained zoom reserves its maximum envelope from the outset. Every animation
 * frame keeps the entire illustration (not just a face point) inside the safe box. */
export function focalImageRect(iw:number,ih:number,box:ImageRect,focus:ImageFocus=[.5,1/3],zoom=1,pan:ImageFocus=[0,0],mode:'contain'|'cover'='contain'):ImageRect{
 const scale=mode==='contain'?Math.min(box.w/iw,box.h/ih)*clamp(zoom/1.06,.8,1):Math.max(box.w/iw,box.h/ih)*clamp(zoom,1,1.06),w=iw*scale,h=ih*scale;
 const origin=(start:number,size:number,draw:number,p:number,anchor:number,drift:number)=>clamp(start+size*anchor-clamp(p,0,1)*draw+drift,Math.min(start,start+size-draw),Math.max(start,start+size-draw));
 return{x:origin(box.x,box.w,w,focus[0],.5,pan[0]),y:origin(box.y,box.h,h,focus[1],1/3,pan[1]),w,h};
}
export function drawFocusedImage(ctx:CanvasRenderingContext2D,image:HTMLImageElement,box:ImageRect,zoom=1,pan:ImageFocus=[0,0],mode:'contain'|'cover'='contain'):ImageRect{
 const r=focalImageRect(image.naturalWidth,image.naturalHeight,box,imageFocus(image),zoom,pan,mode);ctx.drawImage(image,r.x,r.y,r.w,r.h);return r;
}
