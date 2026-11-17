import {afterEach,describe,it,expect,vi} from 'vitest';
import {readFile} from 'node:fs/promises';
import {AnimationArt,animationArtIssues,withAnimationArt,illustration,type AnimationArtSpec} from '../src/v2/battle/animation-art';
import {loadPack} from '../src/v2/pack/load';
import {assetPlan} from '../src/v2/pack/asset-plan';
import {StageLoader} from '../src/v2/pack/assets';
import type {ImageStore} from '../src/v2/pack/images';
import type {MediaCache,StageAssets} from '../src/v2/media-cache';
import type {Sound} from '../src/v2/sound';
import {illustratedBurst} from '../src/v2/battle/moves/materials';

const spec=():AnimationArtSpec=>({version:1,pages:{atlas:{width:1024,height:1024}},props:{hammer:{art:'atlas',rect:[20,30,200,400],sourceSize:[400,800],anchor:[.5,.5],grip:[.25,.75],facing:'up'}}});
const image={naturalWidth:1024,naturalHeight:1024,complete:true}as HTMLImageElement;
function context(){const calls:unknown[][]=[];return {calls,ctx:new Proxy({},{get:(_,key)=>(...args:unknown[])=>calls.push([key,...args]),set:()=>true})as CanvasRenderingContext2D};}
function canvasDocument(){vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>context().ctx})});}
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
describe('optional pack illustration overrides',()=>{
 it('primes reductions at the section boundary and reuses a larger prepared tile for small dense particles',()=>{
  canvasDocument();const art=new AnimationArt(spec(),{atlas:image}),{ctx}=context();art.warm();const pixels=art.cachePixels;expect(art.cacheEntries).toBe(1);expect(pixels).toBeGreaterThan(0);expect(art.usage.size).toBe(0);art.draw(ctx,'hammer',100,100,96);expect(art.cacheEntries).toBe(1);expect(art.cachePixels).toBe(pixels);
 });
 it('validates ids, registered files, bounds, pivot and direction without weakening pack validation',()=>{
  expect(animationArtIssues(spec(),{atlas:'page.webp'})).toEqual([]);
  for(const edit of [(s:any)=>s.props.fake=s.props.hammer,(s:any)=>s.props.hammer.anchor=[-.1,.5],(s:any)=>s.props.hammer.grip=[.2,2],(s:any)=>s.props.hammer.facing='forward',(s:any)=>s.props.hammer.rect=[900,0,200,400],(s:any)=>s.pages.atlas.width=4096]){const s=spec();edit(s);expect(animationArtIssues(s,{atlas:'page.webp'}).length).toBeGreaterThan(0);}
  expect(animationArtIssues(spec(),{})).toContain('unregistered animation art: hammer');
 });
 it('falls back for undeclared, pending and failed images; only a failed file warns, once',()=>{
  const warn=vi.spyOn(console,'warn').mockImplementation(()=>{}),{ctx}=context(),pending={naturalWidth:0,complete:false}as HTMLImageElement,art=new AnimationArt(spec(),{atlas:pending});
  expect(art.draw(ctx,'banana',0,0,100)).toBe(false);expect(art.draw(ctx,'hammer',0,0,100)).toBe(false);expect(warn).not.toHaveBeenCalled();Object.assign(pending,{complete:true});
  expect(art.draw(ctx,'hammer',0,0,100)).toBe(false);expect(art.draw(ctx,'hammer',0,0,100)).toBe(false);expect(warn).toHaveBeenCalledTimes(1);
 });
 it('uses grip, mirrors the left attack and rotates the source facing along the projectile',()=>{
  canvasDocument();const {ctx,calls}=context(),art=new AnimationArt(spec(),{atlas:image});
  expect(art.draw(ctx,'hammer',80,90,400,.2,-1,{pivot:'grip',orientation:'projectile'})).toBe(true);
  expect(calls).toContainEqual(['translate',80,90]);expect(calls).toContainEqual(['scale',-1,1]);expect(calls).toContainEqual(['rotate',Math.PI/2]);
  expect(calls.find(c=>c[0]==='drawImage')?.slice(2)).toEqual([-50,-300,200,400]);
 });
 it('caps the rendered native source scale including stretch, caches reductions and bounds cache memory',()=>{
  canvasDocument();const {ctx,calls}=context(),art=new AnimationArt(spec(),{atlas:image});art.draw(ctx,'hammer',0,0,1400,0,1,{stretchMax:1.2});
  expect(art.scaleRequests.get('hammer')).toMatchObject({requested:1680,allowed:1000,capped:true});const draw=calls.find(c=>c[0]==='drawImage')!;expect(Number(draw[5])*1.2).toBeCloseTo(1000);
  art.draw(ctx,'hammer',0,0,1400,0,1,{stretchMax:1.2});expect(art.cacheEntries).toBe(1);
  for(let n=32;n<1600;n+=10)art.draw(ctx,'hammer',0,0,n);expect(art.cachePixels).toBeLessThanOrEqual(8*1024*1024);art.clear();expect(art.cachePixels).toBe(0);
 });
 it('scopes overrides per painter and restores scope even if the nested paint throws',()=>{
  canvasDocument();const {ctx}=context(),art=new AnimationArt(spec(),{atlas:image});
  withAnimationArt(ctx,art,()=>{expect(illustration(ctx,'hammer',0,0,100)).toBe(true);expect(()=>withAnimationArt(ctx,undefined,()=>{expect(illustration(ctx,'hammer',0,0,100)).toBe(false);throw Error('paint');})).toThrow();expect(illustration(ctx,'hammer',0,0,100)).toBe(true);});expect(illustration(ctx,'hammer',0,0,100)).toBe(false);
 });
 it('uses code chips for a pack overriding only burst and falls back when the physical atlas is too small',()=>{
  canvasDocument();const {ctx,calls}=context(),art=new AnimationArt({version:1,elements:{impact:{burst:{art:'atlas'}}}},{atlas:image});
  withAnimationArt(ctx,art,()=>expect(illustratedBurst(ctx,'impact',100,100,.2,200,300)).toBe(true));expect(calls.filter(c=>c[0]==='drawImage')).toHaveLength(11);
  const broken=new AnimationArt(spec(),{atlas:{...image,naturalWidth:100}as HTMLImageElement});expect(broken.ready('hammer')).toBe(false);expect(broken.draw(ctx,'hammer',0,0,100)).toBe(false);
 });
 it('keeps the standalone example free of illustration files and adds atlas pages to every stage only when declared',async()=>{
  const p=await loadPack('packs/example',f=>readFile(f,'utf8'));expect(p.errors).toEqual([]);expect(p.animationArt).toBeUndefined();p.animationArt=spec();p.game.art.files.atlas='art/page.webp';const plan=assetPlan(p);
  for(const g of Object.values(plan.stages)){expect(g.images).toContain('art/page.webp');expect(g.optionalImages).toContain('art/page.webp');}
 });
 it('prepares optional illustration images at section boundaries, using ImageStore fallback rather than fatal fetch',async()=>{
  let complete!:()=>void;const manifest={pack:'x',version:'1',entries:{},boot:{images:[],audio:[],files:[]},stages:{one:{images:['plain','atlas'],optionalImages:['atlas'],audio:[],files:['plain','atlas']}}}as StageAssets;
  const cache={preload:vi.fn(async()=>{}),optionalVideos:vi.fn(async()=>{}),releaseVideos:vi.fn(),background:vi.fn()}as unknown as MediaCache,images={definitions:{},preload:vi.fn(()=>new Promise<void>(r=>complete=r))}as unknown as ImageStore,sound={preload:vi.fn(async()=>{}),retainMusic:vi.fn(),effectIds:()=>[]}as unknown as Sound;
  const loader=new StageLoader(manifest,cache,images,sound);let ready=false;const waiting=loader.ensure('one')!.then(()=>ready=true);await Promise.resolve();await Promise.resolve();expect(cache.preload).toHaveBeenCalledWith(['plain'],expect.any(Function));expect(ready).toBe(false);complete();await waiting;expect(ready).toBe(true);expect(loader.ensure('one')).toBeUndefined();
 });
});
