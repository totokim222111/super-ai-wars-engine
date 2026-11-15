import {Screen} from '../screen';
import {Sprite,H,W} from '../stage';
import {cover,COLOR} from '../ui';
import {label,MenuList,hintBar,toast} from '../kit';
import {preloadImages} from '../pack/images';
import type {Sample} from './sample';
const HOME_MENU: { label: string; about: string }[] = [
  {label:'어셋 도감',about:'인물·표정 묶음·기체·말·기준점과 빠진 그림을 확인합니다.'},
  {label:'대본 틀어 보기',about:'팩의 화·장면과 플레이어 타입을 골라 재생합니다.'},
  {label:'팩 검사 결과',about:'그림·표정·기준점·무기 연출의 할 일 목록입니다.'},
  {label:'기준점 보기',about:'기체 그림 위의 총구·몸통·손 위치를 확인합니다.'},
  { label: '게임 한 바퀴', about: '실제 캠페인으로 새 게임·전투·인터미션·2화를 잇습니다.' },
  { label: '시범 전체 보기', about: '대화 → 등장 삽화 → 전투 두 번을 이어서 봅니다.' },
  { label: '맵(실제 규칙)', about: '현재 팩의 화와 견본을 실제 규칙으로 엽니다.' },
  { label: '맵', about: '기체를 고르고, 움직이고, 공격하고, 턴을 넘깁니다. 규칙은 흉내 낸 것입니다.' },
  { label: '대화 연출', about: '지문 없이 배경, 인물, 표정, 화면 효과로만 진행되는 대화 장면입니다.' },
  { label: '무기 연출 틀', about: '무기 연출의 틀을 하나씩 틀어 봅니다. 무기는 틀과 값만 골라 씁니다.' },
  { label: '전투 상황', about: '명중, 빗나감, 크리티컬, 방어, 격파, 적의 공격, 반격, 원호 방어.' },
  { label: '정신기', about: '정신기를 썼을 때 기체에 걸리는 효과입니다.' },
  { label: '효과 부품', about: '베기, 타격, 폭발 같은 효과를 하나씩 눌러 봅니다.' },
  { label: 'UI 부품', about: '버튼, 메뉴, 탭, 창, 게이지, 확인창, 알림. 모든 메뉴 화면의 재료입니다.' },
  { label: '표정', about: '인물별 표정 그림을 갈아 끼워 봅니다.' },
  { label: '소리', about: '효과음과 음악을 들어 봅니다.' },
  { label: '타이틀 화면', about: '게임을 켰을 때 처음 보는 화면입니다.' },
  { label: '인터미션 · 개조', about: '화와 화 사이의 준비 화면입니다. 기체 개조까지 들어가 볼 수 있습니다.' },
];

export class HomeScreen extends Screen {
  music=null;
  constructor(private readonly sample:Pick<Sample,'images'>&{pack?:Sample['pack'];title?:string;background?:string;character?:string},private readonly open?:(index:number)=>void){super();}
  prepare():Promise<void>|void{const sample=this.sample;return preloadImages([sample.images[sample.background??sample.pack?.game.titleArt.background??''],sample.images[sample.character??sample.pack?.game.titleArt.character??'']]);}
  enter():void{
    const {stage,ui,sample}=this;
    stage.back.add(Object.assign(new Sprite(sample.images[sample.background??sample.pack?.game.titleArt.background??''],H*1.12),{x:W/2,y:H/2}));stage.back.add(cover('rgba(5,8,22,.55)'));
    stage.world.add(Object.assign(new Sprite(sample.images[sample.character??sample.pack?.game.titleArt.character??''],690).trimToContent(),{anchorY:1,x:960,y:H+8}));
    stage.ui.add(Object.assign(label(sample.title??sample.pack?.game.title??'전략 RPG',76,{display:true}),{x:70,y:30}));stage.ui.add(Object.assign(label('v2 진열장',24,{color:COLOR.gold,weight:700}),{x:76,y:122}));
    const about=stage.ui.add(Object.assign(label(HOME_MENU[0].about,21,{color:COLOR.dim,width:560}),{x:76,y:622}));
    const choose=(index:number)=>{if(this.open){this.open(index);return;}this.app.load((async()=>{const [{openGallery},{buildSample}]=await Promise.all([import('./screens'),import('./sample')]);const {currentPack}=await import('../pack/browser');const pack=sample.pack??await currentPack();await pack.ensureGallery?.();openGallery(index,this.app,buildSample(sample.images,pack));})().catch(e=>toast(this,String(e))));};
    ui.add(Object.assign(new MenuList(HOME_MENU,choose,{w:470,rows:8,rowHeight:46,onMove:i=>{about.state.text=HOME_MENU[i].about;}}),{x:70,y:150}));stage.ui.add(hintBar('↑↓ 선택 · Enter 결정 · Esc 뒤로 · 마우스와 터치도 됩니다'));
  }
}
