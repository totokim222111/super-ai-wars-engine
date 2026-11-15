import type {BattleProgress,StrikeProgress} from './progress';
/**
 * 전투 한 판을 처음부터 끝까지 튼다.
 *
 * 공격 한 번의 뼈대(모든 무기 공통):
 *   [공격하는 쪽 화면] (알림 띠) → 선언과 무기 이름 → (컷인) → 틀의 launch
 *   컷
 *   [맞는 쪽 화면]     (원호 방어) → 틀의 impact → 결과(피해·빗나감·격파)와 한마디
 *   격파했으면 공격한 쪽 화면으로 돌아와 한마디
 * 반격과 원호 공격도 같은 뼈대를 그대로 탄다. 순서만 strikes에 담겨 온다.
 */
import { wait, type Step } from '../flow';
import type { BattleScene } from './scene';
import { makeContext } from './template';
import { TEMPLATES } from './templates';
import type { Exchange, Strike } from './types';

export function* playStrike(scene: BattleScene, strike: Strike,progress?:StrikeProgress): Step {
  const attacker = scene.actor(strike.attacker), target = scene.actor(strike.target);
  // 앞선 공격에서 격파된 기체는 치지도 맞지도 않는다.
  if (attacker.dead || target.dead) return;
  const guardian = strike.cover ? scene.actor(strike.cover) : undefined, defender = guardian ?? target;
  const template = TEMPLATES[strike.weapon.anim.template];
  if (!template) throw new Error(`없는 무기 연출 틀: ${strike.weapon.anim.template} (${strike.weapon.name})`);
  const lines = strike.lines ?? {}, context = makeContext(scene, attacker, defender, strike.weapon, strike.outcome);
  scene.begin();scene.onResult=()=>{if(progress)progress.result=true;};scene.onDefeat=()=>{if(progress)progress.defeated=true;};

  // ── 공격하는 쪽 화면 ──
  yield* scene.focus(attacker);
  if (strike.banner) yield* scene.banner(strike.banner, attacker.fighter.side);
  yield* scene.announce(attacker, strike.weapon, lines.before);
  if(strike.combo){if(strike.combo.dialogue){for(const row of strike.combo.dialogue)yield*scene.partnerCutin(row.fighter,row.line);}else yield*scene.partnerCutin(strike.combo.partner,strike.combo.line);}
  if(strike.weapon.video&&scene.video)yield*scene.video(strike.weapon.video);else if (strike.weapon.cutin) yield* scene.cutin(attacker);
  yield* template.launch(context);if(progress)progress.launched=true;

  // ── 맞는 쪽 화면 ──
  scene.setFront(target);
  yield* scene.cut(target.fighter.side);
  if (guardian) yield* scene.coverSwap(target, guardian);
  yield* template.impact(context);
  attacker.sprite.visible = false;   // 근접 공격으로 넘어와 있던 공격자를 치운다
  const destroyed = yield* scene.resolve(defender, strike.outcome, lines);
  for(const e of strike.effects??[])yield*scene.banner(e.text,scene.actor(e.targetId).fighter.side);
  yield* scene.dismiss();

  if (destroyed && lines.after) {
    yield* scene.focus(attacker);
    yield* scene.say(attacker, lines.after, 'smile', 0.9);
    yield* scene.dismiss();
  }
}

export function* playExchange(scene: BattleScene, exchange: Exchange,progress?:BattleProgress): Step {
  const first = exchange.strikes[0];
  if (!first) return;
  yield* scene.enter(scene.actor(first.attacker));
  for (const [i,strike] of exchange.strikes.entries()) yield* playStrike(scene, strike,progress?.strikes[i]);
  yield* wait(0.4);
}
