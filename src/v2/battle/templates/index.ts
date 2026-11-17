/**
 * 무기 연출 틀의 목록. 무기 자료의 anim.template이 여기 이름을 가리킨다.
 * 새 틀을 만들면: 이 폴더에 파일을 하나 더하고(가까운 틀을 베껴서), 아래 목록에 한 줄 더한다.
 */
import type { Template } from '../template';
import { beamShot } from './beam';
import { missileSalvo } from './missile-salvo';
import { rapidFire } from './rapid-fire';
import { slashCombo } from './slash-combo';

import { heavyShot } from './heavy-shot';
import { punchRush } from './punch-rush';
import { chargeRam } from './charge-ram';
import { funnel } from './funnel';
import { artillery } from './artillery';
import { spreadShot } from './spread-shot';
import { wordSlam } from './word-slam';
import { finisher } from './finisher';
import { sequence } from './sequence';

export const TEMPLATES: Record<string, Template> = {
  'sequence': sequence,
  'slash-combo': slashCombo,
  'rapid-fire': rapidFire,
  'beam': beamShot,
  'missile-salvo': missileSalvo,
  'heavy-shot': heavyShot,
  'punch-rush': punchRush,
  'charge-ram': chargeRam,
  'funnel': funnel,
  'artillery': artillery,
  'spread-shot': spreadShot,
  'word-slam': wordSlam,
  'finisher': finisher,

};
