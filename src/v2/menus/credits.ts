import {preloadImages} from '../pack/images';
import {Button,MenuList} from '../kit';
import {Screen} from '../screen';
import {Shape} from '../stage';
import {FONT,COLOR,wrap,panel} from '../ui';
import {largeUi,uiMetrics} from '../presentation';
import {menuFrame} from './screens';
import type {MenuModel} from './model';
import {at,type MenuLook} from './common';
export interface DisplayCredit{group:string;title:string;author:string;license:string;source:string;licenseUrl?:string}
export function displayCredits(sounds:{kind:string;title:string;author:string;credit?:string;license:string;source:string;licenseUrl?:string}[],project:{title:string;detail:string}[]):DisplayCredit[]{
 return [...sounds.map(c=>({group:c.kind==='bgm'?'음악':'효과음',title:c.title,author:c.credit??c.author,license:c.license,source:c.source,licenseUrl:c.licenseUrl})),...project.map(c=>({group:'그림·글꼴·프로젝트',title:c.title,author:c.detail,license:'',source:''}))];
}
export class CreditsScreen extends Screen{
 private page=0;private total=1;private previous?:Button;private next?:Button;
 constructor(private readonly model:MenuModel,private readonly look:MenuLook={},private readonly done?:()=>void){super();}
 prepare():Promise<void>{return Promise.all([preloadImages([this.look.background]),this.app.sound.ready?.()]).then(()=>undefined);}
 enter():void{menuFrame(this,{title:'크레딧',navigation:'close',hint:'휠·↑↓ 쪽 넘기기 · Esc 닫기',background:this.look.background,onBack:()=>this.done?this.done():this.app.pop()});
 const items=displayCredits(this.app.sound.credits(),this.model.credits()),per=largeUi()?8:10;this.total=Math.max(1,Math.ceil(items.length/per));
 this.stage.ui.add(new Shape({},ctx=>{ctx.fillStyle='#071125';ctx.fillRect(56,138,1168,472);ctx.textBaseline='top';ctx.textAlign='left';const rows=items.slice(this.page*per,(this.page+1)*per);rows.forEach((c,i)=>{const y=145+i*(largeUi()?56:46);ctx.font=`700 ${largeUi()?24:20}px ${FONT.body}`;ctx.fillStyle=COLOR.ink;ctx.fillText(c.title,78,y,440);ctx.font=`700 ${largeUi()?21:14}px ${FONT.body}`;ctx.fillStyle=COLOR.dim;let source=c.source;try{source=new URL(c.source).hostname;}catch{}ctx.fillText([c.author,c.license,source].filter(Boolean).join(' · '),540,y+3,650);});ctx.font=`700 21px ${FONT.body}`;ctx.fillStyle=COLOR.dim;ctx.fillText(`${this.page+1}/${this.total} · 전체 라이선스는 출처·라이선스에서`,540,580,650);}));
 const move=(n:number)=>{this.page=Math.max(0,Math.min(this.total-1,this.page+n));if(this.previous)this.previous.enabled=this.page>0;if(this.next)this.next.enabled=this.page<this.total-1;};
 this.previous=this.ui.add(at(new Button('▲ 이전',()=>move(-1),{w:260,h:uiMetrics().button}),56,620));this.next=this.ui.add(at(new Button('다음 ▼',()=>move(1),{w:260,h:uiMetrics().button}),350,620));
 this.ui.add(at(new Button('출처·라이선스',()=>this.app.push(new CreditSourcesScreen(items)),{w:320,h:uiMetrics().button}),650,620));move(0);if(this.next.enabled)this.ui.focusOn(this.next,true);
 }
 input(e:import('../input').InputEvent):void{if(e.kind==='action'&&(e.action==='up'||e.action==='down')){this.page=Math.max(0,Math.min(this.total-1,this.page+(e.action==='up'?-1:1)));if(this.previous)this.previous.enabled=this.page>0;if(this.next)this.next.enabled=this.page<this.total-1;return;}super.input(e);}
}

/** Full source URLs remain reachable without crowding the overview. */
export class CreditSourcesScreen extends Screen{
 constructor(private readonly entries:DisplayCredit[]){super();}
 enter():void{menuFrame(this,{title:'출처·라이선스',navigation:'back',hint:'↑↓ 선택 · Enter 결정 · Esc 뒤로',onBack:()=>this.app.pop()});const rows=this.entries.filter(e=>e.source),current={index:0};let license:Button|undefined;const select=(i:number)=>{current.index=i;if(license)license.enabled=!!rows[i]?.licenseUrl;};
 this.ui.add(at(new MenuList(rows.map(e=>({label:e.title,labelSize:24})),select,{w:500,rows:4,rowHeight:84,maxHeight:450,onMove:select}),40,150));
 this.stage.ui.add(new Shape({},ctx=>{panel(ctx,570,150,670,460);const row=rows[current.index];if(!row)return;ctx.fillStyle=COLOR.ink;ctx.font=`700 24px ${FONT.body}`;ctx.textAlign='left';ctx.textBaseline='top';let y=178;for(const value of[row.title,row.author,row.license,row.source,row.licenseUrl??'']){for(const line of wrap(ctx,value,620)){if(y>500)break;ctx.fillText(line,594,y,620);y+=31;}y+=10;}}));
 const link=(license=false)=>{const row=rows[current.index],url=license?row?.licenseUrl:row?.source;if(url&&/^https?:\/\//.test(url))globalThis.open?.(url,'_blank','noopener,noreferrer');};
 this.ui.add(at(new Button('출처 열기',()=>link(),{w:260,h:uiMetrics().button}),580,524));license=this.ui.add(at(new Button('라이선스 열기',()=>link(true),{w:260,h:uiMetrics().button}),880,524));license.enabled=!!rows[0]?.licenseUrl;
 }
}
