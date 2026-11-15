import { preloadImages } from '../pack/images';
import { Screen } from '../screen';
import {assetWarnings} from '../pack/asset-check';
import {packText} from '../pack/files';
import {resolvePath} from '../pack/load';
import { label, MenuList, Tabs } from '../kit';
import { Shape, Sprite } from '../stage';
import { cover } from '../ui';
import type { Pack } from '../pack/load';
import { packActors, packUnit } from '../pack/load';
import { PackStoryScreen, memoryStoryState } from '../story/play';
import type { Sample } from './sample';
abstract class PackPage extends Screen {
    constructor(readonly pack: Pack, readonly sample: Sample) { super(); }
    frame(title: string): void { this.stage.back.add(cover('#080d20')); this.stage.ui.add(Object.assign(label(title, 32), { x: 80, y: 95 })); this.ui.setNavigation({kind:'back',onBack:()=>this.app.pop()}); }
}
export class StoryPreviewScreen extends PackPage {
    private episode = 0;
    private type='';
    private list?: MenuList;
    enter(): void { this.frame('대본 틀어 보기'); this.ui.add(Object.assign(new Tabs(this.pack.game.episodes.map(e => e.title), i => { this.episode = i; this.scenes(); }, { w: 830 }), { x: 80, y: 155 })); this.ui.add(Object.assign(new Tabs(this.pack.players.presets.map(p=>p.name),i=>{this.type=this.pack.players.presets[i].type;}, { w: 290 }), { x: 910, y: 155 })); this.scenes(); }
    private state():import('../story/play').StoryState{const preset=this.pack.players.presets.find(p=>p.type===this.type)??this.pack.players.presets[0];return {...memoryStoryState(preset.type,this.pack.game.story?.affection),placeholders:this.pack.players.placeholders,playerName:()=>this.pack.players.name.default,unitName:()=>this.pack.players.lines[0]?.unitName??'',actor:id=>id===this.pack.players.actor?preset.cast??id:id};}
    private scenes(): void {const id=this.pack.game.episodes[this.episode].id;if(this.pack.ensureStory&&!this.pack.storyLoaded?.(id)){this.app.load(this.pack.ensureStory(id).then(()=>this.scenes()));return;} if (this.list)
        this.ui.remove(this.list); const ep = this.pack.game.episodes[this.episode]; const scenes = Object.keys(this.pack.stories[ep.id].scenes).filter(s => !s.startsWith('_')); this.list = this.ui.add(Object.assign(new MenuList(scenes.map(label => ({ label })), i => this.app.push(new PackStoryScreen(this.pack.stories[ep.id], scenes[i], packActors(this.pack, this.sample.images), this.sample.images, this.state(), () => this.app.pop())), { w: 1120, rows: 7, rowHeight: 52 }), { x: 80, y: 230 })); }
}
export class PackCheckScreen extends PackPage {
    private artWarnings:Pack['warnings']=[];
    prepare():Promise<void>|void{const path=this.pack.game.art.metadata;if(typeof window!=='undefined')return Promise.all([...this.pack.game.episodes.map(e=>this.pack.ensureStory?.(e.id)),this.pack.ensureExamples?.(),this.pack.ensureGallery?.()]).then(async()=>{if(path){const text=await packText(resolvePath(this.pack.root,path));const report={...this.pack,warnings:[]};assetWarnings(report,JSON.parse(text));this.artWarnings=report.warnings;}});}
    enter(): void { const warnings=[...this.pack.warnings,...this.artWarnings];this.frame(`팩 검사 결과 · 오류 ${this.pack.errors.length} / 경고 ${warnings.length}`); const kinds = [...new Set(warnings.map(w => w.kind ?? '기타'))]; let list: MenuList | undefined; const show = (kind: string) => { if (list)
        this.ui.remove(list); list = this.ui.add(Object.assign(new MenuList(warnings.filter(w => w.kind === kind).map(w => ({ label: w.message, description: `${w.file}:${w.line} · ${w.fix}`, labelSize: 21 })), () => undefined, { w: 1120, rows: 4, rowHeight: 88 }), { x: 80, y: 240 })); }; this.ui.add(Object.assign(new Tabs(kinds, i => show(kinds[i]), { w: 1120 }), { x: 80, y: 165 })); show(kinds[0]); }
}
export class AnchorsScreen extends PackPage {
    prepare():Promise<void>|void {const u=Object.values(this.pack.units).find(u=>u.art&&u.anchors);return preloadImages([this.sample.images[u?.art??'']]);}
    private art?: Sprite;
    private dots?: Shape;
    enter(): void { this.frame('기준점 보기'); const seen=new Set<string>();const entries=Object.entries(this.pack.units).flatMap(([id,u])=>[[id,u],...Object.entries(u.forms??{}).map(([form,d])=>[`${id} / ${form}`,d])] as [string,import('../pack/load').UnitDef][]).filter(([,u])=>!!(u.art||u.recolor)&&!!u.anchors).map(([label])=>{const [id,form]=label.split(' / ');return [label,packUnit(this.pack,id,'player',form)] as const;}).filter(([,u])=>{const key=u.recolor?JSON.stringify(u.recolor):u.art;if(seen.has(key))return false;seen.add(key);return true;}); const show = (i: number) => { this.art?.remove(); this.dots?.remove(); const [id, u] = entries[i];const task=preloadImages([this.sample.images[u.art!]]);if(task){this.app.preload([this.sample.images[u.art!]],()=>show(i));return;} const art = this.art = this.stage.world.add(Object.assign(new Sprite(this.sample.images[u.art!], 420).trimToContent(), { x: 880, y: 420 })); this.dots = this.stage.ui.add(new Shape({}, ctx => { ctx.font = '700 18px sans-serif'; for (const [name, [x, y]] of Object.entries(u.anchors!)) {
        const px = art.x + (x - .5) * art.width, py = art.y + (y - .5) * art.height;
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#05070c';
        ctx.strokeText(name, px + 10, py);
        ctx.fillText(name, px + 10, py);
    } ctx.fillStyle = '#b9c7e6'; ctx.fillText(`${id} · ${u.faces ?? 'left'} · 보이는 그림 기준`, 600, 670); if (u.temporary) {
        ctx.fillStyle = '#ffd23f';
        ctx.fillText('임시 그림', 800, 180);
    } })); }; this.ui.add(Object.assign(new MenuList(entries.map(([id]) => ({ label: id, labelSize: 16 })), i => show(i), { w: 470, rows: 8, rowHeight: 51, onMove: i => show(i) }), { x: 80, y: 165 })); show(0); }
}
