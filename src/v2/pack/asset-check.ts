import {animationSprites} from '../battle/animation-art';
import type { Pack } from './load';
export interface ArtInfo {width:number;height:number;bytes:number;empty?:number[]}
/** 픽셀/파일 I/O는 CLI가 한다. 동일한 검사 결과를 테스트에서도 쓴다. */
export function assetWarnings(p:Pack,info:Record<string,ArtInfo>):void {
  const add=(id:string,kind:string,message:string,fix:string)=>p.warnings.push({file:`${p.root}/game.json`,line:Math.max(1,(p.sources[`${p.root}/game.json`]?.slice(0,p.sources[`${p.root}/game.json`].indexOf(`"${id}"`)).match(/\n/g)?.length??0)+1),kind,message:`${id}: ${message}`,fix});
  for(const [id,s]of animationSprites(p.animationArt)){const r=s.rect,i=info[s.art];if(r&&i&&(r[0]+r[2]>i.width||r[1]+r[3]>i.height))p.errors.push({file:p.root+'/game.json',line:1,message:'연출 아틀라스 실제 크기 밖: '+id,fix:'원본 아틀라스 크기와 rect를 맞추세요.'});}
  const specs=new Map<string,{w:number;h:number;kb:number}>();
  for(const [id,page]of Object.entries(p.animationArt?.pages??{}))specs.set(id,{w:page.width,h:page.height,kb:1600});
  for(const c of Object.values(p.cast)){
    const portrait=/portrait/.test(c.bust??'')||(c.moodSheet?.rect[2]===1&&c.moodSheet.rect[3]===1);
    const spec=portrait?{w:768,h:768,kb:120}:{w:1024,h:1536,kb:280};
    if(c.bust)specs.set(c.bust,spec);for(const id of Object.values(c.moods??{}))specs.set(id,spec);
    if(c.moodSheet){const s=c.moodSheet;specs.set(s.art,portrait?{w:768*s.cols,h:768*s.rows,kb:200}:{w:2624,h:1935,kb:850});
      for(const index of info[s.art]?.empty??[])if(index<s.order.length)add(s.art,'표정 빈 칸',`${s.order[index]} 칸이 비어 있습니다.`,'해당 표정 원본을 넣고 art_ingest.py를 다시 실행하세요.');
    }
  }
  for(const [id,u]of Object.entries(p.units))for(const d of [u,...Object.values(u.forms??{}),...Object.values(u.tacticalForms??{})])if(d.art){specs.set(d.art,{w:1024,h:1024,kb:200});if(!d.anchors||!Object.keys(d.anchors).length)add(id,'그림 기준점','기체 그림에 기준점이 없습니다.','units.json anchors를 넣고 기준점 보기로 확인하세요.');}
  for(const id of Object.keys(p.game.art.files))if(/^(bg-|bbg-|cg-)/.test(id))specs.set(id,{w:1600,h:900,kb:id.startsWith('cg-')?400:350});
  for(const theme of Object.values(p.maps??{})){
    specs.set(theme.ground,{w:512,h:512,kb:150});
    for(const tile of Object.values(theme.tiles)){if(tile.surface)specs.set(tile.surface,{w:512,h:512,kb:150});for(const id of tile.props??[])if(!theme.propsAtlas?.rects[id])specs.set(id,{w:256,h:256,kb:80});}
    if(theme.propsAtlas)specs.set(theme.propsAtlas.art,{w:theme.propsAtlas.width,h:theme.propsAtlas.height,kb:880});
    if(theme.buildings)specs.set(theme.buildings.art,{w:2048,h:1024,kb:700});
  }
  for(const c of Object.values(p.stageScripts??{}))if(c.mapArt)specs.set(c.mapArt,{w:c.stage.map.w*80,h:c.stage.map.h*80,kb:700});
  for(const [id,spec]of specs){const actual=info[id];if(!actual)continue;
    if(actual.width!==spec.w||actual.height!==spec.h)add(id,'그림 크기',`${actual.width}×${actual.height}, 규격 ${spec.w}×${spec.h}`,'v2-asset-spec.md 크기로 새 그림을 만드세요. 기존 그림은 교체 전까지 사용할 수 있습니다.');
    if(actual.bytes>spec.kb*1024)add(id,'그림 용량',`${Math.ceil(actual.bytes/1024)}KB, 상한 ${spec.kb}KB`,'잡티를 정리하고 품질 80, 알파 90 WebP로 다시 넣으세요.');
  }
}
