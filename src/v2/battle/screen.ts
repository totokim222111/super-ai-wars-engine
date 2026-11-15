import {battleProgress,type BattleProgress,type BattleFinish} from './progress';
import { preloadImages } from '../pack/images';
import { portraitImages } from '../portrait';
/**
 * 전투 화면. 전투 한 판(Exchange)을 받아 처음부터 끝까지 틀고, 끝나면 onDone을 부른다.
 * 맵 화면이 이것을 위에 올렸다가(push) 끝나면 걷는다(pop).
 *
 * 조작: 화면을 누르거나 Enter를 누르면 빨리 감기가 켜지고 꺼진다. 위쪽 버튼은 건너뛰기다. 전투 중에는 ESC 버튼을 그리지 않는다.
 */
import {wait,type Step} from '../flow';
import type { InputEvent } from '../input';
import { Button,toast } from '../kit';
import {term} from '../terms';
import { Screen } from '../screen';
import { Shape, W } from '../stage';
import { COLOR, FONT } from '../ui';
import { playExchange } from './play';
import { BattleScene } from './scene';
import type { Exchange } from './types';

export class BattleScreen extends Screen {
  readonly progress:BattleProgress;
  private finished=false;private opener?:{seconds:number;cancel:()=>void};
  scene!:BattleScene;
  private finish(skipped:boolean):void{if(this.finished)return;this.finished=true;this.opener?.cancel();this.runner.clear();this.onDone({skipped,progress:this.progress});}
  /** @param onDone 연출이 끝났거나 플레이어가 건너뛰었을 때. 보통 `() => app.pop()`. */
  constructor(private readonly exchange: Exchange, private readonly onDone: (result:BattleFinish) => void, private readonly options: { speed?: number; shake?: number; music?:string;opening?:{slot:string;seconds?:number};deferRewards?:boolean } = {}) { super();this.music=options.opening?undefined:options.music;this.progress=battleProgress(exchange); }
  prepare():Promise<void>|void {const images=preloadImages([this.exchange.background,...this.exchange.strikes.flatMap(s=>s.combo?[...portraitImages(s.combo.partner.portrait),...(s.combo.dialogue??[]).flatMap(d=>portraitImages(d.fighter.portrait))]:[]),...this.exchange.fighters.flatMap(f=>[f.image,...portraitImages(f.portrait)])]);const audio=this.app?.sound?.preload?.([this.options.music,this.options.opening?.slot].filter((id):id is string=>!!id));if(images||audio)return Promise.all([images,audio]).then(()=>undefined);}
  enter(): void {
    this.runner.speed = this.options.speed ?? 1;
    this.stage.camera.shakeScale = this.options.shake ?? 1;
    const { exchange, runner } = this, scene = this.scene = new BattleScene(this.show, exchange);
    const screenVideo=this;scene.video=function*(id:string):Step{let done=false;const task=screenVideo.app.cinematics?.play(id);if(task){void task.finally(()=>done=true);while(!done)yield;}};
    this.ui.add(Object.assign(new Button('건너뛰기',()=>this.finish(true),{w:124,h:88}),{x:W/2-62,y:12,z:90,canFocus:false}));
    this.ui.onCancel = ()=>this.finish(true);
    // 빨리 감는 중이라는 표시. 버튼 바로 아래에 깜빡인다.
    const mark = new Shape({ t: 0 }, (ctx, s) => {
      if (runner.speed === 1) return;
      ctx.globalAlpha *= 0.6 + Math.sin(s.t * 10) * 0.4;
      ctx.font = `700 18px ${FONT.body}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = COLOR.gold;
      ctx.fillText('≫ 빨리 감기', W / 2, 108,120);
    });
    mark.z = 90;
    this.stage.ui.add(mark);
    this.run((function* (): Step { for (;;) mark.state.t += (yield) / runner.speed; })());
    const screen=this;
    // The jingle plays over the entrance; it must never hold a blank battle screen.
    this.run((function* (): Step {if(screen.options.opening)screen.opener=screen.app.sound.opening?.(screen.options.opening.slot,screen.options.music,screen.options.opening.seconds);yield* playExchange(scene, exchange,screen.progress);if(!screen.options.deferRewards&&exchange.rewards?.length){for(const r of exchange.rewards)toast(screen,`${r.name} · ${term('trainingShort')} +${r.amount}`);yield*wait(.85);} screen.finish(false); })());
  }
  input(event: InputEvent): void {
    if (this.ui.input(event)) return;
    const tap = event.kind === 'pointer' && event.phase === 'down', key = event.kind === 'action' && (event.action === 'skip' || event.action === 'confirm');
    if (tap || key) { this.runner.speed = this.runner.speed === (this.options.speed ?? 1) ? (this.options.speed ?? 1) * 3 : (this.options.speed ?? 1); this.app.sound.play('cursor'); }
  }
}
