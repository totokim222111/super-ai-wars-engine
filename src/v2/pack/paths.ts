/** Relative pack media use a namespaced route in development and release builds. */
export const mediaPath=(id:string,path:string):string=>path.startsWith('/')||/^(https?:|data:|blob:)/.test(path)?path:`/packs/${id}/${path.replace(/^\.\//,'')}`;
