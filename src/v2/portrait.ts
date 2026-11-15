/** 표정은 상반신을 복제하지 않고 작은 머리 칸만 캐시해 겹친다. */
export interface Rect { x: number; y: number; w: number; h: number }
export interface MoodSheet { art: string; rect: [number, number, number, number]; cols: number; rows: number; order: string[] }
export interface Portrait {
  faces: Record<string, HTMLImageElement | undefined>;
  moodAliases?:Record<string,string>;
  crop: Rect;
  moodSheet?: Omit<MoodSheet, 'art'> & { image?: HTMLImageElement };
}
export const MOOD_NAMES: Record<string,string> = {default:'기본',smile:'미소',laugh:'웃음',attack:'공격',serious:'진지',hit:'당황·피격',shock:'충격',sad:'슬픔',angry:'분노',shy:'부끄러움'};
export const STANDARD_MOODS = Object.keys(MOOD_NAMES);
export function faceOf(p: Portrait, mood: string): HTMLImageElement | undefined { return p.faces[p.moodAliases?.[mood]??mood] ?? p.faces.default; }
const tiles = new WeakMap<HTMLImageElement, Map<string, HTMLCanvasElement>>();
/** 가장자리 24 원본 픽셀의 알파를 선형으로 섞는다. RGB와 내부 알파는 보존한다. */
export function feather(data: Uint8ClampedArray, w: number, h: number, edge = 24): void {
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) data[(y*w+x)*4+3] *= Math.min(1, Math.min(x,y,w-1-x,h-1-y)/edge);
}
export function moodTile(p: Portrait, mood: string): HTMLCanvasElement | undefined {
  mood=p.moodAliases?.[mood]??mood;
  if(p.faces[mood])return; // 전체 그림 예외 우선
  const s=p.moodSheet, image=s?.image, index=s?.order.indexOf(mood)??-1;
  if(!s||!image?.naturalWidth||index<0||index>=s.cols*s.rows)return;
  const key=`${s.cols},${s.rows},${index}`;let cache=tiles.get(image);if(!cache)tiles.set(image,cache=new Map());
  let tile=cache.get(key);if(tile)return tile;
  tile=document.createElement('canvas');tile.width=Math.floor(image.naturalWidth/s.cols);tile.height=Math.floor(image.naturalHeight/s.rows);
  const c=tile.getContext('2d',{willReadFrequently:true})!;
  c.drawImage(image,index%s.cols*tile.width,Math.floor(index/s.cols)*tile.height,tile.width,tile.height,0,0,tile.width,tile.height);
  const pixels=c.getImageData(0,0,tile.width,tile.height);feather(pixels.data,tile.width,tile.height);c.putImageData(pixels,0,0);cache.set(key,tile);return tile;
}
/** 원본 상반신 좌표의 crop을 목적 사각형으로 그린다. 얼굴칸·컷인·Sprite가 함께 쓴다. */
export function drawPortrait(ctx: CanvasRenderingContext2D,p:Portrait,mood:string,crop:Rect,x:number,y:number,w:number,h:number):void {
  const image=faceOf(p,mood);if(!image?.naturalWidth)return;
  ctx.drawImage(image,crop.x*image.naturalWidth,crop.y*image.naturalHeight,crop.w*image.naturalWidth,crop.h*image.naturalHeight,x,y,w,h);
  const tile=moodTile(p,mood),s=p.moodSheet;if(!tile||!s)return;
  ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
  ctx.drawImage(tile,x+(s.rect[0]-crop.x)/crop.w*w,y+(s.rect[1]-crop.y)/crop.h*h,s.rect[2]/crop.w*w,s.rect[3]/crop.h*h);ctx.restore();
}
export function portraitImages(p?: Pick<Portrait,'faces'|'moodSheet'>): (HTMLImageElement|undefined)[] {return p?[...Object.values(p.faces),p.moodSheet?.image]:[];}
