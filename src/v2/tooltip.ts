import {readable,largeUi} from './presentation';
import {Shape,W,H} from './stage';
import {panel,FONT,COLOR,wrap} from './ui';
import {displayTerms,term} from './terms';
export interface Tip {title:string;lines:string[]}
export interface Rect {x:number;y:number;w:number;h:number}
export const durationLabel=(s:string):string=>({instant:'즉시',nextAttack:'다음 공격',nextHitTaken:'다음 피격',turn:'이번 턴',passive:'상시'})[s]??s;
export const targetLabel=(s:string):string=>({self:'자신',ally:'아군 1기',enemy:'적 1기',allAllies:'아군 전체'})[s]??s;
export function spiritTip(s:{name:string;cost:number|string;desc?:string;duration?:string;target?:string;reason?:string}):Tip{return{title:s.name,lines:[`${term('sp')} ${s.cost} · ${durationLabel(s.duration??'instant')} · ${targetLabel(s.target??'self')}`,s.desc??'',...(s.reason?[s.reason]:[])]};}
/** Shared readable tooltip. Placement is clamped and keeps the source list unobstructed. */
export class Tooltip extends Shape<{tip?:Tip}> {
 w=390;h=150;
 constructor(){super({},(ctx,s)=>{if(!s.tip)return;ctx.font=`700 ${readable(17)}px ${FONT.body}`;const lines=s.tip.lines.filter(Boolean).flatMap(l=>wrap(ctx,displayTerms(l),this.w-36));this.h=64+lines.length*(largeUi()?30:24);const oldY=this.y;this.y=Math.max(60,Math.min(H-42-this.h,this.y));ctx.translate(0,this.y-oldY);panel(ctx,0,0,this.w,this.h,COLOR.gold);ctx.textAlign='left';ctx.textBaseline='top';ctx.fillStyle=COLOR.gold;ctx.font=`900 ${readable(21)}px ${FONT.body}`;ctx.fillText(s.tip.title,18,15,this.w-36);ctx.font=`700 ${readable(17)}px ${FONT.body}`;lines.forEach((l,i)=>{ctx.fillStyle=i===lines.length-1&&s.tip!.lines.at(-1)?.includes('불가')?COLOR.enemy:COLOR.ink;ctx.fillText(l,18,50+i*(largeUi()?30:24),this.w-36);});});this.z=96;this.visible=false;}
 show(tip:Tip,avoid?:Rect):void{this.state.tip=tip;this.visible=true;this.w=390;if(avoid){const right=W-avoid.x-avoid.w-24,left=avoid.x-24;if(right>=300){this.w=Math.min(390,right);this.x=avoid.x+avoid.w+12;this.y=avoid.y;}else if(left>=300){this.w=Math.min(390,left);this.x=avoid.x-this.w-12;this.y=avoid.y;}else{this.x=Math.max(20,Math.min(W-this.w-20,avoid.x));this.y=avoid.y>H/2?Math.max(60,avoid.y-175):avoid.y+avoid.h+12;}}this.x=Math.max(16,Math.min(W-this.w-16,this.x));}
 hide():void{this.visible=false;this.state.tip=undefined;}

}
const descriptions:Record<string,string>={melee:'격투 계열 무기의 피해에 영향을 줍니다.',shoot:'사격 계열 무기의 피해에 영향을 줍니다.',hit:'공격이 맞을 확률에 영향을 줍니다.',evade:'적 공격을 피할 확률에 영향을 줍니다.',skill:'크리티컬과 기술 판정에 영향을 줍니다.',defense:'받는 피해를 줄입니다.',armor:'기체가 받는 피해를 줄입니다.',mobility:'기체의 회피율에 영향을 줍니다.',move:'한 번에 이동할 수 있는 거리입니다.',hp:'0이 되면 격파됩니다.',en:'무기와 일부 행동에 쓰는 에너지입니다.',sp:'정신기를 사용하는 데 쓰는 자원입니다.',morale:'무기 사용 조건과 전투 능력에 영향을 줍니다.',size:'기체 크기에 따른 명중과 피해 보정입니다.',adapt:'공중·지상·수중·우주에서의 적성입니다.',partSlots:'장착할 수 있는 파츠 수입니다.',moveType:'이동 가능한 지형 유형입니다.'};
export function statTip(id:string,name:string,overrides:Record<string,string>={}):Tip{const configured=term('desc.'+id);return{title:name,lines:[overrides[id]??(configured!=='desc.'+id?configured:descriptions[id]??'팩에서 정의한 추가 능력치입니다.')]};}
