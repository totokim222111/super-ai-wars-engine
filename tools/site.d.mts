export const cacheHeaders:string;
export interface SiteFile{file:string;bytes:number}
export interface SiteResult{directory:string;files:number;bytes:number;largest:SiteFile[];over25MiB:SiteFile[];over1000Files:boolean}
export function buildSite(dist:string,target:string):Promise<SiteResult>;
