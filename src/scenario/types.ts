import type { BattleEvent, Phase, Side, Stage } from '../core';
export interface Location { file: string; line: number; column: number }
export interface Token extends Location { value: string; quoted: boolean }
export interface SourceLine { indent: number; tokens: Token[]; loc: Location }
export interface Character { id: string; name: string; side: Side; expressions: string[]; portrait?: { base: string; full?: boolean; faces: Record<string, string> }; cutin?: string; battle?: Record<'attack' | 'finisher' | 'hit' | 'evade' | 'damaged' | 'defeated', string[]> }
export type Selector = { kind: 'unit' | 'tag' | 'side'; id: string; loc?: Location };
export type Condition = { kind: 'and' | 'or'; left: Condition; right: Condition }
  | { kind: 'flag'; id: string; not: boolean } | { kind: 'alive' | 'dead'; selector: Selector }
  | {kind:'persona';value:string;not:boolean}
  | { kind: 'round' | 'credits'; op: string; value: number };
export interface ScriptCommand { op: string; args: string[]; loc: Location }
export type Node = ScriptCommand | { op: 'if'; condition: Condition; yes: Node[]; no: Node[]; loc: Location };
export interface Trigger { kind: string; selector?: Selector; target?: Selector; phase?: Phase; round?: number; percent?: number; area?: string; repeat: boolean }
export interface EventBlock { trigger: Trigger; body: Node[]; loc: Location }
export type Instruction = ScriptCommand | { op: 'branch'; condition: Condition; to: number; loc: Location } | { op: 'jump'; to: number; loc: Location };
export interface Program { version: 'sai-1'; events: { trigger: Trigger; code: Instruction[]; loc: Location }[] }
export interface CompileContext { stage: Stage; characters: Character[]; effects: string[]; parts: string[] }
export type ScenarioEvent = BattleEvent | { type: 'start' };
export interface Waiting { command: ScriptCommand; remaining: number; visible: number; pageStart?:number; pageEnd?:number; pageNext?:number; ids: string[]; before: { id: string; x: number; y: number; side: Side; mechId: string }[] }
export interface RunnerState {
  queue: { event: number; pc: number }[]; fired: string[]; allCounts: Record<string, number>; waiting: Waiting | null;
  objectives: { win: string[]; lose: string[] }; bgm: string | null; fade: number;
}
