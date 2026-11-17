import {safeCaption} from './safe-area';
import type {Speech} from './lines';
import {term} from '../terms';
/**
 * 전투 장면: 기체, 정보창, 대사창, 화면 전환, 그리고 "맞는 순간"의 처리.
 *
 * 화면 구성은 원작 로봇대전과 같다.
 *   - 한 화면에는 한쪽 기체만 나온다. 공격하는 쪽 화면과 맞는 쪽 화면을 컷으로 잇는다.
 *   - 아군은 화면 오른쪽에 서서 왼쪽을 보고, 적은 왼쪽에 서서 오른쪽을 본다.
 *   - 공격이 나가는 방향(dir)은 아군이 칠 때 -1(왼쪽), 적이 칠 때 +1(오른쪽)이다.
 *     연출은 dir만 곱해 쓰면 아군 공격과 적 공격이 저절로 좌우 대칭이 된다.
 *
 * 무기 연출 틀(templates/)은 이 장면의 메서드를 순서대로 부르기만 한다.
 */
import { all, ease, tween, wait, type Flow, type Step } from '../flow';
import { afterimage, burst, drainGauge, flash, impactLines, pop as rawPop, ring, shake, sparks, spawn, speedLines, type Show } from '../fx';
import { H, Shape, Sprite, W, type Node } from '../stage';
import { battleLine, bigText, COLOR, cover, wrap,drawPortrait, faceOf, FONT, hudState, unitHud, weaponPlate, type HudState } from '../ui';
import type { Anchors, Exchange, Fighter, Lines, Outcome, Side, Weapon } from './types';

function pop(show:Show,text:string,x:number,y:number,size:number,fill:string,stroke:string,hold=.35):void{const b=safeCaption(x,y,text.length*size*.72,size+88);rawPop(show,text,b.x+b.w/2,b.y+b.h/2+24,size,fill,stroke,hold);}
/** 발이 닿는 높이, 각자의 화면에서 서는 자리, 화면 밖 지점. */
export const GROUND = 564;
export const MAX_BATTLE_HEIGHT=440;
export const HOME: Record<Side, number> = { ally: 800, enemy: 480 };
export const OFF = { left: -340, right: W + 340 };
/**
 * 기준점의 어림값. 기체 자료에 anchors가 없을 때만 쓴다.
 * "왼쪽을 보는 그림" 기준으로 적었다(오른쪽을 보는 그림에는 좌우를 뒤집어 쓴다).
 */
export const DEFAULT_ANCHORS: Anchors = { muzzle: [0.05, 0.38], core: [0.5, 0.5], shoulder: [0.42, 0.14], head: [0.36, 0.1], hand: [0.12, 0.5] };
/** 대사창 얼굴의 표정. 그림이 없는 표정은 기본 표정으로 나온다. */
export type Mood = string;

/** 장면 위의 기체 하나: 자료, 그림, 정보창의 값. */
export interface Actor { fighter: Fighter; sprite: Sprite; hud: HudState; dead: boolean }

const tint = (side: Side): string => (side === 'ally' ? COLOR.ally : COLOR.enemy);

export class BattleScene {
  readonly animationArt?:import('./animation-art').AnimationArt;
  video?:(id:string)=>Step;videoShown=false;
  onResult?:()=>void;
  onDefeat?:()=>void;
  readonly actors = new Map<string, Actor>();
  /** 지금 보이는 화면이 어느 쪽 것인가. */
  screen: Side = 'ally';
  private readonly front = {} as Record<Side, Actor>;
  private readonly huds = {} as Record<Side, Shape<HudState>>;
  private readonly backdrop: Node;
  private line?: Node;
  private plate?: { node: Node; out: number };
  /** 한 번의 공격에서 "빗나감"·"방어" 글자는 한 번만 띄운다. */
  private noted = false;

  constructor(readonly show: Show, exchange: Exchange) {
    this.animationArt=exchange.animationArt;
    const { stage } = show, image = exchange.background;
    // 배경은 좌우로 이어 붙여 깐다(홀수 번째는 뒤집어서 이음매가 맞게). 컷으로 카메라가 크게 움직여도 끝이 드러나지 않는다.
    this.backdrop = stage.back.add(new Shape({}, ctx => {
      if (!image?.naturalWidth) return;
      const height = H * 1.3, width = height * image.naturalWidth / image.naturalHeight;
      for (let i = -3; i <= 3; i++) {
        ctx.save(); ctx.translate(i * width, -height / 2);
        if (i % 2) ctx.scale(-1, 1);
        ctx.drawImage(image, -width / 2, 0, width + 1, height); ctx.restore();
      }
    }));
    const separation=stage.back.add(new Shape({},ctx=>{const gradient=ctx.createLinearGradient(0,200,0,GROUND+20);gradient.addColorStop(0,'rgba(10,20,48,0)');gradient.addColorStop(.4,'rgba(10,20,48,.34)');gradient.addColorStop(1,'rgba(10,20,48,.34)');ctx.fillStyle=gradient;ctx.fillRect(0,200,W,GROUND-180);}));separation.z=1;
    Object.assign(this.backdrop, { x: W / 2 - 240, y: H / 2 });
    for (const fighter of exchange.fighters) {
      const side = fighter.side, sprite = new Sprite(fighter.image, Math.min(MAX_BATTLE_HEIGHT,fighter.height)).trimToContent();
      // 아군은 왼쪽을, 적은 오른쪽을 본다. 그림이 반대로 그려져 있으면 뒤집는다.
      Object.assign(sprite, { x: HOME[side], y: GROUND, anchorY: 1, visible: false, flipX: fighter.faces !== (side === 'ally' ? 'left' : 'right') });
      stage.world.add(sprite);
      // 발밑 그림자. 기체를 따라다닌다.
      const shadow = stage.world.add(new Shape({}, ctx => {
        if (!sprite.visible) return;
        ctx.globalAlpha *= 0.5 * sprite.alpha; ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(sprite.x, GROUND - 6, sprite.width * 0.32, 16, 0, 0, Math.PI * 2); ctx.fill();
      }));
      shadow.z = -1;
      const hud = hudState({ name: fighter.name, pilot: fighter.pilot, hp: fighter.hp, hpMax: fighter.hpMax, en: fighter.en, enMax: fighter.enMax, color: tint(side), side: side === 'ally' ? 'right' : 'left' });
      const actor: Actor = { fighter, sprite, hud, dead: false };
      this.actors.set(fighter.id, actor);
      // 각 편의 첫 기체가 처음 정보창에 나온다.
      if (!this.front[side]) { this.front[side] = actor; this.huds[side] = stage.ui.add(unitHud(hud)); this.huds[side].z = 50; }
    }
  }

  actor(id: string): Actor {
    const actor = this.actors.get(id);
    if (!actor) throw new Error(`전투에 없는 기체: ${id}`);
    return actor;
  }
  /**
   * 기체 그림 위의 기준점이 지금 화면의 어디인가(총구, 몸통 등).
   * 기체가 움직이거나 뒤집혀 있어도 그림을 따라간다. 자료에 그 이름이 없으면 어림값을 쓴다.
   */
  at(actor: Actor, name: string): { x: number; y: number } {
    const { sprite, fighter } = actor, own = fighter.anchors?.[name], guess = DEFAULT_ANCHORS[name] ?? DEFAULT_ANCHORS.core;
    // 어림값은 왼쪽을 보는 그림 기준이므로, 오른쪽을 보는 그림이면 좌우를 뒤집는다.
    const [fx, fy] = own ?? (fighter.faces === 'left' ? guess : [1 - guess[0], guess[1]]), mirror = sprite.flipX ? -1 : 1;
    return { x: sprite.x + (fx - 0.5) * sprite.width * mirror * sprite.scaleX, y: sprite.y - (1 - fy) * sprite.height * sprite.scaleY };
  }
  /** 공격이 나가는 방향. 아군이 치면 왼쪽(-1), 적이 치면 오른쪽(+1). */
  dir(attacker: Actor): 1 | -1 { return attacker.fighter.side === 'ally' ? -1 : 1; }
  /** 그 편의 앞에 나선 기체를 바꾼다. 정보창이 따라 바뀐다. */
  setFront(actor: Actor): void {
    const side = actor.fighter.side;
    this.front[side] = actor; this.huds[side].state = actor.hud;
  }
  /** 지금 화면에 그 편의 앞 기체만 보이게 하고 제자리에 세운다. */
  private stand(side: Side): void {
    for (const actor of this.actors.values()) actor.sprite.visible = false;
    const { sprite } = this.front[side];
    Object.assign(sprite, { visible: !this.front[side].dead, x: HOME[side], y: GROUND, rotation: 0, scaleX: 1, scaleY: 1 });
  }

  /** 암전에서 밝아지며 첫 기체가 미끄러져 들어온다. */
  *enter(first: Actor): Step {
    const { show } = this, side = first.fighter.side, black = show.stage.ui.add(cover('#000'));
    black.z = 95; this.screen = side; this.setFront(first); this.stand(side);
    this.backdrop.x = W / 2 + (side === 'enemy' ? 240 : -240);
    first.sprite.x = HOME[side] + (side === 'ally' ? 420 : -420);
    yield* all(tween(black, { alpha: 0 }, 0.2), tween(first.sprite, { x: HOME[side] }, 0.3));
    black.remove();
  }

  /** 화면 전환. 카메라가 그쪽으로 휙 돌아가고, 그 사이에 주인공이 바뀐다. */
  *cut(to: Side): Step {
    const { show } = this, camera = show.stage.camera, direction = to === 'enemy' ? -1 : 1;
    const lines = speedLines(show, direction < 0 ? 1 : -1);
    lines.alpha = 1;
    show.sound?.play('whoosh');
    yield* tween(camera, { x: W / 2 + direction * W }, 0.06, ease.in);
    this.screen = to; this.stand(to);
    this.backdrop.x = W / 2 + (to === 'enemy' ? 240 : -240);   // 서로 다른 자리처럼 보이게 배경을 어긋나게 둔다
    Object.assign(camera, { x: W / 2 - direction * W, y: H / 2, zoom: 1 });
    yield* tween(camera, { x: W / 2 }, 0.09, ease.out);
    yield* tween(lines, { alpha: 0 }, 0.04);
    lines.remove();
  }

  /** 그 기체를 화면의 주인공으로 만든다. 다른 쪽 화면이면 컷으로 넘어간다. */
  *focus(actor: Actor): Step {
    const side = actor.fighter.side, changed = this.front[side] !== actor;
    this.setFront(actor);
    if (this.screen !== side) yield* this.cut(side);
    else if (changed || !actor.sprite.visible) this.stand(side);
  }

  /** 대사창에 한 줄. 글자가 차오른 뒤 잠깐 읽을 시간을 준다. mood로 얼굴 표정을 고른다. */
  *say(actor: Actor, speech: Speech, mood: Mood = 'default', hold = 0.7): Step {
    const text=typeof speech==='string'?speech:speech.text;mood=typeof speech==='string'?mood:speech.mood??mood;if(!text.trim())return;
    const { fighter } = actor, ally = fighter.side === 'ally';
    this.line?.remove();
    const line = battleLine({ name: fighter.pilot, text, shown: 0, color: tint(fighter.side), side: ally ? 'right' : 'left', portrait: fighter.portrait, mood });
    line.z = 50; this.line = this.show.stage.ui.add(line);
    let elapsed=0,wall=0;while(elapsed<text.length/60){const dt=yield;elapsed+=dt;wall+=dt/this.show.runner.speed;line.state.shown=Math.min(text.length,elapsed*60);}
    const target=wall+Math.max(this.show.runner.speed>1?.6:hold,hold/this.show.runner.speed);while(wall<target)wall+=(yield)/this.show.runner.speed;
  }

  /** 화면 가운데를 가로지르는 알림 띠("반격", "원호 방어"). */
  *banner(text: string, side: Side): Step {
    const node = new Shape({ open: 0 }, (ctx, s) => {
      const height = 76 * s.open;
      if (height < 2) return;
      ctx.fillStyle = 'rgba(4,8,22,.86)'; ctx.fillRect(0, -height / 2, W, height);
      ctx.fillStyle = tint(side); ctx.fillRect(0, -height / 2, W, 3); ctx.fillRect(0, height / 2 - 3, W, 3);
      ctx.globalAlpha *= s.open; ctx.font = `50px ${FONT.display}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff'; ctx.fillText(text, W / 2, 2);
    });
    Object.assign(node, { y: 300, z: 56 });
    this.show.stage.ui.add(node);
    this.show.sound?.play('confirm', 0.8);
    yield* tween(node.state, { open: 1 }, 0.12);
    yield* wait(0.22);
    yield* tween(node.state, { open: 0 }, 0.1, ease.in);
    node.remove();
  }

  /** 공격 선언: 대사와 함께 무기 이름이 미끄러져 들어오고, 쓰는 만큼 EN이 빠진다. */
  *announce(attacker: Actor, weapon: Weapon, line?: Speech): Step {
    const { show } = this, { hud, fighter } = attacker, ally = fighter.side === 'ally';
    // 무기 이름은 기체의 맞은편에서 들어온다.
    const node = show.stage.ui.add(weaponPlate(weapon.name, tint(fighter.side), ally ? 'left' : 'right'));
    const out = ally ? -560 : W + 560;
    Object.assign(node, { x: out, y: 132, z: 51 });
    this.plate?.node.remove(); this.plate = { node, out };
    if (weapon.cost > 0) {
      // 소모량이 정보창 아래에서 떠올랐다 사라진다.
      const cost = bigText(`${term('en')} -${weapon.cost}`, 30, '#7fe9f7', '#06223a');
      Object.assign(cost, { x: ally ? W - 130 : 130, y: 156, z: 52, alpha: 0 });
      spawn(show, show.stage.ui, cost, function* (n) {
        yield* wait(0.25);
        yield* all(tween(n, { alpha: 1 }, 0.12), tween(n, { y: 146 }, 0.12));
        yield* wait(0.7);
        yield* all(tween(n, { alpha: 0 }, 0.25), tween(n, { y: 132 }, 0.25));
      });
    }
    const drain = drainGauge(show, hud, 'en', Math.max(0, hud.en - weapon.cost));
    yield* all(
      tween(node, { x: ally ? 40 : W - 40 }, 0.18),
      line ? this.say(attacker, line, 'attack',.3) : wait(0.15),
      (function* (): Step { yield* wait(0.05); if (weapon.cost > 0) yield* drain; })(),
    );
  }

  /** 무기 이름과 대사창을 치운다. */
  *dismiss(): Step {
    if (this.plate) { const { node, out } = this.plate; this.plate = undefined; yield* tween(node, { x: out }, 0.10, ease.in); node.remove(); }
    this.line?.remove(); this.line = undefined;
  }

  /** 파일럿 컷인: 비스듬한 띠가 열리고 눈매가 흘러 들어온다. 그 기체에 컷인 영역이 없으면 아무것도 하지 않는다. */
  *partnerCutin(fighter:Fighter,speech:Speech):Step {
    const text=typeof speech==='string'?speech:speech.text,mood=typeof speech==='string'?'attack':speech.mood??'attack';
    const node=this.show.stage.ui.add(new Shape({},ctx=>{ctx.fillStyle='rgba(7,20,55,.96)';ctx.fillRect(0,212,W,240);ctx.fillStyle='#82f4ff';ctx.fillRect(0,212,W,4);drawPortrait(ctx,fighter.portrait,mood,fighter.portrait.crop,55,222,200,200);ctx.font=`700 30px ${FONT.body}`;ctx.textAlign='left';ctx.textBaseline='top';ctx.fillStyle='#fff';ctx.fillText(fighter.pilot+' · 합체기',285,244);ctx.font=`24px ${FONT.body}`;wrap(ctx,text,W-325).forEach((line,i)=>ctx.fillText(line,285,302+i*32));}));node.z=85;
    // Expose the exact displayed speaker/text for replay inspection, not game state.
    Object.assign(node.state,{speech:text,mood,speaker:fighter.id});
    this.show.sound?.play('confirm');let elapsed=0;const hold=Math.max(1.15,text.length/24);while(elapsed<Math.max(.6,hold/this.show.runner.speed))elapsed+=(yield)/this.show.runner.speed;node.remove();
  }
  *cutin(actor: Actor): Step {
    const { show } = this, { fighter } = actor, crop = fighter.cutin;
    if (!crop) return;
    const image = faceOf(fighter.portrait, 'attack'), ally = fighter.side === 'ally', flow = ally ? 1 : -1;
    const lines = speedLines(show, flow as 1 | -1);
    const band = new Shape({ open: 0, drift: 320 }, (ctx, s) => {
      const height = 190 * s.open;
      if (height < 2) return;
      ctx.transform(1, 0, -0.26 * flow, 1, 0, 0);
      ctx.beginPath(); ctx.rect(-W, -height / 2, W * 2, height); ctx.clip();
      const fill = ctx.createLinearGradient(-W / 2, 0, W / 2, 0);
      fill.addColorStop(ally ? 0 : 1, tint(fighter.side)); fill.addColorStop(ally ? 1 : 0, ally ? '#0b2a80' : '#5a0b18');
      ctx.fillStyle = fill; ctx.fillRect(-W, -height / 2, W * 2, height);
      ctx.fillStyle = 'rgba(255,255,255,.18)';
      for (let i = 0; i < 24; i++) ctx.fillRect(-W + ((i * 113 + s.drift * 6) % (W * 2)), -height / 2, 3, height);
      if (image?.naturalWidth) {
        const drawHeight = 330, drawWidth = drawHeight * (crop.w * image.naturalWidth) / (crop.h * image.naturalHeight);
        ctx.save(); ctx.transform(1, 0, 0.26 * flow, 1, 0, 0);   // 얼굴은 기울이지 않는다
        const faceX=(-160+s.drift)*flow-drawWidth/2;for(let j=0;j<40;j++){ctx.save();ctx.beginPath();ctx.rect(faceX+j*drawWidth/40,-drawHeight/2,drawWidth/40+1,drawHeight);ctx.clip();ctx.globalAlpha*=Math.min(1,(j+.5)/4,(39.5-j)/4);drawPortrait(ctx,fighter.portrait,'attack',crop,faceX,-drawHeight/2,drawWidth,drawHeight);ctx.restore();}
        ctx.restore();
      }
      ctx.fillStyle = '#fff'; ctx.fillRect(-W, -height / 2, W * 2, 4); ctx.fillRect(-W, height / 2 - 4, W * 2, 4);
    });
    Object.assign(band, { x: W / 2, y: 311, z: 30 });
    show.stage.ui.add(band);
    show.sound?.play('flash');
    yield* all(tween(band.state, { open: 1 }, 0.12), tween(lines, { alpha: 1 }, 0.12));
    yield* tween(band.state, { drift: 0 }, 0.45, ease.out);
    yield* all(tween(band.state, { open: 0 }, 0.1, ease.in), tween(lines, { alpha: 0 }, 0.1));
    band.remove(); lines.remove();
  }

  /** 공격 하나가 시작될 때 부른다("빗나감"·"방어" 글자를 다시 띄울 수 있게). */
  begin(): void { this.noted = false; }

  /** Sequence parts own all transforms and hit-stop timing; only the shared notice lives here. */
  sequenceNotice(defender:Actor,outcome:Outcome):void {
    if(this.noted||outcome.hit&&!outcome.guard)return;
    this.noted=true;
    if(!outcome.hit)this.onResult?.();
    pop(this.show,outcome.hit?'방어':'빗나감',defender.sprite.x,Math.max(190,GROUND-defender.sprite.height-30),72,outcome.hit?'#e9fbff':'#e9f2ff',outcome.hit?'#0b6f8a':'#3b4a78',.66);
  }

  /**
   * 한 방이 닿는 순간. 틀은 이것만 부르고, 결과에 따라 무엇을 보여 줄지는 여기서 정한다.
   *   - 빗나감: 맞는 쪽이 훌쩍 비켜난다.
   *   - 방어: 방패가 번쩍이고 조금만 밀린다.
   *   - 명중: 번쩍임·찌그러짐·불티·흔들림·카메라 움찔, 그리고 타격 정지. 크리티컬이면 더 세다.
   * @param power 세기. 약한 연사 3~4, 보통 8~12, 결정타 20 이상(집중선과 충격파가 붙는다).
   * @param stop 타격 정지(초). 타격감의 대부분이 여기서 나온다.
   */
  *land(defender: Actor, dir: 1 | -1, outcome: Outcome, power: number, stop = 0.07): Step {
    if (!outcome.hit) yield* this.dodge(defender, dir);
    else if (outcome.guard) yield* this.guard(defender, dir, power);
    else yield* this.hit(defender, dir, outcome.critical ? power * 1.3 : power, outcome.critical ? stop * 1.4 : stop);
  }

  /** 명중한 한 방. 보통은 land()를 통해 불린다. */
  *hit(defender: Actor, dir: 1 | -1, power: number, stop = 0.07): Step {
    const { show } = this, { sprite, hud, fighter } = defender, run = (step: Step): void => show.runner.run(step), camera = show.stage.camera;
    // 맞는 자리는 기체가 지금 있는 곳 기준이다(띄워 올려진 기체도 제 몸에서 터진다).
    const home = HOME[fighter.side], core = this.at(defender, 'core'), x = core.x - dir * 30, y = core.y, heavy = power >= 15;
    show.sound?.play(heavy ? 'heavy' : 'hit', heavy ? 1 : Math.min(1, 0.35 + power * 0.06));
    burst(show, x, y, 90 + power * 13, '#6fc4ff');
    sparks(show, x, y, 10 + Math.round(power), 170 + power * 13, '#fff3c4');
    if (heavy) { impactLines(show, x, y); ring(show, x, y, 420, '#bfe6ff'); flash(show, 0.7, 0.25); }
    sprite.flash = 1;
    run(tween(sprite, { flash: 0 }, 0.24));
    // 맞을 때마다 정보창도 같이 떤다.
    hud.jolt = Math.min(12, 2 + power * 0.5);
    run(tween(hud, { jolt: 0 }, 0.3));
    run(shake(show, power * 2.2, 0.2 + power * 0.015));
    // 카메라 움찔: 순간적으로 당겼다가 돌아온다.
    const zoom = camera.zoom;
    camera.zoom = zoom * (1 + power * 0.006);
    run(tween(camera, { zoom }, 0.22));
    // 맞은 방향으로 밀려났다가 제자리로. 세로로 늘고 가로로 줄어 "눌린" 느낌을 낸다.
    run((function* (): Step {
      yield* tween(sprite, { x: home + dir * power * 5, rotation: dir * power * 0.008, scaleX: 0.92, scaleY: 1.05 }, 0.05);
      yield* tween(sprite, { x: home, rotation: 0, scaleX: 1, scaleY: 1 }, 0.3, ease.out);
    })());
    yield* wait(0.035);          // 터지는 그림이 보일 만큼만 흘린 뒤
    show.runner.hold(stop);      // 멈춘다
    yield* wait(0.02);
  }

  /** 빗나감: 공격이 지나가는 방향으로 훌쩍 물러났다가 돌아온다. */
  *dodge(defender: Actor, dir: 1 | -1): Step {
    const { show } = this, { sprite, fighter } = defender, home = HOME[fighter.side];
    show.sound?.play('whoosh', 0.7);
    if (!this.noted) { this.noted = true;this.onResult?.(); pop(show, '빗나감', sprite.x, Math.max(190,GROUND-sprite.height-30),72, '#e9f2ff', '#3b4a78',.66); }
    afterimage(show, sprite);
    show.runner.run((function* (): Step {
      yield* tween(sprite, { x: home + dir * 130, y: GROUND - 34 }, 0.08, ease.out);
      afterimage(show, sprite);
      yield* wait(0.1);
      yield* tween(sprite, { x: home, y: GROUND }, 0.22, ease.inOut);
    })());
    yield* wait(0.06);
  }

  /** 방어: 공격이 오는 쪽에 방패가 번쩍이고, 조금만 밀린다. */
  *guard(defender: Actor, dir: 1 | -1, power: number): Step {
    const { show } = this, { sprite, hud, fighter } = defender, home = HOME[fighter.side];
    const x = sprite.x - dir * sprite.width * 0.42, y = sprite.y - sprite.height * 0.5, size = sprite.height * 0.62;
    show.sound?.play('hit', 0.5); show.sound?.play('deny', 0.6);
    if (!this.noted) { this.noted = true; pop(show, '방어', sprite.x, Math.max(190,GROUND-sprite.height-30),72, '#e9fbff', '#0b6f8a',.66); }
    // 방패: 공격을 향해 볼록한 호 세 겹.
    const shield = new Shape({}, ctx => {
      ctx.lineCap = 'round';
      for (const [radius, width, color] of [[size, 14, '#7fe9f7'], [size * 0.86, 6, '#ffffff'], [size * 1.12, 4, '#7fe9f7']] as const) {
        ctx.strokeStyle = color; ctx.lineWidth = width;
        ctx.beginPath(); ctx.arc(dir * size * 0.7, 0, radius, dir > 0 ? Math.PI * 0.72 : -Math.PI * 0.28, dir > 0 ? Math.PI * 1.28 : Math.PI * 0.28); ctx.stroke();
      }
    });
    Object.assign(shield, { x, y, blend: 'lighter', z: 18 });
    spawn(show, show.stage.fx, shield, n => tween(n, { alpha: 0 }, 0.35, ease.in));
    sparks(show, x, y, 8, 140, '#c4f8ff');
    hud.jolt = 3; show.runner.run(tween(hud, { jolt: 0 }, 0.3));
    show.runner.run(shake(show, power * 0.8, 0.2));
    show.runner.run((function* (): Step {
      yield* tween(sprite, { x: home + dir * power * 1.6 }, 0.05);
      yield* tween(sprite, { x: home }, 0.25, ease.out);
    })());
    yield* wait(0.03);
    show.runner.hold(0.04);
    yield* wait(0.02);
  }

  /** 원호 방어: 겨냥당한 기체가 뒤로 빠지고 다른 기체가 앞을 막아선다. */
  *coverSwap(target: Actor, guardian: Actor): Step {
    const side = target.fighter.side, back = side === 'ally' ? 1 : -1, home = HOME[side];
    yield* this.banner('원호 방어', side);
    Object.assign(guardian.sprite, { visible: true, x: home + back * 520, y: GROUND, rotation: 0 });
    this.show.sound?.play('whoosh');
    yield* all(tween(target.sprite, { x: home + back * 520 }, 0.22, ease.in), tween(guardian.sprite, { x: home }, 0.26, ease.out));
    target.sprite.visible = false;
    this.setFront(guardian);
  }

  /**
   * 공격의 결과를 보여 준다: 피해 숫자와 체력 감소, 살아남은 쪽의 한마디, 또는 격파.
   * @returns 격파됐으면 true.
   */
  *resolve(defender: Actor, outcome: Outcome, lines: Lines = {}): Flow<boolean> {
    const { show } = this, { sprite, hud, fighter } = defender;
    if (!outcome.hit) {
      this.onResult?.();pop(show,'회피',sprite.x,Math.max(212,GROUND-sprite.height-30),56,'#e9f2ff','#3b4a78',.66);yield* wait(.6);
      if (lines.dodge) yield* this.say(defender, lines.dodge, 'smile', 0.8);
      return false;
    }
    if(outcome.barrier){yield*this.guard(defender,this.dir(defender),180);pop(show,outcome.barrier==='immune'?'무효!':'경감',sprite.x,Math.max(190,GROUND-sprite.height-30),76,'#d9fcff','#138dce',1);yield*wait(.35);}
    this.onResult?.();
    const left = Math.max(0, hud.hp - outcome.damage), x = sprite.x + (fighter.side === 'enemy' ? 160 : -160), y = Math.max(200,GROUND-sprite.height-30);
    if (outcome.critical) {
      const n=safeCaption(x,y,Math.max(180,String(outcome.damage).length*120*.72),260);rawPop(show,'크리티컬',n.x+n.w/2,n.y+30,28,'#fff6c9','#101d35',.66);yield*wait(.08);rawPop(show,String(outcome.damage),n.x+n.w/2,n.y+180,120,'#fff2b0','#e06a00',.66);
    } else if(outcome.guard){const nw=Math.max(220,String(outcome.damage).length*104*.72),b=safeCaption(x,y,nw+230,180);rawPop(show,'방어',b.x+75,b.y+90,56,'#e9fbff','#0b6f8a',.66);rawPop(show,String(outcome.damage),b.x+230+nw/2,b.y+90,104,'#fff','#0b6f8a',.66);}else pop(show,String(outcome.damage),x,y,104,'#fff','#ff5a1f',.66);
    if(left>0&&lines.reaction)yield*all(drainGauge(show,hud,'hp',left),this.say(defender,lines.reaction,'hit',.25));else yield*drainGauge(show,hud,'hp',left);
    if(left<=0){yield*this.destroy(defender,lines.lastWords);return true;}
    return false;
  }

  /** 격파: 마지막 한마디, 연쇄 폭발, 쓰러지며 사라진다. */
  *destroy(actor: Actor, lastWords?: Speech): Step {
    const { show } = this, { sprite } = actor, camera = show.stage.camera;
    yield* all(lastWords ? this.say(actor, lastWords, 'hit', 0.5) : wait(0.2), tween(camera, { x: W / 2 + (sprite.x - W / 2) * 0.5, zoom: 1.14 }, 0.4));
    for (const [dx, dy] of [[-40,-150],[40,-90],[-10,-210]]) {
      show.sound?.play('hit',.25);
      burst(show, sprite.x + dx, GROUND + dy, 150, '#ffb347');
      sparks(show, sprite.x + dx, GROUND + dy, 12, 200, '#ffd23f');
      sprite.flash = 0.8; show.runner.run(tween(sprite, { flash: 0 }, 0.1));
      show.runner.run(shake(show, 20, 0.2));
      yield* wait(0.07);
    }
    flash(show, 1, 0.7);
    show.sound?.play('explode');
    this.onDefeat?.();
    burst(show, sprite.x, GROUND - 190, 520, '#ff7b2f');
    ring(show, sprite.x, GROUND - 190, 700, '#ffd9a8');
    impactLines(show, sprite.x, GROUND - 190);
    show.runner.run(shake(show, 46, 0.8));
    yield* wait(0.04);
    show.runner.hold(0.12);
    yield* tween(sprite, { alpha: 0, y: GROUND + 30, rotation: actor.fighter.side === 'enemy' ? -0.35 : 0.35 }, 0.3, ease.in);
    actor.dead = true; sprite.visible = false;
    yield* wait(0.12);
    yield* tween(camera, { x: W / 2, zoom: 1 }, 0.12);
  }
}
