import{describe,it,expect,vi}from'vitest';
import{PROP_IDS,MOVE_SECONDS,type MoveId}from'../src/v2/battle/moves/catalog';
import{PROP_COLORS,propFill,REDRAWN_PROPS}from'../src/v2/battle/moves/palette';
import{hitStops,moveClock}from'../src/v2/battle/moves';
import{contactShape}from'../src/v2/battle/moves/contacts';
import{battleLayout}from'../src/v2/battle/moves/layout';
import{Stage}from'../src/v2/stage';
import{Runner}from'../src/v2/flow';
import{flash}from'../src/v2/fx';
const context=()=>{const calls:unknown[]=[];return{calls,ctx:new Proxy({},{get:(_,key)=>(...args:unknown[])=>{calls.push([key,...args])},set:(_,key,value)=>{calls.push([key,value]);return true}})as CanvasRenderingContext2D}};
describe('impact readability contract',()=>{
 it('has a natural base color for every sticker; weapon accent never replaces the fill',()=>{
  expect(Object.keys(PROP_COLORS).sort()).toEqual([...PROP_IDS].sort());for(const color of Object.values(PROP_COLORS))expect(color).toMatch(/^#[a-f0-9]{6}$/i);
  expect(propFill('banana')).toBe('#f2d04f');expect(propFill('chain','water')).toBe(PROP_COLORS.chain);expect(propFill('droplet','fire')).not.toBe(propFill('droplet','water'));expect(REDRAWN_PROPS).toHaveLength(25);
 });
 it('draws a distinct contact silhouette for all 35 moves without a filled white disc',()=>{
  const drawings=Object.keys(MOVE_SECONDS).map(move=>{const{ctx,calls}=context();contactShape(ctx,move as MoveId,100,100,300,1,'#12abcd');expect(calls).not.toContainEqual(['fillStyle','#fff']);return JSON.stringify(calls)});expect(new Set(drawings).size).toBe(35);
 });
 it('keeps physical-pixel projectile/fragment floors and 20 dense particles at lowest quality',()=>{
  vi.stubGlobal('document',{querySelector:()=>({getBoundingClientRect:()=>({width:693.333,height:390})})});
  try{const g=battleLayout({attacker:{sprite:{height:335}},defender:{sprite:{height:280,width:224}}}as never);expect(g.projectileMin*g.scale).toBeCloseTo(22);expect(g.fragmentMin*g.scale).toBeCloseTo(18);expect(g.particleCount(40,true,.1)).toBe(20);expect(g.large).toBe(280*1.8);}finally{vi.unstubAllGlobals()}
 });
 it('freezes the pose at contact for four frames, six on heavy landings, within authored time',()=>{
  for(const move of['slash','hammer-smash']as const){const a={template:'sequence' as const,moves:[{move}],element:'impact' as const,closer:'none' as const,tier:1 as const};const timing=hitStops({move},a,1.2),start=timing.starts[0],first=moveClock(start+.0001,timing);expect(first.held).toBe(true);expect(moveClock(start+timing.hold-.0001,timing).t).toBe(first.t);expect(moveClock(start+timing.hold+.001,timing).held).toBe(false);expect(timing.hold*60).toBe(move==='hammer-smash'?6:4);expect(moveClock(1.2,timing).t).toBeCloseTo(1)}
 });
 it('gates all full-screen flashes to three rendered frames and three starts per second',()=>{
  const show={stage:new Stage(),runner:new Runner()};flash(show,0);expect(show.stage.ui.nodes).toHaveLength(0);for(let i=0;i<5;i++)flash(show,1,1);expect(show.stage.ui.nodes).toHaveLength(3);
  const{ctx,calls}=context();for(let i=0;i<10;i++)for(const node of show.stage.ui.nodes)node.draw(ctx);expect(calls.filter(c=>Array.isArray(c)&&c[0]==='fillRect')).toHaveLength(9);
  show.runner.update(1.1);flash(show,.5,1);expect(show.stage.ui.nodes).toHaveLength(1);
 });
});
