import {largeUi,readable} from '../presentation';
import {GridMenu} from '../grid-menu';
import {Tooltip,spiritTip,statTip,type Tip,type Rect} from '../tooltip';
import {Screen} from '../screen';
import {Button,MenuList,Tabs,label,hintBar,windowFrame} from '../kit';
import {Shape,Sprite} from '../stage';
import {panel,plate,gauge,hpTones,EN_TONES,FONT,COLOR,wrap,drawPortrait} from '../ui';
import {faceOf,portraitImages} from '../portrait';
import {preloadImages} from '../pack/images';
import {term,displayTerms} from '../terms';
import type {InputEvent} from '../input';
import type {UnitDetails,MapModel} from './model';

export function weaponTraitTips(traits:string):string[]{return traits.split(' · ').map(t=>{const custom=term('desc.trait.'+t);if(custom==='desc.trait.'+t){const adapt=/^(공중|지상|수중|우주) ([SABCD])$/.exec(t);if(adapt)return `${adapt[1]}에서 적성 ${adapt[2]}에 따라 명중·피해를 보정합니다.`;if(t.startsWith(term('morale')+' '))return t+' 이상에서 사용할 수 있습니다.';}return custom!=='desc.trait.'+t?custom:({격투:'격투 능력으로 피해를 계산합니다.',사격:'사격 능력으로 피해를 계산합니다.',빔:'빔 계열 무기입니다.',미사일:'미사일 계열 무기입니다.','이동 후 가능':'이동한 뒤에도 사용할 수 있습니다.','이동 전':'이동하기 전에만 사용할 수 있습니다.','맵 병기':'범위 안 여러 기체를 공격합니다.'} as Record<string,string>)[t]??t;});}

/** Read-only dossier. Unknown enemy data is masked by the adapter, before drawing. */
export class UnitDetailsScreen extends Screen {
  private weaponsPage=0;
  private pilotPage=0;
  private effectPage=0;private helpIndex=-1;
  private tooltip=new Tooltip();
  private zones:{rect:Rect;tip:Tip;weapon?:boolean}[]=[];
  private effectPages=1;private largeTabs?:Tabs;private largeGrid?:GridMenu;
  private effectControls:Button[]=[];
  constructor(readonly data:UnitDetails,private readonly close:()=>void){super();}
  prepare(){return preloadImages([...portraitImages(this.data.portrait),this.data.mech.image]);}
  enter():void {
    this.responsiveMenu();this.largeTabs=undefined;this.largeGrid=undefined;if(largeUi()){this.enterLarge();return;}
    const d=this.data,color={ally:COLOR.ally,enemy:COLOR.enemy,third:'#ffad4a',neutral:'#a8b4c8'}[d.unit.team];
    this.stage.ui.add(new Shape({},ctx=>{
      this.zones=[];
      const zone=(rect:Rect,name:string,id?:string,desc?:string,weapon=false)=>{if(d.known)this.zones.push({rect,tip:desc?{title:name,lines:[desc]}:statTip(id??d.tips?.stats[name]?.id??name,name,d.tips?.stats[name]?.desc?{[id??d.tips.stats[name].id]:d.tips.stats[name].desc!}:{}),weapon});};
      const text=(s:string,x:number,y:number,size=18,width=500,color=COLOR.ink)=>{ctx.font=`700 ${readable(size)}px ${FONT.body}`;ctx.textAlign='left';ctx.textBaseline='top';ctx.fillStyle=color;ctx.fillText(displayTerms(s),x,y,width);};
      ctx.fillStyle='#050b1b';ctx.fillRect(0,0,1280,720);
      plate(ctx,22,20,510,42,color,'right');
      text(d.unit.pilot+' · '+d.unit.name,38,29,24,850);text({ally:'아군',enemy:'적',third:'제3세력',neutral:'중립'}[d.unit.team],930,29,21,120,color);
      panel(ctx,22,82,608,358,color);panel(ctx,646,82,612,358,color);
      const image=faceOf(d.portrait,'default');
      if(image?.naturalWidth){const ratio=image.naturalWidth/image.naturalHeight,w=Math.min(178,268*ratio),h=w/ratio;drawPortrait(ctx,d.portrait,'default',d.portrait.crop,38+(178-w)/2,143+(268-h)/2,w,h);}
      text(d.unit.pilot,232,98,25,375);text(`Lv ${d.level} · ${term('morale')} ${d.morale}`,232,137,17,375);text(`${term('sp')} ${d.sp} / ${d.spMax}`,232,163,17,375);
      d.pilotStats.forEach(([name,v],i)=>{const x=232+i%2*190,y=194+Math.floor(i/2)*23;text(`${name} ${v}`,x,y,17,180);zone({x,y,w:180,h:23},name);});
      const pilotBottom=194+Math.ceil(d.pilotStats.length/2)*23;
      const listTop=Math.max(294,pilotBottom+34),pilotRowsPerPage=Math.max(1,Math.min(4,Math.floor((400-listTop)/24)));
      text(d.pilotAdapt,232,pilotBottom+4,14,380,COLOR.dim);zone({x:232,y:pilotBottom+4,w:380,h:22},'지형 적성','adapt');
      const pilotRows=[...d.skills.map(name=>`기술 · ${name}`),...d.spirits.map(s=>`${s.name} · ${term('sp')} ${s.cost} · ${d.known?(s.usable?'사용 가능':'사용 불가'):'???'}`)];
      pilotRows.slice(this.pilotPage*pilotRowsPerPage,this.pilotPage*pilotRowsPerPage+pilotRowsPerPage).forEach((s,i)=>{const index=this.pilotPage*pilotRowsPerPage+i,y=listTop+i*24;text(s,232,y,16,375);const spirit=d.tips?.spirits[index-d.skills.length];if(d.known)this.zones.push({rect:{x:232,y,w:375,h:24},tip:spirit?spiritTip(spirit):{title:d.skills[index],lines:[d.tips?.skills[index]??'']}});});
      text(`기술·정신기 ${this.pilotPage+1}/${Math.max(1,Math.ceil(pilotRows.length/pilotRowsPerPage))}`,232,412,13,250,COLOR.dim);
      text('기체 능력',662,98,24,575);
      const bar=(name:string,value:number,max:number,y:number,en=false)=>{
        text(name,662,y,16,100,en?'#7fe9f7':COLOR.gold);text(d.known?`${value} / ${max}`:'???',780,y,18,260);
        if(d.known)gauge(ctx,662,y+24,310,12,value,value,max,en?EN_TONES:hpTones(max?value/max:0));
      };
      bar('HP',d.mech.hp,d.mech.hpMax,136);bar(term('en'),d.mech.en,d.mech.enMax,184,true);
      d.mech.stats.forEach(([name,v],i)=>{const x=662+i%2*160,y=235+Math.floor(i/2)*21;text(`${name} ${v}`,x,y,15,155);zone({x,y,w:155,h:21},name);});
      zone({x:662,y:136,w:310,h:43},'HP','hp');zone({x:662,y:184,w:310,h:43},term('en'),'en');zone({x:662,y:325,w:100,h:22},'크기','size');zone({x:770,y:325,w:480,h:22},'지형 적성','adapt');zone({x:232,y:137,w:375,h:25},term('morale'),'morale');zone({x:232,y:163,w:375,h:25},term('sp'),'sp');
      if(d.mech.upgrades)text('개조 · '+d.mech.upgrades.map(([name,value])=>`${name} ${value}`).join(' · '),662,300,13,360,COLOR.dim);
      text(`크기 ${d.mech.size} · ${d.mech.adapt}`,662,325,14,575,COLOR.dim);
      const effectLines=d.effects.flatMap(s=>{ctx.font=`700 ${readable(15)}px ${FONT.body}`;return wrap(ctx,displayTerms(s),560);});
      this.effectPages=Math.max(1,Math.ceil(effectLines.length/3));for(const b of this.effectControls)b.visible=this.effectPages>1;
      effectLines.slice(this.effectPage*3,this.effectPage*3+3).forEach((s,i)=>text(s,662,351+i*18,15,560));
      text(`효과 ${this.effectPage+1}/${Math.max(1,Math.ceil(effectLines.length/3))}`,662,412,13,220,COLOR.dim);
      panel(ctx,22,459,1236,207,color);
      const xs=[38,365,445,530,615,705,950],widths=[312,70,76,76,76,230,292];
      ['무기','위력','사거리','명중','크리티컬',`${term('en')} · 탄수`,'특성'].forEach((s,i)=>text(s,xs[i],474,15,widths[i],COLOR.gold));
      d.weapons.slice(this.weaponsPage*2,this.weaponsPage*2+2).forEach((w,row)=>{
        const y=502+row*42;ctx.fillStyle=row%2?'rgba(255,255,255,.02)':'rgba(255,255,255,.06)';ctx.fillRect(32,y-2,1210,40);
        if(d.known)this.zones.push({rect:{x:950,y:y-2,w:292,h:40},tip:{title:w.name+' · 특성',lines:weaponTraitTips(w.traits)},weapon:true});
        if(w.reason){ctx.font=`700 ${readable(12)}px ${FONT.body}`;const bw=Math.min(120,ctx.measureText(w.reason).width+18);plate(ctx,350-bw,y+4,bw,26,'#243252','right');text(w.reason,358-bw,y+10,12,bw-16,COLOR.gold);}
        [w.name,w.power,w.range,w.hit,w.critical,w.cost,w.traits].forEach((s,i)=>{let size=i===0?16:14;ctx.font=`700 ${readable(size)}px ${FONT.body}`;const width=i===0&&w.reason?widths[i]-130:widths[i];while(size>14&&ctx.measureText(displayTerms(s)).width>width)ctx.font=`700 ${--size}px ${FONT.body}`;text(s,xs[i],y+8,size,width);});
      });
      text(`무기 ${this.weaponsPage+1}/${Math.max(1,Math.ceil(d.weapons.length/2))}`,38,641,14,350,COLOR.dim);
      if(!d.known)text(term('scanHint'),550,641,15,685,COLOR.gold);
    }));
    if(d.mech.image){const sprite=new Sprite(d.mech.image,190).trimToContent();sprite.height=Math.min(190,190*180/Math.max(1,sprite.width));Object.assign(sprite,{x:1138,y:237,flipX:d.mech.faces==='right'});this.stage.ui.add(sprite);}
    const pager=(label:string,x:number,y:number,run:()=>void,w=48)=>this.ui.add(Object.assign(new Button(label,run,{w,h:40}),{x,y,canFocus:true}));
    this.stage.ui.add(this.tooltip);
    const perPage=Math.max(1,Math.min(4,Math.floor((400-Math.max(294,194+Math.ceil(d.pilotStats.length/2)*23+34))/24)));
    const pilotCount=d.skills.length+d.spirits.length;
    if(pilotCount>perPage){pager('◀',508,407,()=>{this.pilotPage=(this.pilotPage+Math.ceil(pilotCount/perPage)-1)%Math.ceil(pilotCount/perPage);});pager('▶',568,407,()=>{this.pilotPage=(this.pilotPage+1)%Math.ceil(pilotCount/perPage);});}
    // Line wrapping may depend on the font; effects pagination uses the rendered text lines.
    if(d.effects.length){this.effectControls.push(pager('◀',1138,407,()=>{this.effectPage=Math.max(0,this.effectPage-1);}));this.effectControls.push(pager('▶',1198,407,()=>{this.effectPage=(this.effectPage+1)%this.effectPages;}));}
    if(d.weapons.length>2){pager('◀ 이전',820,630,()=>{this.weaponsPage=(this.weaponsPage+Math.ceil(d.weapons.length/2)-1)%Math.ceil(d.weapons.length/2);},100);pager('다음 ▶',930,630,()=>{this.weaponsPage=(this.weaponsPage+1)%Math.ceil(d.weapons.length/2);},100);}
    this.ui.setNavigation({kind:'back',bounds:{x:22,y:0,w:1236,h:720},onBack:this.close});this.stage.ui.add(hintBar('Tab 항목 설명 · Q/E 기술·효과 · ↑↓ 무기 · Esc 뒤로'));
  }
  private enterLarge():void{
    const d=this.data;this.stage.ui.add(new Shape({},ctx=>{ctx.fillStyle='#050b1b';ctx.fillRect(0,0,1280,720);ctx.fillStyle=COLOR.gold;ctx.fillRect(40,70,80,3);ctx.font=`900 ${readable(30)}px ${FONT.body}`;ctx.fillStyle=COLOR.ink;ctx.textBaseline='top';ctx.fillText(`${d.unit.pilot} · ${d.unit.name}`,40,28,1160);}));
    const art=this.stage.ui.add(new Sprite(faceOf(d.portrait,'default'),300).trimToContent());Object.assign(art,{x:165,y:390});
    const summary=this.stage.ui.add(Object.assign(label('',24,{width:830,weight:900}),{x:340,y:212}));
    const tip=this.tooltip;this.stage.ui.add(tip);
    const render=(tab:number)=>{
      tip.hide();if(this.largeGrid)this.ui.remove(this.largeGrid);
      let entries:{label:string;value?:string;tip:Tip}[]=[];
      if(tab===0){art.image=faceOf(d.portrait,'default');art.height=300;summary.state.text=`Lv ${d.level} · ${term('morale')} ${d.morale} · ${term('sp')} ${d.sp}/${d.spMax}`;
        entries=[...d.pilotStats.map(([label,value])=>({label,value,tip:statTip(d.tips?.stats[label]?.id??label,label,d.tips?.stats[label]?.desc?{[d.tips.stats[label].id]:d.tips.stats[label].desc!}:{})})),{label:'지형 적성',value:d.pilotAdapt,tip:statTip('adapt','지형 적성')},...d.skills.map((name,i)=>({label:name,value:'특수기술',tip:{title:name,lines:[d.tips?.skills[i]??'???']}})),...d.spirits.map((sp,i)=>({label:sp.name,value:`${term('sp')} ${sp.cost} · ${sp.usable?'사용 가능':'사용 불가'}`,tip:d.tips?.spirits[i]?spiritTip(d.tips.spirits[i]):{title:sp.name,lines:['???']}}))];
      }else if(tab===1){art.image=d.mech.image;art.height=260;summary.state.text=`HP ${d.known?d.mech.hp+' / '+d.mech.hpMax:'???'} · ${term('en')} ${d.known?d.mech.en+' / '+d.mech.enMax:'???'}`;
        entries=[...d.mech.stats.map(([label,value])=>({label,value,tip:statTip(d.tips?.stats[label]?.id??label,label)})),{label:'크기',value:d.mech.size,tip:statTip('size','크기')},{label:'지형 적성',value:d.mech.adapt,tip:statTip('adapt','지형 적성')},...(d.mech.upgrades??[]).map(([label,value])=>({label:'개조 · '+label,value,tip:{title:label,lines:[value]}}))];
      }else if(tab===2){art.visible=false;summary.state.text='';entries=d.weapons.map(w=>({label:w.name,value:`위력 ${w.power} · 사거리 ${w.range} · ${w.hit==='0'?'':(w.hit+' · ')}크리 ${w.critical} · ${w.cost}`,tip:{title:w.name,lines:[...(w.reason?[w.reason]:[]),...weaponTraitTips(w.traits)]}}));
      }else{art.image=d.mech.image;art.height=260;summary.state.text='걸린 효과 · 장착 플러그인';entries=d.effects.map(label=>({label,tip:{title:label,lines:[label]}}));if(!entries.length)entries=[{label:'걸린 효과 없음',tip:{title:'걸린 효과 없음',lines:[]}}];}
      art.visible=tab!==2;
      const grid=new GridMenu(entries.map(e=>({label:e.label,value:e.value})),i=>{if(!d.known)return;tip.show(entries[i].tip,grid);},{w:tab===2?1160:870,columns:tab===2?1:3,rows:tab===2?3:2,height:84});Object.assign(grid,{x:tab===2?60:340,y:tab===2?218:284});this.largeGrid=this.ui.add(grid);
      if(!d.known)summary.state.text=term('scanHint');
    };
    this.largeTabs=this.ui.add(Object.assign(new Tabs(['파일럿','기체','무기','효과'],render,{w:1160,h:84}),{x:60,y:104}));render(0);this.ui.focusOn(this.largeTabs,true);
    this.ui.setNavigation({kind:'back',bounds:{x:0,y:0,w:1280,h:720},onBack:this.close});
  }
  input(event:InputEvent):void {
    if(this.largeTabs){if(event.kind==='action'&&(event.key==='q'||event.key==='e')){this.largeTabs.act(event.key==='q'?'left':'right');return;}this.ui.input(event);return;}
    if(event.kind==='action'&&event.action==='menu'&&this.zones.length){this.helpIndex=(this.helpIndex+1)%this.zones.length;const z=this.zones[this.helpIndex];this.tooltip.show(z.tip);Object.assign(this.tooltip,{x:z.weapon?662:38,y:z.weapon?90:460,w:z.weapon?560:580});return;}
    if(event.kind==='action'&&(event.key==='q'||event.key==='e')){this.pilotPage=Math.max(0,this.pilotPage+(event.key==='q'?-1:1));this.effectPage=Math.max(0,Math.min(this.effectPages-1,this.effectPage+(event.key==='q'?-1:1)));return;}
    if(event.kind==='action'&&(event.action==='up'||event.action==='down')){const pages=Math.max(1,Math.ceil(this.data.weapons.length/2));this.weaponsPage=(this.weaponsPage+(event.action==='up'?-1:1)+pages)%pages;return;}
    if(event.kind==='pointer'&&(event.phase==='down'||event.phase==='move')){const z=this.zones.find(z=>event.x>=z.rect.x&&event.x<=z.rect.x+z.rect.w&&event.y>=z.rect.y&&event.y<=z.rect.y+z.rect.h);if(z){this.tooltip.show(z.tip);Object.assign(this.tooltip,{x:z.weapon?662:38,y:z.weapon?90:460,w:z.weapon?560:580});}else if(event.phase==='down')this.tooltip.hide();}
    this.ui.input(event);
  }
}

export class RosterScreen extends Screen{
 opaque=false;private outsideDown=false;
 constructor(private readonly model:MapModel,private readonly close:()=>void,private readonly selected?:(id:string)=>void){super();}
 enter():void{
  this.stage.ui.add(Object.assign(windowFrame('부대 현황',1120,600,{inside:true}),{x:80,y:80,z:1}));this.stage.ui.add(new Shape({},ctx=>{ctx.fillStyle='rgba(2,6,18,.62)';ctx.fillRect(0,0,1280,720);panel(ctx,80,80,1120,600);}));
  const units=this.model.units().filter(u=>u.team==='ally');
  const list=this.ui.add(Object.assign(new MenuList(units.map(u=>({label:`${u.name} · Lv ${u.level??'—'}`,description:`${u.pilot} · ${u.acted?'행동 완료':'행동 전'}`,value:`HP ${u.hp}/${u.hpMax} · ${term('en')} ${u.en}/${u.enMax}`,labelSize:24,valueSize:21})),i=>{if(this.selected){this.selected(units[i].id);return;}const d=this.model.details?.(units[i].id);if(d)this.app.push(new UnitDetailsScreen(d,()=>this.app.pop('none')),'none');},{w:1040,rows:4,rowHeight:100,maxHeight:430,tap:'choose'}),{x:120,y:194}));
  const bars=this.stage.ui.add(new Shape({},ctx=>{const top=(list as unknown as {top:number}).top??0,pager=(list as unknown as {pager:number}).pager??0;units.slice(top,top+4).forEach((u,i)=>{const y=list.y+10+pager+i*100+78;if(y>610)return;gauge(ctx,670,y,180,8,u.hp,u.hp,u.hpMax,hpTones(u.hp/u.hpMax));gauge(ctx,880,y,180,8,u.en,u.en,u.enMax,EN_TONES);});}));bars.z=5;
  this.ui.setNavigation({kind:'close',bounds:{x:80,y:80,w:1120,h:600},onBack:this.close});
 }
 input(event:InputEvent):void{const handled=this.ui.input(event);if(event.kind==='pointer'){if(event.phase==='down')this.outsideDown=!handled;if(event.phase==='up'){if(this.outsideDown&&!handled)this.close();this.outsideDown=false;}}}
}
