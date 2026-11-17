import {clamp,smooth} from './layout';
/** Contact-sized blasts never cover the rear 40% of a target silhouette. */
export function burstSize(height:number,last=false):number{return height*(last?1.2:.85);}
export function burstEnvelope(age:number):{scale:number;alpha:number}{
 if(age<0||age>=1)return{scale:0,alpha:0};
 return{scale:age<.16?.6+.4*smooth(0,.16,age):1-.55*smooth(.25,1,age),alpha:age<.25?1:1-smooth(.25,1,age)};
}
export function hammerPose(time:number,hit:number,height:number,head:{x:number;y:number},dir:number,hand?:{x:number;y:number}){
 const swing=smooth(hit-.18,hit,time),recoil=smooth(hit+.10,hit+.25,time),size=height*1.6,length=size*.74;
 const grip=hand??{x:head.x-dir*length*.94,y:head.y+length*.342};
 const landing=Math.atan2(head.x-grip.x,grip.y-head.y),angle=landing+dir*((-120*(1-swing)+15*recoil)*Math.PI/180);
 return{x:grip.x,y:grip.y,angle,size,alpha:1-smooth(hit+.12,hit+.4,time)};
}
export function liftPose(age:number,height:number,ground:number,ceiling:number){const k=smooth(0,.25,age)*(1-smooth(.25,.45,age)),rise=clamp(height*.35,80,120)*k;return{rise,tilt:.21*k,scaleY:Math.min(1,(ground-rise-ceiling)/height)};}
