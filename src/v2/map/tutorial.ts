export type TutorialEvent='select'|'move'|'forecast'|'battle'|'end-turn';
const order:TutorialEvent[]=['select','move','forecast','battle','end-turn'];
export class FirstGuide {
 step=0;finished=false;
 event(event:TutorialEvent):void{if(!this.finished&&order[this.step]===event){this.step++;if(this.step===order.length)this.finished=true;}}
 text(touch:boolean):string{return ['아군 기체를 눌러 고르세요','파란 칸을 누르면 그곳으로 이동합니다','공격할 무기를 고르고 적을 누르세요','예상 결과를 보고 전투 개시','모두 움직였으면 메뉴에서 턴 종료'][Math.min(this.step,4)].replace(/눌러/g,touch?'눌러':'클릭해').replace(/누르면/g,touch?'누르면':'클릭하면').replace(/누르세요/g,touch?'누르세요':'클릭하세요');}
}
