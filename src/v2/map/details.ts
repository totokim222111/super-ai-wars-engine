import {Tooltip,spiritTip,statTip,type Tip,type Rect} from '../tooltip';
import {Screen} from '../screen';
import {Button,MenuList,hintBar} from '../kit';
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
  private helpIndex=-1;
  private weaponsPage=0;
  private pilotPage=0;
  private effectPage=0;
  private tooltip=new Tooltip();
  private zones:{rect:Rect;tip:Tip;weapon?:boolean}[]=[];
  private effectPages=1;
  private effectControls:Button[]=[];
  constructor(readonly data:UnitDetails,private readonly close:()=>void){super();}
  prepare(){return preloadImages([...portraitImages(this.data.portrait),this.data.mech.image]);}
  enter():void {
    const d=this.data,color={ally:COLOR.ally,enemy:COLOR.enemy,third:'#ffad4a',neutral:'#a8b4c8'}[d.unit.team];
    this.stage.ui.add(new Shape({},ctx=>{
      this.zones=[];
      const zone=(rect:Rect,name:string,id?:string,desc?:string,weapon=false)=>{if(d.known)this.zones.push({rect,tip:desc?{title:name,lines:[desc]}:statTip(id??d.tips?.stats[name]?.id??name,name,d.tips?.stats[name]?.desc?{[id??d.tips.stats[name].id]:d.tips.stats[name].desc!}:{}),weapon});};
      const text=(s:string,x:number,y:number,size=18,width=500,color=COLOR.ink)=>{ctx.font=`700 ${size}px ${FONT.body}`;ctx.textAlign='left';ctx.textBaseline='top';ctx.fillStyle=color;ctx.fillText(displayTerms(s),x,y,width);};
      ctx.fillStyle='#050b1b';ctx.fillRect(0,0,1280,720);
      plate(ctx,22,20,510,42,color,'right');
      text(d.unit.name,38,29,24,460);text({ally:'아군',enemy:'적',third:'제3세력',neutral:'중립'}[d.unit.team],930,29,21,120,color);
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
      text(d.unit.name,662,98,24,575);
      const bar=(name:string,value:number,max:number,y:number,en=false)=>{
        text(name,662,y,16,100,en?'#7fe9f7':COLOR.gold);text(d.known?`${value} / ${max}`:'???',780,y,18,260);
        if(d.known)gauge(ctx,662,y+24,310,12,value,value,max,en?EN_TONES:hpTones(max?value/max:0));
      };
      bar('HP',d.mech.hp,d.mech.hpMax,136);bar(term('en'),d.mech.en,d.mech.enMax,184,true);
      d.mech.stats.forEach(([name,v],i)=>{const x=662+i%2*160,y=235+Math.floor(i/2)*21;text(`${name} ${v}`,x,y,15,155);zone({x,y,w:155,h:21},name);});
      zone({x:662,y:136,w:310,h:43},'HP','hp');zone({x:662,y:184,w:310,h:43},term('en'),'en');zone({x:662,y:325,w:100,h:22},'크기','size');zone({x:770,y:325,w:480,h:22},'지형 적성','adapt');zone({x:232,y:137,w:375,h:25},term('morale'),'morale');zone({x:232,y:163,w:375,h:25},term('sp'),'sp');
      if(d.mech.upgrades)text('개조 · '+d.mech.upgrades.map(([name,value])=>`${name} ${value}`).join(' · '),662,300,13,360,COLOR.dim);
      text(`크기 ${d.mech.size} · ${d.mech.adapt}`,662,325,14,575,COLOR.dim);
      const effectLines=d.effects.flatMap(s=>{ctx.font=`700 15px ${FONT.body}`;return wrap(ctx,displayTerms(s),560);});
      this.effectPages=Math.max(1,Math.ceil(effectLines.length/3));for(const b of this.effectControls)b.visible=this.effectPages>1;
      effectLines.slice(this.effectPage*3,this.effectPage*3+3).forEach((s,i)=>text(s,662,351+i*18,15,560));
      text(`효과 ${this.effectPage+1}/${Math.max(1,Math.ceil(effectLines.length/3))}`,662,412,13,220,COLOR.dim);
      panel(ctx,22,459,1236,207,color);
      const xs=[38,365,445,530,615,705,950],widths=[312,70,76,76,76,230,292];
      ['무기','위력','사거리','명중','크리티컬',`${term('en')} · 탄수`,'특성'].forEach((s,i)=>text(s,xs[i],474,15,widths[i],COLOR.gold));
      d.weapons.slice(this.weaponsPage*3,this.weaponsPage*3+3).forEach((w,row)=>{
        const y=502+row*42;ctx.fillStyle=row%2?'rgba(255,255,255,.02)':'rgba(255,255,255,.06)';ctx.fillRect(32,y-2,1210,40);
        if(d.known)this.zones.push({rect:{x:950,y:y-2,w:292,h:40},tip:{title:w.name+' · 특성',lines:weaponTraitTips(w.traits)},weapon:true});
        if(w.reason){ctx.font=`700 12px ${FONT.body}`;const bw=Math.min(120,ctx.measureText(w.reason).width+18);plate(ctx,350-bw,y+4,bw,26,'#243252','right');text(w.reason,358-bw,y+10,12,bw-16,COLOR.gold);}
        [w.name,w.power,w.range,w.hit,w.critical,w.cost,w.traits].forEach((s,i)=>{let size=i===0?16:14;ctx.font=`700 ${size}px ${FONT.body}`;const width=i===0&&w.reason?widths[i]-130:widths[i];while(size>11&&ctx.measureText(displayTerms(s)).width>width)ctx.font=`700 ${--size}px ${FONT.body}`;text(s,xs[i],y+8,size,width);});
      });
      text(`무기 ${this.weaponsPage+1}/${Math.max(1,Math.ceil(d.weapons.length/3))}`,38,641,14,350,COLOR.dim);
      if(!d.known)text(term('scanHint'),550,641,15,685,COLOR.gold);
    }));
    if(d.mech.image){const sprite=new Sprite(d.mech.image,190).trimToContent();sprite.height=Math.min(190,190*180/Math.max(1,sprite.width));Object.assign(sprite,{x:1138,y:237,flipX:d.mech.faces==='right'});this.stage.ui.add(sprite);}
    const pager=(label:string,x:number,y:number,run:()=>void,w=48)=>this.ui.add(Object.assign(new Button(label,run,{w,h:26}),{x,y,canFocus:false}));
    this.stage.ui.add(this.tooltip);
    const perPage=Math.max(1,Math.min(4,Math.floor((400-Math.max(294,194+Math.ceil(d.pilotStats.length/2)*23+34))/24)));
    const pilotCount=d.skills.length+d.spirits.length;
    if(pilotCount>perPage){pager('◀',508,407,()=>{this.pilotPage=(this.pilotPage+Math.ceil(pilotCount/perPage)-1)%Math.ceil(pilotCount/perPage);});pager('▶',568,407,()=>{this.pilotPage=(this.pilotPage+1)%Math.ceil(pilotCount/perPage);});}
    // Line wrapping may depend on the font; effects pagination uses the rendered text lines.
    if(d.effects.length){this.effectControls.push(pager('◀',1138,407,()=>{this.effectPage=Math.max(0,this.effectPage-1);}));this.effectControls.push(pager('▶',1198,407,()=>{this.effectPage=(this.effectPage+1)%this.effectPages;}));}
    if(d.weapons.length>3){pager('◀ 이전',1025,630,()=>{this.weaponsPage=(this.weaponsPage+Math.ceil(d.weapons.length/3)-1)%Math.ceil(d.weapons.length/3);},100);pager('다음 ▶',1138,630,()=>{this.weaponsPage=(this.weaponsPage+1)%Math.ceil(d.weapons.length/3);},100);}
    this.ui.setNavigation({kind:'close',bounds:{x:22,y:0,w:1136,h:656},onBack:this.close});this.stage.ui.add(hintBar('항목을 누르면 설명 · ✕ 닫기 / Esc 뒤로 · ↑↓ 무기 쪽 넘기기'));
  }
  input(event: InputEvent): void {

        if (event.kind === 'action' && event.action === 'menu' && this.zones.length) {
            this.helpIndex = (this.helpIndex + 1) % this.zones.length;
            const z = this.zones[this.helpIndex];
            this.tooltip.show(z.tip);
            Object.assign(this.tooltip, { x: z.weapon ? 662 : 38, y: z.weapon ? 90 : 460, w: z.weapon ? 560 : 580 });
            return;
        }
        if (event.kind === 'action' && (event.key === 'q' || event.key === 'e')) {
            this.pilotPage = Math.max(0, this.pilotPage + (event.key === 'q' ? -1 : 1));
            this.effectPage = Math.max(0, Math.min(this.effectPages - 1, this.effectPage + (event.key === 'q' ? -1 : 1)));
            return;
        }
        if (event.kind === 'action' && (event.action === 'up' || event.action === 'down')) {
            const pages = Math.max(1, Math.ceil(this.data.weapons.length / 3));
            this.weaponsPage = (this.weaponsPage + (event.action === 'up' ? -1 : 1) + pages) % pages;
            return;
        }
        if (event.kind === 'pointer' && (event.phase === 'down' || event.phase === 'move')) {
            const z = this.zones.find(z => event.x >= z.rect.x && event.x <= z.rect.x + z.rect.w && event.y >= z.rect.y && event.y <= z.rect.y + z.rect.h);
            if (z) {
                this.tooltip.show(z.tip);
                Object.assign(this.tooltip, { x: z.weapon ? 662 : 38, y: z.weapon ? 90 : 460, w: z.weapon ? 560 : 580 });
            }
            else if (event.phase === 'down')
                this.tooltip.hide();
        }
        this.ui.input(event);
    }
}

export class RosterScreen extends Screen {
  private outsideDown=false;
  constructor(private readonly model:MapModel,private readonly close:()=>void){super();}
  enter():void {
    this.stage.ui.add(new Shape({},ctx=>{ctx.fillStyle='#050b1b';ctx.fillRect(0,0,1280,720);panel(ctx,170,100,940,520);ctx.font=`700 28px ${FONT.body}`;ctx.fillStyle=COLOR.gold;ctx.fillText('부대 현황',210,142);}));
    const units=this.model.units().filter(u=>u.team==='ally');
    this.ui.add(Object.assign(new MenuList(units.map(u=>({label:u.name,description:`${u.pilot} · ${u.acted?'행동 완료':'행동 전'}`,labelSize:23})),index=>{const data=this.model.details?.(units[index].id);if(data)this.app.push(new UnitDetailsScreen(data,()=>this.app.pop('none')),'none');},{w:860,rows:5,rowHeight:67,tap:'choose'}),{x:210,y:208}));
    this.ui.setNavigation({kind:'close',bounds:{x:170,y:100,w:940,h:520},onBack:this.close});this.stage.ui.add(hintBar('유닛을 고르면 능력 보기 · Esc 뒤로'));
  }
  input(event:InputEvent):void {const handled=this.ui.input(event);if(event.kind==='pointer'){if(event.phase==='down')this.outsideDown=!handled;if(event.phase==='up'){if(this.outsideDown&&!handled)this.close();this.outsideDown=false;}}}
}
