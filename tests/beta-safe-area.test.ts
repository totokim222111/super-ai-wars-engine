import {describe,it,expect} from 'vitest';
import {BATTLE_CONTROLS,BATTLE_HUD,safeCaption,overlaps} from '../src/v2/battle/safe-area';
describe('battle control exclusion area',()=>{
 it('keeps tall-unit damage, guard, falling words and sound captions outside controls and HUD in both directions',()=>{
  for(const x of [200,480,640,800,1080])for(const y of [124,152,175,212,300])for(const [w,h]of [[214,120],[180,84],[450,112]]){
   const b=safeCaption(x,y,w,h);for(const forbidden of [BATTLE_CONTROLS,...BATTLE_HUD])expect(overlaps(b,forbidden),JSON.stringify({b,forbidden})).toBe(false);
  }
 });
});
