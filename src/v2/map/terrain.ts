/** 판을 열 때 한 번 굽는 칸 지형. 좌표 해시는 코어 RNG와 무관하다. */
export interface TerrainTile {surface?:string;edge?:'road'|'water';props?:string[];density?:number;color?:string;scale?:number}
export interface MapTheme {plainDetail?:boolean;vegetationColor?:string;roles?:Partial<Record<'plain'|'wall'|'cache'|'cover',string>>;ground:string;color:string;trim?:string;accent?:string;propsAtlas?:{art:string;width:number;height:number;rects:Record<string,[number,number,number,number]>};buildings?:{art:string;cols:number;rows:number;sizes:[number,number][]};tiles:Record<string,TerrainTile>}
export interface MapTerrain {tiles:string[][];theme:MapTheme;images:Record<string,HTMLImageElement|undefined>;painted?:string}
export interface BuildingPiece {x:number;y:number;w:number;h:number;variant:number}
/** 실제 게임/검수 도구가 공유하는 18×12 견본. 모든 지형과 모든 건물 크기를 포함한다. */
export function terrainDemoTiles(ids:Record<string,string>={'.':'plain','#':'wall','=':'road','~':'water',C:'cache','^':'cover'}):string[][]{const rows=[
  '.................#', '.##.###..##.###...', '.##.###..##.###...', '...............##.',
  '==================', '..................', '.C...^...^...C....', '.##.###.......###.',
  '.##.###..~~~..###.', '.........~~~~.....', '.###.##..~~~~.##..', '.###.##...........'];
  return rows.map(r=>[...r].map(c=>ids[c]));}
/** 큰 직사각형부터 벽 칸만 소비한다. 빈 칸/물/통로 위로 건물을 늘이지 않는다. */
export function buildingPlan(tiles:string[][],wall='wall'):BuildingPiece[]{
  const used=new Set<string>(),pieces:BuildingPiece[]=[];
  for(let y=0;y<tiles.length;y++)for(let x=0;x<tiles[y].length;x++){
    if(tiles[y][x]!==wall||used.has(`${x},${y}`))continue;
    const [w,h]=([[3,2],[2,2],[2,1],[1,1]] as const).find(([w,h])=>Array.from({length:h},(_,dy)=>Array.from({length:w},(_,dx)=>tiles[y+dy]?.[x+dx]===wall&&!used.has(`${x+dx},${y+dy}`))).flat().every(Boolean))!;
    for(let dy=0;dy<h;dy++)for(let dx=0;dx<w;dx++)used.add(`${x+dx},${y+dy}`);
    pieces.push({x,y,w,h,variant:tileHash(x,y,8)%2});
  }return pieces;
}
export interface TilePaint {x:number;y:number;terrain:string;style:TerrainTile;neighbors:[boolean,boolean,boolean,boolean];prop?:string;variant:number}
export function tileHash(x:number,y:number,salt=0):number {let n=Math.imul(x+17,374761393)^Math.imul(y+29,668265263)^Math.imul(salt+1,1274126177);n=Math.imul(n^(n>>>13),1274126177);return (n^(n>>>16))>>>0;}
export function terrainPlan(terrain:MapTerrain):TilePaint[]{return terrain.tiles.flatMap((row,y)=>row.map((id,x)=>{const style=terrain.theme.tiles[id]??{},seed=tileHash(x,y),props=style.props??[],prop=props.length&&seed/4294967296<(style.density??1)?props[tileHash(x,y,1)%props.length]:undefined;const same=(xx:number,yy:number)=>{const other=terrain.tiles[yy]?.[xx];return !!other&&(other===id||!!style.edge&&terrain.theme.tiles[other]?.edge===style.edge);};return {x,y,terrain:id,style,neighbors:[same(x,y-1),same(x+1,y),same(x,y+1),same(x-1,y)],prop,variant:tileHash(x,y,2)%4};}));}
export function terrainImages(terrain:MapTerrain):(HTMLImageElement|undefined)[]{if(terrain.painted)return [terrain.images[terrain.painted]];return [terrain.images[terrain.theme.ground],...(terrain.theme.buildings?[terrain.images[terrain.theme.buildings.art]]:[]),...(terrain.theme.propsAtlas?[terrain.images[terrain.theme.propsAtlas.art]]:[]),...Object.values(terrain.theme.tiles).flatMap(t=>[...(t.surface?[terrain.images[t.surface]]:[]),...(t.props??[]).filter(id=>!terrain.theme.propsAtlas?.rects[id]).map(id=>terrain.images[id])])];}
type Canvas=HTMLCanvasElement|OffscreenCanvas;
export function terrainCanvas(terrain:MapTerrain,cell:number,make?:(w:number,h:number)=>Canvas):Canvas|undefined {
  const w=(terrain.tiles[0]?.length??0)*cell,h=terrain.tiles.length*cell;
  const create=make??(typeof OffscreenCanvas!=='undefined'?(w:number,h:number)=>new OffscreenCanvas(w,h):typeof document!=='undefined'?(w:number,h:number)=>Object.assign(document.createElement('canvas'),{width:w,height:h}):undefined);
  if(!create||!w||!h)return;const canvas=create(w,h),ctx=canvas.getContext('2d') as CanvasRenderingContext2D|null;if(!ctx)return;
  const painted=terrain.images[terrain.painted??''];if(painted?.naturalWidth){ctx.drawImage(painted,0,0,w,h);return canvas;}
  const fill=(id:string|undefined,color:string)=>{const image=terrain.images[id??''];return image?.naturalWidth?ctx.createPattern(image,'repeat')??color:color;};
  ctx.fillStyle=fill(terrain.theme.ground,terrain.theme.color);ctx.fillRect(0,0,w,h);
  for(const p of terrainPlan(terrain)){
    const {style,neighbors:[up,right,down,left]}=p,x=p.x*cell,y=p.y*cell,color=style.color??terrain.theme.color;
    if(style.surface||style.edge){
      ctx.save();ctx.translate(x,y);const r=style.edge?cell*.18:0,tl=!up&&!left?r:0,tr=!up&&!right?r:0,br=!down&&!right?r:0,bl=!down&&!left?r:0;
      ctx.beginPath();ctx.moveTo(tl,0);ctx.lineTo(cell-tr,0);ctx.quadraticCurveTo(cell,0,cell,tr);ctx.lineTo(cell,cell-br);ctx.quadraticCurveTo(cell,cell,cell-br,cell);ctx.lineTo(bl,cell);ctx.quadraticCurveTo(0,cell,0,cell-bl);ctx.lineTo(0,tl);ctx.quadraticCurveTo(0,0,tl,0);ctx.closePath();
      ctx.fillStyle=color;ctx.fill();ctx.clip();ctx.translate(-x,-y);ctx.fillStyle=fill(style.surface,color);ctx.fillRect(0,0,w,h);ctx.restore();
    }else if(!terrain.images[terrain.theme.ground]?.naturalWidth){ctx.fillStyle=`rgba(255,255,255,${.012+(tileHash(p.x,p.y,3)%6)*.004})`;ctx.fillRect(x+2,y+2,cell-4,cell-4);}
    // 3×3 구획의 명암, 보도 이음매·배수 홈. 중앙은 말이 읽히도록 낮은 대비로 둔다.
    if(p.terrain===terrain.theme.roles?.plain){
      ctx.fillStyle=tileHash(Math.floor(p.x/3),Math.floor(p.y/3),6)%2?'rgba(8,24,40,.07)':'rgba(255,242,208,.055)';ctx.fillRect(x,y,cell,cell);
      if(terrain.theme.plainDetail!==false){ctx.strokeStyle='rgba(21,35,49,.09)';ctx.lineWidth=1;ctx.strokeRect(x+4,y+4,cell-8,cell-8);}
      if(p.x%3===0){ctx.fillStyle=terrain.theme.trim??'#708389';ctx.globalAlpha=.3;ctx.fillRect(x+2,y,3,cell);ctx.globalAlpha=1;}
      if(tileHash(p.x,p.y,9)%5===0){ctx.fillStyle='rgba(12,24,32,.3)';for(let i=0;i<7;i++)ctx.fillRect(x+12+i*4,y+cell-9,2,4);}
      // 구획 가장자리의 낮은 녹지·눈·안료. 통행할 중앙은 비우고 큰 면의 반복을 깬다.
      if(terrain.theme.plainDetail!==false&&p.x%3===0&&tileHash(Math.floor(p.x/3),Math.floor(p.y/2),11)%3!==0){
        const color=terrain.theme.vegetationColor??'#526c3d';
        ctx.save();ctx.shadowBlur=2;ctx.shadowColor='rgba(0,0,0,.3)';ctx.fillStyle=color;ctx.fillRect(x+6,y+8,9,cell-16);ctx.shadowBlur=0;
        for(let i=0;i<7;i++){ctx.fillStyle=i%2?'rgba(224,241,184,.2)':'rgba(15,35,24,.2)';ctx.beginPath();ctx.ellipse(x+10+(i%2)*2,y+13+i*8,4,5,0,0,Math.PI*2);ctx.fill();}ctx.restore();
      }
    }
    if(style.edge){
      ctx.save();ctx.strokeStyle=terrain.theme.trim??'#99a8ac';ctx.lineWidth=style.edge==='water'?5:3;ctx.beginPath();
      if(!up){ctx.moveTo(x+3,y+3);ctx.lineTo(x+cell-3,y+3);}if(!right){ctx.moveTo(x+cell-3,y+3);ctx.lineTo(x+cell-3,y+cell-3);}if(!down){ctx.moveTo(x+3,y+cell-3);ctx.lineTo(x+cell-3,y+cell-3);}if(!left){ctx.moveTo(x+3,y+3);ctx.lineTo(x+3,y+cell-3);}ctx.stroke();
      ctx.strokeStyle=terrain.theme.accent??'#9fd5df';ctx.lineWidth=1;ctx.globalAlpha=.65;ctx.stroke();ctx.restore();
    }
    if(p.prop){
      const rect=terrain.theme.propsAtlas?.rects[p.prop],image=terrain.images[rect?terrain.theme.propsAtlas!.art:p.prop],size=cell*(style.scale??.78),px=x+(cell-size)/2,py=y+cell-size;
      if(p.terrain===terrain.theme.roles?.wall&&terrain.images[terrain.theme.buildings?.art??'']?.naturalWidth)continue;
      if(image?.naturalWidth){ctx.save();if(p.terrain===terrain.theme.roles?.plain)ctx.globalAlpha=.32;else {ctx.shadowColor='rgba(0,0,0,.55)';ctx.shadowBlur=5;ctx.shadowOffsetY=4;}if(rect)ctx.drawImage(image,...rect,px,py,size,size);else ctx.drawImage(image,px,py,size,size);ctx.restore();}
      else if(p.terrain===terrain.theme.roles?.cache){ctx.fillStyle='#092939';ctx.fillRect(x+16,y+10,48,60);ctx.fillStyle='#62e6c4';for(let i=0;i<3;i++)ctx.fillRect(x+22,y+18+i*16,36,9);}
      else if(p.terrain===terrain.theme.roles?.cover){ctx.fillStyle='#38495c';ctx.fillRect(x+12,y+24,56,43);ctx.strokeStyle='#8da1b0';ctx.lineWidth=3;ctx.strokeRect(x+12,y+24,56,43);ctx.beginPath();ctx.moveTo(x+12,y+24);ctx.lineTo(x+68,y+67);ctx.stroke();}
      else if(p.terrain===terrain.theme.roles?.wall){ctx.fillStyle='#0a101e';ctx.fillRect(x+2,y+4,cell-4,cell-7);ctx.fillStyle='#647589';ctx.fillRect(x+4,y+4,cell-8,14);ctx.fillStyle='#293646';ctx.fillRect(x+8,y+24,cell-16,cell-35);}
    }
  }
  const buildings=terrain.theme.buildings,atlas=terrain.images[buildings?.art??''];
  if(buildings&&atlas?.naturalWidth){const sw=atlas.naturalWidth/buildings.cols,sh=atlas.naturalHeight/buildings.rows;
    for(const p of buildingPlan(terrain.tiles,terrain.theme.roles?.wall)){const col=buildings.sizes.findIndex(([w,h])=>w===p.w&&h===p.h);if(col<0)continue;
      ctx.save();ctx.shadowColor='rgba(0,0,0,.6)';ctx.shadowBlur=6;ctx.shadowOffsetY=5;
      ctx.drawImage(atlas,col*sw,p.variant*sh,sw,sh,p.x*cell+2,p.y*cell+2,p.w*cell-4,p.h*cell-7);ctx.restore();
    }
  }
  return canvas;
}
