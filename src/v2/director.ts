import {drawFocusedImage,type ImageRect} from './image-layout';
import { cueImages, waitForImages } from './pack/preload';
import { faceOf, type Portrait } from './portrait';
/**
 * 대화 장면 연출기.
 *
 * 대본은 "큐"의 목록이다. 큐는 대사(say)이거나 연출(나머지 전부)이다.
 * 소설의 지문("화면이 하얗게 번쩍이고 그녀가 나타났다")은 큐가 아니다. 화면에 글로 나오지 않는다.
 * 그 지문이 하려던 일은 flash, cg, enter 같은 연출 큐가 한다.
 *
 * 작가(아르곤)에게 받는 대본도 이 구분을 따른다: 한 줄은 대사이거나 연출 지시이고, 서술은 없다.
 */
import type { Choice, Condition, Value } from './story/parse';
import { all, ease, tween, until, wait, type Step } from './flow';
import { flash, shake, type Show } from './fx';
import { H, Shape, Sprite, W, type Node } from './stage';
import { COLOR, cover, quietCgCard, placeChip, storyLine, type Side, bigText } from './ui';
export const CG_TONES = ['강림','개그','섬뜩','감성'] as const;
export type CgTone = typeof CG_TONES[number];

export type Cue =
  | {do:'video';id:string}
  /** 배경을 바꾼다(암전을 거쳐). */
  | { do: 'bg'; image: string }
  /** 화 제목 카드. 화면이 어두워지고 "제1화"와 제목이 크게 떴다가 걷힌다. "전투 개시!" 같은 안내 글을 대신한다. */
  | { do: 'title'; chapter: string; title: string }
  /** 장소 표시를 띄운다. "장면: ○○"을 대신한다. */
  | { do: 'place'; text: string }
  /** 인물이 한쪽에서 들어온다. */
  | { do: 'enter'; who: string; side: Side; face?: string }
  | { do: 'exit'; who: string }
  /** 대사. 누르면 다음으로 넘어간다. */
  | { do: 'say'; who: string; text: string; face?: string; thought?: boolean; paged?: boolean }
  | { do: 'flash' }
  | { do: 'shake'; power?: number }
  /** sub is the illustration TITLE only. description is archival and never rendered. */
  | { do: 'cg'; image: string; name: string; sub: string; tone?: CgTone; description?: string; alone?: boolean }
  | { do: 'wait'; seconds: number }
  | { do: 'face'; who: string; face: string }
  | { do: 'dark'; alpha: number }
  | { do: 'music' | 'sound'; id?: string }
  | { do: 'choice'; choices: Choice[] }
  | { do: 'jump'; scene: string }
  | { do: 'condition'; test: Condition; scene: string }
  | { do: 'typed'; type: string; cue: Cue }
  | { do: 'affection'; who: string; amount: number }
  | { do: 'variable'; name: string; value: Value }
  | { do: 'recruit'; unit: string }
  | { do: 'map'; action: '보기' | '이동' | '등장' | '폭발' | '퇴장' | '합류' | '배리어' | '폼' | '통행' | '소진'; unit?: string; cell?: [number,number]; form?:string; barrier?:number; rect?:[number,number,number,number]; blocked?:boolean }
  | { do: 'end' };

/** @property faces 표정별 상반신 그림. default는 꼭 있어야 하고, 나머지는 같은 틀에 얼굴만 다른 그림이다. 목소리만 나오는 인물은 비워 둔다. */
export interface Actor { framingByImage?:Map<HTMLImageElement,NonNullable<Actor['framing']>>; framing?:{hairCrown:number;chin:number;faceCenterX:number;relativeHeight?:number}; moodSheet?: Portrait['moodSheet']; name: string; color: string; faces?: Record<string, HTMLImageElement | undefined>; height: number }
/** 플레이어의 "다음" 입력. 한 번 읽으면 지워진다. */
export class Taps {
  private pending = false;
  press(): void { this.pending = true; }
  take(): boolean { const had = this.pending; this.pending = false; return had; }
}

const SEAT = { left: 300, right: 985 };
const TALK_ZOOM=1.03;
/** Screen-space layout shared by map talk and background scenes. Coordinates are normalized to the source art. */
export function dialoguePortraitLayout(actor:Actor,bust:Sprite,seat:number):{x:number;y:number;height:number} {
  const c=bust.crop??{x:0,y:0,w:1,h:1},image=bust.image;
  const square=!!image?.naturalWidth&&image.naturalWidth/image.naturalHeight>=.8;
  const floor=square?H-240:H+8,framing=(image&&actor.framingByImage?.get(image))??actor.framing;
  const relative=framing?.relativeHeight??1;
  let height=Math.min(actor.height,(floor-24)/TALK_ZOOM);
  if(!square&&framing&&framing.chin>framing.hairCrown)height=Math.min(height,190*c.h/(framing.chin-framing.hairCrown));
  const ratio=image?.naturalWidth?image.naturalWidth*c.w/(image.naturalHeight*c.h):.8;
  height=Math.min(height,560/(ratio*TALK_ZOOM));
  height*=relative;
  const crown=framing?Math.max(0,Math.min(1,(framing.hairCrown-c.y)/c.h)):0;
  const width=height*ratio,center=framing?(framing.faceCenterX-c.x)/c.w:.5;
  const x=Math.max(24+width*TALK_ZOOM/2,Math.min(W-24-width*TALK_ZOOM/2,seat-(center-.5)*width));
  return{x,y:24+height*TALK_ZOOM*(1-crown),height};
}


export class Director {
  private busts = new Map<string, Sprite>();
  private seats = new Map<string, Side>();
  private line?: Node;
  onLineVisible?:(visible:boolean)=>void;
  private place?: Node;
  private background?: Sprite;
  private shade?:Node;
  private darkness?: Node;
  constructor(private readonly show: Show, private readonly cast: Record<string, Actor>,
    private readonly images: Record<string, HTMLImageElement | undefined>, private readonly taps: Taps, private readonly extension?: (cue: Cue) => Step) {}

  /** 인물의 표시 이름. 모르는 id면 id를 그대로 돌려준다. */
  nameOf(id: string): string { return this.cast[id]?.name ?? id; }

  *play(cues: readonly Cue[]): Step {
    yield* waitForImages(this.show,cueImages(cues,this.cast,this.images));
    for (const cue of cues) yield* this.cue(cue);
    this.clearLine();
  }

  *perform(cue: Cue): Step { yield* this.cue(cue); }
  dispose():void {this.clearLine();for(const bust of this.busts.values())bust.remove();this.busts.clear();this.seats.clear();this.background?.remove();this.shade?.remove();this.shade=undefined;this.place?.remove();this.darkness?.remove();this.background=undefined;this.place=undefined;this.darkness=undefined;}
  clearActors():void {for(const b of this.busts.values())b.remove();this.busts.clear();this.seats.clear();}
  clearLine(): void { this.line?.remove();this.line=undefined;this.onLineVisible?.(false); }
  private *cue(cue: Cue): Step {
    yield* waitForImages(this.show,cueImages([cue],this.cast,this.images));
    const { show } = this, { stage } = show;
    switch (cue.do) {
      case 'bg': {this.clearLine();
        const first = !this.background, black = stage.ui.add(cover('#000'));
        black.z = 95; black.alpha = first ? 1 : 0;
        yield* tween(black, { alpha: 1 }, 0.25);
        this.clearActors();
        this.background?.remove();
        // 배경은 화면보다 조금 크게 깔아서 카메라가 흔들려도 가장자리가 드러나지 않게 한다.
        this.background = stage.back.add(Object.assign(new Sprite(this.images[cue.image], H * 1.12), { x: W / 2, y: H / 2 }));
        // 화면 아래쪽을 어둡게 눌러 인물의 잘린 허리와 대사창 글자가 자연스럽게 읽히게 한다.
        if (first) this.shade=stage.back.add(Object.assign(new Shape({}, ctx => {
          const dark = ctx.createLinearGradient(0, H - 420, 0, H);
          dark.addColorStop(0, 'rgba(5,8,20,0)'); dark.addColorStop(1, 'rgba(5,8,20,.85)');
          ctx.fillStyle = dark; ctx.fillRect(-200, H - 420, W + 400, 520);
        }), { z: 5 }));
        yield* tween(black, { alpha: 0 }, 0.4);
        black.remove();
        return;
      }
      case 'title': {
        // 어두운 띠가 화면을 덮고, 화 번호가 먼저, 제목이 뒤따라 꽂힌다. 누르면 바로 넘어간다.
        this.clearLine();
        const veil = stage.ui.add(cover('#03060f')); veil.z = 95; veil.alpha = 0;
        const chapter = stage.ui.add(Object.assign(bigText(cue.chapter, 44, COLOR.gold, '#3a2a00'), { x: W / 2, y: H / 2 - 74, z: 96, alpha: 0 }));
        const title = stage.ui.add(Object.assign(bigText(cue.title || cue.chapter, 86, '#ffffff', COLOR.ally), { x: W / 2 + 120, y: H / 2 + 10, z: 96, alpha: 0 }));
        const rule = stage.ui.add(Object.assign(cover(COLOR.gold, H / 2 + 78, 4), { z: 96, scaleX: 0, x: 0 }));
        show.sound?.play('whoosh');
        yield* tween(veil, { alpha: 0.88 }, 0.25);
        yield* tween(chapter, { alpha: 1 }, 0.2);
        show.sound?.play('heavy', 0.6);
        yield* all(tween(title, { alpha: 1, x: W / 2 }, 0.25, ease.out), tween(rule, { scaleX: 1 }, 0.35, ease.out));
        this.taps.take();
        let held = 0;
        while (held < 1.8 && !this.taps.take()) held += yield;
        yield* all(tween(veil, { alpha: 0 }, 0.3), tween(chapter, { alpha: 0 }, 0.2), tween(title, { alpha: 0 }, 0.2), tween(rule, { alpha: 0 }, 0.2));
        veil.remove(); chapter.remove(); title.remove(); rule.remove();
        return;
      }
      case 'place': {
        this.place?.remove();
        const chip = this.place = stage.ui.add(placeChip(cue.text));
        Object.assign(chip, { x: -500, y: 34, z: 40 });
        yield* tween(chip, { x: 0 }, 0.35);
        return;
      }
      case 'enter': {
        this.busts.get(cue.who)?.remove();
        const actor = this.cast[cue.who], from = cue.side === 'left' ? -1 : 1;
        // Map camera motion must never move or enlarge dialogue portraits.
        const bust = stage.talk.add(Object.assign(new Sprite(actor.faces?.[cue.face ?? 'default'] ?? actor.faces?.default, actor.height),{portrait:{faces:actor.faces??{},crop:{x:0,y:0,w:1,h:1},moodSheet:actor.moodSheet},mood:cue.face??'default'}).trimToContent());
        this.frame(actor,bust);
        const position=dialoguePortraitLayout(actor,bust,SEAT[cue.side]);
        Object.assign(bust,position,{anchorY:1,x:position.x+from*240,alpha:0,shade:.55});
        for(const [id,other]of this.busts)if(this.seats.get(id)===cue.side)other.visible=false;
        this.seats.set(cue.who,cue.side);this.busts.set(cue.who, bust);
        yield* tween(bust, { x: position.x, alpha: 1 }, 0.35);
        return;
      }
      case 'exit': {
        const bust = this.busts.get(cue.who);
        if (!bust) return;
        yield* tween(bust, { alpha: 0, x: bust.x + (bust.x < W / 2 ? -200 : 200) }, 0.3, ease.in);
        bust.remove(); this.busts.delete(cue.who);this.seats.delete(cue.who);
        return;
      }
      case 'say': {
        const actor = this.cast[cue.who], speaker = this.busts.get(cue.who);
        // 표정이 바뀌면 그림을 갈아 끼우고 살짝 튀어 오르게 해서, 바뀐 순간이 눈에 들어오게 한다.
        const next = actor.faces?.[cue.face ?? 'default'] ?? actor.faces?.default;
        if (speaker && next && (speaker.image !== next || speaker.mood !== (cue.face ?? 'default'))) {
          speaker.image = next; speaker.mood=cue.face??'default';this.frame(actor,speaker);
          const position=dialoguePortraitLayout(actor,speaker,SEAT[this.seats.get(cue.who)!]);
          Object.assign(speaker,position,{y:position.y+18});
          show.runner.run(tween(speaker, { y: position.y }, 0.22, ease.out));
        }
        if(speaker){speaker.visible=true;for(const [id,other]of this.busts)if(id!==cue.who&&this.seats.get(id)===this.seats.get(cue.who))other.visible=false;}
        // 말하는 사람은 밝게 앞으로, 나머지는 어둡게 뒤로.
        const focus = [...this.busts].map(([id, bust]) => {
          bust.z = id === cue.who ? 2 : 1;
          return all(tween(bust, { shade: id === cue.who ? 0 : 0.55 }, 0.18), tween(bust, { scaleX: id === cue.who ? TALK_ZOOM : 1, scaleY: id === cue.who ? TALK_ZOOM : 1 }, 0.18));
        });
        this.line?.remove();
        const line = storyLine({ name: actor.name, text: cue.thought ? `（${cue.text}）` : cue.text, shown: 0, color: cue.thought ? '#aab1c4' : actor.color });
        line.z = 50; this.line = stage.ui.add(line);this.onLineVisible?.(true);
        yield* all(...focus, this.type(line.state));
        yield* until(() => this.taps.take());
        return;
      }
      case 'face': { const bust=this.busts.get(cue.who), actor=this.cast[cue.who]; if(bust){bust.image=faceOf({faces:actor.faces??{},crop:{x:0,y:0,w:1,h:1}},cue.face);bust.mood=cue.face;this.frame(actor,bust);Object.assign(bust,dialoguePortraitLayout(actor,bust,SEAT[this.seats.get(cue.who)!]));} return; }
      case 'dark': { this.darkness ??= stage.ui.add(Object.assign(cover('#000'),{alpha:0,z:45})); yield* tween(this.darkness,{alpha:cue.alpha},.4); return; }
      case 'music': show.sound?.music(cue.id); return;
      case 'sound': if(cue.id) show.sound?.play(cue.id as import('./sound').Sfx); return;
      case 'video': case 'choice': case 'jump': case 'condition': case 'typed': case 'affection': case 'variable': case 'recruit': case 'map': case 'end': if(this.extension) yield* this.extension(cue); return;
      case 'flash': show.sound?.play('flash'); flash(show, 1, 0.5); yield* wait(0.12); return;
      case 'shake': show.sound?.play('hit'); yield* shake(show, cue.power ?? 16, 0.45); return;
      case 'wait': yield* wait(cue.seconds); return;
      case 'cg': if(cue.alone) { this.clearLine(); const image=this.images[cue.image],art=stage.ui.add(Object.assign(new Shape({},ctx=>{ctx.fillStyle='#05070c';ctx.fillRect(0,0,W,H);if(image?.naturalWidth)drawFocusedImage(ctx,image,{x:24,y:24,w:W-48,h:H-48},1.06);}),{z:55})); this.taps.take(); yield* until(()=>this.taps.take()); art.remove(); return; } yield* this.cg(cue.image, cue.name, cue.sub, cue.tone ?? '강림'); return;
    }
  }

  private frame(actor:Actor,bust:Sprite):void {
    bust.trimToContent();const c=bust.crop,r=actor.moodSheet?.rect;
    if(c&&r){const x=Math.min(c.x,r[0]),y=Math.min(c.y,r[1]);bust.crop={x,y,w:Math.max(c.x+c.w,r[0]+r[2])-x,h:Math.max(c.y+c.h,r[1]+r[3])-y};}
  }

  /** 글자가 차오른다. 도중에 누르면 한 번에 다 나온다. */
  private *type(state: { shown: number; text: string }): Step {
    this.taps.take();
    let blip = 0;
    while (state.shown < state.text.length) {
      state.shown = Math.min(state.text.length, state.shown + (yield) * 46);
      // 글자가 나오는 동안 세 글자에 한 번씩 톡톡 소리를 낸다.
      if (state.shown - blip >= 3) { blip = state.shown; this.show.sound?.play('text'); }
      if (this.taps.take()) state.shown = state.text.length;
    }
  }

  /** Tone-specific CG, character name and title. Archival description never enters this renderer. */
  private *cg(image: string, name: string, sub: string, tone: CgTone): Step {
    const {show}=this,{stage}=show;this.clearLine();if(this.place)this.place.visible=false;
    const imageElement=this.images[image],veil=stage.ui.add(Object.assign(cover('#05070c'),{z:54}));
    const art=stage.ui.add(Object.assign(new Shape({imageId:image,tone,zoom:1,dx:0,dy:0,layout:undefined as ImageRect|undefined},(ctx,s)=>{
      if(imageElement?.naturalWidth)s.layout=drawFocusedImage(ctx,imageElement,{x:24,y:24,w:W-48,h:H-144},s.zoom,[s.dx,s.dy]);
    }),{z:55,alpha:tone==='강림'?1:0}));
    // A dedicated bottom caption never masks a face, including lower-positioned figures.
    const card=stage.ui.add(quietCgCard(name,sub,tone==='섬뜩'?'#94b2cc':COLOR.ink));Object.assign(card,{x:42,y:H-110,z:62,alpha:0});
    if(tone==='강림'){
      show.sound?.play('heavy',.7);
      show.runner.run(tween(art.state,{zoom:1.06,dx:-8},6,ease.linear));
      yield* tween(card,{alpha:1},.3);show.sound?.play('slash',.8);
    }else if(tone==='개그'){
      art.state.zoom=1.045;show.sound?.play('confirm',.35);
      yield*all(tween(art,{alpha:1},.23),tween(art.state,{zoom:1,dx:4},.23,ease.back),tween(card,{alpha:1},.22));
    }else{
      const cold=tone==='섬뜩';if(cold)show.sound?.play('cg-cold',.3);
      yield*all(tween(art,{alpha:1},cold?1.8:1.1,ease.inOut),tween(card,{alpha:1},cold?1.9:1.25));
      show.runner.run(tween(art.state,{zoom:1.025,dy:-4},12,ease.linear));
    }
    this.taps.take();yield*until(()=>this.taps.take());
    yield*all(tween(art,{alpha:0},.35),tween(card,{alpha:0},.25));
    art.remove();card.remove();veil.remove();if(this.place)this.place.visible=true;
  }
}
