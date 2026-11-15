import { describe, expect, it } from 'vitest';
import { apply, createBattle, loadRules, restore, snapshot, validateContent, validateStage } from '../../src/core';
import { arena, harbor, testContent } from './helpers';

describe('content and rules schemas', () => {
  it.each(['hitBase', 'hitPilot', 'evadePilot', 'evadeMobility', 'mobilityBase', 'statDivisor', 'critMul', 'defendResponse', 'evadeResponse', 'minDamage', 'spread', 'critSkill'])('requires rules.k.%s', key => {
    const r = loadRules() as unknown as { k: Record<string, number> }; delete r.k[key];
    expect(() => loadRules(r)).toThrow(`rules.k.${key}:`);
  });
  it('requires every adaptation, size, morale and policy key', () => {
    for (const [group, key] of [['adaptHit', 'D'], ['adaptDmg', 'S'], ['sizeHit', 'SS'], ['sizeDmg', 'LL'], ['morale', 'allyKill'], ['ai', 'killBonus'], ['effects', 'sureHit']] as const) {
      const r = loadRules() as unknown as Record<string, Record<string, unknown>>; delete r[group][key];
      expect(() => loadRules(r)).toThrow(`rules.${group}.${key}:`);
    }
  });
  it('loads independent defaults and rejects invalid coefficients', () => {
    const r = loadRules(); r.k.hitBase = 1; expect(loadRules().k.hitBase).toBe(70);
    r.k.spread = 1.1; expect(() => loadRules(r)).toThrow('rules.k.spread:');
    r.k.spread = 0.1; r.k.statDivisor = 0; expect(() => loadRules(r)).toThrow('rules.k.statDivisor:');
  });
  it('reports paths for broken entities and references', () => {
    const c = testContent(); c.mechs[0].weapons.push('missing');
    expect(() => validateContent(c)).toThrow('content.mechs[0].weapons[4]: unknown id');
    const c2 = testContent(); c2.pilots[0].stats.hit = NaN;
    expect(() => validateContent(c2)).toThrow('content.pilots[0].stats.hit:');
  });
  it('rejects duplicate ids, ragged maps, unknown tiles and occupied deployment', () => {
    const { content } = harbor(); content.pilots[1].id = content.pilots[0].id;
    expect(() => validateContent(content)).toThrow('duplicate id');
    const h = harbor(); h.stage.map.tiles[0].pop(); expect(() => validateStage(h.stage, h.content)).toThrow('stage.map.tiles[0]: expected 18 columns');
    const h2 = harbor(); h2.stage.map.tiles[0][0] = 'unknown'; expect(() => validateStage(h2.stage, h2.content)).toThrow('stage.map.tiles[0][0]:');
    const h3 = harbor(); Object.assign(h3.stage.units[1], { x: h3.stage.units[0].x, y: h3.stage.units[0].y });
    expect(() => createBattle(h3.content, h3.stage, 1)).toThrow('occupied deployment');
  });
});
describe('snapshot JSON', () => {
  it('round-trips byte for byte and resumes with the same future', () => {
    const s = apply(arena(), { type: 'move', unitId: 'p1', x: 2, y: 2 }).state;
    const json = snapshot(s), restored = restore(s.content, s.stage, json);
    expect(snapshot(restored)).toBe(json);
    const command = { type: 'attack' as const, unitId: 'p1', targetId: 'e1', weaponId: 'beam' };
    expect(apply(restored, command)).toEqual(apply(s, command));
  });
  it.each([
    ['rng', -1, 'snapshot.battle.rng:'], ['round', 0, 'snapshot.battle.round:'], ['phase', 'neutral', 'snapshot.battle.phase:'],
    ['outcome', 'victory', 'snapshot.battle.outcome:'], ['pending', {}, 'snapshot.battle.pending.type:'],
  ])('rejects damaged %s', (key, value, error) => {
    const s = arena(), save = JSON.parse(snapshot(s)); save.battle[key] = value;
    expect(() => restore(s.content, s.stage, JSON.stringify(save))).toThrow(error);
  });
  it.each([
    ['hp', -1], ['hp', 999999], ['en', -1], ['sp', 999], ['morale', 151], ['alive', false], ['x', 8], ['acted', 0],
    ['ammo', {}], ['effects', [{ id: 'bad' }]], ['pilotId', 'pilot-8'], ['moveOrigin', {}],
  ])('rejects damaged unit %s=%j', (key, value) => {
    const s = arena(), save = JSON.parse(snapshot(s)); save.battle.units[0][key] = value;
    expect(() => restore(s.content, s.stage, JSON.stringify(save))).toThrow('snapshot.battle.units[0]');
  });
  it('rejects wrong versions, overlapping units, invalid pending and malformed JSON', () => {
    const s = arena(), save = JSON.parse(snapshot(s)); save.contentVersion = 'other';
    expect(() => restore(s.content, s.stage, JSON.stringify(save))).toThrow('snapshot.contentVersion:');
    save.contentVersion = s.content.version; Object.assign(save.battle.units[1], { x: 1, y: 2 });
    expect(() => restore(s.content, s.stage, JSON.stringify(save))).toThrow('living units overlap');
    const bad = JSON.parse(snapshot(s)); bad.battle.pending = { type: 'response', attackerId: 'p1', targetId: 'e1', weaponId: 'beam' };
    expect(() => restore(s.content, s.stage, JSON.stringify(bad))).toThrow('invalid response participants');
    expect(() => restore(s.content, s.stage, '{')).toThrow('snapshot: invalid JSON');
  });
  it('rejects unexpected fields that could overwrite the external content or stage', () => {
    const s = arena(), save = JSON.parse(snapshot(s)); save.battle.content = {};
    expect(() => restore(s.content, s.stage, JSON.stringify(save))).toThrow('snapshot.battle.content: unknown field');
  });
});
