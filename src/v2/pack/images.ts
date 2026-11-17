/** 그림 I/O 경계. 참조를 먼저 만들어도 src는 preload 때만 지정한다. */
export interface Recolor { from: string; hue: number; sat: number; light: number }
export type ImageDefinition = string | Recolor;
export type ImageStatus = 'idle' | 'loading' | 'ready' | 'missing';
export type Images = Record<string,HTMLImageElement|undefined>;
const owners = new WeakMap<HTMLImageElement,{store:ImageStore;id:string}>();
export function recolorPixels(pixels:Uint8ClampedArray,hue:number,sat:number,light:number):void {
  const clamp=(n:number)=>Math.max(0,Math.min(1,n));
  for(let i=0;i<pixels.length;i+=4){
    if(!pixels[i+3])continue;
    const r=pixels[i]/255,g=pixels[i+1]/255,b=pixels[i+2]/255,max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,l=(max+min)/2;
    let h=d===0?0:max===r?(g-b)/d+(g<b?6:0):max===g?(b-r)/d+2:(r-g)/d+4;
    h=((h*60+hue)%360+360)%360/60;const s=d===0?0:d/(1-Math.abs(2*l-1)),nl=clamp(l+light),ns=clamp(s*sat),c=(1-Math.abs(2*nl-1))*ns,x=c*(1-Math.abs(h%2-1)),m=nl-c/2;
    const [nr,ng,nb]=h<1?[c,x,0]:h<2?[x,c,0]:h<3?[0,c,x]:h<4?[0,x,c]:h<5?[x,0,c]:[c,0,x];
    pixels[i]=(nr+m)*255;pixels[i+1]=(ng+m)*255;pixels[i+2]=(nb+m)*255;
  }
}
export class ImageStore {
  readonly images:Images;
  private entries=new Map<string,{image:HTMLImageElement;status:ImageStatus;pending?:Promise<void>}>();
  private shared=new Map<string,{image:HTMLImageElement;status:ImageStatus;pending?:Promise<void>}>();
  constructor(readonly definitions:Record<string,ImageDefinition>,private readonly url:(path:string)=>string=p=>p,
    private readonly create:()=>HTMLImageElement=()=>new Image(),private readonly fetchImage?:(url:string,image:HTMLImageElement)=>Promise<boolean>,
    private readonly tint?:(image:HTMLImageElement,recolor:Recolor,target:HTMLImageElement)=>Promise<void>){
    this.images=new Proxy({}, {get:(_target,key)=>typeof key==='string'?this.get(key):undefined,ownKeys:()=>Object.keys(definitions),getOwnPropertyDescriptor:()=>({enumerable:true,configurable:true})});
  }
  get(id:string):HTMLImageElement|undefined {if(!Object.hasOwn(this.definitions,id))return;let entry=this.entries.get(id);if(!entry){const def=this.definitions[id],key=typeof def==='string'?this.url(def):JSON.stringify([def.from,def.hue,def.sat,def.light]),shared=this.shared.get(key);if(shared){entry=shared;this.entries.set(id,entry);}else{const image=this.create();this.entries.set(id,entry={image,status:'idle'});this.shared.set(key,entry);owners.set(image,{store:this,id});}}return entry.status==='missing'?undefined:entry.image;}
  status(id:string):ImageStatus{return this.entries.get(id)?.status??(Object.hasOwn(this.definitions,id)?'idle':'missing');}
  /** Pay the first raster upload while the section loading screen is still visible. */
  warm(ids:readonly string[]):void{if(typeof document==='undefined')return;try{const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d');if(!ctx)return;for(const id of ids){const entry=this.entries.get(id);if(entry?.status==='ready'&&entry.image.naturalWidth)ctx.drawImage(entry.image,0,0,64,64);}}catch{/* Privacy/headless restrictions retain the ordinary lazy drawing fallback. */}}
  private async read(url:string,image:HTMLImageElement):Promise<boolean>{const loaded=await(this.fetchImage?.(url,image)??new Promise<boolean>(resolve=>{image.onload=()=>resolve(true);image.onerror=()=>resolve(false);image.src=url;}));if(!loaded)return false;try{await image.decode?.();return true;}catch{return false;}}
  preload(ids:readonly string[]):Promise<void>{return Promise.all([...new Set(ids)].map(id=>this.load(id,[]))).then(()=>undefined);}
  private load(id:string,chain:string[]):Promise<void>{
    if(chain.includes(id))return Promise.resolve();
    const image=this.get(id),entry=this.entries.get(id);if(!image||!entry)return Promise.resolve();
    if(entry.pending)return entry.pending;if(entry.status==='ready'||entry.status==='missing')return Promise.resolve();
    entry.status='loading';const def=this.definitions[id];
    entry.pending=(async()=>{try{
      if(typeof def==='string'){
        if(!await this.read(this.url(def),image))throw new Error('missing');
      }else{
        await this.load(def.from,[...chain,id]);const source=this.get(def.from);if(this.status(def.from)!=='ready'||!source)throw new Error('missing');
        if(this.tint)await this.tint(source,def,image);else{const c=document.createElement('canvas');c.width=source.naturalWidth;c.height=source.naturalHeight;const ctx=c.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(source,0,0);const pixels=ctx.getImageData(0,0,c.width,c.height);recolorPixels(pixels.data,def.hue,def.sat,def.light);ctx.putImageData(pixels,0,0);const blob=await new Promise<Blob|null>(resolve=>c.toBlob(resolve,'image/png'));if(!blob)throw new Error('encode');const url=URL.createObjectURL(blob);try{if(!await this.read(url,image))throw new Error('decode');}finally{URL.revokeObjectURL(url);}}
      }
      entry.status='ready';
    }catch{entry.status='missing';}})();return entry.pending;
  }
}
/** 이미 받은 그림이면 동기적으로 끝나므로 기존 머리 없는 화면 테스트도 그대로 돈다. */
export function preloadImages(images:readonly (HTMLImageElement|undefined)[]):Promise<void>|undefined {
  const pending=images.flatMap(image=>{const owner=image&&owners.get(image);return owner&&['idle','loading'].includes(owner.store.status(owner.id))?[owner]:[];});
  if(pending.length)return Promise.all(pending.map(o=>o.store.preload([o.id]))).then(()=>undefined);
}
export function imageOwner(image?:HTMLImageElement):{store:ImageStore;id:string}|undefined{return image&&owners.get(image);}
