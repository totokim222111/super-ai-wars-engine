import {afterEach,describe,it,expect,vi} from 'vitest';
import {App,Screen,Cinematics,CinematicScreen} from '../src/v2/screen';
import {Sound} from '../src/v2/sound';
import {Runner} from '../src/v2/flow';
class Media {
 static all:Media[]=[];src='';paused=true;muted=false;volume=1;loop=false;currentTime=0;ended=false;readyState=2;videoWidth=960;videoHeight=540;style={};tabIndex=0;onended:null|(()=>void)=null;onerror:null|(()=>void)=null;
 constructor(src=''){this.src=src;Media.all.push(this);}play=vi.fn(async()=>{this.paused=false});pause=vi.fn(()=>{this.paused=true});load=vi.fn();setAttribute(){}removeAttribute(k:string){if(k==='src')this.src='';}remove=vi.fn();
}
const flush=()=>new Promise(r=>setTimeout(r,0));
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
async function setup(kind:string){
 Media.all=[];vi.stubGlobal('Audio',Media);vi.stubGlobal('AudioContext',undefined);vi.stubGlobal('webkitAudioContext',undefined);
 const doc=Object.assign(new EventTarget(),{visibilityState:'visible',createElement:()=>new Media(),body:{append(){}}});vi.stubGlobal('document',doc);
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>new Response(url.endsWith('pack.json')?JSON.stringify({name:'fixture',bgm:Object.fromEntries(['map','title','theme','new-scene'].map(id=>[id,{file:id+'.mp3',source:'fixture',license:'CC0',gain:.5}]))}):new Uint8Array([1]))));
 const sound=new Sound();sound.configure({streamMusic:true});await sound.loadPack('/audio/');await sound.preload(['map','title','theme','new-scene']);sound.unlock();
 class Scene extends Screen{enter(){}}const owner=new Scene();owner.music=kind==='opening'?'title':kind==='weapon'?'theme':'map';
 const app=Object.assign(Object.create(App.prototype),{stack:[owner],epoch:0,changing:false,loading:0,flow:new Runner(),veil:{alpha:0},sound})as App;owner.app=app;sound.music(owner.music);
 const bytes=vi.fn(async()=>new ArrayBuffer(4)),service=new Cinematics(app,{videos:{[kind]:{file:kind+'.mp4',music:kind==='weapon'?'duck':'mute'}}},bytes,{},'fixture');
 return{app,sound,service,bytes,owner,doc};
}
describe('all cinematic exits own media cleanup',()=>{
 for(const kind of ['opening','story','weapon'])for(const ending of ['ended','skip','rapid'])it(`${kind}: ${ending} leaves exactly the current BGM, including during a screen fade`,async()=>{
  const h=await setup(kind),task=h.service.play(kind);await flush();const screen=h.app.top as CinematicScreen,video=screen.video! as unknown as Media;
  expect(video.paused).toBe(false);h.sound.music('new-scene');Object.assign(h.app,{changing:true});
  if(ending==='ended')video.onended!();else for(let n=0;n<(ending==='rapid'?12:2);n++)screen.requestSkip();
  await task;await flush();expect(h.app.top).toBe(h.owner);expect(video.paused).toBe(true);expect(video.muted).toBe(true);expect(video.src).toBe('');expect(video.remove).toHaveBeenCalledOnce();
  const active=Media.all.filter(m=>!m.paused&&!m.ended);expect(active).toHaveLength(1);
  expect((h.sound as unknown as {mediaPlaying:{id:string}}).mediaPlaying.id).toBe('new-scene');expect(active[0].volume).toBeCloseTo(.3);
  Object.defineProperty(h.doc,'visibilityState',{value:'visible'});h.doc.dispatchEvent(new Event('visibilitychange'));expect(video.play).toHaveBeenCalledTimes(1);
 });
 it('skip during I/O cannot start a late movie or leave a pending caller',async()=>{const h=await setup('opening');let release!:(b:ArrayBuffer)=>void;h.bytes.mockImplementationOnce(()=>new Promise(r=>release=r));const task=h.service.play('opening'),screen=h.app.top as CinematicScreen,video=screen.video! as unknown as Media;screen.requestSkip();screen.requestSkip();await task;release(new ArrayBuffer(4));await flush();expect(video.play).not.toHaveBeenCalled();expect(Media.all.filter(m=>!m.paused)).toHaveLength(1);});
 it('reset resolves an active movie and does not remove the newly selected scene',async()=>{const h=await setup('story'),task=h.service.play('story');await flush();h.app.reset();h.app.push(h.owner,'none');h.sound.music('new-scene');await task;await flush();expect(h.app.top).toBe(h.owner);expect(Media.all.filter(m=>!m.paused)).toHaveLength(1);});
 it('a suspended live movie resumes once on visibility return, and never after disposal',async()=>{const h=await setup('story'),task=h.service.play('story');await flush();const screen=h.app.top as CinematicScreen,video=screen.video! as unknown as Media;video.pause();h.doc.dispatchEvent(new Event('visibilitychange'));await flush();expect(video.paused).toBe(false);screen.requestSkip();screen.requestSkip();await task;const count=video.play.mock.calls.length;h.doc.dispatchEvent(new Event('visibilitychange'));expect(video.play).toHaveBeenCalledTimes(count);});
});
