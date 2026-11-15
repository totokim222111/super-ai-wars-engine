import {storageKey} from './storage';
type AnimationMode='on'|'off'|'allies';
export interface Settings { sound: boolean; volume: number; textSpeed: 'slow' | 'normal' | 'fast' | 'instant'; fastEnemy: boolean; autoResponse: boolean; grid: boolean; threat: boolean; helpSeen: boolean; animation: AnimationMode }
export const defaultSettings: Settings = { sound: true, volume: 10, textSpeed: 'normal', fastEnemy: false, autoResponse: false, grid: true, threat: false, helpSeen: false, animation: 'on' };
export const settingsKey=(id='default')=>storageKey(id,'ui');
export const SETTINGS_KEY=settingsKey();
export function loadSettings(packId='default'): Settings {
  try { return normalizeSettings(JSON.parse(localStorage.getItem(settingsKey(packId))??'{}')); }
  catch { return {...defaultSettings}; }
}
export function normalizeSettings(s: Partial<Settings> | null): Settings {
  s ??= {};
  const volume=Number.isInteger(s.volume)&&s.volume!>=0&&s.volume!<=10?s.volume!:s.sound===false?0:10;
  return {sound:volume>0,volume,textSpeed:['slow','normal','fast','instant'].includes(s.textSpeed!)?s.textSpeed!:'normal',fastEnemy:s.fastEnemy===true,autoResponse:s.autoResponse===true,grid:s.grid!==false,threat:s.threat===true,helpSeen:s.helpSeen===true,animation:['on','off','allies'].includes(s.animation!)?s.animation!:'on'};
}
export const textRate = (speed: Settings['textSpeed']): number => ({slow:50,normal:25,fast:10,instant:0})[speed];
export function storeSettings(s: Partial<Settings>,packId='default'): void { try { localStorage.setItem(settingsKey(packId),JSON.stringify(normalizeSettings(s))); } catch { /* Play remains available without storage. */ } }
export function reducedMotion(): boolean { return typeof matchMedia!=='undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches; }
