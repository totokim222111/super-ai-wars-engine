/**
 * 소리: 효과음과 음악.
 *
 * 효과음은 기본으로 그 자리에서 합성한다(음높이가 미끄러지는 파형 + 걸러 낸 잡음).
 * 그래서 소리 파일이 하나도 없어도 게임이 소리를 낸다.
 *
 * 진짜 소리는 "소리 팩"으로 넣는다. 팩은 폴더 하나와 pack.json이다.
 *   - sfx: 이름이 같은 합성음을 파일로 덮어쓴다. 새 이름을 더해도 된다.
 *   - bgm: 음악. 도입부를 한 번 틀고 loopStart~loopEnd 구간을 끊김 없이 되풀이한다.
 *   - 항목마다 제목·만든이·라이선스·출처를 적는다. 엔진은 이것으로 크레딧 화면을 만든다.
 *     라이선스가 비어 있는 항목은 불러오지 않는다(출처가 불분명한 소리가 섞이지 않게).
 * 부르는 쪽 코드(play, music)는 팩이 있든 없든 같다.
 */
export type Sfx =
  | 'cursor' | 'confirm' | 'important' | 'cancel' | 'deny' | 'text'          // 메뉴와 대사
  | 'whoosh' | 'slash' | 'shot' | 'hit' | 'heavy' | 'explode'   // 전투
  | 'charge' | 'flash' | 'gauge' | 'cg-cold'
  | 'beam' | 'missile' | 'transform' | 'servo' | 'alarm' | 'levelup'
  | 'ground-thud' | 'shield-clang' | 'whip' | 'ice-break' | 'electric' | 'splash' | 'popup' | 'stamp';

/** 소리 한 겹. wave가 noise면 from→to는 걸러 내는 주파수, 아니면 음높이(Hz)다. */
interface Layer { wave: OscillatorType | 'noise'; from: number; to?: number; time: number; gain: number; delay?: number; highpass?: number }

const RECIPES: Record<Sfx, Layer[]> = {
  'ground-thud':[{wave:'sine',from:85,to:32,time:.22,gain:.45},{wave:'noise',from:400,to:70,time:.18,gain:.22}],
  'shield-clang':[{wave:'triangle',from:1450,to:600,time:.12,gain:.18},{wave:'noise',from:4500,to:1100,time:.06,gain:.15}],
  whip:[{wave:'noise',from:700,to:7500,time:.12,gain:.2},{wave:'noise',from:9000,to:1400,time:.055,gain:.3,delay:.11}],
  'ice-break':[{wave:'noise',from:11000,to:3200,time:.16,gain:.24,highpass:2200},{wave:'sine',from:2400,to:520,time:.08,gain:.06}],
  electric:[{wave:'sawtooth',from:180,to:2800,time:.13,gain:.1},{wave:'noise',from:6500,to:600,time:.1,gain:.22}],
  splash:[{wave:'noise',from:800,to:3800,time:.23,gain:.23},{wave:'sine',from:240,to:60,time:.1,gain:.1}],
  popup:[{wave:'triangle',from:380,to:900,time:.055,gain:.12},{wave:'noise',from:2700,to:800,time:.045,gain:.12}],
  stamp:[{wave:'noise',from:1600,to:230,time:.085,gain:.32},{wave:'sine',from:115,to:55,time:.12,gain:.24}],
  'cg-cold': [{wave:'sine',from:96,to:62,time:1.5,gain:.08},{wave:'sine',from:193,to:124,time:1.7,gain:.025,delay:.08}],
  cursor: [{ wave: 'noise', from: 1800, to: 700, time: 0.022, gain: 0.07 }],
  confirm: [{ wave: 'noise', from: 2600, to: 600, time: 0.04, gain: 0.1 }],
  important: [{ wave: 'square', from: 880, time: 0.06, gain: 0.12 }, { wave: 'square', from: 1320, time: 0.11, gain: 0.12, delay: 0.06 }],
  cancel: [{ wave: 'square', from: 520, to: 320, time: 0.12, gain: 0.12 }],
  deny: [{ wave: 'sawtooth', from: 150, time: 0.15, gain: 0.16 }],
  text: [{ wave: 'square', from: 920, time: 0.016, gain: 0.04 }],
  whoosh: [{ wave: 'noise', from: 500, to: 3600, time: 0.24, gain: 0.28 }],
  slash: [{ wave: 'noise', from: 7000, to: 900, time: 0.17, gain: 0.34, highpass: 1400 }, { wave: 'sawtooth', from: 1900, to: 280, time: 0.12, gain: 0.08 }],
  shot: [{ wave: 'square', from: 950, to: 170, time: 0.07, gain: 0.14 }, { wave: 'noise', from: 5200, to: 800, time: 0.05, gain: 0.2 }],
  hit: [{ wave: 'noise', from: 2600, to: 300, time: 0.15, gain: 0.5 }, { wave: 'sine', from: 190, to: 60, time: 0.17, gain: 0.5 }],
  heavy: [{ wave: 'noise', from: 2000, to: 110, time: 0.55, gain: 0.7 }, { wave: 'sine', from: 140, to: 34, time: 0.6, gain: 0.85 }, { wave: 'square', from: 92, to: 40, time: 0.3, gain: 0.2 }],
  explode: [{ wave: 'noise', from: 1300, to: 70, time: 1.0, gain: 0.8 }, { wave: 'sine', from: 110, to: 28, time: 0.9, gain: 0.75 }],
  charge: [{ wave: 'sawtooth', from: 220, to: 1500, time: 0.45, gain: 0.1 }],
  flash: [{ wave: 'sine', from: 2400, to: 4400, time: 0.26, gain: 0.1 }, { wave: 'noise', from: 9000, to: 3200, time: 0.2, gain: 0.12, highpass: 3000 }],
  gauge: [{ wave: 'square', from: 720, to: 300, time: 0.26, gain: 0.05 }],
  beam: [{wave:'sawtooth',from:1700,to:160,time:.5,gain:.12},{wave:'noise',from:6000,to:1400,time:.4,gain:.25}],
  missile: [{wave:'noise',from:1200,to:4200,time:.5,gain:.3}],
  transform: [{wave:'sawtooth',from:140,to:700,time:.35,gain:.1},{wave:'noise',from:3000,to:500,time:.12,gain:.25,delay:.3}],
  servo: [{wave:'sawtooth',from:250,to:600,time:.22,gain:.05}],
  alarm: [{wave:'square',from:740,to:1000,time:.2,gain:.08},{wave:'square',from:740,to:1000,time:.2,gain:.08,delay:.3}],
  levelup: [{wave:'sine',from:660,to:1320,time:.18,gain:.12},{wave:'sine',from:1320,to:1980,time:.3,gain:.12,delay:.18}],
};
export const SFX_NAMES = Object.keys(RECIPES) as Sfx[];
/** UI transients stay below battle sounds, including packs without recorded files. */
export const uiSoundGain=(id:string):number=>['cursor','confirm','important','cancel','deny','text'].includes(id)?.5:1;

/** 소리 팩의 항목 하나. license와 source가 있어야 불러온다. */
export interface PackEntry { file: string; gain?: number; title?: string; author?: string; license: string; source: string; loopStart?: number; loopEnd?: number; loop?: boolean; credit?: string; licenseUrl?: string; modifications?: string; frames?:number; sampleRate?:number; encoderDelay?:number }
export interface SoundPack { name: string; sfx?: Record<string, PackEntry>; bgm?: Record<string, PackEntry> }
export interface Credit { kind: 'sfx' | 'bgm'; id: string; title: string; author: string; license: string; source: string; credit?: string; licenseUrl?: string; modifications?: string }

interface Loaded { buffer: AudioBuffer; entry: PackEntry; used:number }

export class Sound {
  /** 효과음과 음악의 크기 0~1. 설정 화면이 바꾼다. */
  private sfxLevel = 0.8;
  private musicLevel = 0.6;
  private duck=1;
  private ducks=new Map<symbol,number>();private duckFade=0;
  get activated():boolean{return !!this.mediaUnlocked||this.context?.state==='running';}
  /** Keep the song playhead alive while cinematic audio owns the foreground. */
  duckMusic(level=0):()=>void {const token=Symbol();this.ducks.set(token,Math.max(0,Math.min(1,level)));const update=()=>{this.duck=Math.min(1,...this.ducks.values());this.fadeDuck(this.musicVolume*this.duck);};update();return()=>{if(!this.ducks.delete(token))return;update();};}
  private fadeDuck(value:number):void {const generation=++this.duckFade,c=this.context,g=this.musicOut?.gain;if(c&&g){g.cancelScheduledValues(c.currentTime);g.setValueAtTime(g.value,c.currentTime);g.linearRampToValueAtTime(value,c.currentTime+.2);}if(this.mediaPlaying){const playing=this.mediaPlaying,audio=playing.audio,start=audio.volume,target=Math.max(0,Math.min(1,value*(this.registry.bgm?.[playing.id]?.gain??1))),at=performance.now(),tick=()=>{const t=Math.min(1,(performance.now()-at)/200);if(this.duckFade!==generation||this.mediaPlaying!==playing)return;audio.volume=start+(target-start)*t;if(t<1&&typeof requestAnimationFrame!=='undefined')requestAnimationFrame(tick);else audio.volume=target;};tick();}}

  get sfxVolume(): number { return this.sfxLevel; }
  set sfxVolume(value: number) { this.sfxLevel = value; if (this.sfxOut) this.sfxOut.gain.value = value; }
  get musicVolume(): number { return this.musicLevel; }
  set musicVolume(value: number) { this.musicLevel = value;this.duckFade++; if (this.musicOut) this.musicOut.gain.value = value*this.duck; if(this.mediaPlaying)this.mediaPlaying.audio.volume=Math.max(0,Math.min(1,value*this.duck*(this.registry.bgm?.[this.mediaPlaying.id]?.gain??1))); }
  private context?: AudioContext;
  private decoder?:BaseAudioContext;
  private sfxOut?: GainNode;
  private musicOut?: GainNode;
  private noise?: AudioBuffer;
  private readonly sfx = new Map<string, Loaded>();
  private readonly bgm = new Map<string, Loaded>();
  private readonly skipped: string[] = [];
  private registry:SoundPack={name:''};private base='';private aliases:Record<string,string>={};private pending=new Map<string,Promise<void>>();private clock=0;private maxBytes=128*1024*1024;private fetchBytes=(url:string)=>fetch(url).then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.arrayBuffer();});
  configure(options:{aliases?:Record<string,string>;maxBytes?:number;streamMusic?:boolean;bytes?:(url:string)=>Promise<ArrayBuffer>}):void{this.aliases=options.aliases??{};this.streamMusic=options.streamMusic??this.streamMusic;this.maxBytes=options.maxBytes??this.maxBytes;if(options.bytes)this.fetchBytes=options.bytes;}
  private resolve(id:string):string{const seen=new Set<string>();while(this.aliases[id]&&!seen.has(id)){seen.add(id);id=this.aliases[id];}return id;}
  private warn(problem:string,error?:unknown):void{if(this.skipped.includes(problem))return;this.skipped.push(problem);console.warn('[audio] '+problem,error??'');}
  get decodedBytes():number{return [...this.sfx.values(),...this.bgm.values()].reduce((n,v)=>n+(v.buffer.length??0)*(v.buffer.numberOfChannels??1)*4,0);}
  private trim():void{const rows=[...this.sfx].map(([id,v])=>({id,v,map:this.sfx})).concat([...this.bgm].map(([id,v])=>({id,v,map:this.bgm}))).sort((a,b)=>(a.map===this.sfx?1:0)-(b.map===this.sfx?1:0)||a.v.used-b.v.used);for(const row of rows){if(this.decodedBytes<=this.maxBytes)break;if(row.id===this.playing?.id||row.id===this.resolve(this.wanted??''))continue;row.map.delete(row.id);}}
  private playing?: { id: string; source: AudioBufferSourceNode; level: GainNode };
  /** 아직 소리를 낼 수 없을 때 요청된 음악. 잠금이 풀리면 튼다. */
  private wanted?: string;
  private mediaUrls=new Map<string,string>();private mediaPlaying?:{id:string;audio:HTMLAudioElement};private mediaUnlocked=false;private mediaMusic?:HTMLAudioElement;private mediaJingle?:HTMLAudioElement;
  private streamMusic=false;
  retainMusic(ids:readonly string[]):void{const keep=new Set(ids.map(id=>this.resolve(id)));for(const [id,url]of this.mediaUrls)if(this.registry.bgm?.[id]&&!keep.has(id)&&id!==this.wanted&&id!==this.mediaPlaying?.id){URL.revokeObjectURL(url);this.mediaUrls.delete(id);}}
  private mediaOnly():boolean{const g=globalThis as typeof globalThis&{webkitAudioContext?:typeof AudioContext};return !g.AudioContext&&!g.webkitAudioContext&&typeof Audio!=='undefined';}
  private mediaStart(audio:HTMLAudioElement,id:string):void{try{void audio.play()?.catch(e=>this.warn('재생 실패: '+id,e));}catch(e){this.warn('재생 실패: '+id,e);}}

  /**
   * 브라우저는 사용자가 뭔가 누르기 전에는 소리를 막는다. 첫 입력 때 한 번 부른다.
   * 재생 실패는 종류마다 한 번 콘솔에 남기며, 게임 진행은 계속한다.
   */
  unlock(): void {
    if(this.streamMusic){if(!this.mediaJingle){const id=Object.keys(this.registry.bgm??{}).find(id=>this.registry.bgm![id].loop===false&&this.mediaUrls.has(id));if(id){const clip=this.mediaJingle=new Audio(this.mediaUrls.get(id));clip.volume=0;try{void clip.play()?.then(()=>clip.pause()).catch(()=>{});}catch{}}}this.mediaUnlocked=true;if(this.wanted)this.music(this.wanted);if(this.mediaPlaying?.audio.paused)this.mediaStart(this.mediaPlaying.audio,this.mediaPlaying.id);}
    if(this.mediaOnly()){this.mediaUnlocked=true;if(this.wanted)this.music(this.wanted);if(this.mediaPlaying?.audio.paused)this.mediaStart(this.mediaPlaying.audio,this.mediaPlaying.id);return;}
    if (!this.context) {
      try {
        const constructors=globalThis as typeof globalThis&{webkitAudioContext?:typeof AudioContext};
        const Constructor=constructors.AudioContext??constructors.webkitAudioContext;if(!Constructor)throw Error('Web Audio unavailable');
        const context = this.context = new Constructor();
        this.sfxOut = context.createGain(); this.sfxOut.connect(context.destination);
        this.musicOut = context.createGain(); this.musicOut.connect(context.destination);
        this.sfxOut.gain.value=this.sfxVolume;this.musicOut.gain.value=this.musicVolume*this.duck;
        const noise = this.noise = context.createBuffer(1, context.sampleRate, context.sampleRate), data = noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        context.addEventListener?.('statechange',()=>{if(context.state==='running'&&this.wanted)this.music(this.wanted);});
      } catch(error) { this.context=undefined;this.warn('AudioContext 초기화 실패',error);return; }
    }
    const c=this.context;
    // These calls stay synchronously inside touchend/pointerup/keydown, including on old iOS.
    if(c.state!=='running'&&c.state!=='closed'){
      try{const silent=c.createBufferSource();silent.buffer=c.createBuffer(1,1,c.sampleRate);silent.connect(c.destination);silent.start(0);void c.resume().then(()=>{if(this.wanted)this.music(this.wanted);}).catch(e=>this.warn('AudioContext 재개 실패',e));}catch(e){this.warn('오디오 잠금 해제 실패',e);}
    }else if(this.wanted)this.music(this.wanted);
  }
  /** Actual activation events, not hover/pointermove. Visibility resume retries on the next tap too. */
  bind(doc:Document=document):()=>void {const unlock=()=>this.unlock(),visible=()=>{if(doc.visibilityState==='visible'&&(this.context||this.mediaUnlocked))this.unlock();};for(const event of ['touchend','pointerup','keydown'])doc.addEventListener(event,unlock,{capture:true,passive:true});doc.addEventListener('visibilitychange',visible);globalThis.addEventListener?.('pageshow',visible);return()=>{for(const event of ['touchend','pointerup','keydown'])doc.removeEventListener(event,unlock,true);doc.removeEventListener('visibilitychange',visible);globalThis.removeEventListener?.('pageshow',visible);};}

  /**
   * 소리 팩을 불러온다. base는 pack.json이 있는 폴더(끝에 / 포함).
   * 팩이 없거나 파일이 깨졌으면 그 항목만 건너뛰고 합성음을 쓴다.
   */
  private packLoading?:Promise<SoundPack|undefined>;
  ready():Promise<void>{return this.packLoading?.then(()=>undefined)??Promise.resolve();}
  loadPack(base:string):Promise<SoundPack|undefined>{return this.packLoading=this.readPack(base);}
  private async readPack(base:string):Promise<SoundPack|undefined>{
    this.base=base;
    try{this.registry=JSON.parse(new TextDecoder().decode(await this.fetchBytes(base+'pack.json'))) as SoundPack;}
    catch(error){this.warn('소리 팩 읽기 실패',error);return;}
    for(const kind of ['bgm','sfx'] as const)for(const [id,entry]of Object.entries(this.registry[kind]??{}))if(!entry.license||!entry.source)this.warn(`${kind}:${id} (라이선스·출처 없음)`);
    if(this.wanted)this.music(this.wanted);return this.registry;
  }
  async preload(ids:readonly string[]):Promise<void>{await this.ready();for(const id of [...new Set(ids.map(id=>this.resolve(id)))])await this.load(id);}
  private load(id:string):Promise<void>{
    const kind=this.registry.bgm?.[id]?'bgm':'sfx',map=kind==='bgm'?this.bgm:this.sfx,old=map.get(id);if(old){old.used=++this.clock;return Promise.resolve();}
    const entry=this.registry[kind]?.[id];if(!entry||!entry.license||!entry.source)return Promise.resolve();
    const key=kind+':'+entry.file;const task=this.pending.get(key);if(task)return task;
    const work=(async()=>{try{
      // A decoder is created only when needed; prefixed constructors cover older WebKit.
      const g=globalThis as typeof globalThis&{webkitOfflineAudioContext?:typeof OfflineAudioContext;webkitAudioContext?:typeof AudioContext};
      const Constructor=g.OfflineAudioContext??g.webkitOfflineAudioContext;
      if(this.mediaOnly()||kind==='bgm'&&this.streamMusic){if(!this.mediaUrls.has(id))this.mediaUrls.set(id,URL.createObjectURL(new Blob([await this.fetchBytes(this.base+entry.file)],{type:'audio/mpeg'})));return;}
      const Audio=g.AudioContext??g.webkitAudioContext;const context=this.context??(this.decoder??=(Constructor?new Constructor(2,1,44100):Audio?new Audio():undefined));if(!context)throw Error('No audio decoder; tap to unlock');
      const bytes=await this.fetchBytes(this.base+entry.file);
      const buffer=await new Promise<AudioBuffer>((ok,bad)=>{const promise=context.decodeAudioData(bytes.slice(0),ok,bad);promise?.then(ok,bad);});
      let normalized=buffer;const expected=entry.frames&&entry.sampleRate?Math.round(entry.frames*buffer.sampleRate/entry.sampleRate):buffer.length;
      if(expected&&buffer.length>expected+2&&entry.encoderDelay){const offset=Math.min(buffer.length-expected,Math.round(entry.encoderDelay*buffer.sampleRate/(entry.sampleRate??44100)));normalized=context.createBuffer(buffer.numberOfChannels,expected,buffer.sampleRate);for(let ch=0;ch<buffer.numberOfChannels;ch++)normalized.getChannelData(ch).set(buffer.getChannelData(ch).subarray(offset,offset+expected));}
      if((entry.loopStart??0)<0||entry.loopEnd!==undefined&&(entry.loopEnd<=(entry.loopStart??0)||entry.loopEnd>normalized.duration+.02))throw Error('잘못된 반복 구간');
      map.set(id,{buffer:normalized,entry,used:++this.clock});this.trim();
    }catch(error){this.warn(`${kind}:${id} (파일을 읽지 못함)`,error);}finally{this.pending.delete(key);}})();this.pending.set(key,work);return work;
  }

  /** 크레딧 화면에 쓸 목록. 팩에서 실제로 불러온 소리만 나온다. */
  credits(): Credit[] {
    const list=(kind:'sfx'|'bgm'):Credit[]=>Object.entries(this.registry[kind]??{}).filter(([,e])=>e.license&&e.source).map(([id,e])=>({kind,id,title:e.title??id,author:e.author??'',license:e.license,source:e.source,credit:e.credit,licenseUrl:e.licenseUrl,modifications:e.modifications}));
    return [...list('bgm'),...list('sfx')];
  }
  /** 불러오지 못했거나 일부러 건너뛴 항목. 검사 도구와 진열장이 보여 준다. */
  problems(): readonly string[] { return this.skipped; }
  hasFile(id: string): boolean { return !!this.registry.sfx?.[id]; }
  effectIds():string[]{return Object.keys(this.registry.sfx??{});}
  musicIds(): string[] { return Object.keys(this.registry.bgm??{}); }

  /**
   * 효과음을 낸다. 팩에 같은 이름의 파일이 있으면 그것을, 없으면 합성음을 쓴다.
   * @param gain 이번 한 번의 크기(기본 1). 약한 타격은 작게, 결정타는 그대로.
   */
  play(id: Sfx | (string & {}), gain = 1, load = true): void {
    if(this.mediaOnly()){const url=this.mediaUrls.get(id),entry=this.registry.sfx?.[id];if(!url){if(load&&entry)void this.load(id).then(()=>this.play(id,gain,false));return;}if(this.mediaUnlocked&&this.sfxVolume>0){const audio=new Audio(url);audio.volume=Math.max(0,Math.min(1,this.sfxVolume*gain*uiSoundGain(id)*(entry?.gain??1)));this.mediaStart(audio,id);}return;}
    const { context, sfxOut } = this;
    if (!context || !sfxOut || context.state !== 'running' || this.sfxVolume <= 0) return;
    sfxOut.gain.value = this.sfxVolume;
    const now = context.currentTime, file = this.sfx.get(id);if(!file&&load&&this.registry.sfx?.[id]){void this.load(id).then(()=>this.play(id,gain,false));return;}
    gain*=uiSoundGain(id);
    if (file) {
      const source = context.createBufferSource(), level = context.createGain();
      source.buffer = file.buffer; level.gain.value = gain * (file.entry.gain ?? 1);
      source.connect(level).connect(sfxOut); source.start(now);
      return;
    }
    for (const layer of RECIPES[id as Sfx] ?? []) {
      const start = now + (layer.delay ?? 0), end = start + layer.time, level = context.createGain();
      // 딱 끊기지 않게: 빠르게 올라갔다가 끝까지 줄어든다.
      level.gain.setValueAtTime(0.0001, start);
      level.gain.exponentialRampToValueAtTime(Math.max(0.0002, layer.gain * gain), start + 0.006);
      level.gain.exponentialRampToValueAtTime(0.0001, end);
      level.connect(sfxOut);
      if (layer.wave === 'noise') {
        const source = context.createBufferSource(), filter = context.createBiquadFilter();
        source.buffer = this.noise!; source.loop = true;
        filter.type = 'lowpass'; filter.frequency.setValueAtTime(layer.from, start);
        filter.frequency.exponentialRampToValueAtTime(layer.to ?? layer.from, end);
        let tail: AudioNode = source.connect(filter);
        if (layer.highpass) { const high = context.createBiquadFilter(); high.type = 'highpass'; high.frequency.value = layer.highpass; tail = tail.connect(high); }
        tail.connect(level); source.start(start); source.stop(end + 0.02);
      } else {
        const tone = context.createOscillator();
        tone.type = layer.wave; tone.frequency.setValueAtTime(layer.from, start);
        if (layer.to) tone.frequency.exponentialRampToValueAtTime(layer.to, end);
        tone.connect(level); tone.start(start); tone.stop(end + 0.02);
      }
    }
  }

  /**
   * 음악을 바꾼다. 앞 곡은 잦아들고 새 곡이 올라온다. 같은 곡이면 그대로 둔다.
   * @param id 팩의 bgm 이름. undefined면 음악을 끈다. 등록된 곡이 있는데 없는 이름을 요청하면 경고만 남기고 현재 곡을 유지한다.
   */
  music(id: string | undefined, fade = 0.6): void {
    if(id)id=this.resolve(id);
    if(id&&this.packLoading&&Object.keys(this.registry.bgm??{}).length&&!this.registry.bgm?.[id]){this.warn(`bgm:${id} (등록된 곡 없음)`);return;}
    this.wanted = id;
    if(this.mediaOnly()||this.streamMusic){if(!id){this.mediaPlaying?.audio.pause();this.mediaPlaying=undefined;return;}if(!this.mediaUrls.has(id)){void this.ready().then(()=>this.load(id!)).then(()=>{if(this.wanted===id&&this.mediaUrls.has(id!))this.music(id,fade);});return;}if(!this.mediaUnlocked||this.mediaPlaying?.id===id)return;this.mediaPlaying?.audio.pause();const audio=this.mediaMusic??=new Audio(),entry=this.registry.bgm?.[id];audio.src=this.mediaUrls.get(id)!;audio.volume=Math.max(0,Math.min(1,this.musicVolume*this.duck*(entry?.gain??1)));audio.loop=entry?.loop??true;audio.ontimeupdate=entry?.loopEnd?()=>{if(audio.loop&&audio.currentTime>=entry.loopEnd!)audio.currentTime=entry.loopStart??0;}:null;this.mediaPlaying={id,audio};this.mediaStart(audio,id);return;}
    if(id&&!this.bgm.has(id)){const wanted=id;void this.ready().then(()=>this.load(wanted)).then(()=>{if(this.wanted===wanted&&this.bgm.has(wanted))this.music(wanted,fade);});return;}
    const { context, musicOut } = this;
    if (!context || !musicOut || context.state !== 'running') return;
    if (this.playing?.id === id) return;
    const now = context.currentTime;
    musicOut.gain.value = this.musicVolume*this.duck;
    if (this.playing) {
      const { source, level } = this.playing;
      level.gain.setValueAtTime(level.gain.value, now); level.gain.linearRampToValueAtTime(0, now + fade);
      source.stop(now + fade + 0.05);
      this.playing = undefined;
    }
    const track = id ? this.bgm.get(id) : undefined;if(track)track.used=++this.clock;
    if (!id || !track) return;
    const source = context.createBufferSource(), level = context.createGain();
    source.buffer = track.buffer; source.loop = track.entry.loop ?? true;
    // 도입부는 한 번만 나오고, 그 뒤로는 loopStart~loopEnd만 되풀이한다.
    if (track.entry.loopEnd) { source.loopStart = track.entry.loopStart ?? 0; source.loopEnd = track.entry.loopEnd; }
    level.gain.setValueAtTime(0, now); level.gain.linearRampToValueAtTime(track.entry.gain ?? 1, now + fade);
    source.connect(level).connect(musicOut); source.start(now);
    this.playing = { id, source, level };this.trim();
    source.onended=()=>{if(this.playing?.source===source){this.playing=undefined;if(this.wanted===id&&!source.loop)this.wanted=undefined;}};
  }
  /** Short battle opener using an existing licensed track. Cancel never schedules a stale theme. */
  opening(id:string,theme:string|undefined,seconds=1.4):{seconds:number;cancel:()=>void}{
    id=this.resolve(id);
    // Keep the underlying theme's playhead alive. A jingle must not restart the
    // same theme when it is already playing (for example after an ally joins).
    if(this.mediaOnly()||this.streamMusic){const url=this.mediaUrls.get(id);if(!url||!this.mediaUnlocked){this.music(theme);return{seconds:0,cancel(){}};}const previous=this.mediaPlaying,volume=previous?.audio.volume,clip=this.mediaJingle??=new Audio(url);clip.src=url;clip.loop=false;if(previous)previous.audio.volume=0;clip.volume=Math.max(0,Math.min(1,this.musicVolume*(this.registry.bgm?.[id]?.gain??1)));this.mediaStart(clip,id);let active=true;const restore=()=>{if(previous&&this.mediaPlaying===previous)previous.audio.volume=volume??this.musicVolume;},timer=setTimeout(()=>{if(!active)return;active=false;clip.pause();restore();this.music(theme);},seconds*1000);return{seconds,cancel:()=>{if(!active)return;active=false;clearTimeout(timer);clip.pause();restore();}};}
    const track=this.bgm.get(id),c=this.context;if(!track||!c||c.state!=='running'||!this.musicOut){this.music(theme);return{seconds:0,cancel(){}};}
    const previous=this.playing,source=c.createBufferSource(),level=c.createGain(),duration=Math.min(seconds,track.buffer.duration);let active=true;
    if(previous){previous.level.gain.cancelScheduledValues?.(c.currentTime);previous.level.gain.setValueAtTime(0,c.currentTime);}
    const restore=()=>{if(previous&&this.playing===previous){previous.level.gain.cancelScheduledValues?.(c.currentTime);previous.level.gain.setValueAtTime(this.registry.bgm?.[previous.id]?.gain??1,c.currentTime);}};
    source.buffer=track.buffer;level.gain.value=track.entry.gain??1;source.connect(level).connect(this.musicOut);source.start(c.currentTime);source.stop(c.currentTime+duration);
    source.onended=()=>{if(!active)return;active=false;restore();this.music(theme,.15);};
    return{seconds:duration,cancel:()=>{if(!active)return;active=false;source.onended=null;try{source.stop();}catch{}restore();}};
  }

}
