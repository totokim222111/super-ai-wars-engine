import{it,expect,vi}from'vitest';
import{encodeSaveCode,decodeSaveCode}from'../src/campaign/save-code';
import{SessionBytes}from'../src/platform/storage';
it('compresses Korean/emoji slot data losslessly, including dictionary resets',()=>{
 const text=JSON.stringify({name:'별빛🛰️',slots:Array.from({length:12000},(_,i)=>[i,Math.imul(i,45243)>>>0,'한글 진행 저장'])});
 const code=encodeSaveCode(text);expect(code.length).toBeLessThan(text.length);expect(decodeSaveCode(code)).toBe(text);
 for(const bad of [code.slice(0,-3),code.replace(/:.{8}:/,':00000000:'),'SRPG9:abc:bad','not a save'])expect(()=>decodeSaveCode(bad)).toThrow();
});
it('warns once and retains portable session backups when both browser stores fail',async()=>{
 const warn=vi.spyOn(console,'warn').mockImplementation(()=>{}),backend={read:async()=>{throw Error('denied')},replace:async()=>{throw Error('quota')}};
 const storage=new SessionBytes(backend),notice=vi.fn();storage.onUnavailable=notice;expect(await storage.probe()).toBe(false);expect(storage.status.persistent).toBe(false);
 await storage.replace('1','저장');expect(await storage.read('1')).toBe('저장');await storage.replace('2','다음');expect(notice).toHaveBeenCalledTimes(1);expect(warn).toHaveBeenCalledTimes(1);warn.mockRestore();
});
it('detects readback failure and flushes temporary slots when persistence returns',async()=>{
 const warn=vi.spyOn(console,'warn').mockImplementation(()=>{}),map=new Map<string,string>();let deny=true;
 const store=new SessionBytes({read:async k=>deny?null:map.get(k)??null,replace:async(k,v)=>{if(!deny)map.set(k,v);}});
 expect(await store.probe()).toBe(false);await store.replace('1','portable');deny=false;expect(await store.probe()).toBe(true);expect(map.get('1')).toBe('portable');expect(await store.read('1')).toBe('portable');warn.mockRestore();
});
it('salvages readable old slots even when the persistent store is full/read-only',async()=>{
 const warn=vi.spyOn(console,'warn').mockImplementation(()=>{}),storage=new SessionBytes({read:async k=>k==='1'?'last good':null,replace:async()=>{throw Error('quota')}});
 expect(await storage.probe()).toBe(false);expect(await storage.read('1')).toBe('last good');await storage.replace('1','new portable');expect(await storage.read('1')).toBe('new portable');warn.mockRestore();
});
