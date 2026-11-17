# 무장 연출 조합

무장 sidecar의 `anim`으로 동작·소품·재질·마무리를 조합합니다. 전투 수치와 난수에는 영향을 주지 않습니다. 기존 12개 template도 계속 사용할 수 있습니다.

```json
{"anim":{"template":"sequence","moves":[{"move":"cannon","prop":"token"},{"move":"stamp","prop":"star","words":["쾅"]}],"element":"light","closer":"none","tier":1,"color":"#7fe9f7"}}
```

첫 동작의 launch → 공통 진영 컷 → 모든 impact → closer → 공통 피해/격파 순서입니다. 사격 다음 접촉에는 0.20초의 진입을 넣습니다. 영상/파일럿 컷인/합체 참가자 대사는 기존 위치에서 먼저 재생합니다. `cutin:true`와 `video`는 anim 밖의 기존 필드입니다.

- `moves`: 1~3개. 항목은 `move`, `prop?`, `hits?`, `count?`, `words?`만 받습니다.
- `hits`: 정수1~12, `count`: 정수1~40. 실제 화면에서는 좁은 canvas/느린 프레임에 밀도를 줄이며 타임라인과 공격 결과는 유지합니다.
- `words`: 1~4글자 문자열 최대3개. 무장 이름에서 따온 말/의성어를 사용합니다.
- `element`, `closer`, `tier(1~3)`, `color(#RRGGBB)`를 지정합니다. tier는 타수·크기·흔들림만 조금 키우며 길이/전투 수치를 바꾸지 않습니다.
- 길이 검사는 **연출 부품만**을 셉니다. 일반(closer=none)4초, 마무리 포함8초 이하. 표의 단일 동작 길이는 기본 launch32%+impact68%이며(launch 최소0.3초, stamp/lob 잔상 시간 포함), 두 번째부터는 impact만 재생하므로 단순 합보다 짧습니다. 여기에 진입0.2초와 마무리를 더합니다. 공통 선언 대사·MP4·화면 컷·피해/격파는 이 예산과 별도입니다.
- 모든 변환은 동작 한 태스크가 소유합니다. 취소 시 generator finally가 노드·기체·카메라를 복원합니다. 회피 대상은 붙들거나 올려치지 않고 소품만 비껴가며, 방어는 방패 앞에서 멈춥니다.
- 소품은 코드 그림104개이며 크기/강조색별 offscreen canvas LRU128개(최대1024px, 총 캐시8M픽셀)로 캐시합니다. 군집은 느린 장치에서도 최소20개이고 소품 크기는 줄이지 않습니다. 한 동작의 살아 있는 효과 노드는1개, 마무리도1개입니다. 입자는 한 노드에서 묶어 그립니다. CPU가 느린 프레임에서는 장식 밀도만 줄입니다.
- 합성 효과음 `whip`, `ice-break`, `electric`, `splash`, `popup`, `stamp`를 추가했습니다. 팩 파일이 있으면 같은 id로 덮어쓸 수 있습니다. 타격음과 시각 contact는 같은 update에서 발생합니다.

## 동작 목록
길이는 1배속 기준 발사+명중의 기본값이다. `prop`을 받는 동작은 날아가거나 들고 치는 것이 그 소품으로 바뀐다.

### 접촉 동작 (공격자가 상대 화면으로 들어온다)
| id | 보이는 것 | 길이 | prop | 어울리는 이름 |
|---|---|---|---|---|
| `jab-rush` | 잔상 돌진 후 좌우 연타. 타격 자리마다 소품 자국 | 1.6 | 자국 | 너클, 펀치, 철권, 연타, 격투 |
| `uppercut` | 웅크렸다 올려치기, 상대가 뜬다 | 0.9 | 자국 | 어퍼, 띄우기(연결용) |
| `slam-down` | 위에서 내리꽂고 지면 충격파 | 0.9 | 자국 | 스매시, 내려찍기(연결용) |
| `hammer-smash` | 뛰어올라 거대한 소품을 머리 위에서 내려찍음, 바닥 균열 | 1.8 | 든 것 | 해머, 스매시, 엔터 키, 강제 종료 |
| `ram` | 모았다가 몸통 돌진 관통 | 2.2 | 앞에 든 방패 | 돌격, 태클, 부스터, 들이받기, 방패치기 |
| `headbutt` | 짧게 2~3번 들이받음, 별이 튄다 | 1.3 | — | 박치기, 밀착 |
| `slash` | 각도를 바꿔 가며 베기 연타 | 1.6 | 칼날 색 | 소드, 세이버, 슬래시, 검술, 참격 |
| `iai` | 암전 속 일섬, 잠깐 정적 뒤 늦게 터짐 | 1.4 | — | 일섬, 저지먼트, 블레이드 마무리 |
| `thrust` | 직선 찌르기 다단 | 1.3 | 찌르는 것 | 레이피어, 비녀 찌르기, 독침, 단검 |
| `whip` | 곡선 채찍을 휘둘러 후려치고 감는다 | 1.6 | 채찍 끝 | 채찍, 휩, 케이블 |
| `spin` | 회전하며 다단 히트 | 1.5 | 도는 것 | 스핀, 드럼, 회전, 브레이커 |
| `stamp` | 소품을 상대 위에 쾅 찍고 자국·글자를 남김 | 1.2 | 찍는 것 | 찍기, 도장, 부착, 노트, 박제 |
| `cling` | 들러붙어 빨아들이거나 물들임 | 1.6 | 붙는 것 | 엉겨붙기, 들러붙기, 발목 잡기, 흡수, 오염 |
| `sweep` | 낮게 쓸어 넘김 | 1.2 | 쓰는 것 | 빗자루, 쓸기, 휩쓸기 |

### 사격·투척 동작 (공격자는 자기 화면에 남는다)
| id | 보이는 것 | 길이 | prop | 어울리는 이름 |
|---|---|---|---|---|
| `vulcan` | 여러 줄 연사 | 2.4 | 탄 | 발칸, 개틀링, 연사, 난사, 복붙 |
| `cannon` | 조준 후 큰 한 발 | 2.2 | 탄 | 캐논, 직사포, 라이플, 저격, 로켓 펀치류 |
| `beam` | 모았다가 굵은 수평 빔 | 2.8 | — | 빔, 광선, 레이저 |
| `sweep-beam` | 빔을 위아래로 훑음 | 2.6 | — | 훑는 광선, 교정 빔, 빨간 줄 |
| `sky-beam` | 하늘에서 내리꽂는 광선 기둥 | 2.4 | — | 심판, 위성, 노바, 강림 |
| `missiles` | 곡선 미사일 여러 발 | 2.8 | 탄두 | 미사일, 사출, 추격포 |
| `mortar` | 위로 쏘아 올려 그림자 뒤 낙하 | 3.2 | 탄 | 장거리포, 포격, 축포, 융단폭격 |
| `scatter` | 부채꼴 산탄이 한 번에 | 1.8 | 탄 | 파편탄, 산탄, 살포, 난반사 |
| `bits` | 비트가 둘러싸고 차례로 쏨 | 3.0 | 비트 | 판넬, 비트, 서브에이전트, 드론 |
| `lob` | 소품을 포물선으로 던짐, 착탄 자리에 재질이 번짐 | 2.0 | 던지는 것 | 투척, 네이팜, 앵커, 폭탄 |
| `stream` | 원뿔 모양으로 계속 뿜음 | 2.4 | 섞여 나오는 것 | 분사, 스프레이, 브레스, 물대포, 한숨 |
| `swarm` | 작은 소품 수십 개가 떼로 몰려가 뒤덮음 | 2.4 | 떼 | 하트, 알림, 댓글, 쿠키, 연쇄, 테러 |
| `popup-storm` | 창이 상대 위에 겹겹이 뜨다 한꺼번에 터짐 | 2.4 | 창 종류 | 약관창, 알림, 추천, 광고, 자동재생 |
| `drop` | 거대한 소품 하나가 하늘에서 떨어짐 | 2.0 | 떨어지는 것 | 낙하, 사전, 택배, 중압감, 감옥 |
| `text-drop` | 큰 글자가 한 자씩 떨어짐 | 2.6 | — | 반려, 거절, 결론, 명령 |
| `wave` | 공격자에서 퍼지는 동심원 파동 | 2.0 | 파동에 실린 것 | 소닉 웨이브, 파동, 위압, 최면, 전파, 메아리 |
| `storm` | 화면 가득 소용돌이·눈보라·모래바람 | 2.6 | 날리는 것 | 스톰, 회오리, 눈보라, 돌풍, 폭풍 |
| `bind` | 사슬·그물·창살이 사방에서 조임 | 2.0 | 묶는 것 | 사슬, 그물, 감옥, 규제, 묶기 |
| `mirage` | 분신 여러 개가 나타나 동시에 침 | 2.2 | — | 미라주, 분신, 할루시네이션, 거울 |
| `summon` | 큰 실루엣이 나타나 덮치고 지나감 | 2.4 | 소환되는 것 | 고래, 용, 리바이어던, 모비딕 |
| `serpent` | 긴 몸통이 굽이치며 화면을 가로질러 물어뜯음 | 2.4 | 머리 | 용진, 웜, 스크롤, 타임라인 |

### 마무리 (closer, 필살기와 강한 무장만)
| id | 보이는 것 | 길이 |
|---|---|---|
| `none` | 없음 | 0 |
| `nova` | 흰 섬광 뒤 대폭발, 긴 정지 | 1.2 |
| `blackout` | 화면이 꺼지듯 암전, 한 줄 빛, 늦은 폭발 | 1.4 |
| `terminal` | 터미널 글자가 타이핑되고 화면이 줄 단위로 지워짐 | 1.6 |
| `rainbow` | RGB 띠가 화면을 가르고 잔상이 남음 | 1.2 |
| `verdict` | 큰 글자 한 줄이 찍히고 균열 | 1.2 |
| `confetti` | 재질 조각이 쏟아져 내림(하트, 동전, 종이) | 1.0 |

## 기본 소품87개
스티커풍 벡터: 2~3색 평면, 진한 외곽선, 작은 하이라이트. 기본 96px, 강조색을 바꿀 수 있다.

- **장비·무기**: `fist` `keycap` `enter-key` `hammer` `wrench` `chip` `cooler-fan` `radiator` `plug` `cable` `battery` `server` `drill` `saw` `gear` `anchor` `shield` `sword` `dagger` `rapier` `lance` `hairpin` `folding-fan` `broom` `shuriken` `missile` `bomb` `satellite` `bike-wheel` `drum`
- **화면·웹**: `window` `error-window` `terms-window` `cursor` `magnifier` `bell` `badge-number` `heart` `thumb` `star` `speech` `mail` `link` `cookie` `check-badge` `coin` `paper` `scroll` `book` `stamp` `gavel` `play-button` `spinner` `token` `pixel` `hashtag` `note-tag` `red-underline`
- **자연·음식·생물**: `flame` `droplet` `snowflake` `icicle` `bolt` `swirl` `whale` `llama` `cat-paw` `teddy` `cake` `thermos` `shrimp` `turkey-leg` `banana` `parcel` `smile-mask` `eye` `tentacle` `crown` `crescent` `dragon-head` `worm-head` `net` `chain` `cage` `patch` `spray-can` `needle`

목록에 없는 소품이 꼭 필요하면 배정표의 `newProps`에 id와 한 줄 설명을 적는다(전체 합쳐 20개 이내).

## 재질 목록
타격 폭발, 남는 조각, 번쩍임 색, 꼬리가 달라진다.

`fire` 불꽃·그을음 / `ice` 결정 파편·서리 고리 / `volt` 지그재그 방전 / `water` 물보라 / `wind` 나선 바람줄 / `light` 십자 섬광·빛 조각 / `dark` 보라 얼룩·그림자 / `data` 글리치 띠·픽셀 조각 / `paper` 종이 조각 / `sugar` 하트·별 반짝이 / `gold` 동전 / `rgb` 무지개 띠 / `sand` 모래 / `impact` 기본 주황 불티


## 추가 소품17개

| id | 보이는 것 |
|---|---|
| `picture` | 액자에 든 사진 한 장(산과 해 그림). 이미지 생성 무장용 |
| `music-note` | 8분음표 두 개가 묶인 음표. 하모니·심포니·솔로·비바체용 |
| `feather` | 빛나는 날개 깃털 한 장. 트라이-윙 날개 사격용 |
| `bao` | 주름 잡힌 하얀 찐빵(바오). 바오 비트용 |
| `fork` | 식사용 포크. 어비스 오브 포크의 '포크' 말장난 |
| `six-hand` | 손가락이 여섯 개인 손바닥. AI 그림 손가락 오류 개그 |
| `galleon` | 돛을 단 꿈속 범선 실루엣. 드림 갤리온 소환용 |
| `crab` | 간장게장 꽃게. 진갈색 등딱지에 간장 광택, 집게 둘 |
| `fish-hook` | 낚싯바늘과 짧은 낚싯줄. 미끼처럼 빨간 찌가 달림 |
| `thumbnail` | 낚시 썸네일 카드. 빨간 동그라미와 빨간 화살표가 그려진 16:9 화면 |
| `sandbag` | 발목 모래주머니. 끈 두 줄, 겉에 줄글 약관이 빽빽이 인쇄됨 |
| `glasses` | 스마트 안경. 렌즈 두 알에 작은 카메라 점이 달린 안경 |
| `claw` | 인형뽑기식 세 갈래 집게. 위에서 내려와 집어 감 |
| `vacuum` | 청소기 흡입구. 주름관 끝에 넓적한 노즐 |
| `chest` | 이빨과 혀가 달린 보물상자(미믹). 뚜껑이 입처럼 열림 |
| `cube` | 모서리가 또렷한 정육면체. 면마다 격자 무늬 |
| `blanket` | 둘둘 말린 솜이불. 덮치면 늪처럼 축 처짐 |

예제 팩의 pulse·blade·pebble·trio-beam은 단발 포·접촉 연계·투척·3동작 마무리 견본입니다.

## 접촉·재질과 공용 배치

`moves/layout.ts`가 W/H·GROUND·실제 기체 높이/폭·canvas의 CSS 배율을 읽습니다. 지면/기체 크기를 변경할 때 동작별 수치를 다시 고칠 필요가 없습니다. 날아가는 소품은 PC28/모바일22 CSS px, 재질 조각은 PC24/모바일18 CSS px 이상입니다. 밀도 축소는 개수만 줄입니다.

명중은 동작별 접촉 실루엣 → 외곽선이 있는 재질 폭발/지면 흔적 → 대상 반응입니다. 보통4프레임·큰 물건6프레임 동안 동작 포즈와 소품을 멈추며 같은 update에서 타격음을 냅니다. 회피 대상은 붙들거나 띄우지 않습니다. 방어는 육각 방벽과 튕김/끊어짐, 작은 밀림을 사용합니다.

전체 화면 번쩍임은 `fx.flash(show, strength, seconds)`로만 호출합니다. 세기는0~1, 최대3렌더 프레임·1초당최대3회입니다. 강도0은 생략하며 다음 설정 화면의 번쩍임 옵션을 이 인자에 연결할 수 있습니다. 새 합성음 `ground-thud`·`shield-clang`은 음원 파일이 필요 없습니다.

## 소품 기본색 표

무장 색은 꼬리·빛·접촉·글자에 사용합니다. 소품 채움은 아래의 사물 기본색이며, flame/droplet/snowflake/icicle/bolt/swirl은 재질 색을 우선합니다. 스티커 외곽선과 밝은 rim은 유지합니다.

| id | 기본색 |
| --- | --- |
| fist | `#e9b28b` |
| keycap | `#79b9e8` |
| enter-key | `#b3a6eb` |
| hammer | `#a5b0bc` |
| wrench | `#9daeb8` |
| chip | `#56ac80` |
| cooler-fan | `#596d85` |
| radiator | `#a8bbc9` |
| plug | `#4b5264` |
| cable | `#646e81` |
| battery | `#64b77b` |
| server | `#54637d` |
| drill | `#bcc3cd` |
| saw | `#abb3be` |
| gear | `#9dabb7` |
| anchor | `#8ca0af` |
| shield | `#769fca` |
| sword | `#b9d4e1` |
| dagger | `#a4b4c6` |
| rapier | `#e3d9b6` |
| lance | `#a3c3d0` |
| hairpin | `#eea0c9` |
| folding-fan | `#e2a2b4` |
| broom | `#cba363` |
| shuriken | `#9cabbc` |
| missile | `#d66b53` |
| bomb | `#2a3550` |
| satellite | `#709ad0` |
| bike-wheel | `#4d576d` |
| drum | `#c26f57` |
| window | `#77adcf` |
| error-window | `#e98379` |
| terms-window | `#8dace2` |
| cursor | `#f0eee0` |
| magnifier | `#81bfd2` |
| bell | `#f2c85e` |
| badge-number | `#e16b6e` |
| heart | `#f482ae` |
| thumb | `#eac5a2` |
| star | `#f2cf58` |
| speech | `#ece9de` |
| mail | `#88b7d8` |
| link | `#90b8c5` |
| cookie | `#cda069` |
| check-badge | `#59b98a` |
| coin | `#e9b840` |
| paper | `#f1e5c9` |
| scroll | `#d7bc86` |
| book | `#a6775a` |
| stamp | `#c95b62` |
| gavel | `#a6774a` |
| play-button | `#e76664` |
| spinner | `#6ac2cf` |
| token | `#a68fea` |
| pixel | `#7ac9b5` |
| hashtag | `#839baf` |
| note-tag | `#efca74` |
| red-underline | `#df505a` |
| flame | `#f68a3e` |
| droplet | `#54bfe5` |
| snowflake | `#b0e9f1` |
| icicle | `#93cfe5` |
| bolt | `#f2d75d` |
| swirl | `#95d2bd` |
| whale | `#598eae` |
| llama | `#d4b28c` |
| cat-paw | `#e1acb7` |
| teddy | `#c29771` |
| cake | `#e4b49d` |
| thermos | `#a4b7ae` |
| shrimp | `#ef9874` |
| turkey-leg | `#ae683e` |
| banana | `#f2d04f` |
| parcel | `#c69a68` |
| smile-mask | `#e9d9a8` |
| eye | `#b99ccf` |
| tentacle | `#a383bb` |
| crown | `#e9c05b` |
| crescent | `#eed285` |
| dragon-head | `#60ae8a` |
| worm-head | `#b894bd` |
| net | `#b2b9af` |
| chain | `#9fa9b5` |
| cage | `#8498a5` |
| patch | `#cfd5ce` |
| spray-can | `#83b5b0` |
| needle | `#c0c9cd` |
| picture | `#acb68c` |
| music-note | `#9e8dc5` |
| feather | `#d3ded7` |
| bao | `#eee0bd` |
| fork | `#adb9c0` |
| six-hand | `#e7b99a` |
| galleon | `#b48658` |
| crab | `#78503a` |
| fish-hook | `#9caeb4` |
| thumbnail | `#df7970` |
| sandbag | `#c2a071` |
| glasses | `#789fae` |
| claw | `#a7b7b9` |
| vacuum | `#86a7a8` |
| chest | `#b57b55` |
| cube | `#7da6bd` |
| blanket | `#b69ba9` |

## 소품·효과 그림 덮어쓰기

코드 그림은 기본값입니다. `game.animationArt`에 팩 안 JSON 경로(또는 아래 객체)를 지정하면 같은 id의 그림만 덮어씁니다. `props`는104개 소품 id, `elements`는14개 재질의 `burst`/`mark`/`chip`/`trail`, `common`은 아래9개 id를 받습니다. 생략·로딩 중·읽기 실패 항목은 코드로 그리고 전투를 기다리지 않습니다. 예제 팩에는 이 목록과 그림 파일을 넣을 필요가 없습니다.

```json
{"animationArt":"art/animation/atlas.json"}
```

```json
{"version":1,"pages":{"animation-page":{"width":2048,"height":2048}},
 "props":{"hammer":{"art":"animation-page","rect":[3,3,785,1024],"sourceSize":[785,1024],"anchor":[0.5,0.5],"grip":[0.5,0.93],"facing":"up"}},
 "elements":{"fire":{"burst":{"art":"animation-page","rect":[800,3,1000,1000],"anchor":[0.5,0.5]}}},
 "common":{"guard-barrier":{"art":"barrier-picture","anchor":[0.5,0.5]}}}
```

`art`는 `game.art.files`에 등록한 그림 id입니다. `rect`가 없으면 그림 전체를 씁니다. `sourceSize`는 묶기 전 원본 크기이며 생략하면 rect/그림 크기를 씁니다. anchor·grip은 원본의0~1 비율입니다. 손에 쥔 것은 grip, 그 외에는 anchor를 회전축으로 씁니다. facing은none/up/down/left/right이고, 발사 소품은 진행 방향으로 정렬합니다. 기체 진영이 반대면 좌우를 뒤집습니다.

원본 최대 변의1.25배를 넘는 요청은 눌림/늘어남도 포함하여 제한합니다. `AnimationArt.scaleRequests`에서 요청/허용 크기와 다시 그릴 대상을 수집할 수 있습니다. 원본 그림을 수정하거나 무장 안무를 바꾸지 않습니다. 캐시는 32~1536px 크기 단계별로 원본 atlas rect보다 작게 축소하고 팩 라이브러리마다192개/8M픽셀을 한도로 오래된 항목을 비웁니다. 원본 비율·투명 가장자리를 유지합니다. burst만 덮어써도 빠진 chip은 코드 조각으로 그립니다.

일반 명중의 burst는 대상 키의0.85배까지, 접촉한 쪽 몸통 가장자리에만 나타납니다. 2~3프레임 최대 크기 뒤 줄면서 사라지며 대상 뒤쪽40%는 덮지 않습니다. 마무리만1.2배까지 허용합니다. chip은 회전하며 퍼지고 mark는 공용 지면에 남다가 동작 종료 전에 사라집니다. 같은 재질의 코드 폭발은 동시에 겹쳐 그리지 않습니다. common id는guard-barrier-side/guard-barrier/dust-cloud/ground-crack/shock-ring/smoke-puff/hit-star/speed-streak/muzzle-flash입니다.

아틀라스 페이지는 해당 스테이지의 사전 로딩/HTTP·Cache API 목록에 포함됩니다. 준비 경계에서 읽고 디코딩하며, 이 선택적 그림이 실패해도 진행을 막지 않습니다. 전투 진입의 누락 그림은 백그라운드로만 받습니다. 기존 부팅·스토리 끝·스테이지 끝 로딩 화면 규칙은 그대로입니다. `Exchange.animationArt`는 표시 전용이며 저장/규칙 데이터에는 들어가지 않습니다.

방향 none은 자연광 방향을 보존해 좌우를 뒤집지 않습니다. 방향 있는 소품/꼬리는 facing에 따라 공격 방향으로 정렬합니다. guard-barrier-side는 오른쪽을 막는 원본을 기준으로 방어 방향에 맞춰 뒤집습니다.


### 접지·배속·빛과 기준점

`battle/scene.ts`의 `GROUND=564`, `MAX_BATTLE_HEIGHT=440`을 표시 기준으로 씁니다. 안무는 `moves/layout.ts`의 실제 기체 크기·지면·안전 영역을 읽습니다. 커진 보스도 HUD 아래에 머물며, 소품·흔적·그림자가 같은 지면을 따릅니다. 무장 이름은 HUD 바로 아래, 대사는 지면 아래에 둡니다.

전체 화면 흰 번쩍임은 `fx.flash` 한 곳을 사용합니다. UI z40으로 HUD/대사(z50) 아래이며 최대3프레임,1초3회,알파0.55입니다. 사용자 설정 `flash`는0~10(기본7,시스템 모션 줄이기는3)입니다.0은 번쩍임을 만들지 않습니다.

전투의 ×1/×2/×3 버튼은 `MenuSettings.speed`를 즉시 저장합니다. 빈 곳 탭은 배속을 바꾸지 않습니다. 적 턴 `빨리`/Ctrl은 누르는 동안만×3이며 저장한 배속을 바꾸지 않습니다. `enemyBattle`은 `full`(기본)/`brief`로 적 턴의 연출 형식을 따로 고릅니다. 지도 이동도 같은 배속을 따릅니다.

성공적으로 보여 준 합체기 영상 뒤에는 `launch`를 반복하지 않고 `impact`·마무리로 이어집니다. 진행 표식은 발사 완료로 기록하므로 중간 건너뛰기도 같은 발사를 지도에서 반복하지 않습니다. 전투 직후 정산은 `Exchange.settlement`의 exp/credits/levels를 표시하며 보상을 다시 지급하지 않습니다.

`cast.cutinEye: [x,y]`는 원본 공격 표정 그림의 눈 중심(0~1)입니다. `python -I tools/cutin_check.py --pack <팩> --check`로190px 컷인 띠의45%에서 ±8% 이내인지 검사합니다. `--apply`는 명시된 눈 기준점으로 crop의 y만 고치며 원본 그림을 바꾸지 않습니다.

공용 선언 대사는 같은 파일럿에게 연속 반복하지 않으며, 무장 전용 대사가 우선입니다. `battleLines.*[].when.kinds`에 `melee`/`ranged`/`map`을 지정할 수 있습니다. 선언에만 종류 제한을 적용하며, 무장 전용 줄이 없는 근접 공격에는 광선·미사일 계열 공용 문장을 고르지 않습니다. 대사 원문은 고치지 않습니다. `battleLineAudit(lookup)`의 표시 기록을 JSON으로 저장해 `node tools/battle_lines_check.mjs <기록.json>`으로 한 화/파일럿/문장3회 초과를 경고로 확인합니다. 이 도구는 전투를 실행하지 않습니다.
# 화면 크기와 연출 안전 영역

전투의 건너뛰기 바로 아래에는 현재 속도를 보여 주는 순환 버튼 하나가 있습니다. 누를 때마다 ×1 → ×2 → ×3이며 팩별 설정에 저장합니다. 화면 전체 번쩍임은 설정의 0~10 세기를 따르고 HUD 아래에서만 그립니다. 모션 감소가 켜진 첫 실행은 낮은 세기를 기본으로 사용합니다.

숫자·회피·방어·소리 글자와 무장 이름은 `battle/safe-area.ts`의 HUD 및 중앙 조작 영역을 피합니다. 회전하거나 커지는 글자는 변환된 경계 상자로 검사합니다. 눈매 컷인은 중앙 조작 영역 아래에서 시작하며 눈 중심은 띠 높이의 45%를 유지합니다.

소품 그림은 팩의 `animationArt`로 덮어쓰고, 그림이 없는 팩은 코드 그림을 그대로 사용합니다. 소품·재질·마무리 조합과 승인된 무장 배정은 UI 크기와 무관합니다. 이 팩의 아틀라스 생성 원본 우선순위는 `cut` → `redraw` → `redraw-2`입니다. 공통 그림에 `dragon-segment`, `dragon-tail`, `rainbow-beam`, `storm-ring`, `nova-ring`, `grease-drop`, `contact-slash`를 추가할 수 있습니다. 그림 캐시·해상도 제한과 누락 시 코드 대체 규칙은 동일합니다.

작은 소품의 축소 타일은 부팅·구간 전환 로딩 중 준비합니다. 더 큰 준비 타일이 있으면 작은 입자에 재사용하여 군집의 첫 타격에서 축소 캔버스를 연속 생성하지 않습니다. 이미지 디코딩과 초기 래스터 업로드도 해당 구간 준비에 포함합니다. 아틀라스는 페이지 수 상한 대신 2048×2048과 파일당 25MiB를 검사합니다.
