/**
 * Composable animation. See docs/v2-weapon-animation.md for the validated vocabulary.
 * 값
 *   moves    1..3 move objects (move, prop?, hits?, count?, words?)
 *   element  material id
 *   closer   final accent id or none
 *   tier     1..3, visual intensity only (never combat damage)
 *   color    preserved weapon accent #RRGGBB
 */
import type {Template,StrikeContext} from '../template';
import {ease,tween} from '../../flow';
import {GROUND} from '../scene';
import {MOVES} from '../moves';
import {needsBridge,sequenceIssues,type SequenceAnim} from '../moves/catalog';
import {closeSequence} from '../moves/closers';
function anim(c:StrikeContext):SequenceAnim{const errors=sequenceIssues(c.weapon.anim);if(errors.length)throw Error('invalid sequence: '+errors.join('; '));return c.weapon.anim as unknown as SequenceAnim;}
export const sequence:Template={
 *launch(c){const a=anim(c);yield*MOVES[a.moves[0].move].launch(c,a.moves[0],a);},
 *impact(c){
  const a=anim(c);let arrived=false;
  for(const[i,m]of a.moves.entries()){
   if(i&&needsBridge(a.moves[i-1],m)){
    const s=c.attacker.sprite,old={x:s.x,y:s.y,visible:s.visible};
    Object.assign(s,{visible:true,x:c.entryX,y:GROUND});
    try{yield*tween(s,{x:c.body().x-c.dir*(s.width*.38+c.defender.sprite.width*.25)},.2,ease.in);}finally{Object.assign(s,old);}arrived=true;
   }
   yield*MOVES[m.move].impact(c,m,a,arrived);
   arrived=['jab-rush','uppercut','slam-down','hammer-smash','ram','headbutt','slash','iai','thrust','whip','spin','stamp','cling','sweep'].includes(m.move);
  }
  yield*closeSequence(c,a);
 },
};
