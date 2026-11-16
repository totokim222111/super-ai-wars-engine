/** Portable LZW/CRC32 text; no browser storage, network or compression API required. */
const LIMIT=10_000_000,RESET=256;
function checksum(bytes:Uint8Array):string{let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return((crc^0xffffffff)>>>0).toString(16).padStart(8,'0');}
export function encodeSaveCode(text:string):string{
 const data=new TextEncoder().encode(text);if(data.length>LIMIT)throw Error('저장 코드가 너무 큽니다');let dict=new Map<string,number>(),next=257;const reset=()=>{dict=new Map(Array.from({length:256},(_,i)=>[String.fromCharCode(i),i]));next=257;};reset();const codes=[RESET];let previous='';
 for(const byte of data){const char=String.fromCharCode(byte),word=previous+char;if(dict.has(word)){previous=word;continue;}codes.push(dict.get(previous)!);if(next<=65535)dict.set(word,next++);else{codes.push(RESET);reset();}previous=char;}if(previous)codes.push(dict.get(previous)!);
 const bytes=new Uint8Array(codes.length*2);codes.forEach((n,i)=>{bytes[i*2]=n&255;bytes[i*2+1]=n>>>8;});let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return'SRPG1:'+checksum(data)+':'+btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
export function decodeSaveCode(code:string):string{
 if(code.length>28_000_000)throw Error('저장 코드가 너무 큽니다');const m=/^SRPG1:([a-f0-9]{8}):([A-Za-z0-9_-]+)$/.exec(code.trim().replace(/\s+/g,''));if(!m)throw Error('저장 코드 형식이 올바르지 않습니다');let bytes:string;try{bytes=atob(m[2].replaceAll('-','+').replaceAll('_','/'));}catch{throw Error('손상된 저장 코드');}if(bytes.length%2)throw Error('손상된 저장 코드');let dict:string[]=[],next=257,previous='',length=0;const chunks:string[]=[];
 for(let i=0;i<bytes.length;i+=2){const n=bytes.charCodeAt(i)|(bytes.charCodeAt(i+1)<<8);if(n===RESET){dict=Array.from({length:256},(_,i)=>String.fromCharCode(i));next=257;previous='';continue;}const word=dict[n]??(n===next&&previous?previous+previous[0]:undefined);if(word===undefined)throw Error('손상된 저장 코드');length+=word.length;if(length>LIMIT)throw Error('저장 코드가 너무 큽니다');chunks.push(word);if(previous&&next<=65535)dict[next++]=previous+word[0];previous=word;}
 const joined=chunks.join(''),data=Uint8Array.from(joined,c=>c.charCodeAt(0));if(checksum(data)!==m[1])throw Error('손상된 저장 코드');return new TextDecoder('utf-8',{fatal:true}).decode(data);
}
