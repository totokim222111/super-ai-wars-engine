# v2 빌드 산출물

엔진 폴더에서 실행한다. 바깥 팩은 먼저 `PACK_DIR`을 지정한다.

```powershell
npm test
npm run build
node tools/split_browser.mjs --preview --tag release
npm run preview
```

`prebuild`는 선택된 팩의 아트 메타데이터·대본 색인을 만든다. 타입 검사 후 Vite가 `game.html`·`v2.html`을 빌드한다. 대사 원문은 파일별 JSON으로 지연 로드하고 규칙·설정·배포 색인은 분류별 JSON으로 묶는다. 팩 목록·기본 팩은 가상 모듈에 기록한다. `DEFAULT_PACK`으로 기본값을 지정할 수 있다.

배포 선별은 `game.art.files`와 `audio.pack`의 sfx·bgm 목록·음원 고지를 사용한다. 상대 미디어는 팩 폴더 기준이며 `/packs/<id>/...`로 배포한다. 기존 `/...` 경로는 `public/` 기준이다. `dist/pack-manifest.json`에 미디어 목록을 기록한다. `artifact_files.py`는 매니페스트와 HTML/JS/CSS 참조를 따라 선별하며 LICENSE·THIRD_PARTY_NOTICES도 포함한다. 검사용 사본은 `tools/out/release-cleanup/artifact/`다.

검증된 `dist/`가 배포 대상이다. 게임 진입점은 `game.html`이므로 호스트의 링크·기본 문서 설정도 이에 맞춘다. `base: './'`를 사용하며 HTTP로 제공한다. v1 index·PWA·서비스 워커는 제거했다. 옛 오프라인·업데이트 검수 결과는 현재 빌드의 보증이 아니다.

저장은 주소(origin)와 팩 id에 귀속된다. 같은 주소의 다른 팩은 DB·설정·슬롯·내보내기를 공유하지 않는다. 이전 저장·다른 팩의 파일은 거절한다. 외부 업로드·커밋·배포는 로컬 검증에 포함하지 않는다.

[실기기 확인](device-test.md)
