import {MediaCache,type StageAssets,type AssetGroup} from '../media-cache';
import {ImageStore} from './images';
import type {Sound} from '../sound';
/** Keep the current section intact; stage-end preparation overlaps its outro and the next episode. */
export class StageLoader {
 onPrepared?:()=>void;
 private ready=new Set<string>();private pending=new Map<string,Promise<void>>();private current?:string;
 constructor(readonly manifest:StageAssets,readonly cache:MediaCache,private readonly images:ImageStore,private readonly sound:Sound){}
 private pictures(paths:readonly string[]):string[]{const ids=new Set(Object.entries(this.images.definitions).filter(([,v])=>typeof v==='string'&&paths.includes(v)).map(([id])=>id));let changed=true;while(changed){changed=false;for(const [id,v]of Object.entries(this.images.definitions))if(typeof v!=='string'&&ids.has(v.from)&&!ids.has(id)){ids.add(id);changed=true;}}return [...ids];}
 private merge(groups:(AssetGroup|undefined)[]):AssetGroup {const list=groups.filter((g):g is AssetGroup=>!!g),union=(key:keyof AssetGroup)=>[...new Set(list.flatMap(g=>g[key]??[]))];return{optionalImages:union('optionalImages'),images:union('images'),audio:union('audio'),videos:union('videos'),files:union('files')};}
 private async prepare(g:AssetGroup,progress?:(done:number,total:number)=>void):Promise<void>{this.cache.releaseVideos(g.videos??[]);this.sound.retainMusic?.(g.audio);await this.cache.preload(g.files.filter(path=>!g.optionalImages?.includes(path)),(done)=>progress?.(done,g.files.length));await this.cache.optionalVideos(g.videos??[]);await this.images.preload(this.pictures(g.images));this.images.warm?.(this.pictures(g.images));await this.sound.preload([...this.sound.effectIds(),...g.audio]);this.onPrepared?.();progress?.(g.files.length,g.files.length);}
 async boot(progress?:(done:number,total:number)=>void):Promise<void>{const id=Object.keys(this.manifest.stages)[0];await this.prepare(this.merge([this.manifest.boot,this.manifest.stages[id]]),progress);if(id){this.ready.add(id);this.current=id;this.prefetch(id);}}
 private prefetch(id:string):void{const keys=Object.keys(this.manifest.stages),next=this.manifest.stages[keys[keys.indexOf(id)+1]];if(next)this.cache.background(next.files);}
 ensure(id:string,progress?:(done:number,total:number)=>void):Promise<void>|undefined {
  if(this.ready.has(id)||!this.manifest.stages[id])return;
  const old=this.pending.get(id);if(old)return old;const task=this.prepare(this.manifest.stages[id],progress).then(()=>{this.current=id;this.ready.clear();this.ready.add(id);this.prefetch(id);});this.pending.set(id,task);void task.finally(()=>this.pending.delete(id)).catch(()=>{});return task;
 }
 async transition(id:string,next?:string,progress?:(done:number,total:number)=>void):Promise<void>{await this.prepare(this.merge([this.manifest.stages[id],next?this.manifest.stages[next]:undefined]),progress);this.current=next??id;this.ready.clear();this.ready.add(id);this.ready.add(this.current);this.prefetch(this.current);}
}
