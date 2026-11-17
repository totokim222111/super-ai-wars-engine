import {MenuList,type MenuItem} from './kit';
import type {Action} from './input';
import {FONT,COLOR,plate} from './ui';
import {uiMetrics} from './presentation';
/** Shared paged tiles: the same focus, sound and one-tap contract as MenuList. */
export class GridMenu extends MenuList{
 private page=0;private pressed=-1;
 readonly cellHeight:number;readonly gap:number;readonly columns:number;readonly pageRows:number;
 constructor(items:MenuItem[],private readonly selected:(index:number)=>void,options:{w:number;columns?:number;rows?:number;height?:number;gap?:number;onMove?:(index:number)=>void}){
  super(items,selected,{w:options.w,rows:items.length||1});this.columns=options.columns??2;this.pageRows=options.rows??3;this.cellHeight=options.height??uiMetrics().row;this.gap=options.gap??uiMetrics().gap;this.w=options.w;this.h=this.pageRows*(this.cellHeight+this.gap)-this.gap+(items.length>this.capacity?uiMetrics().pager+16:0);this.preview=options.onMove;this.page=Math.floor(this.index/this.capacity);
 }
 private preview?: (index:number)=>void;
 get capacity(){return this.columns*this.pageRows;}
 get pages(){return Math.max(1,Math.ceil(this.items.length/this.capacity));}
 get pageButtons(){const y=this.pageRows*(this.cellHeight+this.gap),w=(this.w-128)/2-8;return [{x:8,y,w,h:uiMetrics().pager,label:'▲ 이전'},{x:this.w/2+64,y,w,h:uiMetrics().pager,label:'다음 ▼'}];}
 get cells(){const cw=(this.w-(this.columns-1)*this.gap)/this.columns;return this.items.slice(this.page*this.capacity,(this.page+1)*this.capacity).map((item,i)=>({item,index:this.page*this.capacity+i,x:(i%this.columns)*(cw+this.gap),y:Math.floor(i/this.columns)*(this.cellHeight+this.gap),w:cw,h:this.cellHeight}));}
 private selectIndex(to:number){const n=this.items.length;if(!n)return;let i=(to+n)%n;for(let k=0;k<n&&this.items[i].disabled;k++)i=(i+1)%n;if(this.items[i].disabled)return;this.index=i;this.page=Math.floor(i/this.capacity);this.preview?.(i);}
 reveal(index:number):void{this.selectIndex(index);}
 setItems(items:MenuItem[]):void{super.setItems(items);this.page=Math.min(this.pages-1,Math.floor(this.index/this.capacity));this.h=this.pageRows*(this.cellHeight+this.gap)-this.gap+(items.length>this.capacity?uiMetrics().pager+16:0);}
 private fire(){if(this.items[this.index]?.disabled)return;this.ui.play(this.items[this.index]?.sound??'confirm');this.selected(this.index);}
 act(action:Action):boolean{if(action==='confirm'){this.fire();return true;}const delta:Partial<Record<Action,number>>={up:-this.columns,down:this.columns,left:-1,right:1};if(delta[action]!==undefined){this.selectIndex(this.index+delta[action]!);this.ui.play('cursor');return true;}return false;}
 point(phase:'down'|'move'|'up',x:number,y:number):void{const cell=this.cells.find(c=>x>=this.x+c.x&&x<=this.x+c.x+c.w&&y>=this.y+c.y&&y<=this.y+c.y+c.h);if(phase==='down'){this.pressed=cell?.index??-1;if(cell&&!cell.item.disabled)this.selectIndex(cell.index);}if(phase==='move'&&cell&&!cell.item.disabled)this.selectIndex(cell.index);if(phase==='up'){if(cell&&cell.index===this.pressed&&!cell.item.disabled){this.selectIndex(cell.index);this.fire();}else if(this.pages>1){const i=this.pageButtons.findIndex(b=>x>=this.x+b.x&&x<=this.x+b.x+b.w&&y>=this.y+b.y&&y<=this.y+b.y+b.h);if(i>=0){this.page=(this.page+(i?1:-1)+this.pages)%this.pages;this.selectIndex(this.page*this.capacity);}}this.pressed=-1;}}
 selectionPoint(){const c=this.cells.find(c=>c.index===this.index);return{x:this.x+(c?.x??0)+100,y:this.y+(c?.y??0)+this.cellHeight/2};}
 protected paint(ctx:CanvasRenderingContext2D):void{ctx.textBaseline='middle';for(const c of this.cells){const value=c.item.value??c.item.description;const active=this.focused&&this.index===c.index&&!c.item.disabled;const fill=ctx.createLinearGradient(c.x,0,c.x+c.w,0);fill.addColorStop(0,'#ffe27a');fill.addColorStop(.7,'#f2b300');fill.addColorStop(1,'#b58222');plate(ctx,c.x,c.y,c.w,c.h,'#122344','right');if(active){ctx.fillStyle=fill;ctx.fill();}ctx.strokeStyle=c.item.disabled?'#44516b':'#7096c8';ctx.lineWidth=2;ctx.stroke();ctx.textAlign='left';ctx.font=`700 ${uiMetrics().font}px ${FONT.body}`;ctx.fillStyle=active?'#0b1530':c.item.disabled?'#7d8ba5':COLOR.ink;ctx.fillText(c.item.label,c.x+18,c.y+c.h*(value&&c.item.badge ? .25 : (value||c.item.badge ? .36 : .5)),c.w-36);if(value||c.item.badge){ctx.font=`700 ${uiMetrics().small}px ${FONT.body}`;ctx.fillStyle=active?'#142344':COLOR.dim;const lines=[value,c.item.badge].filter(Boolean);lines.forEach((text,i)=>ctx.fillText(text!,c.x+18,c.y+c.h*(lines.length===2?.53+i*.27:.72),c.w-36));}}
 if(this.pages>1){const buttons=this.pageButtons;for(const b of buttons){plate(ctx,b.x,b.y,b.w,b.h,'#18284c','right');ctx.font=`700 18px ${FONT.body}`;ctx.textAlign='center';ctx.fillStyle=COLOR.ink;ctx.fillText(b.label,b.x+b.w/2,b.y+b.h/2);}ctx.textAlign='center';ctx.fillStyle=COLOR.gold;ctx.fillText(`${this.page*this.capacity+1}–${Math.min(this.items.length,(this.page+1)*this.capacity)} / ${this.items.length}`,this.w/2,buttons[0].y+buttons[0].h/2,116);}}
}
