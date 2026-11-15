import { describe, expect, it } from 'vitest';
import { attackForecast, damageAtRoll, forecast, nextRandom, normalizeSeed, resolve } from '../../src/core';
import { deepFreeze, fixedCombat, seaCombat } from './helpers';

describe('hand-calculated formula cases', () => {
  it('A/M/plain: atk=2500, def=800, hit=90, crit=15', () => {
    const f = forecast(fixedCombat(), 'p1', 'e1', 'blade', { type: 'counter', weaponId: 'rifle' });
    expect(f.hitRate).toBe(90); expect(f.critRate).toBe(15);
    expect(f.damage).toEqual({ min: 1530, max: 1870 });
    expect(f.criticalDamage).toEqual({ min: 1912, max: 2337 });
  });
  it('sea/B attacker + C weapon, L/B defender, morale120/110, terrain -20%, evade', () => {
    // atk=1755; def=977.5; (atk-def)*1.1*.8=684.2; hit=80*.8*.5=32.
    const f = forecast(seaCombat(), 'p1', 'e1', 'blade', { type: 'evade' });
    expect(f.hitRate).toBe(32); expect(f.damage).toEqual({ min: 615, max: 752 });
    expect(f.criticalDamage).toEqual({ min: 769, max: 940 }); expect(f.counter).toBeNull();
  });
  it('same sea case with defend: 684.2*.5=342.1, hit64', () => {
    const f = forecast(seaCombat(), 'p1', 'e1', 'blade', { type: 'defend' });
    expect(f.hitRate).toBe(64); expect(f.damage).toEqual({ min: 307, max: 376 });
    expect(f.criticalDamage).toEqual({ min: 384, max: 470 });
  });
  it('D adaptation remains legal and changes accuracy and damage', () => {
    const s = fixedCombat(); s.content.mechs[0].adapt.ground = 'D';
    const f = forecast(s, 'p1', 'e1', 'blade', { type: 'evade' });
    expect(f.hitRate).toBe(30); expect(f.damage).toEqual({ min: 180, max: 220 });
  });
  it('shoot stat is used independently of melee', () => {
    const s = fixedCombat(); s.content.weapons[0].kind = 'shoot';
    expect(attackForecast(s, 'p1', 'e1', 'blade', { type: 'counter', weaponId: 'rifle' }).damage).toEqual({ min: 1350, max: 1650 });
  });
  it('minimum damage applies after defense, critical and spread', () => {
    const s = fixedCombat(); s.content.mechs.find(m => m.id === 'mech-d')!.armor = 10000;
    const f = forecast(s, 'p1', 'e1', 'blade', { type: 'defend' });
    expect(f.damage).toEqual({ min: 10, max: 10 }); expect(f.criticalDamage).toEqual({ min: 10, max: 10 });
  });
  it('spread endpoints are exactly 90% and 110% with the default table', () => {
    const s = fixedCombat(); expect(damageAtRoll(s, 1000, 0)).toBe(900); expect(damageAtRoll(s, 1000, 1)).toBe(1100);
    expect(() => damageAtRoll(s, 1000, -0.01)).toThrow('damage roll:');
  });
  it('clamps hit and crit to 0..100', () => {
    const s = fixedCombat(); s.content.weapons[0].hit = 500; s.content.weapons[0].crit = 500;
    expect(forecast(s, 'p1', 'e1', 'blade', { type: 'defend' })).toMatchObject({ hitRate: 100, critRate: 100 });
    s.content.weapons[0].hit = -500; s.content.weapons[0].crit = -500;
    expect(forecast(s, 'p1', 'e1', 'blade', { type: 'defend' })).toMatchObject({ hitRate: 0, critRate: 0 });
  });
  it('critical multiplies actual damage before spread', () => {
    const s = fixedCombat(); s.content.weapons[0].hit = 100; s.content.weapons[0].crit = 100;
    const r = resolve(s, 'p1', 'e1', 'blade', { type: 'evade' });
    const shot = r.events.find(e => e.type === 'attack');
    expect(shot?.type).toBe('attack');
    if (shot?.type !== 'attack') throw new Error('missing shot');
    // seed1 first roll .627 < capped evade chance .9; damage base=1700*1.25.
    expect(shot.critical).toBe(true); expect(shot.damage).toBe(damageAtRoll(s, 2125, shot.rolls[2]));
  });
});
describe('purity and seeded resolution', () => {
  it('forecast and resolve preserve deeply frozen inputs and RNG', () => {
    const s = deepFreeze(fixedCombat()), before = structuredClone(s);
    const f = forecast(s, 'p1', 'e1', 'blade');
    expect(forecast(s, 'p1', 'e1', 'blade')).toEqual(f); expect(s).toEqual(before); expect(s.rng).toBe(1);
    const r = resolve(s, 'p1', 'e1', 'blade', { type: 'evade' });
    expect(s).toEqual(before); expect(r.state.rng).not.toBe(s.rng);
  });
  it('always draws hit, crit and spread on a miss, with no counter draw', () => {
    const s = fixedCombat(); s.content.weapons[0].hit = -1000;
    const r = resolve(s, 'p1', 'e1', 'blade', { type: 'evade' });
    let rng = s.rng; const rolls = [];
    for (let i = 0; i < 3; i++) { const next = nextRandom(rng); rng = next.state; rolls.push(next.value); }
    expect(r.state.rng).toBe(rng);
    expect(r.events.find(e => e.type === 'attack')).toMatchObject({ hit: false, critical: false, damage: 0, rolls });
  });
  it('serializes RNG state including zero and checks seeds', () => {
    expect(nextRandom(1).value).toBe(0.6270739405881613);
    const first = nextRandom(0), second = nextRandom(JSON.parse(JSON.stringify(first)).state);
    expect(second).toEqual(nextRandom(first.state)); expect(first.value).toBeGreaterThanOrEqual(0); expect(first.value).toBeLessThan(1);
    expect(normalizeSeed(-1)).toBe(0xffffffff); expect(() => normalizeSeed(1.5)).toThrow('seed:');
  });
});
