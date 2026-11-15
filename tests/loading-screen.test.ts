import {describe,it,expect,vi} from 'vitest';
import {readFile} from 'node:fs/promises';
import {LoadingScreen,LoadingProgress,LoadingTransition,chooseSlide,chooseQuote,loadingLines,type LoadingSlide} from '../src/v2/loading-screen';
import {stageAssets} from '../tools/stage-assets';
import {loadPack} from '../src/v2/pack/load';
import {assetPlan} from '../src/v2/pack/asset-plan';
import {packMedia,packSources} from '../tools/pack-sources';
import {App} from '../src/v2/screen';
const a:LoadingSlide={image:'/a.webp',cast:'a',name:'가',color:'#aabbcc',lines:['{이름}, 같이 가자.','좋아!']},b={...a,image:'/b.webp',cast:'b'};
const image={naturalWidth:1280,naturalHeight:720} as HTMLImageElement;
const manifest={screens:[a,b],fallbacks:[],playerName:'산책',placeholders:{이름:'name' as const}};
describe('shared illustrated progress loading',()=>{
 it('omits absent optional loading art at the filesystem boundary',async()=>{const source=(await packSources('example'))[0];source.game={...source.game,loadingScreens:[{image:'art/loading/not-created.webp',cast:'hero'}]};const files=await packMedia(source);expect([...files.keys()].some(k=>k.includes('not-created'))).toBe(false);});
 it('uses presentation RNG, excludes the immediately previous image, and permits a single entry',()=>{
  expect(chooseSlide([a,b],a.image,()=>0)).toBe(b);expect(chooseSlide([a],a.image,()=>.99)).toBe(a);expect(chooseSlide([],undefined,()=>0)).toBeUndefined();
 });
 it('keeps authored punctuation and whitespace, prefers short lines, and substitutes the current name',()=>{
  const lines=loadingLines({attack:[{text:'{이름}, 같이 가자.'},{text:'아주 긴 이야기'.repeat(30)}],weapons:{s:[{text:'  원문!  '}]},opponents:{x:{attack:[{text:'{이름}, 같이 가자.'}]}},forms:{x:{attack:[{text:'폼!'}]}}});
  expect(lines).toEqual(['{이름}, 같이 가자.','아주 긴 이야기'.repeat(30),'  원문!  ','폼!']);
  expect(chooseQuote(lines,s=>s.replace('{이름}','새 이름'),()=>0)).toBe('새 이름, 같이 가자.');expect(chooseQuote(['  원문!  '],s=>s)).toBe('  원문!  ');expect(chooseQuote([],s=>s)).toBe('');
 });
 it('never overshoots actual progress or decreases when totals change; each loading session resets',()=>{
  const p=new LoadingProgress();p.set(3,10);expect(p.tick(.1)).toBeGreaterThan(0);expect(p.value).toBeLessThanOrEqual(.3);const last=p.value;p.set(1,10);expect(p.tick(.1)).toBeGreaterThanOrEqual(last);expect(p.target).toBe(.3);p.set(9,10);p.tick(5);expect(p.value).toBeCloseTo(.9);p.set(NaN,0);expect(p.target).toBe(.9);p.reset();expect(p.value).toBe(0);
 });
 it('awaits only the selected first picture, then prefetches one different next picture through the same reader',async()=>{
  const reads:string[]=[],read=vi.fn(async(path:string)=>{reads.push(path);return image;}),s=new LoadingScreen(manifest,read,()=>0);
  s.begin();await s.imageReady();expect(reads).toEqual([a.image]);expect(s.quote).toBe('산책, 같이 가자.');s.end();expect(reads).toEqual([a.image,b.image]);s.begin();await s.imageReady();expect(s.slide?.image).toBe(b.image);expect(read).toHaveBeenCalledTimes(2);
 });
 it('skips missing files, tries fallback CGs after a runtime failure, and never stalls an empty pack',async()=>{
  const read=vi.fn(async(path:string)=>path===b.image?image:undefined),s=new LoadingScreen({...manifest,screens:[a],fallbacks:[b]},read,()=>0);s.begin();await s.imageReady();expect(s.slide).toBe(b);expect(s.image).toBe(image);
  const empty=new LoadingScreen({...manifest,screens:[],fallbacks:[]},read);empty.begin();await empty.imageReady();expect(empty.image).toBeUndefined();
 });
 it('does not display a loading screen for overlapping in-section preparations and forwards progress',async()=>{
  const loadingScreen={begin:vi.fn(),end:vi.fn(),progress:{set:vi.fn()}},app=Object.assign(Object.create(App.prototype),{epoch:0,loading:0,loadingScreen}) as App;
  let finish!:()=>void;const task=new Promise<void>(r=>finish=r);app.load(task);app.load(task);app.progress(3,10);expect(loadingScreen.begin).not.toHaveBeenCalled();expect(loadingScreen.progress.set).toHaveBeenCalledWith(3,10);finish();await task;await Promise.resolve();expect(loadingScreen.end).not.toHaveBeenCalled();
 });
 it('starts the first picture even when pack metadata preparation is still pending',async()=>{
  const app=Object.assign(Object.create(App.prototype),{loading:1}) as App,s=new LoadingScreen(manifest,async()=>image,()=>0);app.configureLoading(s);await s.imageReady();expect(s.image).toBe(image);expect(s.slide).toBe(a);
 });
 it('updates name substitution when a save finishes loading without changing the authored sentence',async()=>{
  const s=new LoadingScreen(manifest,async()=>image,()=>0);s.begin();await s.imageReady();expect(s.quote).toBe('산책, 같이 가자.');s.resolve=text=>text.replace('{이름}','저장된 이름');expect(s.quote).toBe('저장된 이름, 같이 가자.');expect(a.lines[0]).toBe('{이름}, 같이 가자.');
 });
 it('builds existing-image metadata/quotes from pack cast; stage lists include it, boot never bundles every slide',async()=>{
  const source=(await packSources('example'))[0],data=await stageAssets(source);expect(data.loading?.screens).toHaveLength(2);expect(data.loading?.screens[0].name).toBe(JSON.parse(await readFile('packs/example/cast.json','utf8')).hero.name);
  for(const row of data.loading!.screens){expect(data.entries[row.image].kind).toBe('image');for(const stage of Object.values(data.stages))expect(stage.files).toContain(row.image);}
  const pack=await loadPack('packs/example',f=>readFile(f,'utf8'));delete pack.game.loadingScreens;expect(data.boot.images).toEqual(assetPlan(pack).boot.images);
 });
});

describe('section loading boundaries',()=>{
 it('keeps two full seconds between the short fades and never invokes sound',async()=>{const swap=vi.fn(),sound={play:vi.fn()},s=new LoadingScreen({screens:[],fallbacks:[],playerName:'',placeholders:{}},async()=>undefined),app=Object.assign(Object.create(App.prototype),{loading:0,loadingScreen:s,loadingEvents:[],sound})as App;const done=app.boundary('stage-end',async()=>{},swap);await Promise.resolve();await Promise.resolve();const gate=(app as unknown as {boundaryGate:LoadingTransition}).boundaryGate;for(let i=0;i<120;i++)gate.tick(1/60);expect(swap).not.toHaveBeenCalled();expect(gate.active).toBe(true);gate.tick(.3);expect(swap).toHaveBeenCalledOnce();expect(gate.active).toBe(true);gate.tick(.3);await done;expect(gate.active).toBe(false);expect(sound.play).not.toHaveBeenCalled();expect(app.loadingEvents.map(e=>e.phase)).toEqual(['begin','ready','end']);});
 it('limits the bar to the minimum presentation interval, never reverses and reaches 100%',()=>{const p=new LoadingProgress();p.minimum=2;p.set(1,1);let last=0;for(let i=0;i<120;i++){p.tick(1/60);expect(p.value).toBeGreaterThanOrEqual(last);if(i<60)expect(p.value).toBeLessThan(.51);last=p.value;}p.tick(.01);expect(p.value).toBe(1);});
});
