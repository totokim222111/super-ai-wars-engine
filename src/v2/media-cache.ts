/** Encoded media survive restarts where Cache API is available; HTTP remains the fallback. */
export interface MediaEntry {file:string;hash:string;bytes:number;kind:'image'|'audio'|'video'|'metadata'}
export interface AssetGroup {optionalImages?:string[];images:string[];audio:string[];videos?:string[];files:string[]}
export interface StageAssets {version:string;pack:string;entries:Record<string,MediaEntry>;boot:AssetGroup;stages:Record<string,AssetGroup>;loading?:import('./loading-screen').LoadingManifest}
export class MediaCache {
  private memory=new Map<string,ArrayBuffer>();private memoryBytes=0;private pending=new Map<string,Promise<ArrayBuffer>>();private cache?:Promise<Cache|undefined>;
  private warned=new Set<string>();private retainedVideos=new Set<string>();
  constructor(readonly manifest:StageAssets,private readonly url:(path:string)=>string,private readonly memoryLimit=16*1024*1024){}
  path(file:string):string {const e=this.manifest.entries[file];return this.url(file)+(e?(file.includes('?')?'&':'?')+'v='+e.hash.slice(0,16):'');}
  private key(path:string):{key:string;entry?:MediaEntry}{const clean=path.split('?')[0];const pair=Object.entries(this.manifest.entries).find(([file])=>this.url(file).split('?')[0]===clean||file===clean);return pair?{key:this.path(pair[0]),entry:pair[1]}:{key:path};}
  private persistent():Promise<Cache|undefined>{return this.cache??=(async()=>{try{if(typeof caches==='undefined')return;const prefix='srpg-media-'+this.manifest.pack+'-',name=prefix+this.manifest.version;for(const key of await caches.keys())if(key.startsWith(prefix)&&key!==name)await caches.delete(key);return await caches.open(name);}catch{return;}})();}
  async bytes(path:string):Promise<ArrayBuffer>{const {key}=this.key(path);const memory=this.memory.get(key);if(memory){this.memory.delete(key);this.memory.set(key,memory);return memory.slice(0);}const pending=this.pending.get(key);if(pending)return (await pending).slice(0);
    const task=(async()=>{const cache=await this.persistent();let response:Response|undefined;try{response=await cache?.match(key);}catch{}if(!response){response=await fetch(key,{cache:'force-cache'});if(!response.ok)throw Error(key+': HTTP '+response.status);try{await cache?.put(key,response.clone());}catch{}}
      const bytes=await response.arrayBuffer();this.memory.set(key,bytes);this.memoryBytes+=bytes.byteLength;while(this.memoryBytes>this.memoryLimit&&this.memory.size>1){const first=[...this.memory.keys()].find(k=>!this.retainedVideos.has(k));if(!first)break;this.memoryBytes-=this.memory.get(first)!.byteLength;this.memory.delete(first);}return bytes;
    })();this.pending.set(key,task);try{return (await task).slice(0);}finally{this.pending.delete(key);}}
  /** Current stage only: retain HTTP/Cache API copies, release large in-memory video bytes. */
  releaseVideos(except:readonly string[]=[]):void{this.retainedVideos=new Set(except.map(file=>this.key(file).key));for(const [file,e]of Object.entries(this.manifest.entries))if(e.kind==='video'&&!except.includes(file)){const key=this.key(file).key,bytes=this.memory.get(key);if(bytes){this.memoryBytes-=bytes.byteLength;this.memory.delete(key);}}}
  async optionalVideos(files:readonly string[]):Promise<void>{for(const file of files){let timer:ReturnType<typeof setTimeout>|undefined;try{await Promise.race([this.bytes(this.url(file)),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('영상 사전 로딩 시간 초과')),8000);})]);}catch(e){this.warn(file,e);}finally{if(timer)clearTimeout(timer);}}}
  async image(path:string,image:HTMLImageElement):Promise<boolean>{try{const bytes=await this.bytes(path),url=URL.createObjectURL(new Blob([bytes]));try{return await new Promise<boolean>(done=>{image.onload=()=>done(true);image.onerror=()=>done(false);image.src=url;});}finally{URL.revokeObjectURL(url);}}catch(error){this.warn(path,error);return false;}}
  async preload(files:readonly string[],progress?:(done:number,total:number)=>void,concurrency=4):Promise<void>{const unique=[...new Set(files)];let next=0,done=0;progress?.(0,unique.length);await Promise.all(Array.from({length:Math.min(concurrency,unique.length)},async()=>{for(;;){const file=unique[next++];if(!file)return;await this.bytes(this.url(file));progress?.(++done,unique.length);}}));}
  background(files:readonly string[]):void {void this.preload(files,undefined,1).catch(error=>this.warn('prefetch',error));}
  private warn(path:string,error:unknown):void{if(this.warned.has(path))return;this.warned.add(path);console.warn('[media] '+path,error);}
}
