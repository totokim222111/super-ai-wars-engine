/** Campaign values share the same encoded storage used by story variables. */
export function campaignValue(flags:Record<string,boolean>,name:string):string|number|boolean {
 const prefix=`v2:value:${encodeURIComponent(name)}:`,key=Object.keys(flags).find(k=>k.startsWith(prefix));
 if(key){try{return JSON.parse(decodeURIComponent(key.slice(prefix.length)));}catch{return false;}}return flags[name]??false;
}
export const enabledFlag=(flags:Record<string,boolean>,name?:string):boolean=>!name||campaignValue(flags,name)===true||campaignValue(flags,name)===1;
