# 팩 만들기

`packs/example/`의 「작은 산책」을 복사해 시작한다. 대본과 수치를 바꿔 새 게임을 만들 수 있다. 더 큰 예시는 슈퍼 AI 대전 저장소를 참고한다.

## 폴더와 실행

팩에는 game.json, players.json, cast.json, units.json, weapons.json, spirits.json, rules.json, data/, maps/, story/, art/, audio/가 있다. 모든 파일 참조는 팩 내부 상대 경로다. 수치 파일의 팩 밖 참조는 거절한다.

`PACK_DIR`은 엔진 폴더 기준 경로 또는 절대 경로다. 생략하면 packs/의 폴더를 수집한다. DEFAULT_PACK을 지정하지 않으면 첫 번째 팩이 기본이다. `game.html?pack=<id>`는 수집된 팩만 선택한다. dev는 파일을 읽고 build는 설정·규칙·색인과 지연 로딩 대사를 묶는다.

## 먼저 바꿀 자료

| 파일 | 역할 |
|---|---|
| game.json | 고유 id·제목·용어·화 목록·엔딩·아트/음원·기본값·크레딧 |
| players.json | 이름 규칙, 임의 개수의 presets/lines, 시작 플래그, 인물·기체 연결, 이름 토큰 |
| rules.json, data/ | 코어의 기체·파일럿·무기·지형·정신·기술·파츠·태그 효과 |
| cast.json | 인물 이름·별명·상반신·표정·얼굴 영역. 예제의 hero/loop/dummy 참고 |
| units.json | 기체 그림·아이콘·인물·기준점·폼 표시. 규칙 수치는 data/mechs.json |
| weapons.json, spirits.json | 연출 템플릿·값·색. 규칙 수치는 data/ |
| maps/ | ground·tiles·소품/건물, 지형 의미 role과 표시 힌트 |
| gallery.json | 현재 팩의 전투·대화·UI 견본. 다른 팩 JSON을 import하지 않음 |
| economy.json, training.json | 상점·보상·육성. 선택 항목 |

`game.art.files`는 그림 id → 상대 파일 이름이다. `audio.pack`은 audio/pack.json, `audio.base`는 audio/다. 음원 항목마다 title/author/license/source를 적고 라이선스 전문·출처를 함께 둔다. metadata는 검사 산출물이다. 예제에는 CC0 녹음만 들어 있다.

## 대본과 스테이지

story/ep01.story, ep02.story의 주석을 읽는다. 각 화의 @ 규칙·@ 맵이 스테이지 전체를 정의한다. 옛 compiled 캠페인 JSON은 필요 없다. 지형의 char 한 글자를 공백으로 나누며 좌표는 0부터 센다.

```text
@ 규칙
무대: yard
아군: hero = scout 1,2 파일럿 hero
적: target = dummy 5,2 파일럿 dummy 대기
승리: 적 전멸
패배: 격파 hero
보상: 승리 → 자금 500
배리어 target 25
형태 hero = 기본:scout / 방호:guard
@ 맵
. . . . . . .
. . . . . . .
. . . . . . .
. . . . . . .
```

아군·적·대기·합류 아군·중립·제3세력을 선언한다. 기체·파일럿 id, 레벨, 태그, 좌표, 공격/대기/방어/추적 AI를 덧붙일 수 있다. 증원은 `증원: 턴 2 → reserve 5,2`, 지역 사건은 `지역 gate (3,0~3,3): 아군 진입 → 사건 gate`처럼 쓴다. 각 화 game.episodes.objectives에 승리/패배 안내도 적는다.

| 장면/명령 | 의미 |
|---|---|
| @ 도입 / @ 출격 | 전투 전 대화 / 맵 시작 사건 |
| @ 승리 / @ 인터미션 | 전투 뒤 대화 / 화 사이 대화 |
| @ 엔딩 | game.ending이 가리키는 마지막 장면 |
| 이름: 대사 | cast의 id·name·alias로 화자 선택 |
| [배경] bg-hangar, [등장] 루프 왼쪽 | 배경·인물 표시 |
| [퇴장] 루프, [암전], [밝아짐] | 퇴장·전환 |
| [음악] battle, [효과음] confirm | 등록된 음원 선택 |
| [맵] 배리어 해제 target | 선언한 배리어 해제 |
| [맵] 폼 hero 방호 | 선언한 전술 폼 선택 |
| [맵] 통행 3,0~3,3 열림 | 구역 통행 열림/막힘 |
| [변수] 동행 = 1, [호감] loop +1 | 저장되는 변수·호감도 |
| [조건] 호감 loop >= 1 -> 나란히 | 조건 분기. 변수·타입·최고호감도 가능 |
| [이동] 출발, [끝] | 장면 이동 / 장면 종료 |
| [타입 traveler] 대사 | players.presets가 선언한 임의 타입에만 표시 |

```text
[선택]
- 같이 가요 { 호감 loop +1; [변수] 동행 = 1 } -> 출발
- 먼저 가 주세요 { [변수] 동행 = 0 } -> 출발
```

효과는 세미콜론으로 나눈다. 이름 치환은 players.placeholders에서 name/unitName 필드를 연결한다. 호감도 동점 순서와 합류 조건은 game.story.affection, 별칭은 affectionAliases다. 타입·계열·인물 id의 고정 목록은 없다.

삽화는 `[삽화] 그림id | 인물 | 제목 | 강림 | 보관 설명`으로 표시한다. 단독 삽화와 톤별 연출도 지원한다. 삽화 중 대화 버튼 숨김·긴 인물 이름 축소는 공용 재생기의 동작이다. 무기 연출의 합법 매개변수는 src/v2/battle/templates 각 파일의 머리말을 따른다.

태그 효과는 aura/heal/summon/drain/regeneration/weapon-roll을 rules.tagEffects에 선언한다. 배리어·전술 폼·합체기·복사·가챠·진영·전투 사건 DSL은 src/v2/rules/config.ts와 story/stage.ts의 검증기를 기준으로 한다. 가챠/보상 자원 단어도 game.terms를 따른다.

## 확인 순서

`npm run pack:check` → `npm test` → `npm run sim -- --batch` → `npm run build`. 검사 메시지의 파일·줄·수정 힌트를 확인한다. 예제 sim은 선택 0/1 두 가지로 끝까지 검사한다. 팩 고유 전략이나 원고 대조 도구는 해당 게임 저장소에 둔다. 저장은 팩 id와 콘텐츠 지문으로 검사하며 낯선 형식은 거절한다.

## 맵 명령과 정보 공개

`game.json`의 `rules.spiritAfterAction`은 기본 `false`다. `true`인 팩은 행동 후에도 정신기를 사용할 수 있다. 명령 목록과 reducer가 같은 판정을 사용한다. 행동 후의 다른 맵 명령은 비활성이고 능력 보기는 항상 가능하다.

정찰은 `data/spirits.json`에 `{ "id":"scan", "name":"정찰", "sp":10, "duration":"instant", "target":"enemy", "effects":[{"type":"scan"}], "desc":"적 하나의 정보 공개" }`처럼 선언한다. `pilots.json`의 `spirits`에 `{ "id":"scan", "level":1 }`을 넣고 표시용 `spirits.json`에서 연출을 지정한다. 예제 팩의 hero가 견본이다. 이름과 비용은 팩이 정한다.

`scan`은 거리 제한 없이 살아 있는 비아군 한 명의 정보를 공개하며 행동·이동·난수를 소모하지 않는다. SP와 행동 후 사용 규칙은 다른 정신기와 같다. 실제 아군 교전도 상대 정보를 공개한다. 예상 조회와 적끼리 교전은 공개하지 않는다. 공개 여부는 스테이지 전투 저장의 `Unit.revealed`에 남고 새 스테이지에서는 초기화된다. 기존 저장에서 이 선택 필드가 없으면 미공개로 취급한다.

`terms.scan`과 `terms.scanHint`로 정찰 이름과 공개 안내를 정할 수 있다. 맵 메뉴는 HUD 메뉴 버튼, M/Tab, 같은 빈 칸을 0.45초 안에 두 번 누르기로 연다. 키보드 Enter의 기존 동작도 유지한다. 칸 옆 목록은 바깥을 누르면 한 단계 뒤로 가며 예상·대응 창은 보호한다. 부대 현황과 능력 보기는 게임 수치를 바꾸지 않는다.

대화 인물은 맵 카메라와 분리된 화면 좌표에 놓인다. `cast.json`의 선택 항목 `framing: {hairCrown, chin, faceCenterX}`는 원본 그림의 0~1 비율이며, 머리 크기와 얼굴 가로 중심을 맞출 때 사용한다. 없으면 기존 `face` 영역을 참고한다. 상반신의 아래는 대사창 뒤로 가리고, 발화 확대 중에도 그림 위에 최소 24px을 남긴다. 정사각형 초상은 대사창 위로 맞춘다. 맵 대사 중에는 HUD를 숨기고 종료 시 원래 표시 상태로 복원한다.


## 전투 대사와 맵 간략 연출

`cast.json` 인물에 선택 항목 `battleLines`를 적으면 실제 게임 전투에 연결된다. 모든 항목은 생략할 수 있다. 정의가 없거나 후보를 모두 쓴 상황은 대사 없이 진행하며 빈 문장이나 임시 문장을 만들지 않는다.

```json
"battleLines": {
  "mode": "sequence",
  "attack": [{"text":"자, 한 걸음 더!", "mood":"attack"}],
  "finisher": [{"text":"이번엔 끝까지 간다!", "mood":"attack"}],
  "hitLight": [{"text":"괜찮아, 계속해 보자.", "mood":"hit"}],
  "hitHeavy": [{"text":"아직 버틸 수 있어.", "mood":"serious"}],
  "dodge": [{"text":"조금 옆으로!", "mood":"smile"}],
  "guard": [{"text":"여기서 막을게.", "mood":"serious"}],
  "defeated": [{"text":"잠깐 쉬었다 갈게.", "mood":"sad"}],
  "victory": [{"text":"좋아, 다음으로 가자.", "mood":"smile"}],
  "weapons": {"blade": [{"text":"가까이서 간다!", "mood":"attack"}]},
  "opponents": {"dummy": {"attack": [{"text":"준비됐나요?", "mood":"serious"}]}}
}
```

- `text`는 비어 있지 않은 문장, `mood`는 그 인물의 `moods` 또는 `moodSheet.order`에 등록된 표정이다. 표정 생략 시 기존 공격·피격 등 기본 표정을 쓴다.
- `weapons` 키는 규칙 무장 id, `opponents` 키는 **상대 cast id**다. 상대별 항목 안에도 같은 상황 목록과 `weapons`를 넣을 수 있다. 실제 초상과 같은 인물 조회를 사용하므로 공용 파일럿의 자코 초상과 플레이어 프리셋도 구분된다.
- 우선순위는 상대별 무장 → 상대별 상황 → 일반 무장 → 일반 상황이다. 무장 지정은 공격·필살기 선언에만 적용한다. 필살기 목록이 없으면 공격, 심각한 피격 목록이 없으면 가벼운 피격으로 내려간다. 피격 후 HP 25% 이하 또는 한 번에 최대 HP 30% 이상 피해를 받으면 심각한 피격이다. 이는 문장 선택용 구분으로 전투 계산을 바꾸지 않는다.
- 기본 `mode: "sequence"`는 후보를 적은 순서대로 사용한다. `"random"`은 별도의 연출용 난수로 고른다. 한 교전의 반격·원호·2회 공격까지 같은 문장을 반복하지 않고, 우선 목록을 다 썼으면 다음 우선순위로 내려간다. 순서와 사용 목록은 교전마다 초기화된다. 전투 규칙의 난수나 저장 상태는 바뀌지 않는다.
- 대사는 자동으로 넘어가며 입력을 기다리지 않는다. 빨리감기 중에는 문장을 생략하고, 도중에 빨리감기를 켜도 남은 문장을 닫는다. 전투 건너뛰기는 남은 맵 간략 연출로 이어진다. 예제 팩 hero와 dummy가 실제 게임 연결 견본이다.
- 전투 연출 끄기, 아군만 표시 설정에서 적 전투, 속도를 높인 적 전투는 맵 간략 연출을 쓴다. 발사 → 대상 결과 → 반격 발사 → 결과 순서이며 원호·2회 공격도 사건 순서대로 잇는다. 결과 순간에 HP가 줄고 격파는 맵 폭발로 표시한다. 무장 종류는 근접·탄·빔·미사일·맵 범위로 구분한다.
- 전체 연출 도중 건너뛰면 이미 보인 발사·결과·폭발을 제외한 단계만 잇는다. 일반 속도는 단계당 약 0.4초이며 화면 탭·키 입력은 남은 단계를 빠르게 넘긴다. 격파 보상과 후속 알림은 연출 뒤에 표시한다.

### 출격 지도 안내와 표시 지역

지역은 기본적으로 숨겨진다. `표시 이름`을 붙인 지역만 출격 안내·보조 목표·지도 표식에 나온다. 안내에는 이름과 UI 분류만 표시하며 대사나 지문을 만들지 않는다.

```text
@ 규칙
안내 목표: guardian
지역 gate (3,1~3,2) 표시 출입문: 아군 진입 → 사건 출입문
지역 pit (6,1~6,2) 표시 붕괴 지대 위험: 아군 진입 → 사건 붕괴
지역 secret (8,1~8,2): 아군 진입 → 사건 비밀
```

`안내 목표:`는 배치·대기 유닛 id를 쉼표로 나열한다. 생략하면 `승리: 격파 id`의 대상이며, 빈 값이면 승리 대상 안내를 생략한다. 증원 전 대상은 예정 위치를 비추고, 등장 후에는 현재 위치를 따른다. `표시 이름 위험`은 위험 지역으로 분류한다. `표시 이름 표식없음`은 안내만 하고 지도 아이콘을 남기지 않는다. 사건 발생, 공유 변수 성립, 기한 경과, 생존 조건 소멸 뒤에는 표식과 목록에서 빠진다. 같은 공유 사건의 여러 진입 칸은 안내·목표 목록에서 한 번만 나열하고, 지도에서는 각 칸을 표시한다. 일부러 숨길 사건에는 `표시`를 붙이지 않는다.

```json
"mapHints": {"order": ["victory", "optional", "danger"], "persistent": true}
```

`game.json`의 순서는 안내할 분류와 순서를 정한다(생략 시 위 순서). `persistent:false`는 잔류 아이콘을 끈다. 출격 대사·작전 목표 뒤, 첫 아군 페이즈 전에 안내한다. 탭/Enter로 다음, 길게 누르기(0.55초)·건너뛰기·Esc로 전체를 넘긴다. 작전 목표의 보조 목표를 누르면 해당 칸으로 이동한다. 예제 `story/ep01.story`가 작동하는 견본이다.

### 공통 설명과 추가 능력치

정신기 툴팁은 규칙 데이터의 `name`, `sp`, `desc`, `duration`, `target`을 읽는다. `duration`은 `instant`·`turn`·`nextAttack`·`nextHitTaken`·`passive`, `target`은 `self`·`ally`·`enemy`·`allAllies`이다. 사용 불가 사유는 실제 규칙 조회에서 얻는다. 첫 탭은 설명 미리보기, 같은 줄을 다시 탭하면 발동 또는 대상 선택이다. 키보드 커서와 마우스 올림도 설명을 갱신한다.

능력 보기는 닫기·뒤로·Esc로만 닫는다. 능력치·스킬·정신기·무장 특성은 같은 툴팁을 쓴다. 기본 설명을 바꾸려면 `game.terms["desc.melee"]` 같은 키를 쓰거나 아래처럼 항목을 선언한다. 특성 설명은 `terms["desc.trait.이동 후 가능"]` 형태로 덮어쓸 수 있다.

```json
"unitInfo": {"stats": {"additionalStat": {"name": "추가 능력", "desc": "이 팩에서 정의한 능력입니다."}}}
```

실제 수치는 파일럿 `stats.additionalStat`에 넣는다. 데이터에 있는 수치 항목은 자동으로 표시하고 선언의 이름·설명을 붙인다. 선언만 있으면 수치를 만들어 넣지 않으며, 이 선언 자체는 전투 공식에 효과를 추가하지 않는다. 미공개 적은 추가 항목도 `???`이며 설명을 노출하지 않는다.

### 전투 연출과 무기 개조

공격 예상·적 대응 창의 `전투 연출 · 켜짐/꺼짐`은 설정 화면과 같은 팩별 저장 설정이다. 기존 `allies` 설정은 `아군만`으로 표시한다. 끄면 현재 전투부터 순차 맵 연출을 쓴다.

기체 개조의 `무기 개조`는 모든 무장에 함께 적용하며, 선택 시 각 무장의 `현재 → 다음` 위력을 보여 준다. 단계 상한·비용은 기존 규칙의 `upgradeMax`, `upgradeCost`를 읽는다. 기존 기본값은 `upgradeStep.weapons`만큼 더하는 방식이다. 비율 방식이 필요한 팩은 규칙 JSON에 `"weaponUpgrade":{"mode":"percent","rate":0.1}`을 추가한다. 위력은 `round(기본 위력 × (1 + 단계 × rate))`이며, 별도 파츠 보정은 그 뒤에 더한다. 15/30단은 해당 모드의 규칙 데이터에서 상한과 비용 배열을 함께 설정한다. 엔진이 회차나 SAW의 개조 수치를 추정해서 바꾸지 않는다.

### 조건부 전투 대사와 합체기 대사

`battleLines`의 상황에 `resupply`(보급), `repair`(수리), `cheer`(서브 파일럿 응원)를 추가한다. 현재 전투 공격·피격에는 이 세 상황을 호출하지 않는다. 보급/수리 명령과 서브 파일럿 기능을 구현할 때 해당 명령 성공 뒤 `BattleLinePicker.pick(bank, 'resupply' | 'repair' | 'cheer', ..., context)`를 호출하면 된다. 효과·비용·낮은 HP 조건은 그 기능의 규칙/팩 설정이 판정하며, 대사 데이터가 규칙을 바꾸지 않는다.

```json
"battleLines": {
  "mode": "random", "opponentChance": 0.35,
  "attack": [{"text": "전진!", "mood": "attack"}],
  "afterFormChange": [{"text": "전개 완료!", "mood": "smile"}],
  "forms": {"guard": {"attack": [{"text": "진형 유지!", "mood": "serious"}]}},
  "weapons": {"pulse": [{"text": "포문 개방!", "mood": "attack", "when": {"forms": ["ship"], "mechs": ["carrier"]}}]},
  "opponents": {"rival": {"attack": [{"text": "여기서 다시 만났네.", "mood": "serious"}]}},
  "resupply": [{"text": "보급 완료!", "mood": "smile"}]
}
```

`forms` 키는 현재 폼 id이며, 미설정이면 기본 풀을 쓴다. `when.forms`/`when.mechs`는 허용할 폼/기체 id를 나열한다(둘 다 있으면 어느 하나 일치). 조건에 맞지 않는 무장 대사는 건너뛰고 아래 우선순위의 풀로 내려간다. `afterFormChange`는 폼 변경 뒤 첫 공격(반격 포함)에 우선하며, 본래 일반 공격 풀에도 같은 문장을 둘 수 있다. 실제 변형 이벤트를 표시용으로 추적하므로 규칙·전투 RNG·저장 형식은 바꾸지 않는다. 변형 직후 저장을 재개하면 현재 턴의 변형 기록/행동 전 상태를 사용한다. 추가 행동 중간 저장처럼 첫 공격 여부를 구별할 수 없는 경우는 일반 풀로도 나올 수 있다.

상대 전용은 공격/필살에 적용한다. `opponentChance`(0~1, 생략 시 1)는 상대 풀을 먼저 사용할 확률이며, 교전용 로컬 난수만 쓴다. SAW는 0.35로 정해 매 공격마다 상대 전용 대사만 반복하지 않게 한다. 우선순위는 상대 → 변형 직후 → 폼별 무장/상황 → 기본 무장/상황이다. 기존 교전 내 같은 문장 반복 금지는 유지한다. 원문 표정에 해당하는 그림이 없으면 `cast.moodAliases`로 보유 표정을 명시적으로 대체할 수 있다(예: `{"shock":"hit"}`). 원문 mood 태그 자체는 보존한다.

`game.battleDialogue`는 공통 대사·합체기 자료 JSON 경로이다. 다음 구조의 `defaults.enemy`는 팩의 공용 무인 파일럿 중 전용 대사가 없는 인물에만 적용한다. 이름 있는 아군에게 빈 대사를 만들어 넣지 않는다.

```json
{"format": 1, "defaults": {"enemy": {"attack": [{"text":"목표 확인.","mood":"default"}]}}, "combos": [{
  "name": "나란한 빛",
  "participants": [{"cast":"hero","speech":{"text":"좌표 확인!","mood":"attack"}}, {"cast":"ally","speech":{"text":"{이름}, 함께!","mood":"smile"}}],
  "finish": {"cast":"hero","speech":{"text":"발사!","mood":"attack"}},
  "binding": {"ids":["paired-light"],"participants":["hero","ally"]}
}]}
```

`binding.ids`는 스테이지 합체기 id이다. `binding.participants`에 포함되고 실제 생존·배치 중인 인물의 줄을 원고 순서대로 재생한 다음 마무리를 재생한다. 이 목록은 연출상 통신 참여이며, 규칙상 합체기 참가자·행동·비용에는 영향이 없다. `binding`이 없는 합체기는 보관만 한다. `game.players.placeholders`의 치환 규칙은 합체기와 일반 전투 대사에도 적용한다. 실제 새 게임에서는 플레이어 이름과 기체 이름을 넘긴다. 보관 자료에는 원문 토큰을 남긴다. 빠른 진행 중에는 합체기 대사도 생략한다.

SAW의 컨텍스트 호라이즌은 현재 규칙 참가자 지피·클로드와 지피 마무리만 사용하고 젬의 줄은 남겨 둔다. 아키텍처 심포니는 배치 중인 지피·클로드·JEPA의 통신과 클로드 마무리를 사용하되 현재 2인 합체 규칙은 유지한다. 주인공+에이전트 8종 및 클로드·소네트 이중주는 미연결 보관이다. 이는 SAW 생성기 `port_battle_lines.py --check`로 원고와 대조한다.
## 밸런스 기능을 선택하는 팩 (v2)

예제는 `packs/example/`입니다. 다음 설정은 기본적으로 꺼져 있습니다. 기존 팩은 기존 수치·난수·행동 규칙을 유지합니다. SAW의 확정 수치 표를 적용하는 작업은 별도입니다.

`game.json.battleRules`는 엔진 규칙의 부분 덮어쓰기입니다. `ai`, `k`, `morale`도 항목별로 합칩니다. 목록·그 밖의 객체는 지정한 객체로 교체합니다.

```json
{
  "battleRules": {
    "actions": {"stat":"skill","threshold":130,"count":2,"extraMax":1},
    "critical": {"stat":"skill","coefficient":0.4,"min":5,"max":75},
    "skillActivation": {"stat":"skill","coefficient":0.2,"min":5,"max":25},
    "enRegenPerRound": 5,
    "recoveryTiming": "phase",
    "consumablePolicy": "consume",
    "weaponUpgrade": {"mode":"percent","rate":0.1},
    "upgradeLimits": {"weapons":{"max":15,"newGamePlusMax":30,"costs":[100,150,200,250,300,350,400,450,500,550,600,650,700,750,800,850,900,950,1000,1050,1100,1150,1200,1250,1300,1350,1400,1450,1500,1550]}},
    "newGamePlus": {"carry":["upgrades","credits","parts","levels","training"]},
    "ai": {"resources":{"ammoBonus":0.15,"reserveFinisher":true,"reservePenalty":0.5,"finisherMorale":120}}
  },
  "unitInfo":{"stats":{"skill":{"name":"추론","desc":"행동 횟수·크리티컬·확률 기술에 쓰는 능력입니다."}}}
}
```

- **무장 자원**: 코어 `weapons`의 `ammo`는 최대 탄수, 유닛의 `ammo[weaponId]`는 잔탄입니다. `en`은 에너지 소모, 둘 다 없거나 0이면 무소모입니다. `postMove`와 `moraleReq`는 별개 조건입니다. 출격 때 모든 폼의 탄을 채우고, 공격·반격·원호에서 빗나가도 1발 씁니다. 맵병기는 대상 수와 무관하게 발사당 1발입니다. 저장·변형·다음 턴은 탄을 다시 채우지 않습니다.
- **회복**: `enRegenPerRound`는 고정 자연 회복입니다. `recoveryTiming:"phase"`면 각 진영 페이즈 시작에 회복합니다(미지정은 기존 라운드 경계). 기체 `enRecovery:{"pct":10,"flat":0}`와 지속형 파츠 `effects:[{"type":"enRegen","value":{"pct":10}}]`를 더합니다. `hpRegen`도 같은 문법입니다. pct 단위는 퍼센트이며 각 회복량을 내림합니다.
- **장치**: 기체 `devices:[{"id":"supply","name":"보급 장치","kind":"resupply","uses":8,"postMove":true,"morale":-10,"experience":600}]`. 인접한 다른 아군에게 사용하며, 행동 1회와 장치 횟수만 씁니다. `repair`는 `amount:{"pct":30,"flat":0}`로 HP를 회복합니다. 온도 보정·경험치·횟수는 팩이 정합니다. 회복할 자원이 없는 대상은 거절합니다. 횟수는 출격 때만 초기화됩니다.
- **정신기·사용형 파츠**: 즉시 효과 `resupply`는 에너지·탄 전량, `ammoRestore`는 탄 전량입니다. 기존 `enRestore`·`hpRestore`도 씁니다. 사용형 파츠는 `kind:"consumable"`; `consumablePolicy:"consume"`이면 사용 뒤 캠페인 장착 재고에서 빠집니다. 미지정/`stage`는 기존 팩의 출격당 한 번 사용 방식입니다. 정신기의 `experience`는 선택 지원 경험치, `spPct:50`은 사용 파일럿 최대 SP의 50%를 올림해 소모합니다(기존 `sp`를 대체).
- **서브 파일럿**: 기체 `subPilots:["echo"]`는 코어 pilots id 목록입니다. `game.pilotCasts`에 초상 cast를 연결합니다. 메뉴에서 주·보조를 고르고 각자의 SP·습득 레벨을 사용합니다. `spirit` 명령의 선택 `pilotId`로 지정합니다. 호스트가 첫 행동을 마치면 보조 정신기도 제한됩니다. SP는 중단 저장에, 레벨·경험치는 편성에 남습니다. 같은 파일럿을 별도 출격 유닛이나 다른 호스트에 중복 배치하지 않습니다.
- **추론 성장·훈련**: 기존 코어 `skill` 키를 유지하고 표시 이름을 팩에서 바꿉니다. 기존 `growth.skill` 선형 성장을 쓰거나 `statCurves:{"skill":[{"level":1,"value":110},{"level":21,"value":130}]}`로 점 사이 선형 보간 후 내림합니다. 양 끝 밖은 끝값입니다. `training.stats.skill` 투자분을 곡선 위에 더합니다. 기존 기량 수치를 새 이름만 붙여 사용하지 말고, 다음 수치 적용 때 기초·곡선을 함께 정하세요.
- **행동 예산**: `actions.stat/threshold` 또는 `actions.level` 중 하나를 만족하면 `count`회, 아니면 1회입니다(둘을 쓰면 OR). 자기 페이즈 시작에 평가합니다. 한 행동에는 이동 1회와 공격·지원·대기 중 하나가 들어갑니다. 두 번 행동하면 이동→공격→이동→공격, 공격→이동→공격도 가능합니다. 반격·원호는 자신의 행동을 소모하지 않습니다. 첫 완료 행동 뒤에는 `rules.spiritAfterAction:false`인 팩의 정신기가 모두 막힙니다.
- **각성**: `effects:[{"type":"extraAction"}]`, `duration:"instant"`, `target:"self"`. `actions` 설정이 있으면 행동 전 예약으로 남은 행동 +1, `extraMax`만큼만 한 라운드에 씁니다. actions 미설정 팩은 기존 재행동 효과의 호환 동작을 유지합니다. 각성을 도입하는 팩은 actions도 선언하세요.
- **크리·확률 기술**: 크리 확률은 `clamp(weapon.crit + coefficient × (공격 stat − 방어 stat), min, max)`입니다. 별도 방어 난수를 더 굴리지 않습니다. 기술은 `activation:{"hook":"defense","base":5,"baseline":100,"coefficient":0.2,"min":5,"max":25,"level":19,"morale":110,"effects":[{"type":"evadeAll"}]}`처럼 선언합니다. 확률은 `clamp(base+coefficient×(stat−baseline),min,max)`; 생략한 계수·경계는 skillActivation 값을 씁니다. hook은 attack/defense/counter입니다. 효과는 타격 한 번에만 적용하는 명중·회피·피해·크리 보정입니다. 예측은 발동 조합의 기대값만 계산하고 RNG를 쓰지 않으며, 실제 타격에서만 추가 난수를 굴립니다.
- **개조**: 비율은 원래 무장 위력에 단계 수×rate를 더하는 단리입니다. 파츠 위력 보정은 그 뒤입니다. `upgradeLimits`는 항목별 상한·NG+ 상한·전체 단계 비용표이며, costs는 높은 상한까지 있어야 합니다. 기체 costClass 배율은 유지합니다. 미지정 항목은 기존 upgradeMax/upgradeCost를 씁니다.

**N인 합체기 DSL** (기존 2인 문법도 유지):

```text
합체기 walk-trio = hero + loop + wing 무장 trio-beam 조건 호감 loop >= 1 이름 산책의 합주 기력 100 비용 10,10,10 이동후 가능
```

참가자 순서대로 비용을 적습니다. 해금은 `조건 변수 변수명` 또는 `조건 호감 인물id >= 수치`입니다. 이동후는 가능/불가입니다. 모두 살아 있고 같은 페이즈이며 첫 행동 전이어야 하고, 참가자 전체가 인접한 연결 그래프를 이뤄야 합니다(모두가 주공격자 옆일 필요는 없음). 사용하면 전원의 남은 행동을 포기하고 각자 비용을 소모합니다. 실패 시 변경하지 않습니다. 합체기 대사는 기존 `battleDialogue`의 `binding.ids`로 연결하며, `binding.participants`에 참가 cast를 적습니다. 예제 `battle-lines.json`은 3명 순서 대사→마무리입니다. 슈퍼 AI 대전의 11종 합체기는 같은 문법과 원문 대사 binding으로 연결합니다.

- **뉴게임 플러스**: `newGamePlus.carry`로 승계 범위를 정합니다. 엔딩 크레딧이 끝나면 다음 회차의 첫 화를 자동 저장하며 타이틀의 이어하기에 회차를 표시합니다. 개조·자금·파츠·레벨·훈련은 선택 승계, 호감·히든 합류·대본 플래그·소모품 사용 횟수는 초기화합니다. 숨은 동료의 성장 기록은 별도 inheritance에 두고 다시 합류할 때만 복원합니다. 장착한 사용형 파츠도 실제로 남아 있는 것만 승계합니다.
- **AI**: `ai.resources`는 opt-in입니다. 기대 피해에 실탄 보너스를 주고, 다른 필살기의 최소 비용에서 다음 턴 회복량을 뺀 비축량을 침해하는 일반 무기는 감점합니다. 즉시 격파 가능한 기대 피해에는 비축 감점을 주지 않습니다. 자동 반격도 같은 점수를 쓰고, 적·자동 플레이 모두 행동 예산을 끝까지 씁니다. 지원 장치가 있으면 회복이 필요한 인접 아군을 지원합니다.
- **지원 대사**: 장치 resupply/repair와 정신기 resupply/hpRestore 뒤에 해당 사용 파일럿의 battleLines.resupply/repair를 연결합니다. 기체 `cheerHp:0.3`은 아군 호스트가 피격 뒤 살아 있고 HP 비율이 0.3 미만이면 탑승 서브 파일럿의 cheer를 연결합니다. 데이터가 없으면 대사를 만들지 않습니다. 탭으로 빨리 넘기고 속도 2 이상에서는 생략합니다.
- **합류 레벨 하한**: episode의 `minimumLevel`은 명시 배치·편성 추가 배치 모두의 하한입니다. 높은 기존 레벨은 내리지 않습니다.

중단 저장의 코어 형식은 `m2-save-2`입니다. 남은/완료 행동·각성 횟수·장치 횟수·각 서브 파일럿 SP를 검사합니다. 직전 m2-save-1만 행동 1회 이하의 보수적인 상태로 이관하며, 새 장치/서브 파일럿 자료가 필요한 옛 저장은 스테이지 재시작을 요구하고 거절합니다. 알 수 없는 형식은 거절합니다.


### 화별 수치와 지원 경험치 확장

`game.stageAdjustments`는 스테이지 id별 JSON을 가리킬 수 있습니다. 각 항목의 `content.mechs`/`content.weapons`는 id별 부분 덮어쓰기이며 해당 화에만 적용됩니다. `ammo:null`은 탄수 제한 제거입니다. `units`는 배치·대기·증원 정의의 레벨/개조/`pilotOverrides`를 덮습니다. 컴파일된 폼의 원본 id는 `aliases`로 선언합니다. 전역 도감은 변하지 않으며 중단 저장 복원에도 같은 표를 적용합니다. `rules`에는 합체기·유닛 규칙·조건 증원을 선언할 수 있습니다.

기체의 `pilotOverrides:{pilotId,stats,growth,sp,spGrowth}`는 같은 파일럿의 계열 차이를 표현하고 (pilotId를 쓰면 해당 파일럿에게만 적용하며 훈련 보너스도 유지합니다),, 배치의 `pilotOverrides:{stats,growth,startMorale}`는 화별 능력치를 표현합니다. `pilotStatSet` 효과는 특정 상태에서 능력치를 고정합니다. `barrierStates:{active:[효과],inactive:[효과]}`는 배리어 상태와 연동합니다. 합체기의 `powerMultiplier`는 참가자의 유효 필살 위력 최댓값에 곱하고 개조·파츠를 다시 더하지 않습니다. `virtualParticipants`는 공간 인접만 면제하며 비용·행동·온도 조건은 유지합니다. `transitions:[{id,barrierBroken,spawns}]` 또는 `{id,form:{unit,id,hpPct},spawns}`는 조건이 처음 충족될 때 한 번 증원합니다.

`devices[].uses:null`은 무제한이며 `en`은 사용자 EN 비용입니다. `rules.supportExperience`에는 레벨 차 보너스, 1회 기본 상한, 최소 부족 비율, 스테이지 총 상한, 파일럿별 첫 보너스와 정규 파일럿 평균 레벨 기준 상한을 설정합니다. 첫 보너스는 1회 기본 상한 밖이지만 스테이지 총 상한 안입니다. `Pilot.hostProgress:true`인 서브 파일럿은 호스트 레벨을 따르고 지원 경험치도 호스트에게 줍니다. `rules.combatMoraleCap`은 한 교전의 긍정 기력 상승 총량 상한입니다. `game.stageRewards`는 첫 승리 뒤 지급할 파츠 id/개수입니다.

`ai.resources.utility`는 기대 유효 피해·목표 HP 비율·격파 보너스에서 EN 비축/역할별 가격·잔탄 희소도·반격 위험을 빼고, 행동 절약·다음 필살 위치를 가산하는 선택 정책입니다. `safeResponse`, `roundRobin`, `supportPilots`는 각각 치명타 최대 피해를 고려한 대응, 첫 행동 우선 순환, 지원 역할 파일럿 id 목록입니다. `supportUnits`는 아군에게만 적용할 지원 역할 유닛 id 목록입니다. 가상 참가자는 집결 위치 계산에서도 제외합니다. 무장 사용 횟수 할당은 하지 않습니다. 자원 정책을 켜면 피해 0인 타격·반격과 아군이 범위에 든 MAP 공격은 피합니다. 배리어 해제용 이벤트 합체기를 먼저 조립합니다.

`stageAdjustments.aliases`는 컴파일된 기체에 원본 기체의 현재 수치·장비를 적용합니다. 이 선언이 있는 기체에는 이전 컴파일의 무장 추가 목록을 다시 붙이지 않습니다. `pilotOverrides.clearOnJoin:true`는 적에서 아군으로 합류할 때 적 전용 파일럿 수치 덮어쓰기를 해제합니다. 기체의 화별 수치 표는 같은 스테이지 동안 유지됩니다.

### 자원 AI의 후보 혼합과 대응 분리

`game.battleRules.ai.resources.enemyResponse: {mode:"counter-first", defendHp:0, evadeHp:0}`는 적/제3세력 자동 대응만 바꾼다. HP 비율이 설정 이하일 때만 회피/방어하고, 나머지는 가능한 반격을 고른다. 반격할 수 없으면 기존 방어/회피 대체 판정을 쓴다. `safeResponse`에 따른 아군 추천 대응은 유지한다.

`nearOptimal:0.05`는 최고 효용의 95% 범위에서 무장별 최선 위치를 하나씩 모으고, 그 안에서 최대 기대 피해의 95% 이상인 후보 중 EN 소모가 적은 무장을 고른다. 동일 비용 후보는 단계/라운드/유닛/행동 수의 FNV 해시로 섞는다. 전투 RNG는 읽기만 하며 예측 횟수로 결과가 바뀌지 않는다. 사용 횟수 할당은 없다.

`burst:{base:1,crowded:2,eliteCount:4,eliteMechs:["commander"]}`는 자동 플레이 필살 예산이다. 출격 때 계획된 엘리트가 eliteCount 이상이거나, 엘리트 1기 이상·일반 전투원 6기 이상이고 사건 합체기 비축이 없으면 crowded를 쓴다. 일반 무장이 있으면 예산 소진/자코/낮은 HP에는 필살을 아끼고 엘리트에는 가중한다. 실제 필살 발사 수는 유닛 `aiFinisherUses`로 저장한다. 필살과 아직 배리어를 깨지 못한 사건 합체기의 비용은 각각 비축한다.

`positionPlan:true`는 근접·실탄 사거리 안 위치에 작은 가점을 주며, 효용이 같으면 불필요한 이동을 피한다. 아직 사격할 수 없으면 이동 비용·짧은 사거리 무장 사용 가능·근처 적 수를 함께 보고 다음 접근 칸을 고른다. 기존 예상 반격 피해도 효용에서 차감한다.

### 공개판 저장의 명시적 변환

`game.saveMigrations:"save-migrations.json"`에 이전 공개판 계약 배열을 둔다. 각 계약은 `from`(캠페인 fingerprint 배열), `contentVersions`, `campaign`, `content`, 이전 `upgradeCost`/`upgradeLimits`/`mechCosts`를 가진다. 육성이 있으면 이전 `training`도 둔다. 먼저 이전 계약으로 저장 전체를 검증한 뒤 현재 계약으로 다시 검증한다. 알 수 없는 버전·다른 팩·손상된 저장은 계속 거절한다.

진행·편성·플래그·호감·육성·자금·파츠를 유지하고, 보유 기체의 이전 단계별 실제 가격 합계×비용 등급을 환불한다. 개조/완전 개조 보너스는 초기화하고, 잔탄과 유한 장치 횟수는 새 최대값으로 채운다. 전장 위치/턴/RNG/이벤트 포인터는 유지하며 HP·EN·SP는 새 상한으로 제한한다. 오래된 진행 중 전투 연출은 확정된 상태에서 마무리한다. 새 소모/사거리 규칙에 맞지 않는 보류 공격은 취소해 재선택하며, 위치·페이즈·자원은 보존한다. 변환 결과를 슬롯에 먼저 저장하므로 재로드해도 환불하지 않는다. 알림은 새 화면의 비동기 준비가 끝난 뒤 한 번 표시한다. 변환 계약은 전투 상태에 들어가지 않는다.


## 모바일 화면과 닫기·뒤로

게임과 진열장은 자기 문서(iframe이면 그 프레임)의 표시 영역을 고정합니다. `html/body`의 fixed·overflow·overscroll·touch-action 설정, 캔버스의 touch-action:none, 연속 touchend의 iOS 기본 동작 차단을 함께 사용합니다. 입력은 기존 pointerdown/up으로 전달하므로 빠른 대사 넘기기도 유지됩니다. 이름 입력은 `focus({preventScroll:true})`로 엽니다. viewport의 maximum-scale=1/user-scalable=no는 이 캔버스 게임에서 브라우저 확대를 제한하므로 확대 접근성에 손해가 있다는 선택을 명시합니다. 바깥 호스트 문서의 스크롤이나 확대 설정을 게임이 바꾸지는 않습니다.

화면은 `screen.ui.setNavigation(...)`으로 되돌리기 종류를 선언합니다. 동작은 화면의 cancel 입력으로 전달되어 키보드 Esc와 같습니다.

```ts
// 별도 취소 수단이 없는 창: 내부 우상단 ✕, 우상단 모서리에는 약한 ESC
screen.ui.setNavigation({kind:'close', bounds:{x:200,y:110,w:880,h:500}, onBack:close});
// 창 안에 취소·아니오·닫기 버튼이 이미 있으면 ✕를 생략하고 ESC만 유지
screen.ui.setNavigation({kind:'close',cancelInContent:true,onBack:close});
// 창 내부 우하단 뒤로. bounds를 생략하면 전체 화면 메뉴의 우하단
screen.ui.setNavigation({kind:'back', onBack:returnToParent});
// 지도 기본 화면: 최후 수단만 표시
screen.ui.setNavigation({kind:'escape', onBack:mapCancel});
// 타이틀·대사·필수 대응·자동 연출: 표시하지 않음
screen.ui.setNavigation({kind:'none'});
```

✕/뒤로의 터치 영역은 88px 이상입니다(논리 1280×720, 실제 캔버스 폭 640px에서 44px). 창 테두리와 본문 사이에 버튼을 위한 머리말/바닥 공간을 둡니다. ESC가 보이는 화면만 우상단 88×72를 비웁니다. ESC를 숨기는 화면은 그 모서리를 사용해도 됩니다. ESC는 (1200,8)의 72×56 어두운 버튼입니다. 전투 연출은 ESC를 숨기고 HP 패널을 좌우 대칭으로 배치하며, 건너뛰기는 위 가운데에 둡니다. 능력 보기의 빈 곳 탭은 닫지 않습니다. 지도 팝업의 바깥 탭과 이동 후 뒤로는 기존 Esc 취소 규칙을 유지합니다.

브라우저 회귀 시험: 엔진 폴더에서 `node tools/mobile_viewport_check.mjs`. 기본 예제 팩 또는 `PACK_DIR`의 팩으로 첫 도입 대사 전체를 빠른 더블탭으로 넘기고, 대사창·레터박스·프레임 가장자리와 헤더가 있는 스크롤 가능한 iframe 호스트를 확인합니다. 외부 요청은 차단하고 scale/offset/안팎 스크롤/resize/focus를 `tools/out/mobile-viewport/viewport.json`에 기록합니다. `CAPTURE_OUT`으로 출력 위치, `BROWSER_ENGINE=webkit`와 `BROWSER_PATH`로 이미 설치된 호환 WebKit을 선택할 수 있습니다. 이 에뮬레이션이 실제 iOS 브라우저 도구막대나 claude.ai 호스트를 재현한다는 뜻은 아닙니다.

지도 메뉴는 제목 “맵 메뉴”와 우상단 ✕만 두고 목록의 닫기·하단 뒤로는 두지 않습니다. 정신기 목록 제목은 “정신기 · 선택한 파일럿 이름”이며 주·보조를 구분합니다. 닫기 팝업의 머리 줄에는 짧은 제목을 둡니다. 툴팁은 독립 창이 아니므로 ✕·뒤로를 붙이지 않습니다. 선택에 따라 내용을 바꾸고, 해당 목록을 닫을 때 함께 없앱니다. 능력치·스킬 등 다른 설명 툴팁도 같은 규칙입니다. 확인창·전투 예상 창처럼 이미 아니오·취소가 있는 창은 ✕를 중복해 붙이지 않습니다.


## 음악 슬롯과 화별 로딩

`game.music`은 title/map/enemy-phase/battle/boss/lastboss/intermission/upgrade/save/victory/gameover 화면 곡을 지정한다. 생략한 upgrade·save는 인터미션을 쓴다. `cast.json`의 `theme`·`themePriority` 또는 `musicRules.pilots[pilotId]`로 파일럿 테마를 지정한다. 적대 시 다른 테마가 필요하면 cast의 `enemyTheme`·`enemyThemePriority`를 쓴다. 적이 먼저 공격해도 아군 테마를 선택하고, 상대의 우선순위가 더 높을 때만 덮어쓴다. 테마가 없으면 battle, 옛 보스 태그·크기 규칙은 적에게만 적용된다.

```json
{
  "musicRules": {
    "slots": {"hero-theme":"battle", "opening":"victory", "workshop":"intermission"},
    "pilots": {"hero":{"theme":"hero-theme","priority":1}, "commander":{"theme":"boss","priority":50}},
    "battleOpening": {"slot":"opening","seconds":1.4},
    "bossEntrance":"boss",
    "stages":{"stage-1":{"map":"map","appear":{"leader":"boss"}}},
    "story":{"default":"map","tags":{"tense":"boss"},"sceneTags":{"ep01:조우":["tense"]}}
  }
}
```

슬롯은 실제 pack.json 곡의 별칭이며 순환시키지 않는다. 같은 실제 곡이면 다시 시작하지 않는다. `episodes[].mapMusic`은 화별 지도곡이다. 이벤트 합류 기체의 테마는 해당 라운드의 아군 페이즈 동안만 적용되고 다음 라운드에는 원래 곡으로 돌아간다. `stages[stageId].appear[unitId]`는 등장 이벤트 곡이다. `story.scenes["화:장면"]` → sceneTags → story.default 순으로 기본 곡을 고르며, 대본의 `[음악]` 지시가 우선한다. 선택지로 이동한 장면에도 적용된다. 별도 지문·대사는 추가하지 않는다.

전투 연출이 켜져 있을 때만 오프닝을 재생하고 테마로 잇는다. 연출 끄기·건너뛰기는 지도 간략 연출을 유지한다. 빨리감기에서도 전투 대사는 완성된 문장을 최소 0.6초 동안 표시한다. 건너뛰기는 대사를 기다리지 않는다.

배포 형식은 MP3 하나다. `audio/pack.json` 항목의 `frames`·`sampleRate`는 원본 PCM 길이이고 `encoderDelay`는 디코더가 패딩을 제거하지 않은 경우의 보정값이다. `loopStart`·`loopEnd`는 패딩을 제외한 PCM의 초 단위 지점이며, Web Audio 버퍼 반복으로 이음매를 처리한다. 승인 원본의 MP3 재생성은 `tools/reencode_audio.py --pack ... --selection ... --source-root ... --report ...`를 쓴다. 출처·라이선스·변경 기록은 그대로 유지하며 원본을 건드리지 않는다.

첫 사용자 touchend/pointerup/keydown에서 AudioContext 생성·resume·무음 프라이밍을 동기적으로 호출한다. 화면 복귀와 다음 입력에서도 재개를 확인한다. prefixed WebKit API를 지원하고 Web Audio가 없는 환경은 HTMLAudio로 대체한다(정밀 루프는 Web Audio 경로). 실패는 곡/효과음 종류마다 콘솔에 한 번 남긴다. 볼륨 0은 저장한 사용자 설정으로 존중한다.

빌드/개발 서버는 각 화의 선택적 사건·폼을 포함한 그림·음악·공통 효과음 목록과 SHA256/크기를 assets.json 자료 묶음으로 생성한다. 팩 원본에는 생성물을 쓰지 않는다. 부팅은 타이틀과 1화 도입 자료만 준비하고, 화 시작 시 부족한 자료는 불투명 진행률 화면으로 덮는다. 다음 화의 압축 자료만 동시성 1로 미리 받는다. 장면/전투 시작 전에 필요한 오디오를 디코딩하며 디코딩 버퍼는 기본 128MiB LRU 상한으로 지난 곡부터 놓아준다. 재생 중인 곡은 유지한다.

Cache API는 팩 id와 미디어 해시 버전으로 구분하고 이전 버전을 정리한다. Cache API 접근이 거절되면 HTTP 캐시로 이어진다. 서비스 워커는 필요 없다. 미디어 URL에는 내용 해시 쿼리가 붙고, 압축 자료의 메모리 캐시는 16MiB다. 화 전환은 이전 화면의 비동기 준비를 취소하고 로딩 중에는 인터미션/개조 화면을 그리지 않는다.
# 적 행동 패턴과 선택 효과음

`game.json`의 `enemyAI: "enemy-ai.json"`은 스테이지 id → 행동 설정 객체를 읽는다. 해당 파일이 없으면 기존 대본의 공격/대기/방어/추적/도달 규칙을 유지한다. 새 설정의 우선순위는 **유닛 → 처음 일치하는 그룹 → 스테이지 기본값**이다. 중립·아군과 제3세력의 기존 추적 규칙은 이 적 기본값으로 바뀌지 않는다.

```json
{
  "lesson-1": {
    "default": {"pattern": "aggressive"},
    "groups": [
      {"id":"sentries", "ids":["target"], "behavior": {
        "pattern":"boss", "when":[{"turn":3},{"hpBelow":0.7}]
      }}
    ],
    "units": {}
  }
}
```

- `aggressive`: 기존 합법 이동·무장·피해/자원 평가로 유리한 적에게 접근한다.
- `hold`: 처음에는 이동하지 않고 사거리 안에서 공격한다. 적대 유닛의 사거리 진입 또는 피격(빗나감 포함) 뒤 `aggressive`로 전환한다.
- `guard`: `anchor:{x,y}` 또는 살아 있는 `anchorUnit` 주변 `radius`(기본3)를 지킨다. 생략한 중심은 최초 배치 칸이며, 이동 경로 전체가 반경 안에 있어야 한다. 사거리 밖 표적에도 경계까지 접근할 수 있다.
- `ambush`: `when`이 성립하기 전에는 공격·이동하지 않는다. 대기 정의를 자동 등장시키지는 않는다. 기존 증원/등장 사건이 먼저 유닛을 배치한다.
- `boss`: 처음에는 제자리에서 공격하며 `when` 이후 적극 공격한다. 조건을 생략하면 제자리를 유지한다.
- `objective`: `area`(스테이지 지역 id) 또는 `target:{x,y}`로 장애물을 우회하여 이동한다. 목표에 도달하거나 이동을 마치면 가능한 공격을 평가한다.
- `retreat`: HP 비율이 `battleRules.ai.defensiveHp` 이하이면 적으로부터 멀어지고, 그 밖에는 일반 공격을 한다.

`when` 배열은 OR, 배열의 한 객체 안은 AND다. `turn`은 해당 턴 이상, `hpBelow`는 현재 HP/실효 최대 HP 이하, `area`는 그 지역으로 아군이 진입, `variable:{name,equals}`는 이벤트 변수의 정확한 값이다. 한 번 활성화된 대기·매복·보스는 스테이지 동안 활성 상태를 저장하며 미리보기는 상태나 전투 RNG를 소비하지 않는다. 기본 전환 조건은 강제로 추가하지 않는다. 예제 팩의 두 스테이지는 hold와 조건부 boss의 최소 견본이다.

배치용 개조가 상점 상한보다 높아야 하면 `battleRules.deploymentUpgradeMax`를 선언한다(1~99). 이는 배치/저장 검증용 상한이며 상점 가격이나 아군 구매 상한을 바꾸지 않는다. 무장 위력의 단계당 비율은 기존 `weaponUpgrade` 설정을 따른다.

선택음은 `confirm`(일반 클릭), `important`(스토리 분기·일회성 선택·출격 최종 확인·NG+ 시작), `cursor`(이동)로 구분한다. 팩의 audio/pack.json에서 각각 다른 파일을 지정할 수 있다. `Button`은 `sound:'important'`, `MenuItem`은 `sound:'important'`로 중요한 행동을 선언한다. `ConfirmScreen`은 `{yes,no,important:true}`인 경우 실제 긍정 선택에만 중요 확인음을 사용한다. 기본은 일반 클릭이다. 자동 스토리 진행에는 수동 넘김 소리를 추가하지 않는다. UI 음은 `Sound.play`에서 0.5배, 전투 효과음은 1배로 재생한다. 팩 파일 gain으로 더 줄일 수 있다.



### 작전 실패 재도전과 회차별 적 개조

`game.json`의 `battleRules`에 다음과 같이 선언합니다. 생략하면 기존 패배 흐름과 적 수치가 유지됩니다.

```json
{
  "retryOnDefeat": {"keep": ["exp", "credits"]},
  "enemyUpgrades": {"armorDivisor": 2, "mobilityDivisor": 2, "weaponDivisor": 2},
  "newGamePlus": {
    "carry": ["upgrades", "credits", "parts", "levels", "training"],
    "enemyUpgradeOffsetPerCycle": 15
  }
}
```

`retryOnDefeat.keep`는 `exp`(레벨·경험치·서브 파일럿 경험치), `credits`(현재 자금)를 선택합니다. 실패 화면의 주 행동은 **인터미션으로 돌아가기**, 보조 행동은 **타이틀로**입니다. 복귀는 출격 직전 체크포인트 전체를 복원한 뒤 지정 보상만 합칩니다. 파츠 획득·소모, 합류·진행·호감·훈련 포인트와 사건 변수는 복원됩니다. 전투에서 일시 합류한 인물의 경험치는 합류 상태와 별도로 보관하고 다음 합류 때 적용합니다. 반환 직후 자동 저장하며, 개조·육성하고 재출격하면 같은 화를 새 전장으로 만듭니다(잔탄·장치 횟수 충전). 승리 보상은 정상적인 클리어 경로에서 지급합니다.

`game.stageAdjustments`의 인라인 객체 또는 해당 경로 JSON의 각 스테이지에 `"enemyUpgradeLevel": 1`처럼 기본 단계를 적습니다. 내부 `Stage.enemyUpgradeLevel`도 같은 값입니다. 출격 때 유효 단계는 `기본 단계 + (저장 회차 − 1) × enemyUpgradeOffsetPerCycle`입니다. 저장의 첫 회차는 1이므로 사용자 표현의 1회차=0 오프셋과 같습니다. HP·에너지는 유효 단계, 장갑·운동성·무기는 각각 `floor(유효 단계 / armorDivisor|mobilityDivisor|weaponDivisor)`를 적용합니다. `armorCap`·`mobilityCap`을 생략하면 상한이 없으며, divisor를 생략한 옛 팩은 1로 계산합니다. 최초 배치와 모든 증원 경로가 같은 계산을 쓰며 회차는 저장·불러오기에 보존됩니다. 적이 아군으로 합류하면 적 회차 보너스를 떼고 원래 배치의 개조를 사용합니다. 아군 개조 상한·비용과 적 강화 공식은 별개입니다.

예제 팩은 `game.json`의 인라인 `stageAdjustments`와 회차 오프셋 2로 두 스테이지에 대한 견본을 제공합니다. SAW는 15입니다. sim 드라이버도 패배 시 모델의 재도전·자동 저장을 사용합니다. 샘플은 착실/활용 프로필에서 착실 투자 정책, 기본 프로필에서 해당 화의 기존 구매 목표, 최소 프로필에서 무투자를 유지합니다. 범용 sim은 별도 투자 정책이 없어 구매하지 않습니다. 무한 실행을 막는 `--max-retries`의 기본값은 화당 10회이며, 한도를 넘으면 복귀 상태를 저장한 뒤 오류로 끝냅니다.


### 부대 규모별 정규 클리어 자금과 적 파일럿 기준선

`economy.income[stageId].rosterClear`에 `{ "unit-id": 500 }`처럼 영구 편성 유닛별 추가 정규 클리어 지급을 적을 수 있습니다. 실제 편성에 등록된 id만 합산하며, 패배·재도전 때는 주지 않습니다. `clear + rosterClear 합계`는 기존 대본의 클리어 지급분을 포함하는 보장 총액입니다. 격파 자금은 따로 더하고 재정산·재로딩으로 중복 지급하지 않습니다. `defeat`는 예산 기록이므로 실제 격파 지급액은 스테이지 `content.mechs[id].credits`에 적습니다. 컴파일된 폼·무장 별칭에도 원본 기체의 credits/exp가 전달됩니다. 숨은 사건·가챠·파츠 판매 수입은 기본 예산과 별개입니다.

스테이지 조정 항목에 `enemyPilotScaling`을 둘 수 있습니다.

```json
{
  "baseline": {"level": 20, "stats": {"melee": 160, "shoot": 160, "hit": 160, "evade": 140, "defense": 140, "skill": 130}},
  "units": {"grunt": {"ratio": 0.8, "actionCap": 1}, "boss": {"ratio": 1.0}},
  "newGamePlusReference": "allied-mean",
  "referencePilots": ["hero", "partner"]
}
```

첫 회차는 팩이 계산한 아군 기대 평균을 기준으로 같은 능력치마다 ratio를 곱해 반올림합니다. 적 레벨도 기준 레벨×ratio를 반올림하고 1~levelMax 범위로 제한합니다. 전투 중 일시적인 능력치 효과는 그 뒤에 적용됩니다. `actionCap:1`은 추론이 높아져도 기본 2회 행동을 막습니다. NG+의 `allied-mean`은 현재 아군 주 파일럿의 실제 승계 레벨·훈련으로 기준선을 다시 계산합니다. referencePilots에 없는 손님·보조 파일럿은 평균에 넣지 않습니다. 출격 시작 기준선을 해당 화 동안 사용하며, 저장 복원에서도 같은 출격 전 상태로 재계산합니다. 재도전은 정상 출격과 같은 계산을 합니다. 적 기체의 회차별 개조와는 독립입니다. 비율 보정이 없는 팩에는 적용되지 않습니다.


## 시네마틱 영상

영상은 전투 규칙·RNG와 분리된 연출입니다. `game.json`에서 팩 내부 MP4와 대체 그림을 선언합니다.

```json
"cinematics": {
  "enabled": true,
  "opening": {"id": "opening", "when": "title"},
  "videos": {
    "opening": {"file": "video/opening.mp4", "fallback": "bg-hangar", "seconds": 1.5},
    "bridge": {"file": "video/bridge.mp4", "fallback": "bg-harbor"},
    "finisher": {"file": "video/finisher.mp4", "fallback": "bg-arena"}
  }
}
```

- `opening.when`은 `title`(기본) 또는 `new-game`. 팩 id로 구분한 로컬 설정에 처음 본 여부를 저장합니다. 이후 타이틀의 **오프닝 보기**로 다시 봅니다. 저장소 접근이 제한되면 다음 실행에도 자동 재생될 수 있습니다.
- 스토리 어디서든 `[영상] bridge`. 분기·타입 지시 안에서도 같습니다. 스토리 SKIP은 영상을 건너뛰고 AUTO는 정상 재생합니다.
- 표시용 `weapons.json`의 무장 항목에 `"video": "finisher"`. 필살기·합체기 모두 같은 무장 연결이며, 파일럿 컷인 자리를 대체합니다. 전투 연출 끄기/전체 건너뛰기는 영상도 재생하지 않습니다.
- `file`, `fallback` 모두 선택입니다. 대체 그림은 `art.files`의 id. 설정의 **시네마틱 영상 끄기**는 그림을 `seconds`(기본 1.5초) 보여 줍니다. 파일 없음·오류·재생 거절·10초 준비 지연도 그림으로 대체합니다. 그림도 없으면 즉시 계속합니다. 누락은 개발 콘솔에 id별 한 번 남깁니다. SAW는 `enabled:true,videos:{}`로 준비만 해 두었습니다.
- 영상 중 첫 탭/클릭/Esc는 건너뛰기 버튼만 보이고, 두 번째 입력은 종료합니다. 고정 ESC는 우상단 8px, 72×64 영역입니다. 소리 켜기와 건너뛰기 버튼은 이 영역을 피합니다.
- 브라우저의 `playsinline` 비디오가 디코딩하고 기존 캔버스에 프레임을 그립니다. 원본 비율을 유지하고 검은 여백을 넣습니다. 디코더 요소는 문서 안의 고정 1px·투명·비대화형 요소라 게임의 화면 고정/스크롤/터치 좌표를 바꾸지 않습니다. DOM 비디오 겹치기와 달리 iframe·회전·레터박스에 별도 입력 좌표계를 두지 않습니다.
- 재생 중 BGM은 0.2초 페이드로 잠시 음소거하며 재생 위치는 유지합니다. 종료/실패/화면 정리 때 복구합니다. 사용자 오디오 활성화 전에는 무음 재생하고 **소리 켜기**를 표시합니다. 해당 버튼의 사용자 동작 안에서 직접 잠금 해제/비디오 재생을 시도합니다. 영상 음량은 음악 설정을 따릅니다.
- 빌드의 화별 에셋 목록에 영상·대체 그림도 들어갑니다. 미래 화 백그라운드 다운로드에는 큰 영상을 포함하지 않습니다. 현재 화 직전에 받되 영상 사전 로딩은 파일당 8초 안에 끝내고(시간 초과는 재생기 대체 처리로 진행), Cache API/HTTP 캐시를 재사용하고, 다음 화 진입 시 지난 화 인코딩 바이트 캐시를 놓습니다. 재생 종료 때 디코더와 Blob URL은 즉시 정리합니다. 실제 영상의 디코딩 메모리는 브라우저가 관리합니다.

### 컷 이어 붙이기

외부 원본은 `games/super-ai-wars/production/video-src/<영상 id>/`에 둡니다. **실행하지 않으며** JSON 목록과 미디어만 읽습니다. 결과는 `pack/video/<id>.mp4`. 로컬 ffmpeg/ffprobe가 PATH에 있어야 하며 `FFMPEG`, `FFPROBE` 또는 인자로 위치를 지정할 수 있습니다. npm 의존성은 없습니다.

```sh
python -I engine/tools/merge_video.py games/super-ai-wars/production/video-src/opening/cuts.json --output games/super-ai-wars/pack/video/opening.mp4
```

```json
{
  "fps": 24,
  "music": "music.mp3",
  "musicGain": 0.5,
  "cuts": [
    {"file":"01.mp4","order":1,"start":0,"duration":6,"transition":"cut","sfx":[{"file":"whoosh.wav","at":0.2,"gain":0.5}]},
    {"file":"02.mp4","order":2,"start":0.5,"duration":5,"transition":"crossfade","transitionSeconds":0.25},
    {"file":"03.mp4","order":3,"duration":6,"transition":"white-flash","transitionSeconds":0.2}
  ]
}
```

경로는 목록 JSON 기준. `order` 생략 시 배열 순서, `start` 기본 0, `duration` 기본 6초. 전환은 **현재 컷으로 들어올 때** 적용하며 첫 컷은 무시됩니다. 컷의 기존 소리도 유지하고 `sound:false`로 뺄 수 있습니다. 효과음 시간은 자른 컷 시작 기준입니다. 배경 음악은 한 곡을 반복해 전체 길이를 채우고 끝을 0.3초 페이드합니다. 크로스페이드·화이트 플래시의 겹친 시간만큼 전체 길이가 짧아집니다. 소스/목록과 같은 출력 경로는 거절하며 원본은 수정하지 않습니다.

출력 기준: **H.264 High Level 3.1 / yuv420p / 960×540 / 24 또는 30fps / 영상 평균 목표 2Mbps, 최대 2Mbps / AAC-LC 스테레오 48kHz 128kbps / faststart**. 최종 믹스는 EBU R128 loudnorm **−16 LUFS, −1.5 dBTP, LRA 11**(단일 패스 목표), 원본 메타데이터는 제거합니다. 5–7초당 약 1.3–1.9MB를 예상하되 내용에 따라 다릅니다. 전체 아티팩트 **256MB·511파일** 예산은 영상 추가 때 다시 셉니다. 코덱/길이/실제 파일 크기는 ffprobe로 확인합니다.

예제 `video/demo.mp4`는 기존 예제 배경 3장(격납고·항구·경기장)을 줌/팬하고 기존 CC0 음악·효과음을 섞은 5.5초 기능 시험물입니다. 완성 영상이 아니며 오프닝/이야기/합체기 세 위치가 같은 파일을 재사용합니다. 그림 출처는 기존 예제 그림 고지, 소리는 `audio/LICENSES.md`의 HydroGene 및 Kenney 고지를 따릅니다.


## 무장 효과와 지원 무장

기존 무장 데이터에 선택 항목 `special`을 붙입니다. `label`은 짧은 효과 알림이고 `{en}`은 팩 자원 용어로 바뀝니다. 문장·이름과 별개인 UI 문구입니다. `cooldown`은 마지막 발사 라운드와 현재 라운드 차이로 세며(1라운드 사용 + cooldown2 → 3라운드 재사용), 빗나가도 탄수·자원·재사용 대기를 소비합니다. 예측은 상태/RNG를 바꾸지 않습니다.

```json
{"id":"paint-tag","name":"표식 탄","kind":"shoot","power":400,"range":[1,3],"hit":10,"crit":0,"en":10,"ammo":2,"postMove":true,"fixedPower":true,"adapt":{"air":"A","ground":"A","sea":"A","space":"A"},"special":{"kind":"status","target":"enemy","rounds":2,"atoms":[{"type":"hitAdd","value":-10}],"cooldown":2,"label":"명중 저하!"}}
```

| kind | 추가 필드 | 동작 |
|---|---|---|
| status | target:self/enemy, rounds, atoms | 적은 명중한 뒤, 자신은 지원 명령으로 적용. 같은 무장 효과는 중첩하지 않음. `rounds`번 다음 라운드 시작 뒤 해제 |
| drain | ratio, max | 실제 HP 피해×ratio만큼 자원 흡수; max·대상 잔량·사용자 빈 용량 중 최솟값. 빗나가면0 |
| critical | 없음 | 이 무장의 명중 공격만 크리티컬 확정. 일반 크리티컬 상한과 별개 |
| summon | limit, hpPct | 공격 뒤 인접한 통행 가능 빈칸에 같은 기체1기. limit는 무장 id별 스테이지 전체 상한이며 죽은 복제도 포함 |
| extraAction | cooldown | 공격 뒤1회 추가 행동. 반격/원호에서는 재행동하지 않음. 턴당 각성 포함 추가 행동 상한도 적용 |
| restore | target:self/allies, radius, hpPct/enFlat/ammo | 지원 명령 `weaponSkill`. 같은 진영의 자기/주변 동료에게 HP비율·자원고정량·각 무장 탄수 증가. 회복 대상이 없으면 불가 |

`status`의 `moraleOffset` 숫자 원자는 **기본 기력은 보존하면서 유효 기력만 일시 보정**합니다. 명중/피해·온도 조건·확률 기술·합체기 조건·화면에 같은 유효값을 씁니다. `moveAdd`, `hitAdd`, `takenMul` 등 기존 원자도 그대로 사용할 수 있습니다.
`Mech.hpRecovery:{pct:1}`은 같은 기체의 매 자기 페이즈 HP회복입니다(`recoveryTiming`에 따름). 기존 `enRecovery`와 같은 구조이며 능력 보기에도 표시합니다.
지원 무장은 공격·반격 후보에서 제외하고, 유닛 명령 메뉴에 무장 이름으로 제공합니다. 데이터가 없는 팩의 기존 행동은 같습니다. AI는 손상/부족 자원이 있는 동료에게 지원하고, 이미 걸린 디버프는 다시 걸지 않습니다. 소환/디버프/재행동은 조건에 맞고 일반 무장으로 즉시 격파할 대상이 없을 때 우선합니다. 스테이지 AI 대기/전환 조건은 그대로 적용됩니다.
복제는 출현 턴 행동하지 않고 기존 소환원과 같은 능력·개조를 쓰되 HP를 hpPct로 시작합니다. 저장에는 `summonedBy`·무장별 `weaponUses`·전장 전체 `weaponLimits`를 남기며, 출격을 새로 만들 때 초기화합니다. 스테이지에 없는 임의 유닛은 저장 복원이 거절되고, 선언된 소환원/무장/상한에 맞는 복제만 허용합니다. 복제의 `no-reward` 태그는 경험치·자금·훈련 보상 반복 획득을 막습니다.
예제 팩의 연습 기체는 표식 탄·작은 메아리·한 박자 더로 디버프·소환·재행동 문법을 보입니다. 시네마틱 견본과 함께 사용할 수 있습니다.


### 일러스트 로딩 화면

부팅과 화별 진행률 로딩은 같은 캔버스 화면을 씁니다. `game.json`에 다음을 적습니다.

```json
{
  "loadingScreens": [{"image": "art/loading/guide.webp", "cast": "hero"}],
  "loadingScreenFallbacks": [{"image": "bg-harbor", "cast": "loop"}]
}
```

`image`는 팩 안 그림 파일 경로 또는 `art.files`의 그림 id, `cast`는 `cast.json`의 id입니다. 목록은 선택 사항입니다. 없는 파일은 빌드·개발 서버의 에셋 색인에서 제외하며, 전용 그림이 하나도 없거나 실제 디코딩이 실패하면 `loadingScreenFallbacks`의 기존 CG를 씁니다. 모두 없으면 어두운 배경에 로딩 띠만 표시하고 진행합니다. 파일이 생긴 뒤에는 다시 빌드하거나 개발 서버를 다시 시작합니다.

그림은 직전과 다른 것을 무작위로 고릅니다(한 장이면 재사용). 캐릭터 이름·색은 cast, 한마디는 그 인물의 `battleLines`에서 짧은 문장을 우선 골라 그대로 씁니다. 원문에 없는 새 대사는 만들지 않습니다. 플레이어 치환은 `players.placeholders`를 따르며, 부팅 전에는 기본 이름, 게임 시작·불러오기 후에는 현재 이름을 씁니다. 예제 팩은 기존 격납고·항구 그림 두 장을 재사용합니다.

그림은 cover, 0.3초 페이드인, 8초 동안 102→106% 줌이며 시스템 `prefers-reduced-motion`이면 줌·점 깜빡임을 멈춥니다. 아래 왼쪽 이름·최대 두 줄 대사는 폭 448px(화면 35%) 안에 두고 긴 원문은 축소합니다. 최소 글꼴에서도 두 줄에 들어가지 않으면 그 문장은 그리지 않습니다. 맨 아래에는 NOW LOADING·실제 진행률 바·퍼센트가 있습니다. 바는 같은 로딩 중 감소하거나 실제 진행률을 넘지 않습니다.

빌드가 존재하는 그림과 cast의 이름·색·대사만 담은 작은 메타데이터를 화별 에셋 색인에 넣습니다. 부팅에서는 무작위 한 장을 오디오·나머지 에셋보다 먼저 받아 캐시하고, 준비가 끝난 후 다음 한 장만 미리 받아 둡니다. 이후 로딩도 같은 Cache API/HTTP 캐시를 사용합니다. 로딩 화면은 게임 규칙 RNG·저장·대사를 수정하지 않습니다. 그림 원본 추가 없이 설정만으로 견본을 구성할 수 있습니다.

영상 정의의 `music`은 `mute`(기본, 게임 음악을 무음으로 페이드) 또는 `duck`(합체기용: 기존 테마 재생 위치를 유지하며 22%로 낮춤)입니다. 종료·건너뛰기·대체 이미지 후 원래 음량을 복원합니다. 합성 JSON의 `endTransition: "white-flash"`는 마지막 0.25초를 흰색으로 페이드합니다.

### 폼·합류·클리어 육성 옵션

스테이지 규칙 `변형 이동전 unitId`는 그 유닛의 이동 뒤 폼 체인지를 막습니다. 각 `형태`는 서로 다른 mech ID와 무장 목록을 가리킬 수 있고, 변신 시 HP·자원 잔량 비율을 유지합니다. `game.battleRules.meleeHitBonus`는 근접 무장 명중의 공통 보정입니다. 무장 표현 자료의 `lineSource`는 별도 폼 무장의 전투 대사를 원본 무장 ID에서 읽게 합니다.

`game.recruitment[stageId]`의 `{unit,persuader,affection:{id,amount},flag,afterClear}`로 설득 또는 승리 후 합류를 선언합니다. 설득은 기존 인접 조건을 따릅니다. 기체 `allyStats`는 적에서 아군으로 전환할 때 적용할 기본 사양이며 HP·자원 비율을 유지하고 적 개조를 제거합니다. `training.json`의 `clearReward`는 클리어 때 합류한 주·보조 파일럿 전원에게 한 번 주는 훈련 포인트입니다.

캐릭터 `framingByArt`는 그림 ID별 `{hairCrown,chin,faceCenter,relativeHeight}` 기준점입니다. 대화 초상은 그림별 머리끝을 화면 상단 24px 안쪽으로 정렬하며 `relativeHeight`로 상대 신장을 조절합니다. 배경이 바뀌는 암전 시점에는 기존 인물 레이어를 비웁니다.

### 구간 로딩 경계

전체 로딩은 `App.boundary('boot' | 'story-end' | 'stage-end', prepare, enter)`에서만 표시합니다. 0.28초 페이드 인·아웃 사이 완전히 표시되는 시간은 최소2초이며 로딩 효과음은 없습니다. 일반 화면·대사·전투의 prepare는 이전 화면을 유지하는 조용한 준비 경로입니다. 화별 에셋 closure에는 모든 분기·증원·폼·전투 음악·효과음·영상이 포함됩니다. 부팅은 타이틀+1화 전체를 준비하며, 클리어 전환은 현재 화의 후일담과 다음 화를 함께 준비합니다. 디코딩한 효과음 메모리 상한은 유지하고 음악은 받은 MP3의 Blob URL을 사용해 전체 화를 준비해도 PCM 재디코딩을 요구하지 않습니다. 지난 화 영상 메모리는 전환 경계에서만 놓습니다.

### 영상 종료와 구간 안 전환

영상의 자연 종료·스킵·화면 교체는 동일한 종료 처리를 사용합니다. 미디어를 먼저 음소거/정지하고 src와 Blob URL, 복귀 이벤트를 해제한 뒤 BGM 덕킹 소유권을 반환합니다. 화면 전환 페이드 중에도 해당 영상만 제거하며, 다음 장면을 pop하거나 이전 화면의 최초 BGM을 다시 지정하지 않습니다. 현재 장면이 요청한 음악과 곡별 gain을 유지합니다. 전투 오프닝 징글은 첫 진입 연출과 동시에 시작하며, 징글 길이만큼 화면을 기다리지 않습니다. 최소2초는 전체 로딩 경계에만 적용됩니다.

모바일 터치 기본 동작 차단은 문서 capture 단계에서 동적 영상·안내 요소에도 적용합니다. 모든 body 하위 요소에 touch-action:none을 지정하고, visualViewport 이동/복귀 때 자기 문서의 스크롤을 복구합니다. 부모 페이지는 조작하지 않습니다. iOS가 확대 제한 meta를 무시하므로 비수동 touchend·gesture·dblclick 차단을 함께 사용합니다. 이미 확대된 배율을 강제로 1로 만드는 표준 API는 없으며, 실제 Safari/호스트의 동작은 실기기 확인이 필요합니다.

### 저장 검사와 자동 저장

명령 구조는 `core/command-contract.ts`에서 실행·저장이 공유하고, 모드는 `game/controller.ts`의 GAME_MODES에서 타입과 복원 검사가 함께 파생됩니다. 회복·보급 등 보조 무장 명령은 weaponSkill로 기록합니다. v2 연출은 MapEvent를 사용하며, controller의 clips에는 clipDuration이 정의된 이동·공격·격파만 들어갑니다. 현재 스냅샷과 콘텐츠·좌표·참조·손상 저장 검증은 유지합니다.

게임 흐름의 자동 저장은 CoreCampaign.autoSave를 사용합니다. 검증에 실패하면 기존 정상 슬롯을 유지하고 개발 콘솔에 원인을 남기며, 다음 명령/장면의 안전한 상태를 다시 저장합니다. 쓰는 동안의 요청은 최신 상태로 합칩니다. 사용자 저장은 save를 사용하며 실패하면 짧은 안내를 반환합니다. SAW 개발 검증은 `node tools/pack_sim.mjs --line super --type O --hidden joined --seed 1 --profile steady --audit-saves --out tools/out/save-audit`로 매 명령·이벤트·스토리 큐의 실제 저장/불러오기와 정규화된 전체 세션의 동일성을 검사합니다.

### 삽화 초점과 안전 영역

`game.art.focus`는 그림 id별 원본의 정규화된 얼굴 중심입니다: `"focus": {"cg-arrival": [0.72, 0.20]}`. 생략 시 `[0.5, 1/3]`입니다. 여러 인물이면 주 화자, 인물이 없으면 `[0.5, 0.5]`를 권합니다. 네 삽화 톤 모두 원본 전체를 자막과 분리된 안전 영역에 맞추고 최대 확대·이동을 그 영역 안으로 제한합니다. 원본 파일을 자르지 않습니다. 갤러리도 전체 그림을 맞춥니다. 영상 대체 그림은 기존 contain 배치를 사용합니다. `loadingScreens` 항목에도 `focus:[x,y]`를 둘 수 있으며 로딩 cover·줌을 얼굴 쪽에 고정합니다.

무기 자원 줄은 0이 아닌 명중 보정을 `명중+25`/`명중-10`으로 표시합니다. 능력 보기와 예측에도 같은 부호를 사용합니다. 무장 자체 보정을 생성할 때에는 공통 `battleRules.meleeHitBonus`와 중복되지 않도록 둘 중 한 방식만 사용합니다.

## 조건부 출격과 장면·표시 분기

`아군: helper = support 2,3 파일럿 pilot 조건 joined`는 캠페인 변수 `joined`가 true 또는1일 때만 출격합니다. 조건은 고정 배치와 저장 편성 승계에 함께 적용됩니다. 예전 저장에 기체가 남아 있어도 조건이 거짓이면 다음 출격에는 배치하지 않습니다. `requiresFlag: "joined"`가 컴파일된 StageUnit 필드이며 런타임 유닛의 수치가 아닙니다.

장면·줄 묶음은 기존 `[조건] joined != 1 -> absent_scene`와 `[이동] scene`으로 분기합니다. 작가는 조건 뒤의 합류판 원문을 그대로 보존하고 별도 장면에 미합류판을 둘 수 있습니다. 생성기는 이 방식으로 부분 생략·대체를 작성하며 별도 대사 문법은 추가하지 않습니다. `_`로 시작하는 내부 장면은 진열장 목록에서 숨겨집니다.

합체기 설정의 `requiresFlag`는 호감·참가자 조건에 추가로 검사합니다. 참가자가 없거나 다른 진영인 경우에도 사용할 수 없습니다. `game.story.affection`의 `{id,flag}`는 미합류 인물을 최고호감 후보에서 제외합니다.

로딩 항목의 `requiresFlag`도 같은 true/1 규칙을 씁니다. 알 수 없는 경로는 표시하지 않고, 다음 로딩 전에 미리 받은 그림도 조건을 다시 확인합니다. `game.visibility: [{flag:"joined",cast:["pilot"],units:["robot"],images:["ending-cg"],scenes:["pilot-ending"]}]`는 진열장에만 조건을 적용합니다. 원본 카탈로그·적 인물·이미 본 오프닝 몽타주를 삭제하지 않습니다. 게임의 현재 캠페인 변수를 읽고, 경로가 없는 부팅/진열장에서는 조건부 항목을 숨깁니다.


### 삽화 배치와 저장 호환

삽화는 원본 전체를 1280×720 논리 화면 중앙에 contain으로 배치합니다. 3% 확대의 최대 크기를 먼저 확보하여 연출 내내 원본이 잘리지 않으며, 남는 여백은 어두운 배경입니다. 이름판과 제목 띠는 그림 안 왼쪽 아래에 겹칩니다. 기존 CG `focus` 메타데이터는 로딩·미리보기의 cover 구도에도 계속 사용됩니다.

저장 스키마·팩 id가 같으면 콘텐츠 지문이 바뀌어도 유닛·파일럿·기체·스테이지 id로 캠페인 진행을 이관합니다. 없어진 부대/파츠 id는 제외하고, 개조 상한 초과·삭제 기체는 알려진 이전 비용표(없으면 현재 비용표)로 환불합니다. 전투 스냅샷은 같은 지문일 때만 재개하며, 다른 지문은 그 화 출격 직전 인터미션으로 돌아갑니다. 기존 `saveMigrations`는 큰 구조 변경의 원본 검사·환불 비용 계약으로 남습니다.

저장/불러오기 화면의 저장 코드는 모든 정상 슬롯과 현재 중단 지점을 LZW+CRC32 텍스트로 묶습니다. 가져오기는 기존 `restoreSave` 검사를 거치며, 다른 팩·손상 코드는 거부합니다. 클립보드가 차단되면 선택/붙여넣기 가능한 텍스트 상자가 나옵니다. 부팅 저장소 쓰기/읽기 시험이 실패하면 임시 메모리 저장과 코드 백업 안내로 전환합니다. 코드에는 인증·암호화가 없으므로 사용자가 별도로 보관해야 합니다. iOS 홈 화면 앱과 Safari/다른 출처 iframe의 저장소는 서로 공유된다고 가정하지 않습니다.
