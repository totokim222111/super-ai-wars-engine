import { ConfirmScreen } from '../dialogs';
import { toast } from '../kit';
import type { Screen } from '../screen';
import type { MenuModel } from './model';
export interface MenuLook {lineImages?:Record<string,HTMLImageElement|undefined>; background?: HTMLImageElement; portraits?: (HTMLImageElement | undefined)[]; temporary?: boolean; music?:string }
export function at<T extends { x: number; y: number }>(node: T, x: number, y: number): T { return Object.assign(node, { x, y }); }
export function temporary(_screen: Screen, _look: MenuLook): void {}
export function confirm(screen: Screen, message: string, run: () => boolean | void, result: string, after?: () => void): void {
  screen.app.push(new ConfirmScreen(message, () => { const success = run(); toast(screen, success === false ? '처리하지 못했습니다' : result); after?.(); }), 'none');
}
export function notify(screen: Screen, task: Promise<void>, after?: () => void): void {
  void task.then(() => { toast(screen, '완료했습니다'); after?.(); }).catch(error => toast(screen, String(error instanceof Error ? error.message : error)));
}
export function options(model: MenuModel) { const s = model.settings(); return { animation: s.animation, speed: s.speed, shake: s.shake / 10,flash:(s.flash??7)/10,enemyBattle:s.enemyBattle??'full',setSpeed:(speed:number)=>model.setSettings({...model.settings(),speed}) }; }
