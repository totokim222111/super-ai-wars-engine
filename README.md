# 슈퍼 AI 대전 엔진

대본과 유닛 수치만 바꾸면 나만의 브라우저 SRPG를 만들 수 있는 엔진입니다. 코드를 몰라도 텍스트 파일 몇 개로 대화, 전투, 분기, 엔딩까지 이어지는 게임 한 편을 만들 수 있습니다.

이 엔진으로 만든 15화짜리 게임 [슈퍼 AI 대전](https://github.com/totokim222111/super-ai-wars)도 함께 공개되어 있습니다.

## 바로 실행해 보기

아래 요청문을 AI 도우미에게 그대로 붙여넣어 주세요. 컴퓨터에서 작업할 수 있는 도우미라면 설치부터 실행까지 부탁하면 됩니다. 채팅만 가능한 도우미에게는 명령을 하나씩 안내받을 수 있습니다.

```text
내 컴퓨터에 슈퍼 AI 대전 엔진을 설치하고, 포함된 2화 예제 팩 「작은 산책」을 실행해줘.
직접 명령을 실행할 수 있으면 진행해주고, 채팅만 가능하면 내 운영체제를 물어본 뒤 내가 따라 할 명령을 차례로 알려줘.

1. 기존 파일을 덮어쓰지 않는 새 작업 폴더를 정해줘. Git, Node.js 24 이상, Python 3.11 이상을 확인하고, 없는 것은 설치를 도와줘. Python 그림 검사에 필요한 Pillow와 NumPy도 확인해줘.
2. https://github.com/totokim222111/super-ai-wars-engine 저장소를 받아줘.
3. 엔진 폴더에서 npm ci, npm run pack:check, npm run build를 차례로 실행해줘. 오류가 나면 실제 로그를 읽고 원인을 해결해줘.
4. npm run dev로 서버를 켜고, 출력된 주소의 /game.html을 열어줘. 서버가 켜져 있는지 확인하고 접속 주소와 종료 방법을 알려줘. /v2.html은 그림과 장면을 둘러보는 진열장이야.
```

<details>
<summary>직접 설치하려면</summary>

```bash
git clone https://github.com/totokim222111/super-ai-wars-engine.git
cd super-ai-wars-engine
npm ci
npm run dev
```

브라우저에서 `http://127.0.0.1:5173/game.html`을 열면 예제 팩 「작은 산책」(2화)이 실행됩니다. `v2.html`은 그림·대본·장면을 둘러보는 진열장입니다.

필요한 것: Node.js 24 이상. 테스트와 그림 검사에는 Python 3.11 이상과 Pillow·NumPy가 쓰입니다.

</details>

## 할 수 있는 것

- **대화 연출**: 배경, 좌우 입장, 표정 10종, 흔들림·번쩍임, 등장 삽화(강림·개그·섬뜩·감성 연출), 선택지
- **맵 전투**: 이동·공격·반격·방어·회피, 지형, 전투 예상 창, 적 AI, 증원, 승리·패배 조건
- **전투 연출**: 기체 한 대씩 서는 무대, 무기별 연출 템플릿, 컷인
- **이야기 분기**: 변수, 호감도, 호감도 1위 판정, 플레이어 이름 치환, 화별 진행과 엔딩 선택
- **기믹**: 배리어, 합체기, 폼 체인지, 가챠 타일, 3세력 교전, 무기 복사, 가속 지형, 전투 횟수 조건, 통행 토글
- **성장과 저장**: 상점·훈련·개조, 저장 슬롯(팩마다 따로, 플레이어 브라우저에만 저장)
- **터치 우선 UI**: 탭으로 고르고 버튼으로 결정, 가로 화면 안내, 마우스·키보드도 지원

## 내 게임 만들기

1. `packs/example/` 폴더를 통째로 복사합니다. 예: `../my-game/pack/`
2. `game.json`의 `id`와 제목을 바꿉니다. 저장 공간이 이 `id`로 나뉩니다.
3. 등장인물(`cast.json`), 주인공 타입(`players.json`), 유닛 수치(`data/`), 대본(`story/*.story`)을 고칩니다. 그림과 소리도 팩 폴더 안에 둡니다.
4. 엔진에 팩 위치를 알려 주고 검사·실행합니다.

```bash
PACK_DIR=../my-game/pack npm run pack:check
PACK_DIR=../my-game/pack npm run dev
PACK_DIR=../my-game/pack npm run build
```

PowerShell에서는 `$env:PACK_DIR='../my-game/pack'`로 먼저 지정합니다. 빌드 결과는 `dist/`에 생기고, 그대로 정적 호스팅에 올리면 됩니다.

### 대본은 이렇게 생겼습니다

```text
@ 규칙
아군: hero = scout 1,2 파일럿 hero / loop = helper 1,3 파일럿 loop
적: target = dummy 5,2 파일럿 dummy 대기
승리: 적 전멸
배리어 target 25

@ 도입
[배경] bg-hangar
[등장] 모험가 오른쪽
루프: 문 앞까지만 같이 갈래요?
[선택]
- 나란히 걸어요 { 호감 loop +1 } -> 출발
- 먼저 길을 봐 주세요 -> 출발
```

전체 문법은 [팩 만들기](docs/v2-content-pack.md)에 있습니다. 예제 팩의 대본에도 짧은 주석을 달아 두었습니다.

## 검사와 자동 플레이

| 명령 | 하는 일 |
|---|---|
| `npm run pack:check` | 팩의 데이터·대본·그림을 검사하고 고칠 곳을 알려 줍니다 |
| `npm run sim -- --batch` | 실제 규칙과 대본으로 끝까지 자동 플레이해 깰 수 있는지 봅니다 |
| `npm test` | 엔진 테스트 전체 |
| `npm run build` | 배포용 빌드 |

## 더 읽을거리

[팩 만들기](docs/v2-content-pack.md) · [그림·소리 규격](docs/assets.md) · [배포](docs/deploy.md) · [실기기 확인](docs/device-test.md)

## PLEASE

PLEASE는 "제발 한 번 봐주세요" 하는 장난입니다. 관심 가져주시는 것만으로도 감사합니다.

제가 만든 부분은 마음껏 쓰고, 고치고, 나누고, 판매하셔도 됩니다. 출처 표시도 의무는 아닙니다. 자세한 내용은 [LICENSE](LICENSE)에 적었습니다.

예제 팩에 쓰인 다른 분들의 음악·효과음은 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)의 조건을 따라 주세요.

[엔진](https://github.com/totokim222111/super-ai-wars-engine) · [슈퍼 AI 대전](https://github.com/totokim222111/super-ai-wars) · [참고 자료](https://github.com/totokim222111/super-ai-wars-assets)

## English summary

A browser SRPG engine where you make a game by editing text: story scripts, unit stats, and art in a self-contained pack. It covers visual-novel style dialogue, grid battles with forecasts and enemy AI, branching with affection, nine built-in gimmicks, shops and saves, and a touch-first UI. Start by copying the setup request above to an AI helper, or use the expandable manual instructions. The bundled two-episode example runs at `game.html`; copy `packs/example` and set `PACK_DIR` to make your own game. A full 15-episode game made with this engine is [Super AI Wars](https://github.com/totokim222111/super-ai-wars). PLEASE is a playful name: your interest alone means a lot. Our own work is free to use, change, share, and sell without conditions; third-party recordings keep their own terms.


엔진 저장소만으로 예제 팩을 실행할 수 있습니다. 슈퍼 AI 대전의 전체 게임은 샘플 저장소 README의 설치 절차를 따르세요. 원고·작업실 기록은 포함하지 않습니다.
