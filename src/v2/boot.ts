import {LoadingScreen} from './loading-screen';
import {configureImageFocus} from './image-layout';
import {mediaPath} from './pack/paths';
import {storageKey} from '../platform/storage';
import {lockGameViewport} from './viewport';
import {MediaCache,type StageAssets} from './media-cache';
import {StageLoader} from './pack/assets';
/** 첫 화면은 제목 자료와 그림만. 규칙·저장 검증·진열장 예시는 고를 때 읽는다. */
import {App,Cinematics} from './screen';
import {TitleScreen} from './menus/screens';
import {HomeScreen} from './gallery/home';
import {toast} from './kit';
import {ImageStore} from './pack/images';
import {packText,assetUrl,defaultPack} from './pack/files';
import {browserStorage,STORAGE_NOTICE,type SessionBytes} from '../platform/storage';
import {normalizeSettings,settingsKey} from '../platform/settings';
import type {Pack,PackGame} from './pack/load';
import type {GameFlow} from './game/flow';
/** 버튼 활성화용 존재 확인뿐이다. 불러올 때의 형식·규칙 검증은 기존 Saves가 한다. */
async function hasSave(packId:string,bytes:SessionBytes=browserStorage(packId)):Promise<boolean>{try{const saved=await Promise.all(['suspend','auto','1','2','3'].map(id=>bytes.read(id)));return saved.some(Boolean);}catch{return false;}}
export async function boot(canvas:HTMLCanvasElement,gallery=false):Promise<void>{
  lockGameViewport();
  const app=new App(canvas);app.sound.bind();const name=new URLSearchParams(location.search).get('pack')??defaultPack;
  Object.assign(window,{v2:app});
  await app.boundary('boot',async()=>{
  const metadata=Promise.all([packText(`content/packs/${name}/game.json`),packText(`content/packs/${name}/assets.json`)]);
  const [gameText,assetText]=await metadata,game=JSON.parse(gameText)as PackGame;for(const [id,path]of Object.entries(game.art.files))game.art.files[id]=mediaPath(game.id,path);const manifest=JSON.parse(assetText) as StageAssets,cache=new MediaCache(manifest,assetUrl),store=new ImageStore({...game.art.files},assetUrl,()=>new Image(),(url,image)=>cache.image(url,image)),images=store.images,assets=new StageLoader(manifest,cache,store,app.sound);
  configureImageFocus(images,game.art.focus);
  if(manifest.loading)app.configureLoading(new LoadingScreen(manifest.loading,async path=>{const image=new Image();return await cache.image(assetUrl(path),image)?image:undefined;}));
  if(game.cinematics){const config=structuredClone(game.cinematics);for(const v of Object.values(config.videos))if(v.file)v.file=mediaPath(game.id,v.file);app.cinematics=new Cinematics(app,config,path=>cache.bytes(assetUrl(path)),images,game.id);try{app.cinematics.enabled=JSON.parse(localStorage.getItem(storageKey(game.id,'settings'))??'{}').cinematic!==false;}catch{}}
  app.sound.configure({aliases:game.musicRules?.slots,streamMusic:true,bytes:url=>cache.bytes(url)});

  try{const old=normalizeSettings(JSON.parse(localStorage.getItem(settingsKey(game.id))??'{}')),saved=JSON.parse(localStorage.getItem(storageKey(game.id,'settings'))??'{}');const value=(n:unknown,d:number)=>typeof n==='number'&&Number.isFinite(n)?Math.max(0,Math.min(10,n))/10:d;app.sound.sfxVolume=value(saved.sfx,old.volume/10);app.sound.musicVolume=value(saved.music,.6);}catch{}
  document.title=game.title+(gallery?' 진열장':'');canvas.setAttribute('aria-label',game.title+(gallery?' 진열장':'')+'. 화면을 눌러 조작합니다.');const rotate=document.querySelector('#rotate span');if(rotate)rotate.textContent=game.title+' · 가로 화면에서 플레이합니다.';
  const bootStorage=browserStorage(game.id);await bootStorage.probe();
  let pack:Promise<Pack>|undefined,flow:Promise<GameFlow>|undefined;
  const runtime=()=>pack??=(async()=>{const b=await import('./pack/browser');const p=await b.currentPack(name);b.adoptImages(p,store);p.assets=assets;return p;})().catch(e=>{pack=undefined;throw e;});
  const work=(task:Promise<void>)=>app.load(task.catch(e=>toast(app.top!,String(e))));
  const home=()=>app.replace(new HomeScreen({images,title:game.title,background:game.titleArt.background,character:game.titleArt.character},index=>work((async()=>{const p=await runtime();await p.ensureGallery?.();const [{openGallery},{buildSample}]=await Promise.all([import('./gallery/screens'),import('./gallery/sample')]);openGallery(index,app,buildSample(images,p));})())),'none');
  const engine=()=>flow??=(async()=>{const p=await runtime(),{startGame}=await import('./game/start');const f=await startGame(app,{images},gallery?home:undefined,p,false,false,bootStorage);Object.assign(window,{gameFlow:f});return f;})().catch(e=>{flow=undefined;throw e;});
  const initial=await runtime();await initial.ensureStory?.(game.episodes[0].id);await import('./game/start');const {packAnimationArt}=await import('./pack/load');assets.onPrepared=()=>packAnimationArt(initial,images)?.warm();
  const bootReady=Promise.resolve().then(async()=>{await app.loadingScreen.imageReady();if(game.audio.pack)await app.sound.loadPack(assetUrl(mediaPath(game.id,game.audio.base)));await assets.boot((n,total)=>app.progress(n,total));});await bootReady;
  if(gallery)home();else{
    const saved=await hasSave(game.id,bootStorage);
    app.push(new TitleScreen({title:game.title,subtitle:game.subtitle,footer:bootStorage.status.persistent?game.titleFooter:STORAGE_NOTICE,background:images[game.titleArt.background],art:images[game.titleArt.character],music:game.music.title,items:['새 게임','이어하기','불러오기','설정','크레딧',...(game.cinematics?.opening?['오프닝 보기']:[])].map(label=>({label,disabled:label==='이어하기'&&!saved,run:()=>label==='오프닝 보기'?void app.cinematics?.play(game.cinematics!.opening!.id):work(engine().then(f=>f.openTitle(label)))}))}),'none');
  }
  Object.assign(window,{v2:app});
  if(!gallery&&app.cinematics)void app.whenReady().then(()=>app.cinematics!.opening('title'));
  });
  // 제목을 소리 전체의 다운로드/디코드가 막지 않는다. 기존 Sound의 실패·중복 처리 사용.

}
