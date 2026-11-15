/** Pack-declared tag effects. The core never names a game's actors or tags. */
import type {BattleState,BattleEvent,Unit,Weapon,EffectAtom} from './types';
import {effectiveMech} from './modifiers';
import {applySystem} from './system';
import {nextRandom} from './rng';
const near=(a:Unit,b:Unit,range:number)=>a.id!==b.id&&Math.abs(a.x-b.x)+Math.abs(a.y-b.y)<=range;
export function auraAtoms(s:BattleState,u:Unit):EffectAtom[]{return(s.content.tagEffects??[]).flatMap(e=>e.kind==='aura'&&s.units?.some(a=>a.alive&&a.side===u.side&&a.tags?.includes(e.tag)&&near(a,u,e.range))?e.atoms:[]);}
export function phaseGimmicks(s:BattleState,events:BattleEvent[]):void{
 for(const u of [...s.units]){if(!u.alive||u.side!==s.phase)continue;
  for(const e of s.content.tagEffects??[]){
   if(e.kind==='aura'&&e.en&&s.units.some(a=>a.alive&&a.side===u.side&&a.tags?.includes(e.tag)&&near(a,u,e.range))){const en=Math.min(e.en,effectiveMech(s,u).en-u.en);u.en+=en;if(en)events.push({type:'recover',unitId:u.id,hp:0,en});}
   if(e.kind==='heal'&&u.tags?.includes(e.tag))for(const t of s.units){if(!t.alive||t.side!==u.side||!near(u,t,e.range))continue;const max=effectiveMech(s,t).hp,hp=Math.min(max-t.hp,Math.floor(max*e.hpPct/100));t.hp+=hp;if(hp)events.push({type:'recover',unitId:t.id,hp,en:0});}
   if(e.kind==='summon'&&u.tags?.includes(e.tag)){const prefix=u.id+e.suffix,count=s.units.filter(v=>v.id.startsWith(prefix)).length,template=s.stage.definitions?.find(v=>v.tags?.includes(e.templateTag)&&v.id===prefix+(count+1));if(count<e.limit&&template)applySystem(s,{kind:'spawn',units:[{...template,id:prefix+(count+1),x:u.x,y:u.y}]},events);}
  }
 }
}
export function drainEnergy(s:BattleState,a:Unit,d:Unit,events:BattleEvent[],limit=Infinity):number{
 const e=s.content.tagEffects?.find(e=>e.kind==='drain'&&a.tags?.includes(e.tag));if(!e||e.kind!=='drain')return 0;
 const taken=Math.min(e.amount,limit,d.en);d.en-=taken;const en=Math.min(taken,effectiveMech(s,a).en-a.en);a.en+=en;
 if(taken)events.push({type:'recover',unitId:d.id,hp:0,en:-taken});if(en)events.push({type:'recover',unitId:a.id,hp:0,en});return taken;
}
export const energyRegen=(s:BattleState,u:Unit):number=>{const e=s.content.tagEffects?.find(e=>e.kind==='regeneration'&&e.pilot===u.pilotId);return e?.kind==='regeneration'?e.en:s.content.rules.enRegenPerRound;};
export function weaponBounds(s:BattleState,w:Weapon):[number,number]{const e=s.content.tagEffects?.find(e=>e.kind==='weapon-roll'&&(!e.stage||e.stage===s.stage.id)&&e.prefixes.some(p=>w.id.startsWith(p)));return e?.kind==='weapon-roll'?[e.min,e.max]:[1,1];}
export function weaponFactor(s:BattleState,w:Weapon):number{const [lo,hi]=weaponBounds(s,w);if(lo===hi)return lo;const r=nextRandom(s.rng);s.rng=r.state;return lo+r.value*(hi-lo);}
