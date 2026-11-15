import {describe,it,expect}from'vitest';
import {focalImageRect,imageFocus,configureImageFocus}from'../src/v2/image-layout';
import {hitBonus}from'../src/v2/adapter/resources';
describe('focal illustration safety',()=>{
 it('defaults to upper third and associates distinct focus points without modifying pixels',()=>{const a={}as HTMLImageElement,b={}as HTMLImageElement;expect(imageFocus(a)).toEqual([.5,1/3]);configureImageFocus({a,b},{a:[.72,.2]});expect(imageFocus(a)).toEqual([.72,.2]);expect(imageFocus(b)).toEqual([.5,1/3]);});
 it('keeps the entire source in the caption-free area over all zoom/pan frames and portrait extremes',()=>{const box={x:24,y:24,w:1232,h:576};for(const [iw,ih]of[[1600,900],[900,1600],[2400,800]])for(const focus of[[.72,.2],[.01,.01],[.99,.99],[.5,.5]]as[number,number][])for(let frame=0;frame<=720;frame++){const r=focalImageRect(iw,ih,box,focus,1+frame/720*.06,[-8+frame/90,-4]);expect(r.x).toBeGreaterThanOrEqual(box.x-1e-8);expect(r.y).toBeGreaterThanOrEqual(box.y-1e-8);expect(r.x+r.w).toBeLessThanOrEqual(box.x+box.w+1e-8);expect(r.y+r.h).toBeLessThanOrEqual(box.y+box.h+1e-8);}});
 it('formats nonzero hit modifiers with an explicit sign',()=>{expect(hitBonus(25)).toBe('명중+25');expect(hitBonus(-10)).toBe('명중-10');expect(hitBonus(0)).toBe('');});
});
