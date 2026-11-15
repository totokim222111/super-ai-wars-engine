import type {Persona} from './player';
import type { StageUnit } from '../core';
export interface CampaignState { retryNode?:number; retryExperience?:Record<string,Pick<StageUnit,'level'|'exp'|'subPilotProgress'>>; cycle?:number; inheritance?:StageUnit[]; node: number; persona?:Persona; player?:{name:string;preset:string;type:string;line:string;cast?:string;actor?:string;unitId?:string;pilotId?:string;unitName?:string;alternative:number;placeholders?:Record<string,'name'|'unitName'>}; roster: StageUnit[]; credits: number; parts: string[]; flags: Record<string, boolean>; affection?: Record<string, number>; affectionChoices?: Record<string, number>; cleared: string[]; stageCredits: number; battleCredits?: number }
export type CampaignNode = { type: 'stage'; id: string; if?: string } | { type: 'intermission'; if?: string };
export const newCampaign = (): CampaignState => ({ node: 0, roster: [], credits: 0, parts: [], flags: {}, cleared: [], stageCredits: 0 });
export function nextNode(nodes: CampaignNode[], state: CampaignState, advance = true): number {
  let index = state.node + Number(advance);
  while (index < nodes.length && nodes[index].if && !state.flags[nodes[index].if!.replace(/^flag:/, '')]) index++;
  return index;
}
