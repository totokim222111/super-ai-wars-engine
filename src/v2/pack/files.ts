import {readData} from 'virtual:release-data';
export {packNames,defaultPack} from 'virtual:release-data';
export async function packText(path:string):Promise<string>{const data=await readData(path);return typeof data==='string'?data:JSON.stringify(data);}
export const assetUrl=(path:string):string=>path.startsWith('/')?import.meta.env.BASE_URL+path.slice(1):path;
