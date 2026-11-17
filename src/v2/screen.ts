import {LoadingScreen,LoadingTransition,type LoadingBoundary} from './loading-screen';
import {reducedMotion} from '../platform/settings';
import { preloadImages } from './pack/images';
import {resolveUiSize} from './presentation';
/**
 * 화면과 앱.
 *
 * 게임은 화면(Screen)을 쌓아서 만든다. 타이틀, 맵, 전투, 메뉴, 확인창이 모두 화면이다.
 *   - 화면마다 자기 무대(stage)와 시간(runner), UI 부품(ui)을 가진다. 서로 섞이지 않는다.
 *   - 맨 위 화면만 움직이고 입력을 받는다. 아래 화면은 멈춘 채 그려진다.
 *   - 화면을 덮지 않는 화면(확인창, 겹치는 메뉴)은 opaque를 false로 둔다. 그러면 아래 화면이 비쳐 보인다.
 *
 * 새 화면을 만들 때: Screen을 상속해 enter()에서 노드와 부품을 올린다. 나갈 때의 뒷정리는 필요 없다(무대째 버려진다).
 */
import { Runner, tween, wait, type Step } from './flow';
import type { Show } from './fx';
import { Input, type InputEvent } from './input';
import { Button,Ui,toast } from './kit';
import { Sound } from './sound';
import { H, Stage, W, Shape } from './stage';
import { Surface } from './surface';

export type Transition = 'fade' | 'none';

export abstract class Screen {
  private layoutStage?:'normal'|'large';
  responsiveMenu():void{this.layoutStage=resolveUiSize();}
  reflowMenu():void{if(!this.layoutStage||this.layoutStage===resolveUiSize())return;this.ui.clear();this.stage.clear();this.runner.clear();this.enter();}
  readonly stage = new Stage();
  readonly runner = new Runner();
  readonly ui = new Ui(this);
  app!: App;
  /** 아래 화면을 완전히 가리는가. */
  opaque = true;
  /** 이 화면의 음악(소리 팩의 bgm 이름). 비워 두면 앞 화면의 음악이 이어지고, null이면 음악을 끈다. */
  music?: string | null;
  /** 효과 부품(fx.ts)에 넘기는 묶음. */
  get show(): Show { return { stage: this.stage, runner: this.runner, sound: this.app.sound,flashScale:this.app.flashScale }; }
  /** 화면에 들어가기 전에 필요한 그림을 준비한다. 캐시가 있으면 동기적으로 끝난다. */
  prepare(): Promise<void>|void {}
  /** 화면이 처음 올라올 때 한 번. 여기서 노드와 UI 부품을 올린다. */
  abstract enter(): void;
  /** 위에 있던 화면이 걷혀 다시 맨 위가 됐을 때. */
  resume(): void {}
  dispose():void {}
  update(dt: number): void { this.runner.update(dt); this.ui.tick(dt); }
  /** 기본은 UI 부품이 처리한다. 화면 고유의 조작이 있으면 덮어쓴다. */
  input(event: InputEvent): void { this.ui.input(event); }
  /** 스텝을 이 화면의 시간으로 돌린다. */
  run(step: Step): void { this.runner.run(step); }
}

export class App {
  readonly surface: Surface;
  readonly sound = new Sound();
  flashScale=reducedMotion()?.3:.7;fastHeld=false;
  cinematics?: Cinematics;
  loadingScreen=new LoadingScreen({screens:[],fallbacks:[],playerName:"",placeholders:{}},async()=>undefined);
  configureLoading(screen:LoadingScreen):void{this.loadingScreen=screen;if(this.loading){screen.progress.minimum=LoadingTransition.minimumSeconds+LoadingTransition.fadeSeconds;this.loadingScreen.begin();}}
  private readonly stack: Screen[] = [];
  private readonly flow = new Runner();
  /** 화면 전환 중 덮는 어둠(0~1). */
  private veil = { alpha: 0 };
  private changing = false;
  private last = performance.now();
  private loading = 0;
  private preparing=0;
  private boundaryGate?:LoadingTransition;
  readonly loadingEvents:{kind:LoadingBoundary;phase:'begin'|'ready'|'end';time:number}[]=[];

  private epoch=0;
  progress(done:number,total:number):void{this.loadingScreen?.progress.set(done,total);}
  /** Cancel obsolete screen preparation without resuming intermediate menus. */
  reset():void{const old=this.stack.splice(0);for(const s of old)s.dispose();this.epoch++;this.flow.clear();this.changing=false;this.loading=this.boundaryGate?.active?1:0;this.veil.alpha=0;}

  constructor(canvas: HTMLCanvasElement) {
    this.surface = new Surface(canvas);
    new Input(this.surface, event => {
      if(event.kind==='action'&&['fast-on','fast-off'].includes(event.action)){this.fastHeld=event.action==='fast-on';return;}if(event.kind==='pointer'&&event.phase==='up')this.fastHeld=false;
      if(event.kind==='action'||event.kind==='pointer'&&event.phase==='up')this.sound.unlock();
      if (!this.changing && !this.loading) this.top?.input(event);
    });
    window.addEventListener('resize', () => this.surface.resize());
    requestAnimationFrame(this.frame);
  }

  get top(): Screen | undefined { return this.stack[this.stack.length - 1]; }
  get transitioning():boolean{return this.changing;}

  whenReady():Promise<void>{const app=this;return new Promise(resolve=>this.flow.run((function*():Step{while(app.loading||app.changing||!app.top)yield;resolve();})()));}
  /** Deliver notices after asynchronous preparation and the screen transition. */
  notify(text:string):void{const app=this;this.flow.run((function*():Step{for(;;){while(app.loading||app.changing||!app.top)yield;const screen=app.top;yield*wait(.25);if(app.loading||app.changing||app.top!==screen)continue;toast(screen,text);return;}})());}

  /** 새 화면을 위에 올린다. */
  push(screen: Screen, how: Transition = 'fade'): void {
    screen.app=this;this.ready(this.prepareScreen(screen),()=>this.change(() => { this.stack.push(screen); screen.enter(); }, how));
  }
  /** 맨 위 화면을 걷는다. */
  pop(how: Transition = 'fade'): void {
    this.change(() => { this.stack.pop()?.dispose(); this.top?.reflowMenu();this.top?.resume(); }, how);
  }
  /** Media owns its lifetime, even during another screen's fade. Never pop a newer screen
   * or replay the underlying screen's initial music over its current story cue. */
  removeMedia(screen:Screen):void {
    const i=this.stack.indexOf(screen);if(i<0)return;
    const wasTop=i===this.stack.length-1;this.stack.splice(i,1);screen.dispose();
    if(wasTop)this.top?.resume();
  }
  /** 맨 위 화면을 다른 화면으로 바꾼다. */
  replace(screen: Screen, how: Transition = 'fade'): void {
    screen.app=this;this.ready(this.prepareScreen(screen),()=>this.change(() => { this.stack.pop()?.dispose(); this.stack.push(screen); screen.enter(); }, how));
  }

  private prepareScreen(screen:Screen):Promise<void>|void{const images=screen.prepare(),music=screen.music?this.sound.preload([screen.music]):undefined;if(images&&music)return Promise.all([images,music]).then(()=>undefined);return images??music;}
  /** 쪽 넘김·메뉴 상세도 같은 대기 표시를 쓴다. 받은 그림은 동기적으로 바로 연다. */
  preload(images:readonly (HTMLImageElement|undefined)[],done:()=>void):void {this.ready(preloadImages(images),done);}
  /** 동적 코드·자료도 그림과 같은 대기 표시와 입력 잠금을 쓴다. */
  load(task:Promise<void>):void{this.ready(task,()=>{});}
  boundary(kind:LoadingBoundary,task:()=>Promise<void>,done:()=>void=()=>{}):Promise<void>{
    if(this.boundaryGate?.active)return task().then(done);
    this.loading=1;this.loadingScreen.begin();this.loadingScreen.progress.minimum=LoadingTransition.minimumSeconds+LoadingTransition.fadeSeconds;
    this.loadingEvents.push({kind,phase:'begin',time:performance.now()});
    return new Promise(resolve=>{this.boundaryGate=new LoadingTransition(()=>{this.loadingScreen.progress.minimum=0;this.loadingScreen.progress.target=this.loadingScreen.progress.value=1;this.loadingEvents.push({kind,phase:'ready',time:performance.now()});done();},()=>{this.loading=0;this.loadingScreen.end();this.loadingEvents.push({kind,phase:'end',time:performance.now()});resolve();});this.boundaryGate.begin();
      void task().catch(error=>console.warn('[loading] 구간 준비 실패',error)).then(()=>{this.loadingScreen.progress.set(1,1);this.boundaryGate?.complete();});
    });
  }
  private ready(task:Promise<void>|void,done:()=>void):void {
    if(!task){done();return;}const epoch=this.epoch;this.preparing=(this.preparing??0)+1;
    void task.then(()=>{this.preparing--;if(epoch===this.epoch)done();},error=>{this.preparing--;if(epoch===this.epoch)console.warn('[assets] 구간 안 준비 누락',error);});
  }
  private change(swap: () => void, how: Transition): void {
    if (this.changing) return;
    const apply = (): void => { swap(); const music = this.top?.music; if (music !== undefined) this.sound.music(music ?? undefined); };
    if (how === 'none') { apply(); return; }
    this.changing = true;
    const { veil } = this, app = this;
    this.flow.run((function* (): Step {
      yield* tween(veil, { alpha: 1 }, 0.16);
      apply();
      yield* tween(veil, { alpha: 0 }, 0.22);
      app.changing = false;
    })());
  }

  private frame = (now: number): void => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.flow.update(dt);
    this.boundaryGate?.tick(dt);
    if(!this.loading)this.top?.update(dt);
    const ctx = this.surface.begin();
    // 가장 위의 "가리는 화면"부터 위로 그린다.
    let from = this.stack.length - 1;
    while (from > 0 && !this.stack[from].opaque) from--;
    for (let i = Math.max(0, from); i < this.stack.length; i++) this.stack[i].stage.render(ctx, !this.loading&&i === this.stack.length - 1 ? dt : 0);
    if (this.veil.alpha > 0&&!this.loading) { ctx.globalAlpha = this.veil.alpha; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    if(this.loading){ctx.save();ctx.globalAlpha=this.boundaryGate?.alpha??1;this.loadingScreen.draw(ctx,dt,reducedMotion());ctx.restore();}
    requestAnimationFrame(this.frame);
  };
}

/** Pack-local presentation only: video never changes rule state or random streams. */
export interface VideoDef {file?:string;fallback?:string;seconds?:number;music?:'duck'|'mute'}
export interface CinematicConfig {enabled?:boolean;opening?:{id:string;when?:'title'|'new-game'};videos:Record<string,VideoDef>}
export class SkipGate {armed=false;press():boolean {if(this.armed)return true;this.armed=true;return false;}}
export class Cinematics {
 private warned=new Set<string>();enabled=true;
 constructor(readonly app:App,readonly config:CinematicConfig,private readonly bytes:(path:string)=>Promise<ArrayBuffer>,private readonly images:Record<string,HTMLImageElement|undefined>,readonly packId:string){}
 warn(id:string,error:unknown):void {if(this.warned.has(id))return;this.warned.add(id);console.warn('[video] '+id,error);}
 definition(id:string):VideoDef|undefined{return this.config.videos[id];}
 image(id?:string):HTMLImageElement|undefined{return id?this.images[id]:undefined;}
 read(file:string):Promise<ArrayBuffer>{return this.bytes(file);}
 play(id:string,battle=false):Promise<void> {
  const def=this.definition(id);if(this.config.enabled===false||!def||(!def.file&&!def.fallback))return Promise.resolve();
  if(!this.enabled&&!def.fallback)return Promise.resolve();
  if(this.app.transitioning){const owner=this.app.top;return this.app.whenReady().then(()=>this.app.top===owner?this.play(id,battle):undefined);}
  return new Promise(resolve=>{const screen=new CinematicScreen(this,id,def,()=>{this.app.removeMedia(screen);resolve();},battle);this.app.push(screen,'none');});
 }
 async opening(when:'title'|'new-game'):Promise<void>{const o=this.config.opening;if(!o||o.when&&o.when!==when||!o.when&&when!=='title')return;
  const key='srpg:'+this.packId+':opening-seen';try{if(localStorage.getItem(key))return;}catch{}
  await this.play(o.id);try{localStorage.setItem(key,'1');}catch{}
 }
}
/** Detached playsinline media decoded by the browser; one canvas owns layout and input. */
export class CinematicScreen extends Screen {
 readonly gate=new SkipGate();video?:HTMLVideoElement;mode:'loading'|'video'|'fallback'='loading';
 private url?:string;private dead=false;private finished=false;private elapsed=0;private timeout=0;private videoTime=-1;
 private restore?:()=>void;private skip!:Button;private unmute!:Button;private poster?:HTMLImageElement;
 private detach?:()=>void;
 constructor(private readonly service:Cinematics,readonly id:string,private readonly def:VideoDef,private readonly done:()=>void,private readonly battle=false){super();}
 enter():void {
  this.restore=this.app.sound.duckMusic(this.def.music==='duck'?.22:0);
  this.stage.ui.add(new Shape({},ctx=>{ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);const media=this.mode==='video'&&this.video?.readyState&&this.video.readyState>=2?this.video:this.poster;if(!media)return;const w=media instanceof HTMLVideoElement?media.videoWidth:media.naturalWidth,h=media instanceof HTMLVideoElement?media.videoHeight:media.naturalHeight;if(!w||!h)return;const scale=Math.max(W/w,H/h),dw=w*scale,dh=h*scale;ctx.drawImage(media,(W-dw)/2,(H-dh)/2,dw,dh);}));
  this.skip=this.ui.add(Object.assign(new Button('건너뛰기',()=>this.requestSkip(),{w:190,h:84}),{x:W-218,y:H-100,visible:this.battle}));
  this.unmute=this.ui.add(Object.assign(new Button('소리 켜기',()=>this.enableSound(),{w:190,h:72}),{x:28,y:H-100,visible:false}));
  // The skip button is the only visible escape control. Keyboard Esc uses the same gate.
  if(!this.battle)this.skip.visible=true;
  this.ui.onCancel=()=>this.requestSkip();
  if(!this.service.enabled||!this.def.file){void this.fallback();return;}
  const video=this.video=document.createElement('video');video.playsInline=true;video.setAttribute('playsinline','');video.setAttribute('webkit-playsinline','');video.preload='auto';video.setAttribute('aria-hidden','true');video.tabIndex=-1;Object.assign(video.style??{},{position:'fixed',left:'0',top:'0',width:'1px',height:'1px',opacity:'0',pointerEvents:'none',touchAction:'none'});document.body?.append(video);video.muted=!this.app.sound.activated;video.volume=this.app.sound.musicVolume;this.unmute.visible=video.muted;
  const resume=()=>{if(!this.dead&&document.visibilityState==='visible'&&this.mode==='video'&&video.paused&&!video.ended)void video.play().catch(e=>{if(!this.dead)void this.fallback(e);});};
  document.addEventListener?.('visibilitychange',resume);globalThis.addEventListener?.('pageshow',resume);
  this.detach=()=>{document.removeEventListener?.('visibilitychange',resume);globalThis.removeEventListener?.('pageshow',resume);};
  video.onended=()=>this.finish();video.onerror=()=>{void this.fallback(video.error);};
  void this.service.read(this.def.file).then(async bytes=>{if(this.dead||this.mode==='fallback')return;this.url=URL.createObjectURL(new Blob([bytes],{type:'video/mp4'}));video.src=this.url;await video.play();if(!this.dead&&(this.mode as string)!=='fallback'){this.mode='video';this.timeout=0;}else video.pause();}).catch(e=>{void this.fallback(e);});
 }
 private enableSound():void {const v=this.video;if(!v||this.dead)return;this.app.sound.unlock();v.muted=false;try{void v.play().then(()=>{if(!this.dead)this.unmute.visible=false;}).catch(e=>{if(!this.dead){v.muted=true;this.service.warn(this.id+':sound',e);}});}catch(e){if(!this.dead){v.muted=true;this.service.warn(this.id+':sound',e);}}}
 private async fallback(error?:unknown):Promise<void>{if(this.dead||this.mode==='fallback')return;if(error)this.service.warn(this.id,error);this.releaseVideo();this.mode='fallback';this.elapsed=0;this.unmute.visible=false;
  this.poster=this.service.image(this.def.fallback);try{await preloadImages([this.poster]);}catch{}if(this.dead)return;if(!this.poster?.naturalWidth)this.finish();
 }
 requestSkip():void {if(this.dead)return;if(this.gate.press())this.finish();else this.skip.visible=true;}
 input(event:InputEvent):void {if(this.ui.input(event))return;if(event.kind==='pointer'&&event.phase==='up'||event.kind==='action'&&['confirm','skip'].includes(event.action))this.requestSkip();}
 update(dt:number):void{super.update(dt);this.timeout+=dt;if(this.mode==='loading'&&this.timeout>10)void this.fallback(Error('영상 준비 시간 초과'));if(this.mode==='video'&&this.video){if(!this.video.ended&&this.timeout>10)void this.fallback(Error('영상 재생 정지'));if(this.video&&this.video.currentTime!==this.videoTime){this.videoTime=this.video.currentTime;this.timeout=0;}}if(this.mode==='fallback'&&this.poster?.naturalWidth){this.elapsed+=dt;if(this.elapsed>=(this.def.seconds??1.5))this.finish();}}
 private finish():void{this.dispose();}
 private releaseVideo():void {if(this.video){this.video.onended=this.video.onerror=null;this.video.muted=true;this.video.volume=0;this.video.pause();this.video.removeAttribute('src');this.video.load();this.video.remove?.();this.video=undefined;}if(this.url){URL.revokeObjectURL(this.url);this.url=undefined;}}
 dispose():void {if(this.dead)return;this.dead=true;this.detach?.();this.releaseVideo();this.poster=undefined;this.restore?.();this.restore=undefined;if(!this.finished){this.finished=true;this.done();}}
}
