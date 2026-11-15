import { ConfirmScreen } from '../dialogs';
import { label, toast } from '../kit';
import type { Screen } from '../screen';
import type { MenuModel } from './model';
export interface MenuLook { background?: HTMLImageElement; portraits?: (HTMLImageElement | undefined)[]; temporary?: boolean; music?:string }
export function at<T extends { x: number; y: number }>(node: T, x: number, y: number): T { return Object.assign(node, { x, y }); }
export function temporary(screen: Screen, look: MenuLook): void {
  if (look.temporary) screen.stage.ui.add(at(label('임시 그림 포함', 17, { color: '#ffd23f', align: 'right' }), 1170, 82));
}
export function confirm(screen: Screen, message: string, run: () => boolean | void, result: string, after?: () => void): void {
  screen.app.push(new ConfirmScreen(message, () => { const success = run(); toast(screen, success === false ? '처리하지 못했습니다' : result); after?.(); }), 'none');
}
export function notify(screen: Screen, task: Promise<void>, after?: () => void): void {
  void task.then(() => { toast(screen, '완료했습니다'); after?.(); }).catch(error => toast(screen, String(error instanceof Error ? error.message : error)));
}
export function options(model: MenuModel) { const s = model.settings(); return { animation: s.animation, speed: s.speed, shake: s.shake / 10 }; }
