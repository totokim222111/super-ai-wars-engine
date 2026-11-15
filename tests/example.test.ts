import {describe,it,expect,beforeAll} from 'vitest';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {loadPack,packLookup,type Pack} from '../src/v2/pack/load';
import {CoreCampaign} from '../src/v2/adapter/campaign';
import {TrainingSaves} from '../src/v2/adapter/saves';
import {Saves,makeSave,restoreSave} from '../src/campaign/saves';
import {NewGameScreen} from '../src/v2/menus/new-game';
import {TitleScreen,UpgradeScreen} from '../src/v2/menus/screens';
import {PartsScreen} from '../src/v2/menus/parts';
import {ShopScreen} from '../src/v2/menus/shop';
import {TextField} from '../src/v2/kit';
import {Screen,type App} from '../src/v2/screen';
import {parseStory} from '../src/v2/story/parse';
import {memoryStoryState,storyChoices,testCondition} from '../src/v2/story/play';
import {assetWarnings} from '../src/v2/pack/asset-check';
import {buildSample} from '../src/v2/gallery/sample';
import {MapScreen} from '../src/v2/map/screen';
import {CoreMap} from '../src/v2/adapter/map';
import {StoryEvents} from '../src/v2/story/events';
class Bytes{m=new Map<string,string>();async read(k:string){return this.m.get(k)??null;}async replace(k:string,v:string){this.m.set(k,v);}getItem(k:string){return this.m.get(k)??null;}setItem(k:string,v:string){this.m.set(k,v);}}
class Headless{
 sound={play(){},music(){},credits:()=>[],sfxVolume:.8,musicVolume:.6};stack:Screen[]=[];
 get top(){return this.stack.at(-1)!;}push(s:Screen){s.app=this as unknown as App;this.stack.push(s);s.enter();}pop(){this.stack.pop();this.top?.resume();}
 action(action:'confirm'|'cancel'|'up'|'down'|'left'|'right'){this.top.input({kind:'action',action});}tick(n=30){for(let i=0;i<n;i++)this.top?.update(1/60);}
}
let pack:Pack;
beforeAll(async()=>{pack=await loadPack('packs/example',p=>readFile(p,'utf8'));});
async function campaign(){const bytes=new Bytes(),saves=new TrainingSaves(bytes,pack.campaign,pack.rules,pack.training);await saves.init();const model=new CoreCampaign(pack.campaign,pack.rules,saves,packLookup(pack,{}),bytes,pack.game.credits,pack);model.newGame({name:pack.players.name.default,preset:0,line:pack.players.lines[0].id});return{model,bytes,saves};}
describe('example pack as engine authoring contract',()=>{
 it('loads a self-contained neutral pack with two stages, ending, one preset and one line',()=>{expect(pack.errors).toEqual([]);expect(pack.warnings).toEqual([]);expect(pack.game.episodes).toHaveLength(2);expect(pack.players.presets).toHaveLength(1);expect(pack.players.lines).toHaveLength(1);expect(pack.game.ending?.scene).toBe('엔딩');});
 it('uses the presentation height table for every example mech',()=>{const heights={SS:280,S:305,M:335,L:420,LL:540};for(const m of pack.rules.mechs)expect(pack.units[m.id].height).toBe(heights[m.size]);});
 it('contains only local pack media and CC0 recordings',()=>{expect(Object.values(pack.game.art.files).every(p=>p.startsWith('/packs/example/'))).toBe(true);for(const e of Object.values({...pack.audio?.sfx,...pack.audio?.bgm}))expect(e.license).toBe('CC0');});
 it('passes the same metadata validator used by pack_check',async()=>{const checked={...pack,warnings:[]};assetWarnings(checked,JSON.parse(await readFile('packs/example/art-info.json','utf8')));expect(checked.warnings).toEqual([]);});
 it('keeps scanned information in a campaign save and reload',async()=>{const {model}=await campaign();model.advance(false);const map=new CoreMap(model.session.game!.battle,model.lookup);map.cast('hero','scan','target');model.acceptBattle(map.state(),[]);const file=makeSave(model.session,pack.campaign,100),loaded=restoreSave(file,pack.campaign,pack.rules).session;expect(new CoreMap(loaded.game!.battle,model.lookup).details('target').known).toBe(true);});
 it('stores the choice and evaluates affection in the next stage',()=>{const state=memoryStoryState('traveler');const c=pack.stories.ep01.scenes.도입.find(c=>c.do==='choice');expect(c?.do).toBe('choice');if(c?.do!=='choice')throw Error('No choice');const choices=storyChoices(c.choices,state);expect(choices).toHaveLength(2);for(const effect of choices[0].effects)if(effect.do==='affection')state.affection(effect.who,effect.amount);const gate=pack.stories.ep02.scenes.도입.find(c=>c.do==='condition');if(gate?.do!=='condition')throw Error('No gate');expect(testCondition(gate.test,state)).toBe(true);expect(testCondition(gate.test,memoryStoryState('traveler'))).toBe(false);});
 it('new-game widgets use data for one type, one line and configurable name length',async()=>{const {model}=await campaign(),app=new Headless();let done=false;app.push(new NewGameScreen(model,()=>{done=true;}));(app.top.ui.focus as TextField).accept('한글모험가');app.action('down');for(let i=0;i<4;i++){app.action('confirm');app.tick();}app.action('left');app.action('confirm');app.tick();expect(done).toBe(true);expect(model.session.campaign.player?.name).toBe('한글모험가');expect(model.session.campaign.player?.type).toBe('traveler');});
 it('upgrades, trades and equips with the real menu widgets',async()=>{const {model}=await campaign();model.session.screen='intermission';model.session.campaign.credits=10000;model.session.campaign.parts=['hull'];const app=new Headless();app.push(new UpgradeScreen(model));const funds=model.funds();app.action('confirm');app.action('confirm');app.action('left');app.action('confirm');app.tick();expect(model.funds()).toBeLessThan(funds);app.pop();app.push(new PartsScreen(model));app.action('confirm');app.action('confirm');app.action('down');app.action('confirm');app.action('left');app.action('confirm');app.tick();expect(model.partUnits()[0].slots.some(p=>p?.id==='hull')).toBe(true);app.pop();app.push(new ShopScreen(model));expect(Number(!!app.top.ui.focus)).toBeGreaterThan(0);});
 it('keeps per-pack settings and verifies current save round trips and old rejection',async()=>{const {model,bytes}=await campaign();model.session.screen='intermission';model.session.game=null;model.setSettings({...model.settings(),music:3});expect([...bytes.m.keys()].some(k=>k.includes('example'))).toBe(true);const file=makeSave(model.session,pack.campaign,100);expect(restoreSave(file,pack.campaign,pack.rules).session).toEqual(model.session);expect(()=>restoreSave({...file,saveVersion:4},pack.campaign,pack.rules)).toThrow();const saves=new Saves(bytes,pack.campaign,pack.rules);await saves.write('1',file);expect((await saves.load('1')).session).toEqual(model.session);});
 it('attaches actual rule events to a MapScreen and can cancel without moving',async()=>{const {model}=await campaign();model.advance(false);const events=new StoryEvents(pack,model,'ep01'),boot=events.process();model.acceptBattle(boot.state,boot.changes);const map=new CoreMap(boot.state,{...model.lookup,afterCommand:c=>events.process(c),onChange:(s,c)=>model.acceptBattle(s,c)}),app=new Headless();const screen=new MapScreen(map);app.push(screen);app.tick();expect(map.units().some(u=>u.id==='hero')).toBe(true);app.action('cancel');expect(map.state().outcome).toBeNull();});
 it('builds gallery examples from the current pack only',()=>{const sample=buildSample({},pack);expect(sample.exchange([]).fighters.map(f=>f.id)).toEqual(['hero','dummy']);expect(sample.cast.loop.name).toBe('루프');const title=new TitleScreen({title:pack.game.title,subtitle:pack.game.subtitle,items:[]});expect(title).toBeInstanceOf(Screen);});
 it('reports locations for a damaged example story',()=>{const parsed=parseStory('@ 시작\n[조건] 잘못된 조건');expect(parsed.issues[0].line).toBe(2);});
 it.each([0,1])('clears both stages and the actual ending with choice %i using the generic CLI',async choice=>{const dir=await mkdtemp(join(tmpdir(),'srpg-example-'));try{execFileSync(process.execPath,['tools/sim.mjs','--seed','7','--choice',String(choice),'--out',dir],{encoding:'utf8'});const r=JSON.parse(await readFile(join(dir,'simulation.json'),'utf8'));expect(r.battles).toHaveLength(2);expect(r.battles.every((b:{outcome:string})=>b.outcome==='victory')).toBe(true);expect(r.runs[0].ending).toBe(true);expect(r.runs[0].session.campaign.flags.旅行完了??r.runs[0].session.campaign.story?.여행완료??r.runs[0].scenes.includes('ep02:마침')).toBeTruthy();expect(r.runs[0].effects.map((e:{action:string})=>e.action)).toEqual(expect.arrayContaining(['통행','배리어','폼']));expect(r.runs[0].spoken.some((s:string)=>s.includes('문 앞에서 기다릴게요'))).toBe(choice===0);}finally{await rm(dir,{recursive:true,force:true});}},20000);
});
