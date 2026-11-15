/** 플랫폼 저장소/콘텐츠 조회를 조립한다. 화면은 이 의존성을 모른다. */
import {interpolate,playerName} from '../../campaign/player';
import {TrainingSaves} from '../adapter/saves';
import { browserStorage } from '../../platform/storage';
import { CoreCampaign } from '../adapter/campaign';
import type { Pack } from '../pack/load';
import { currentPack } from '../pack/browser';
import { packLookup } from '../pack/load';
import { configureTerms } from '../terms';
import type { Sample } from '../gallery/sample';
import type { App } from '../screen';
import { GameFlow } from './flow';

export async function startGame(app: App, sample: Pick<Sample,'images'>, leave?: () => void,providedPack?:Pack,preview=false,showTitle=true): Promise<GameFlow> {
  const pack=providedPack??await currentPack();if(pack.errors.length)throw new Error(JSON.stringify(pack.errors));configureTerms(pack.game.terms);const content=pack.rules,campaignContent=pack.campaign;
  const memory=new Map<string,string>(),bytes=preview?{read:async(key:string)=>memory.get(key)??null,replace:async(key:string,value:string)=>{memory.set(key,value);}}:browserStorage(pack.game.id);
  const saves = new TrainingSaves(bytes, campaignContent, content,pack.training); await saves.init();
  const lookup = packLookup(pack,sample.images,()=>model.session.campaign.player?.cast,()=>({name:playerName(model.session.campaign),unitName:model.session.campaign.player?.unitName??''}));
  const local = { getItem: (key: string) => globalThis.localStorage.getItem(key), setItem: (key: string, value: string) => globalThis.localStorage.setItem(key, value) };
  const model=new CoreCampaign(campaignContent,content,saves,lookup,local,pack.game.credits??[],pack);
  if(app.loadingScreen)app.loadingScreen.resolve=text=>interpolate(text,model.session.campaign);
  const flow = new GameFlow(app, model, sample, leave,pack); if(showTitle)flow.title(); return flow;
}
