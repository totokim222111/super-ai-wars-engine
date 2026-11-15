/** M2 data contracts. The core has no DOM, clock, filesystem or global RNG. */
export type Environment = 'air' | 'ground' | 'sea' | 'space';
export type Grade = 'S' | 'A' | 'B' | 'C' | 'D';
export type Adaptation = Record<Environment, Grade>;
export type Size = 'SS' | 'S' | 'M' | 'L' | 'LL';
export type Side = 'player' | 'enemy' | 'neutral';
export type Phase = Exclude<Side, 'neutral'>;
export type AIType = 'aggressive' | 'hold' | 'defensive';
export type AIPattern = 'aggressive'|'hold'|'guard'|'ambush'|'boss'|'objective'|'retreat';
export interface AITrigger { turn?:number; hpBelow?:number; area?:string; variable?:{name:string;equals:string|number|boolean} }
export interface AIBehavior { pattern:AIPattern; anchor?:Point; anchorUnit?:string; radius?:number; target?:Point; area?:string; when?:AITrigger[] }
export interface AIPatterns { default?:AIBehavior; groups?:{id:string;ids?:string[];tags?:string[];behavior:AIBehavior}[]; units?:Record<string,AIBehavior> }
export interface Point { x: number; y: number }
export interface Pilot {
  hostProgress?:boolean;
  id: string; name: string;
  stats: { melee: number; shoot: number; hit: number; evade: number; skill: number; defense: number };
  growth?: Partial<Pilot['stats']>; spGrowth?: number; spirits?: {id: string; level: number}[];
  /** Piecewise linear growth, keyed by level; replaces linear growth for these stats. */
  statCurves?: Partial<Record<keyof Pilot['stats'], {level:number;value:number}[]>>;
  skills?: {id: string; level?: number}[]; aiSpirits?: {id: string; when: string}[];
  sp: number; adapt: Adaptation; startMorale?: number; faces?: Record<string, string>; character?: string;
}
export interface Mech {
  allyStats?:Partial<Pick<Mech,'hp'|'en'|'armor'|'mobility'|'move'|'weapons'|'forms'>>&{weaponPower?:Record<string,number>};
  pilotOverrides?:{pilotId?:string;stats?:Partial<Pilot['stats']>;growth?:Partial<Pilot['stats']>;sp?:number;spGrowth?:number};
  id: string; name: string; hp: number; en: number; armor: number; mobility: number;
  exp?: number; credits?: number; costClass?: number; partSlots?: number;
  enRecovery?: {pct?:number;flat?:number};
  hpRecovery?: {pct?:number;flat?:number};
  devices?: SupportDevice[];
  subPilots?: string[];
  cheerHp?:number;
  forms?: {id: string; name: string; overrides: Partial<Pick<Mech, 'hp'|'en'|'move'|'moveType'|'adapt'|'mobility'|'armor'|'weapons'|'size'|'enRecovery'>>}[];
  aiForm?: {formId: string; when: string}[];
  move: number; moveType: Environment[]; size: Size; adapt: Adaptation; weapons: string[];
}
export type WeaponSpecial = {label:string;cooldown?:number} & (
 | {kind:'status';target:'enemy'|'self';rounds:number;atoms:EffectAtom[]}
 | {kind:'drain';ratio:number;max:number}
 | {kind:'critical'}
 | {kind:'summon';limit:number;hpPct:number}
 | {kind:'extraAction'}
 | {kind:'restore';target:'self'|'allies';radius:number;hpPct?:number;enFlat?:number;ammo?:number});
export interface Weapon {
  special?:WeaponSpecial;
  finisher?:boolean;fixedPower?:boolean;
  id: string; name: string; kind: 'melee' | 'shoot' | 'beam' | 'missile' | 'map'; power: number; range: [number, number];
  hit: number; crit: number; en?: number; ammo?: number; postMove: boolean;
  map?: {shape: 'burst'|'line'|'area'; size: number; friendlyFire: boolean};
  moraleReq?: number; adapt: Adaptation; icon?: 'melee' | 'shoot' | 'beam' | 'missile' | 'map'; anim?: string;
}
export interface Terrain {
  id: string; name: string; env: Environment; moveCost: Record<Environment, number | null>;
  hitMod: number; damageMod: number; recover?: { hp: number; en: number };
}
export type UpgradeKey = 'hp'|'en'|'armor'|'mobility'|'weapons';
export type Upgrades = Record<UpgradeKey, number>;
export interface Loadout { level?: number; exp?: number; upgrades?: Upgrades; parts?: (string|null)[]; fullUpgradeBonus?: string; subPilotProgress?:{pilotId:string;level:number;exp:number}[] }
export interface StageUnit extends Point, Loadout { id: string; pilotId: string; mechId: string; side: Side; ai?: AIType; tags?: string[];pilotOverrides?:{stats?:Partial<Pilot['stats']>;growth?:Partial<Pilot['stats']>;startMorale?:number;clearOnJoin?:boolean} }
export interface EnemyPilotScaling {
  baseline:{level:number;stats:Pilot['stats']};
  units:Record<string,{ratio:number;actionCap?:number}>;
  /** A new cycle uses actual inherited main-pilot levels/training instead of the first-cycle expectation. */
  newGamePlusReference?:'allied-mean';
  referencePilots?:string[];
}
export interface Stage { enemyPilotScaling?:EnemyPilotScaling; enemyUpgradeLevel?:number; aiPatterns?:AIPatterns; contentOverrides?:{aliases?:Record<string,string>;mechs?:Record<string,Partial<Mech>>;weapons?:Record<string,Partial<Weapon>>}; minimumLevel?:number; id: string; name?: string; map: { w: number; h: number; tiles: string[][]; asset?: string }; units: StageUnit[]; scenario?: boolean; definitions?: StageUnit[]; waves?: Record<string, StageUnit[]>; areas?: Record<string, [number, number, number, number]>; rosterDeployments?: Record<string, [number, number]>; sprites?: Record<string, number> }
export interface Rules {
  meleeHitBonus?:number;
  combatMoraleCap?:number;
  supportExperience?:{levelGapBonus:number;maxPerAction:number;minMissingEnPct:number;minMissingHpPct:number;maxPerStage:number;firstBonus:Record<string,number>;levelCeiling:number;regularPilots:string[]};
  version: string;
  expPerLevel: number; levelMax: number; expLevelFactor: number; expFactorMin: number; expFactorMax: number; damageExpRatio: number; supportDefenseExp: number;
  weaponUpgrade?:{mode:'percent';rate:number};
  actions?: {stat?:keyof Pilot['stats'];threshold?:number;level?:number;count:number;extraMax?:number};
  critical?: {stat:keyof Pilot['stats'];coefficient:number;min:number;max:number};
  skillActivation?: {stat:keyof Pilot['stats'];coefficient:number;min:number;max:number};
  upgradeLimits?: Partial<Record<UpgradeKey,{max:number;newGamePlusMax?:number;costs:number[]}>>;
  newGamePlus?: {carry:('upgrades'|'credits'|'parts'|'levels'|'training')[];enemyUpgradeOffsetPerCycle?:number};
  retryOnDefeat?: {keep:('exp'|'credits')[]};
  enemyUpgrades?: {armorDivisor?:number;mobilityDivisor?:number;armorCap?:number;mobilityCap?:number;weaponDivisor:number};
  deploymentUpgradeMax?:number;
  upgradeMax: number; fullUpgradeThreshold: number; upgradeStep: Upgrades; upgradeCost: number[]; supportDefenseHp: number;
  k: {
    hitBase: number; hitPilot: number; evadePilot: number; evadeMobility: number;
    mobilityBase: number; statDivisor: number; critMul: number; defendResponse: number;
    evadeResponse: number; minDamage: number; spread: number; critSkill: number;
  };
  adaptHit: Record<Grade, number>; adaptDmg: Record<Grade, number>;
  sizeHit: Record<Size, number>; sizeDmg: Record<Size, number>;
  morale: { start: number; min: number; max: number; round: number; hit: number; damaged: number; evade: number; kill: number; allyKill: number };
  enRegenPerRound: number; airMoveCost: number;
  recoveryTiming?:'round'|'phase';
  consumablePolicy?:'stage'|'consume';
  ai: { killBonus: number; counterWeight: number; defensiveHp: number; defendHp: number;
    resources?: {ammoBonus:number;reserveFinisher:boolean;reservePenalty:number;finisherMorale?:number;utility?:{targetHpRatioWeight:number;lethalBonusCap:number;lethalUsefulMultiplier:number;counterWeight:number;enReserve:number;baseEnPrice:number;scarceEnPrice:number;ammoUsefulFactor:number;roleEnPrices?:Record<string,number[]>;futureBurstWeight?:number;ordinaryActionSavingWeight?:number};enemyResponse?:{mode:'counter-first';defendHp:number;evadeHp:number};nearOptimal?:number;burst?:{base:number;crowded:number;eliteCount:number;eliteMechs:string[]};positionPlan?:boolean;safeResponse?:boolean;roundRobin?:boolean;supportUnits?:string[];supportPilots?:string[]} };
  effects: { sureHit: number; quarterDamage: number };
}
export interface Content {aiVariables?:Record<string,string|number|boolean>;aiSides?:Record<string,string>;aiReserves?:Record<string,number>;options?:{spiritAfterAction?:boolean};terms?:Record<string,string>;tagEffects?:TagEffect[]; version: string; rules: Rules; pilots: Pilot[]; mechs: Mech[]; weapons: Weapon[]; terrain: Terrain[];
  spirits?: Spirit[]; skills?: Skill[]; parts?: Part[]; combinations?: Combination[]; fullUpgradeBonuses?: EffectDefinition[];
}
export type EffectHook = 'onRoundStart' | 'onBeforeMove' | 'modifyHit' | 'modifyDamage' | 'modifyCrit' | 'onAfterAttack' | 'onDefeated';
export type EffectDuration = 'instant'|'nextAttack'|'nextHitTaken'|'turn'|'passive';
export type EffectTarget = 'self'|'ally'|'allAllies'|'enemy';
export type EffectAtom =
  | {type: 'hitAdd'|'evadeAdd'|'hitSet'|'damageMul'|'takenMul'|'takenSet'|'critSet'|'moraleAdd'|'moraleOffset'|'moraleGainAdd'|'moraleCapAdd'|'spRestore'|'moveAdd'|'rangeAdd'|'expMul'|'creditMul'|'supportAttack'|'supportDefense'|'spRegen'; value: number}
  | {type: 'hpRestore'|'enRestore'|'enRegen'|'hpRegen'; value: {pct?: number; flat?: number}}
  | {type: 'statAdd'; value: Partial<Record<'hp'|'en'|'armor'|'mobility'|'move'|'sp'|'weapons', number>>}
  | {type:'pilotStatSet';value:Partial<Pilot['stats']>}
  | {type: 'adaptSet'; value: Partial<Adaptation>}
  | {type: 'evadeAll'|'extraAction'|'scan'|'resupply'|'ammoRestore'};
export interface EffectDefinition {id: string; name: string; effects: EffectAtom[]; desc: string}
export interface Spirit extends EffectDefinition {sp: number; spPct?:number; experience?:number; duration: EffectDuration; target: EffectTarget}
export interface Skill extends EffectDefinition {levels?: Record<string, EffectAtom[]>; activation?:{hook:'attack'|'defense'|'counter';base:number;coefficient?:number;baseline?:number;min?:number;max?:number;level?:number;morale?:number;effects:EffectAtom[]}}
export interface Part extends EffectDefinition {kind: 'passive'|'consumable'; duration?: EffectDuration; price?: number}
export interface Combination {id: string; parts: string[]; result: string}
export interface SupportDevice {id:string;name:string;kind:'resupply'|'repair';uses:number|null;en?:number;postMove:boolean;amount?:{pct?:number;flat?:number};morale?:number;experience:number}
export interface SubPilot {pilotId:string;sp:number;level:number;exp:number}
export interface Effect {
  id: string; source: string; definitionId?: string;
  duration: { unit: 'round' | 'use'; remaining: number }; lifetime?: EffectDuration;
  atoms?: EffectAtom[];
  /** Declarative operations remain JSON safe; new operations can extend this union. */
  hooks: Partial<Record<EffectHook, { op: 'set' | 'add' | 'multiply'; value: number; role: 'owner' | 'attacker' | 'defender' }>>;
}
export interface Unit extends StageUnit {
  summonedBy?:{unitId:string;weaponId:string;ordinal:number};
  recruited?:boolean;
  weaponUses?:Record<string,{round:number;uses:number}>;
  aiAlerted?:boolean;
  supportExperience?:number;supportBonusUsed?:boolean; aiFinisherUses?:number;
  actionsRemaining?:number; actionsSpent?:number; extraActionsUsed?:number;
  deviceUses?:Record<string,number>; subPilots?:SubPilot[];
  revealed?: boolean;
  hp: number; en: number; ammo: Record<string, number>; morale: number; sp: number;
  moved: boolean; acted: boolean; alive: boolean; moveOrigin: Point | null; effects: Effect[]; removed?: boolean;
  moveCommitted?: boolean; supportAttackUsed?: number; supportDefenseUsed?: number; usedItems?: number[]; aiSpiritsUsed?: string[]; transformedRound?: number; formId?: string;
  combined?: {combinationId: string; members: Unit[]};
}
export type Response = { type: 'counter'; weaponId: string } | { type: 'defend' } | { type: 'evade' };
export interface PendingResponse { type: 'response'; attackerId: string; targetId: string; weaponId: string; supportAttackerId?: string }
export interface BattleOptions { autoResponse?: boolean }
export interface BattleState {
  weaponLimits?:Record<string,number>;
  content: Content; stage: Stage; round: number; phase: Phase; rng: number;
  units: Unit[]; options: { autoResponse: boolean }; pending: PendingResponse | null;
  credits?: number;
  outcome: 'victory' | 'defeat' | null;
}
export type Command =
  | {type:'weaponSkill';unitId:string;weaponId:string}
  | { type: 'system'; unitId: string; action: SystemAction }
  | { type: 'persuade'; unitId: string; targetId: string }
  | { type: 'move'; unitId: string; x: number; y: number }
  | { type: 'undoMove'; unitId: string }
  | {type: 'spirit'; unitId: string; spiritId: string; targetId?: string; pilotId?:string}
  | {type: 'device';unitId:string;deviceId:string;targetId:string}
  | {type: 'useItem'; unitId: string; slot: number}
  | {type: 'mapAttack'; unitId: string; weaponId: string; point?: Point; direction?: Direction}
  | {type: 'transform'; unitId: string; formId: string}
  | {type: 'combine'; unitId: string; combinationId: string; memberIds?: string[]}
  | {type: 'split'; unitId: string}
  | { type: 'attack'; unitId: string; targetId: string; weaponId: string; supportAttackerId?: string }
  | { type: 'respond'; response: Response; supportDefenderId?: string }
  | { type: 'wait'; unitId: string }
  | { type: 'endPhase' };
export type SystemAction =
  | {kind: 'experience'; ids: string[]; amount: number}
  | { kind: 'reinforce' | 'spawn'; units: StageUnit[] }
  | { kind: 'move'; ids: string[]; x: number; y: number }
  | { kind: 'retreat' | 'join' | 'leave'; ids: string[] }
  | { kind: 'set-ai'; ids: string[]; ai: AIType }
  | { kind: 'effect'; ids: string[]; effect: Effect }
  | { kind: 'win' | 'lose' };
export type Direction = 'up'|'down'|'left'|'right';
export type BattleEvent =
  | {type:'weapon-effect';unitId:string;targetId:string;weaponId:string;kind:WeaponSpecial['kind'];label:string;amount?:number}
  | {type:'skill-activated';unitId:string;skillId:string;chance:number;roll:number}
  | {type:'device';unitId:string;targetId:string;deviceId:string;kind:'resupply'|'repair';remaining:number|null}
  | {type: 'spirit'; unitId: string; spiritId: string; targetIds: string[]; sp: number;pilotId?:string}
  | {type: 'item-used'; unitId: string; partId: string; slot: number}
  | {type: 'exp-gained'; unitId: string; amount: number;pilotId?:string}
  | {type: 'level-up'; unitId: string; from: number; to: number; statDiff: Partial<Pilot['stats']>; newSpirits: string[];pilotId?:string}
  | {type: 'credits-gained'; unitId: string; amount: number}
  | {type: 'support'; kind: 'attack'|'defense'; unitId: string; targetId: string}
  | {type: 'map-attack'; unitId: string; weaponId: string; targetIds: string[]}
  | {type: 'transform'; unitId: string; from: string; to: string}
  | {type: 'combine'|'split'; unitId: string; combinationId: string; memberIds: string[]}

  | { type: 'persuade'; unitId: string; targetId: string }
  | { type: 'system'; action: SystemAction; ids: string[] }
  | { type: 'round-start'; round: number }
  | { type: 'phase-start'; phase: Phase; round: number }
  | { type: 'move'; unitId: string; path: Point[]; cost: number }
  | { type: 'undo-move'; unitId: string; to: Point }
  | { type: 'wait'; unitId: string }
  | ({ type: 'pending-response' } & Omit<PendingResponse, 'type'>)
  | { type: 'response'; unitId: string; response: Response }
  | { type: 'attack'; attackerId: string; targetId: string; weaponId: string; counter: boolean; hitRate: number; hit: boolean; critical: boolean; damage: number; hpDamage: number; targetMaxHp: number; rolls: [number, number, number] }
  | { type: 'morale'; unitId: string; before: number; after: number; reason: 'round' | 'hit' | 'damaged' | 'evade' | 'kill' | 'ally-kill' | 'effect' }
  | { type: 'recover'; unitId: string; hp: number; en: number }
  | { type: 'effect-expired'; unitId: string; effectId: string }
  | { type: 'unit-defeated'; unitId: string; by: string }
  | { type: 'outcome'; outcome: 'victory' | 'defeat' };
export interface AttackForecast {
  hitRate: number; critRate: number; damage: { min: number; max: number };
  criticalDamage: { min: number; max: number }; expectedDamage: number;
}
export interface SupportCandidate {unitId: string; weaponId?: string; forecast: AttackForecast}
export interface Forecast extends AttackForecast { response: Response; counter: AttackForecast | null; supportAttackers?: SupportCandidate[]; supportDefenders?: SupportCandidate[]; selectedSupportAttack?: SupportCandidate; selectedSupportDefense?: SupportCandidate }
export interface MapForecast {cells: Point[]; targets: ({unitId: string; friendly: boolean} & AttackForecast)[]; friendlyFire: boolean}
export interface ApplyResult { state: BattleState; events: BattleEvent[] }
export interface ReachableCell extends Point { cost: number; path: Point[] }
export interface Snapshot {
  version: 'm2-save-2'; contentVersion: string; stageId: string;
  battle: Omit<BattleState, 'content' | 'stage'>;
}

export type TagEffect =
 | {kind:'aura';tag:string;range:number;atoms:EffectAtom[];en?:number}
 | {kind:'heal';tag:string;range:number;hpPct:number}
 | {kind:'summon';tag:string;templateTag:string;suffix:string;limit:number}
 | {kind:'drain';tag:string;amount:number}
 | {kind:'regeneration';pilot:string;en:number}
 | {kind:'weapon-roll';stage?:string;prefixes:string[];min:number;max:number};
