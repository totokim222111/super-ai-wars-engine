/**
 * 표면: 실제 캔버스 한 장.
 * 논리 좌표(1280×720)와 화면의 실제 픽셀 사이를 잇는다. 그리는 쪽은 늘 논리 좌표만 쓴다.
 */
import { H, W } from './stage';

export class Surface {
  readonly ctx: CanvasRenderingContext2D;
  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
  }
  /** 캔버스의 실제 픽셀 수를 화면 표시 크기에 맞춘다(고해상도 화면은 2배까지). */
  resize(): void {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(Math.min((this.canvas.clientWidth || W) * ratio, W * 2));
    if (this.canvas.width !== width) { this.canvas.width = width; this.canvas.height = Math.round(width * H / W); }
  }
  /** 한 프레임을 시작한다: 논리 좌표로 맞추고 바탕을 지운다. */
  begin(): CanvasRenderingContext2D {
    const unit = this.canvas.width / W, ctx = this.ctx;
    ctx.setTransform(unit, 0, 0, unit, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#05070c'; ctx.fillRect(0, 0, W, H);
    return ctx;
  }
  /** 마우스·터치의 화면 좌표를 논리 좌표로 바꾼다. */
  toLogical(clientX: number, clientY: number): { x: number; y: number } {
    const box = this.canvas.getBoundingClientRect();
    return { x: (clientX - box.left) / box.width * W, y: (clientY - box.top) / box.height * H };
  }
}
