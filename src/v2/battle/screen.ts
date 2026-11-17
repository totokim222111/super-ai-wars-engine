import {battleProgress,type BattleProgress,type BattleFinish} from './progress';
import { preloadImages } from '../pack/images';
import { portraitImages } from '../portrait';
/**
 * 전투 화면. 전투 한 판(Exchange)을 받아 처음부터 끝까지 틀고, 끝나면 onDone을 부른다.
 * 맵 화면이 이것을 위에 올렸다가(push) 끝나면 걷는다(pop).
 *
 * 조작: ×1/×2/×3은 저장되는 배속, 적 턴 빨리는 누르는 동안만 ×3이다. 빈 곳 탭은 배속을 바꾸지 않는다. 위쪽 버튼은 건너뛰기다. 전투 중에는 ESC 버튼을 그리지 않는다.
 */
import {wait,type Step} from '../flow';
import type { InputEvent } from '../input';
import { Button,HoldButton,toast } from '../kit';
import {term} from '../terms';
import { Screen } from '../screen';
import { Shape, W } from '../stage';
import { COLOR, FONT } from '../ui';
import { playExchange } from './play';
import { BattleScene } from './scene';
import type { Exchange } from './types';

export class BattleScreen extends Screen {
  readonly progress:BattleProgress;
  private baseSpeed=1;private settling=false;private advance=false;private finished=false;private opener?:{seconds:number;cancel:()=>void};
  scene!:BattleScene;
  private finish(skipped:boolean):void{if(this.finished)return;this.finished=true;this.opener?.cancel();this.runner.clear();this.onDone({skipped,progress:this.progress});}
  /** @param onDone 연출이 끝났거나 플레이어가 건너뛰었을 때. 보통 `() => app.pop()`. */
  constructor(private readonly exchange: Exchange, private readonly onDone: (result:BattleFinish) => void, private readonly options: { speed?: number; shake?: number; music?:string;opening?:{slot:string;seconds?:number};deferRewards?:boolean;enemyPhase?:boolean;flash?:number;setSpeed?:(speed:number)=>void } = {}) { super();this.music=options.opening?undefined:options.music;this.progress=battleProgress(exchange); }
  prepare():Promise<void>|void {const optional=preloadImages(this.exchange.animationArt?.pageImages??[]);void optional?.catch(error=>console.warn('[animation art] background preload failed',error));const images=preloadImages([this.exchange.background,...this.exchange.strikes.flatMap(s=>s.combo?[...portraitImages(s.combo.partner.portrait),...(s.combo.dialogue??[]).flatMap(d=>portraitImages(d.fighter.portrait))]:[]),...this.exchange.fighters.flatMap(f=>[f.image,...portraitImages(f.portrait)])]);const audio=this.app?.sound?.preload?.([this.options.music,this.options.opening?.slot].filter((id):id is string=>!!id));if(images||audio)return Promise.all([images,audio]).then(()=>undefined);}
  enter(): void {
    this.baseSpeed=this.options.speed??1;this.runner.speed=this.baseSpeed;
    this.stage.camera.shakeScale = this.options.shake ?? 1;
    const { exchange } = this, scene = this.scene = new BattleScene(this.show, exchange);
    const screenVideo=this;scene.video=function*(id:string):Step{let done=false;const svc=screenVideo.app.cinematics;scene.videoShown=!!(svc?.enabled&&svc.definition(id)?.file);const task=svc?.play(id,true);if(task){void task.finally(()=>done=true);while(!done)yield;}};
    this.ui.add(Object.assign(new Button('건너뛰기',()=>this.finish(true),{w:124,h:84}),{x:W/2-62,y:12,z:90,canFocus:false}));
    this.ui.onCancel = ()=>this.finish(true);
    const speed=this.ui.add(Object.assign(new Button('×'+this.baseSpeed,()=>{this.baseSpeed=this.baseSpeed%3+1;this.options.setSpeed?.(this.baseSpeed);speed.label='×'+this.baseSpeed;},{w:124,h:84}),{x:W/2-62,y:108,z:90,canFocus:false}));
    if(this.options.enemyPhase)this.ui.add(Object.assign(new HoldButton('빨리 ▶▶',held=>{this.app.fastHeld=held;},{w:170,h:82}),{x:W-194,y:204,z:90,canFocus:false}));
    const screen=this;
    // The jingle plays over the entrance; it must never hold a blank battle screen.
    this.run((function* (): Step {if(screen.options.opening)screen.opener=screen.app.sound.opening?.(screen.options.opening.slot,screen.options.music,screen.options.opening.seconds);yield* playExchange(scene, exchange,screen.progress);if(exchange.settlement&&(exchange.settlement.exp||exchange.settlement.credits||exchange.settlement.levels.length))yield*screen.settlement(exchange.settlement);if(!screen.options.deferRewards&&exchange.rewards?.length){for(const r of exchange.rewards)toast(screen,`${r.name} · ${term('trainingShort')} +${r.amount}`);yield*wait(.35);} screen.finish(false); })());
  }
  update(dt:number):void{this.runner.speed=this.app.fastHeld?3:this.baseSpeed;super.update(dt);}
  private *settlement(value:NonNullable<Exchange['settlement']>):Step{this.settling=true;this.advance=false;const node=this.stage.ui.add(new Shape({t:0},(ctx,s)=>{ctx.fillStyle='rgba(6,16,39,.96)';ctx.fillRect(160,586,W-320,104);ctx.strokeStyle=COLOR.gold;ctx.lineWidth=2;ctx.strokeRect(160,586,W-320,104);ctx.font=`700 28px ${FONT.body}`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff';ctx.fillText(`EXP +${value.exp} · 자금 +${value.credits}`,W/2,610);if(value.levels.length){ctx.font=`900 58px ${FONT.num}`;ctx.fillStyle=COLOR.gold;ctx.save();ctx.translate(W/2,657);ctx.scale(1+Math.max(0,1-s.t/.18)*.2,1+Math.max(0,1-s.t/.18)*.2);ctx.lineWidth=3;ctx.strokeStyle='#0b1530';ctx.strokeText('LEVEL UP!',0,0);ctx.fillText('LEVEL UP!',0,0);ctx.restore();}}));if(value.levels.length)this.app.sound.play('levelup');let t=0;while(t<1.2&&!this.advance){t+=yield;node.state.t=t;}node.remove();this.settling=false;}
  input(event:InputEvent):void{if(this.ui.input(event))return;if(this.settling&&(event.kind==='pointer'&&event.phase==='up'||event.kind==='action'&&event.action==='confirm'))this.advance=true;}
}
