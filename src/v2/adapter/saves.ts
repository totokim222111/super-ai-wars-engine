/** 저장 형식·마이그레이션은 기존 것. 검증 전에 파일별 육성 자료만 코어에 투영한다. */
import {Saves,restoreSave,SLOT_IDS,type SlotId,type SaveFile} from '../../campaign/saves';
import type {CampaignContent} from '../../campaign/content';
import type {Content} from '../../core';
import type {ByteStore} from '../../platform/storage';
import type {Training} from '../pack/progression';
import {growthFromFlags,trainedContent} from './training';
export class TrainingSaves extends Saves {
  private pending:Promise<unknown>=Promise.resolve();
  constructor(storage:ByteStore,data:CampaignContent,content:Content,private readonly training?:Training){super(storage,data,content);}
  private checked(value:unknown){const file=value as SaveFile,growth=growthFromFlags(file?.campaign?.flags);return {...restoreSave(value,this.data,trainedContent(this.content,growth,this.training),c=>trainedContent(c.content,growth,(c as typeof c & {training?:Training}).training)),data:this.data};}
  async refresh():Promise<void>{this.slots=await Promise.all(SLOT_IDS.map(async id=>{try{const raw=await this.storage.read(id);return raw===null?{id,status:'empty' as const}:{id,status:'ok' as const,file:this.checked(JSON.parse(raw)).file};}catch(error){return {id,status:'unreadable' as const,error:String(error)};}}));}
  async load(id:SlotId){const raw=await this.storage.read(id);if(!raw)throw new Error('빈 슬롯');const loaded=this.checked(JSON.parse(raw));if(loaded.file.migrationNotice){const clean=structuredClone(loaded.file);delete clean.migrationNotice;await this.storage.replace(id,JSON.stringify(clean));await this.refresh();}return loaded;}
  write(id:SlotId,file:SaveFile):Promise<void>{const bytes=JSON.stringify(this.checked(file).file),operation=this.pending.then(async()=>{await this.storage.replace(id,bytes);await this.refresh();});this.pending=operation.catch(()=>{});return operation;}
  async export():Promise<string>{await this.pending;return super.export();}
  importFile(json:string):{id:SlotId;file:SaveFile}[]{
    if(json.length>10_000_000)throw new Error('파일이 너무 큽니다');
    const bundle=JSON.parse(json);
    if(bundle?.format!==`${this.data.id??'default'}:slots:2`||!bundle.slots||typeof bundle.slots!=='object'||Array.isArray(bundle.slots)||Object.keys(bundle.slots).some(id=>!SLOT_IDS.includes(id as SlotId)))throw new Error('저장 파일 형식 오류');
    return SLOT_IDS.flatMap(id=>{const raw=bundle.slots[id];if(raw===null||raw===undefined)return [];if(typeof raw!=='string')throw new Error('슬롯 형식 오류');return [{id,file:this.checked(JSON.parse(raw)).file}];});
  }
}
