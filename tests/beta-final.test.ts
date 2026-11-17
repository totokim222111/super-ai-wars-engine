import {describe,it,expect,afterEach} from 'vitest';
import {objectiveLabel,rawObjectiveSyntax} from '../src/v2/story/stage';
import {scatterParticles} from '../src/v2/battle/moves';
import {layoutOverlaps,type LayoutBox} from '../src/v2/layout-audit';
import {setUiSize,inputDevice} from '../src/v2/presentation';
import {unitHud,hudState} from '../src/v2/ui';
import {FirstGuide} from '../src/v2/map/tutorial';
afterEach(()=>{setUiSize('auto');inputDevice('mouse');});
describe('final beta regressions',()=>{
 it('lowers compound form and adjacency rules without leaking syntax or HTML entities',()=>{const names:Record<string,string>={pilot:'테스터',boss:'문지기'};const label=objectiveLabel('형태 boss final &amp; 인접 pilot boss',id=>names[id],()=> '마지막 기체');expect(label).toBe('마지막 기체 상태 · 테스터: 문지기 옆으로 이동');expect(rawObjectiveSyntax(label)).toBe(false);expect(rawObjectiveSyntax('형태 boss final & 인접 pilot boss')).toBe(true);});
 it('shows eight separate scatter projectiles in the launch at .28 seconds',()=>{const shots=scatterParticles(.28,{x:800,y:300},{x:100,y:300});expect(shots).toHaveLength(8);expect(new Set(shots.map(p=>p.y)).size).toBe(8);expect(Math.max(...shots.map(p=>p.angle))-Math.min(...shots.map(p=>p.angle))).toBeCloseTo(Math.PI/3.6);});
 it('rejects unrelated text/text, text/button and button/button overlaps while allowing only owned labels',()=>{const a:LayoutBox={id:'a',kind:'text',text:'100',x:0,y:0,w:80,h:30},b:LayoutBox={id:'b',kind:'text',text:'80',x:0,y:20,w:80,h:30};expect(layoutOverlaps([a,b]).violations).toHaveLength(1);const button:LayoutBox={id:'c',kind:'button',owner:'c',x:0,y:0,w:100,h:84};expect(layoutOverlaps([a,button]).violations).toHaveLength(1);expect(layoutOverlaps([{...a,owner:'c'},button]).violations).toHaveLength(0);expect(layoutOverlaps([{...a,x:90,owner:'c'},button]).violations).toHaveLength(1);expect(layoutOverlaps([button,{...button,id:'d',owner:'d'}]).violations).toHaveLength(1);});
 it('keeps six-digit HP and VRAM on distinct baselines in large HUDs',()=>{inputDevice('touch');const text:{s:string;y:number;font:string}[]=[],values:any={font:'',measureText:(s:string)=>({width:s.length*18}),createLinearGradient:()=>({addColorStop(){}}),fillText:(s:string,_:number,y:number)=>text.push({s,y,font:values.font})};const ctx=new Proxy(values,{get:(t,k)=>k in t?t[k]:()=>{}})as CanvasRenderingContext2D;unitHud(hudState({name:'기체',pilot:'파일럿',side:'right',color:'#fff',hp:122650,hpMax:122650,en:90,enMax:100})).draw(ctx);expect(text.find(t=>t.s==='122650')).toMatchObject({y:72});expect(text.find(t=>t.s==='90')).toMatchObject({y:104});});
 it('advances the five tutorial actions in order, ignoring response and unrelated actions',()=>{const g=new FirstGuide();g.event('battle');expect(g.step).toBe(0);for(const e of ['select','move','forecast','battle','end-turn']as const)g.event(e);expect(g.finished).toBe(true);});
});
