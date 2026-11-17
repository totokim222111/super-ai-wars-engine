import {describe,it,expect}from'vitest';
import{burstEnvelope,burstSize,hammerPose,liftPose}from'../src/v2/battle/moves/readability';
describe('readable illustrated contacts',()=>{
 it('caps ordinary burst below a target height and retires it after the peak',()=>{expect(burstSize(400)).toBe(340);expect(burstSize(400,true)).toBe(480);expect(burstEnvelope(.16).scale).toBe(1);expect(burstEnvelope(.8).alpha).toBeLessThan(.3);expect(burstEnvelope(1)).toEqual({scale:0,alpha:0});});
 it('swings the hammer through 120 degrees in the final .18 seconds and removes it shortly after contact',()=>{for(const dir of[-1,1]){const start=hammerPose(.82,1,280,{x:400,y:300},dir),hit=hammerPose(1,1,280,{x:400,y:300},dir);expect(Math.abs(start.angle-hit.angle)).toBeCloseTo(Math.PI*2/3);expect(Math.abs(hit.angle)).toBeGreaterThan(1);expect(hit.y).toBeLessThan(564);expect(hammerPose(1.4,1,280,{x:400,y:300},dir).alpha).toBe(0);}});
 it('lifts the target at the material-peak frame and returns it to the floor',()=>{const peak=liftPose(.25,335,564,140);expect(peak.rise).toBeGreaterThanOrEqual(80);expect(peak.rise).toBeLessThanOrEqual(120);expect(peak.tilt).toBeGreaterThan(.2);expect(liftPose(.5,335,564,140).rise).toBe(0);});
});
