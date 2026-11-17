import {largeUi,readable,percent} from '../presentation';
import { term } from '../terms';
/**
 * 맵 화면의 정보 표시: 기체 카드, 지형, 페이즈, 전투 전 예측.
 * 모두 state를 바꾸면 내용이 바뀌는 Shape다. 조작은 받지 않는다(조작은 kit.ts의 부품이 받는다).
 */
import { ease, tween, wait, type Step } from '../flow';
import type { Show } from '../fx';
import { H, Shape, W } from '../stage';
import { COLOR, drawFace, EN_TONES, FONT, gauge, hpTones, panel, plate } from '../ui';
import type { TerrainView, Team, UnitView } from './model';

const TEAM: Record<Team, string> = { ally: COLOR.ally, enemy: COLOR.enemy, third: '#ffad4a', neutral:'#a8b4c8' };
const TEAM_NAME: Record<Team, string> = { ally: '아군', enemy: '적', third:'제3',neutral:'중립' };

/** 왼쪽 아래의 기체 카드. 커서가 가리키는 기체를 보여 준다. unit이 없으면 그리지 않는다. */
export function unitCard(): Shape<{ unit?: UnitView }> {
  const node = new Shape<{ unit?: UnitView }>({}, (ctx, s) => {
    const unit = s.unit;
    if (!unit) return;
    const small=largeUi(),x=16,w=small?520:500,h=150,y=H-56-h,color=TEAM[unit.team];
    panel(ctx, x, y, w, h, color);
    drawFace(ctx, unit.portrait, 'default', x + 2, y + 4, 142);
    const left = x + 160;
    ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    // 긴 이름(폼 이름 포함)은 기력 표시와 겹치지 않게 글자 크기를 줄인다.
    let size = 24; ctx.font = `900 ${size}px ${FONT.body}`;
    while (size > readable(15) && ctx.measureText(unit.name).width > x+w-(small?24:130)-left) ctx.font = `900 ${--size}px ${FONT.body}`;
    ctx.fillStyle = COLOR.ink; ctx.fillText(unit.name, left, y + 12 + (24 - size) / 2);
    if(!small){ctx.font=`500 ${readable(largeUi()?26:16)}px ${FONT.body}`;ctx.fillStyle=COLOR.dim;ctx.fillText(unit.pilot,left,y+44);}
    if(!small&&unit.actionsRemaining!==undefined&&unit.revealed!==false){ctx.textAlign='right';ctx.fillStyle=COLOR.gold;ctx.font=`700 ${readable(13)}px ${FONT.body}`;ctx.fillText(`행동 ${unit.actionsRemaining}/${unit.actionsMax}`,x+w-18,y+54);}
    // 기력
    if(!small){ctx.textAlign = 'right'; ctx.font = `700 ${readable(16)}px ${FONT.body}`; ctx.fillStyle = COLOR.dim; ctx.fillText(term('morale'), x + w - 76, y + 16);
    ctx.font = `700 ${readable(24)}px ${FONT.num}`; ctx.fillStyle = unit.heat >= 130 ? COLOR.gold : COLOR.ink; ctx.fillText(unit.revealed===false?'???':String(unit.heat), x + w - 20, y + 10);}
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = `700 ${readable(15)}px ${FONT.num}`;
    ctx.fillStyle = COLOR.gold; ctx.fillText('HP', left, y + 86);
    ctx.fillStyle = '#7fe9f7'; ctx.fillText(term('en'), left, y + 118);
    if(unit.revealed!==false)gauge(ctx, left + 58, y + 78, 124, 16, unit.hp, unit.hp, unit.hpMax, hpTones(unit.hp / unit.hpMax));
    if(unit.revealed!==false)gauge(ctx, left + 58, y + 112, 124, 11, unit.en, unit.en, unit.enMax, EN_TONES);
    ctx.textAlign = 'right'; ctx.fillStyle = COLOR.ink;
    ctx.font = `700 ${small?24:19}px ${FONT.num}`; ctx.fillText(unit.revealed===false?'???':`${unit.hp} / ${unit.hpMax}`, x + w - 20, y + 87);
    ctx.font = `700 ${small?24:17}px ${FONT.num}`; ctx.fillText(unit.revealed===false?'???':`${unit.en} / ${unit.enMax}`, x + w - 20, y + 118);
    if (unit.acted) { ctx.fillStyle = 'rgba(5,8,20,.55)'; ctx.fillRect(x, y, w, h); ctx.font = `700 ${readable(26)}px ${FONT.body}`; ctx.fillStyle = COLOR.dim; ctx.fillText('✓',x+w-24,y+46); }
  });
  node.z = 40;
  return node;
}

/** 오른쪽 아래의 지형 표시. */
export function terrainChip(): Shape<{ terrain?: TerrainView }> {
  const node = new Shape<{ terrain?: TerrainView }>({}, (ctx, s) => {
    const t = s.terrain;
    if (!t) return;
    const w = 380, h = 88, x = W - 16 - w, y = H - 56 - h;
    panel(ctx, x, y, w, h);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = `700 ${readable(22)}px ${FONT.body}`; ctx.fillStyle = COLOR.ink; ctx.fillText(t.name, x + 22, y + 10);
    ctx.font = `500 ${readable(largeUi()?26:16)}px ${FONT.body}`; ctx.fillStyle = COLOR.dim;
    const sign = (n: number): string => (n > 0 ? `+${n}` : String(n));
    ctx.fillText(`방어 ${sign(t.defense)}% · 회피 ${sign(t.evade)}%`, x + 22, y + 44);
  });
  node.z = 40;
  return node;
}

/** 왼쪽 위의 페이즈 표시. */
export function phaseChip(team: Team, turn: number): Shape<{ team: Team; turn: number }> {
  const node = new Shape({ team, turn }, (ctx, s) => {
    ctx.font = `${readable(26)}px ${FONT.display}`;
    const text = `${TEAM_NAME[s.team]} 페이즈`, w = ctx.measureText(text).width + 170;
    const fill = ctx.createLinearGradient(0, 0, w, 0);
    fill.addColorStop(0, TEAM[s.team]); fill.addColorStop(1, '#12224f');
    ctx.save(); plate(ctx, 0, 20, w, 46, '#000', 'right'); ctx.clip(); ctx.fillStyle = fill; ctx.fillRect(0, 20, w, 46); ctx.restore();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(text, 22, 44);
    ctx.font = `700 ${readable(18)}px ${FONT.num}`; ctx.fillText(`TURN ${s.turn}`, w - 124, 45);
  });
  node.z = 40;
  return node;
}

/** 화면을 가로지르는 큰 알림: 페이즈가 바뀔 때, 스테이지가 끝날 때. */
export function* bigBanner(show: Show, text: string, color: string, hold = 0.5): Step {
  const node = new Shape({ open: 0 }, (ctx, s) => {
    const height = 120 * s.open;
    if (height < 2) return;
    ctx.fillStyle = 'rgba(4,8,22,.88)'; ctx.fillRect(0, H / 2 - height / 2, W, height);
    ctx.fillStyle = color; ctx.fillRect(0, H / 2 - height / 2, W, 4); ctx.fillRect(0, H / 2 + height / 2 - 4, W, 4);
    ctx.globalAlpha *= s.open; ctx.font = `${readable(72)}px ${FONT.display}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff'; ctx.fillText(text, W / 2, H / 2 + 3);
  });
  Object.assign(node.state,{phaseBanner:true});node.z = 30;
  show.stage.ui.add(node);
  show.sound?.play('whoosh', 0.8);
  yield* tween(node.state, { open: 1 }, 0.16, ease.out);
  yield* wait(hold);
  yield* tween(node.state, { open: 0 }, 0.14, ease.in);
  node.remove();
}

/** 전투 전 예측의 한쪽. */
export interface ForecastInfo { unit: UnitView; role: string; weapon?: string; resources?:string; hit?: number; damage?: number; critical?: number }
/**
 * 전투 전 예측. 전투 장면과 좌우가 같다: 적이 왼쪽, 아군이 오른쪽.
 * 버튼(전투 개시, 무기 변경, 취소)은 화면이 kit 부품으로 따로 올린다.
 */
export function forecastPanel(left: ForecastInfo, right: ForecastInfo): Shape {
  const node = new Shape<object>({}, ctx => {
    ctx.fillStyle = 'rgba(4,8,22,.6)'; ctx.fillRect(0, 0, W, H);
    [left, right].forEach((side, i) => {
      const w=540,h=300,x=i?W-60-w:60,y=88, { unit } = side, color = TEAM[unit.team];
      panel(ctx, x, y, w, h, color);
      ctx.font = `${readable(20)}px ${FONT.display}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      const tag = `${TEAM_NAME[unit.team]} · ${side.role}`;
      plate(ctx, x + 22, y + 16, ctx.measureText(tag).width + 44, 32, color, 'right');
      ctx.fillStyle = '#fff'; ctx.fillText(tag, x + 36, y + 33);
      drawFace(ctx, unit.portrait, 'default', x + 22, y + 54, 88);
      ctx.textBaseline = 'top';
      ctx.font = `900 ${readable(28)}px ${FONT.body}`; ctx.fillStyle = COLOR.ink; ctx.fillText(unit.name, x + 146, y + 56);
      ctx.font = `500 ${readable(17)}px ${FONT.body}`; ctx.fillStyle = COLOR.dim; ctx.fillText(`${unit.pilot} · HP ${unit.hp} / ${unit.hpMax}`, x + 146, y + 92);
      gauge(ctx, x + 146, y + 122, 250, 14, unit.hp, unit.hp, unit.hpMax, hpTones(unit.hp / unit.hpMax));
      // 무기
      ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fillRect(x + 22, y + 148,w-44,56);
      ctx.font = `700 ${readable(22)}px ${FONT.body}`; ctx.fillStyle = side.weapon ? COLOR.ink : COLOR.dim; ctx.textBaseline = 'middle';
      ctx.fillText(side.weapon ?? '반격할 수 없음', x + 38, y + 168,w-76);
      if(side.resources){ctx.font=`700 ${readable(20)}px ${FONT.body}`;ctx.fillStyle=COLOR.dim;ctx.fillText(side.resources,x+38,y+194,w-76);}
      // 큰 숫자 둘
      const cells: [string, string][] = [['명중', side.hit === undefined ? '—' : percent(side.hit)], ['예상 피해', side.damage === undefined ? '—' : String(side.damage)]];
      cells.forEach(([name, value], k) => {
        const cx = x + 22 + k * ((w - 44) / 2 + 6), cw = (w - 56) / 2;
        ctx.fillStyle = 'rgba(0,0,0,.36)'; ctx.fillRect(cx, y + 208,cw,76);
        ctx.font = `700 ${readable(26)}px ${FONT.body}`; ctx.fillStyle = COLOR.dim; ctx.textBaseline = 'top'; ctx.fillText(name, cx + 14, y + 218);
        ctx.font = `700 ${readable(52)}px ${FONT.num}`; ctx.fillStyle = COLOR.ink; ctx.fillText(value, cx + 14, y + 242);
      });
      if (side.critical !== undefined) { ctx.font = `700 ${readable(22)}px ${FONT.num}`; ctx.fillStyle = COLOR.gold; ctx.textAlign = 'right'; ctx.fillText(`크리티컬 ${percent(side.critical)}`, x + w - (i ? 110 : 26), y + 22); }
    });
    ctx.font = `${readable(64)}px ${FONT.display}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000'; ctx.fillText('VS', W / 2, 304); ctx.fillStyle = COLOR.gold; ctx.fillText('VS', W / 2, 300);
  });
  node.z = 60;
  return node;
}
