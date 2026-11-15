import type {AIBehavior,BattleEvent,BattleState,Point,Unit} from './types';
import {distance,mechOf} from './terrain';

/** A unit override wins over the first matching group, then the enemy stage default. */
export function behaviorOf(s:BattleState,u:Unit):AIBehavior|undefined {
  if(u.tags?.includes('v2-third')||(s.content.aiSides?.[u.id]??u.side)!=='enemy')return;
  const p=s.stage.aiPatterns;
  return p?.units?.[u.id]??p?.groups?.find(g=>g.ids?.includes(u.id)||g.tags?.some(t=>u.tags?.includes(t)))?.behavior??p?.default;
}
const inArea=(s:BattleState,id:string,p:Point)=>{const a=s.stage.areas?.[id];return !!a&&p.x>=a[0]&&p.x<=a[2]&&p.y>=a[1]&&p.y<=a[3];};
export function alerted(s:BattleState,u:Unit,b:AIBehavior,vars:Record<string,string|number|boolean>=s.content.aiVariables??{}):boolean {
  if(u.aiAlerted)return true;
  if(b.when?.some(t=>(t.turn===undefined||s.round>=t.turn)&&(t.hpBelow===undefined||u.hp/mechOf(s,u).hp<=t.hpBelow)&&(t.area===undefined||s.units.some(v=>v.alive&&(s.content.aiSides?.[v.id]??v.side)==='player'&&inArea(s,t.area!,v)))&&(!t.variable||vars[t.variable.name]===t.variable.equals)))return true;
  if(b.pattern==='hold')return s.units.some(v=>v.alive&&v.side!==u.side&&v.side!=='neutral'&&mechOf(s,u).weapons.some(id=>{const w=s.content.weapons.find(w=>w.id===id)!;const d=distance(u,v);return d>=w.range[0]&&d<=w.range[1];}));
  return false;
}
/** Latch activation in reducer state, not in previews. A missed shot still wakes a sentry. */
export function updatePatternAlerts(s:BattleState,events:readonly BattleEvent[]=[],vars?:Record<string,string|number|boolean>):void {
  for(const u of s.units){const b=behaviorOf(s,u);if(!b||u.aiAlerted)continue;
    if(alerted(s,u,b,vars)||b.pattern==='hold'&&events.some(e=>e.type==='attack'&&e.targetId===u.id))u.aiAlerted=true;
  }
}
export function patternMode(s:BattleState,u:Unit):AIBehavior|undefined {
  const b=behaviorOf(s,u);if(!b)return;
  if(['hold','ambush','boss'].includes(b.pattern)&&alerted(s,u,b))return {...b,pattern:'aggressive'};
  return b;
}
export function guardCenter(s:BattleState,u:Unit,b:AIBehavior):Point {
  return s.units.find(v=>v.id===b.anchorUnit&&v.alive)??b.anchor??s.stage.units.find(v=>v.id===u.id)??s.stage.definitions?.find(v=>v.id===u.id)??u;
}
export function objectivePoint(s:BattleState,b:AIBehavior):Point|undefined {
  const a=b.area&&s.stage.areas?.[b.area];return b.target??(a?{x:Math.floor((a[0]+a[2])/2),y:Math.floor((a[1]+a[3])/2)}:undefined);
}
export function objectiveDistance(s:BattleState,b:AIBehavior,p:Point):number {
  const a=b.area&&s.stage.areas?.[b.area];return a?Math.max(a[0]-p.x,0,p.x-a[2])+Math.max(a[1]-p.y,0,p.y-a[3]):distance(p,objectivePoint(s,b)!);
}
