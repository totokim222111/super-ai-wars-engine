# 팩의 그림과 소리

예제의 그림 id와 경로는 packs/example/game.json, 인물·기체 연결은 cast.json·units.json에 있다. 원본 파일 바이트를 바꾸지 않고 이름과 연결만 바꿔 재사용했다.

| 종류 | 기준 크기 | WebP 용량 기준 |
|---|---|---|
| 상반신 | 1024×1536 | 280KB |
| 기체 | 1024×1024 | 200KB |
| 초상 | 768×768 | 120KB |
| 배경·전투 배경 | 1600×900 | 350KB |
| 삽화 | 1600×900 | 400KB |
| 지형 바닥 | 512×512 | 150KB |

`units.json`의 `height`는 화면 표시 높이로, 등급표는 SS 280, S 305, M 335, L 420, LL 540이다. 규칙 수치에는 영향을 주지 않는다.

units.anchors에는 muzzle/core/head/hand/foot를 0~1 좌표로 적는다. moodSheet는 art·rect·cols·rows·order로 선언하며, moods의 전체 그림이 우선한다. 없는 표정은 기본으로 표시하고 검사에서 경고한다. 예제는 같은 중립 그림을 표정 별칭으로 재사용한다.

`art_ingest.py`는 범용 검사·표정 정렬·WebP·등록 도구다. PACK_DIR 또는 --pack-dir에 해당하는 환경 설정으로 팩을 선택하며, 원본 wave manifest를 읽는다. --register 전에는 팩 설정을 바꾸지 않는다. `art_info.mjs`는 픽셀 메타데이터만, `story_outlines.mjs`는 대사 원문을 건드리지 않고 줄 번호·규칙 색인만 만든다.

음원은 audio/pack.json의 sfx/bgm에 file·title·author·license·source와 필요하면 loopStart/loopEnd·gain을 적는다. 소리를 새로 넣을 때 LICENSES.md도 같이 갱신한다. 엔진 예제는 CC0 두 곡과 CC0 효과음만 포함한다. 글꼴은 시스템 글꼴을 사용한다.
