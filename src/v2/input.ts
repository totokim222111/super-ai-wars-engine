import {inputDevice} from './presentation';
/**
 * 입력. 키보드·마우스·터치를 두 가지 사건으로 통일한다.
 *   - action: "위", "결정", "취소" 같은 뜻 단위의 조작. 화면은 어떤 키였는지 모른다.
 *   - pointer: 논리 좌표의 누름·움직임·뗌. 마우스와 터치를 구분하지 않는다.
 * 화면과 UI 부품은 이 두 가지만 받는다. 게임패드를 붙일 때도 여기만 고치면 된다.
 */
import type { Surface } from './surface';

export type Action = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'cancel' | 'menu' | 'skip'|'fast-on'|'fast-off'|'auto'|'log';
export type InputEvent =
  | { kind: 'action'; action: Action;wheel?:boolean;shift?:boolean;key?:string }
  | { kind: 'pointer'; phase: 'down' | 'move' | 'up'; x: number; y: number };

const KEYS: Record<string, Action> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
  Enter: 'confirm', ' ': 'confirm', z: 'confirm',
  Escape: 'cancel', Backspace: 'cancel', x: 'cancel',
  l:'log',q:'up',e:'down',
  Tab: 'menu', m: 'menu', Control: 'skip', f: 'skip',
};

export class Input {
  private readonly off: (() => void)[] = [];
  constructor(surface: Surface, emit: (event: InputEvent) => void) {
    const { canvas } = surface;
    const listen = <K extends keyof HTMLElementEventMap>(target: EventTarget, type: K | 'keydown', handler: (event: never) => void): void => {
      target.addEventListener(type, handler as EventListener);
      this.off.push(() => target.removeEventListener(type, handler as EventListener));
    };
    listen(window, 'keydown', (event: KeyboardEvent) => {
      if(event.key!=='Escape'&&event.target instanceof Element&&event.target.closest('input,textarea,[contenteditable]'))return;
      const action = KEYS[event.key.length === 1 ? event.key.toLowerCase() : event.key];
      if (!action || event.altKey || event.metaKey) return;
      event.preventDefault();
      emit({ kind: 'action', key:event.key,action:event.key==='Control'?'fast-on':action });
    });
    const pointer = (phase: 'down' | 'move' | 'up') => (event: PointerEvent): void => {
      if(phase==='down')inputDevice(event.pointerType);
      if (phase === 'down') canvas.setPointerCapture?.(event.pointerId);
      emit({ kind: 'pointer', phase, ...surface.toLogical(event.clientX, event.clientY) });
    };
    listen(canvas, 'pointerdown', pointer('down'));
    listen(canvas, 'pointermove', pointer('move'));
    listen(canvas, 'pointerup', pointer('up'));
    listen(window,'keyup',(event:KeyboardEvent)=>{if(event.key==='Control')emit({kind:'action',action:'fast-off'});});
    listen(window,'blur',()=>emit({kind:'action',action:'fast-off'}));
    listen(canvas,'pointercancel',()=>emit({kind:'action',action:'fast-off'}));
    let wheel=0;canvas.addEventListener('wheel',wheelEvent,{passive:false});this.off.push(()=>canvas.removeEventListener('wheel',wheelEvent));
    function wheelEvent(event:WheelEvent):void{event.preventDefault();wheel+=event.deltaY*(event.deltaMode===1?20:event.deltaMode===2?720:1);while(Math.abs(wheel)>=100){const sign=Math.sign(wheel);emit({kind:'action',action:sign>0?'down':'up',wheel:true,shift:event.shiftKey});wheel-=sign*100;}}
    // 오른쪽 버튼은 "취소"로 쓴다(원작의 조작감).
    listen(canvas, 'contextmenu', (event: MouseEvent) => { event.preventDefault(); emit({ kind: 'action', action: 'cancel' }); });
  }
  dispose(): void { for (const off of this.off) off(); }
}
