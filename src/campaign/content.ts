import type { Stage } from '../core';
import type { Character, Program } from '../scenario/types';
import type { CampaignNode } from './state';
import type {PlayerConfig} from './player';
export interface CampaignContent {saveMigrations?:import('./save-migration').SaveMigration[];id?:string;players?:PlayerConfig;characters:Character[];nodes:CampaignNode[];stages:Record<string,{stage:Stage;program:Program}>}
