import type {BattleState,Unit,Weapon} from '../../core';
import {effectiveWeapon} from '../../core';
export const hitBonus=(value:number):string=>value?`명중${value>0?'+':''}${value}`:'';
export function weaponResources(s:BattleState,u:Unit,w:Weapon):string {
  const energy=s.content.terms?.en??'EN';
  return [hitBonus(effectiveWeapon(s,u,s.content.weapons.find(base=>base.id===w.id)??w).hit),w.ammo!==undefined?`잔탄 ${u.ammo[w.id]??0}/${w.ammo}`:undefined,(w.en??0)>0?`${energy} ${w.en}`:w.ammo===undefined?'무소모':undefined,w.postMove?'이동 후 가능':'이동 전'].filter(Boolean).join(' · ');
}
export function weaponReason(s:BattleState,reason:string|null):string|undefined {
  if(!reason)return;return ({'utility weapon cannot counter':'반격 불가','weapon cooling down':'재사용 대기','target already affected':'효과 적용 중','summon limit or no adjacent space':'소환 불가','support weapon requires weaponSkill':'지원 명령','insufficient EN':`${s.content.terms?.en??'EN'} 부족`,'insufficient ammo':'잔탄 없음','insufficient morale':`${s.content.terms?.morale??'기력'} 부족`,'non-P weapon cannot fire after moving':'이동 후 불가','target outside weapon range':'사거리 밖','MAP weapon requires mapAttack':'맵 병기 명령 필요','weapon is not equipped':'장착하지 않은 무기'}as Record<string,string>)[reason]??'현재 사용 불가';
}
