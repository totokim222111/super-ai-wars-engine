"""v2/game 공유 배포 집합. 저장소 원본은 지우지 않으며 목록 밖 파일은 업로드 불필요."""
import argparse
import os
import json
import re
import shutil
from pathlib import Path


def artifact_files(root=Path('dist')):
    root = Path(root)
    all_files = {p.relative_to(root).as_posix(): p for p in root.rglob('*') if p.is_file()}
    assets = {Path(p).name: p for p in all_files if p.startswith('assets/')}
    selected = set()
    pending = ['v2.html', 'game.html', 'LICENSE', 'THIRD_PARTY_NOTICES.md']
    manifest_path = root / 'pack-manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    if manifest.get('format') != 1 or not isinstance(manifest.get('files'), list):
        raise ValueError('배포 팩 목록 형식 오류')
    pending.append('pack-manifest.json')
    for name in manifest['files']:
        if not isinstance(name, str) or name.startswith('/') or '..' in Path(name).parts:
            raise ValueError('배포 팩 경로 오류')
        pending.append(name)
    while pending:
        path = pending.pop()
        if path in selected:
            continue
        if path not in all_files:
            raise ValueError('배포 파일 없음: ' + path)
        selected.add(path)
        # JS의 정적/동적 import와 URL 자산을 모두 추적한다. 규칙 JSON 안의 옛 엔진
        # 이미지 경로는 v2 표시 자료가 아니므로 game.art.files만 배포한다.
        if Path(path).suffix in ('.html', '.js', '.css'):
            text = all_files[path].read_text(encoding='utf-8')
            for name in set(re.findall(r'[\w.-]+\.(?:json|js|css|story|webp|png|woff2?)(?![\w.])', text)):
                if name in assets:
                    pending.append(assets[name])
    return sorted(selected)


def check_budget(count, total_bytes, limit=511, byte_limit=256_000_000):
    if count > limit:
        raise ValueError(f'파일 한도 초과: {count} > {limit}')
    if total_bytes > byte_limit:
        raise ValueError(f'용량 한도 초과: {total_bytes} > {byte_limit}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dist', default='dist')
    parser.add_argument('--output', default='tools/out/release-cleanup/artifact-files.txt')
    parser.add_argument('--limit', type=int, default=511)
    parser.add_argument('--byte-limit', type=int, default=256_000_000)
    parser.add_argument('--copy-to', help='선택 파일만 tools/out 아래 배포 폴더로 복사')
    args = parser.parse_args()
    root = Path(args.dist)
    files = artifact_files(root)
    total = sum((root / p).stat().st_size for p in files)
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text('\n'.join(f'{p}\t{(root / p).stat().st_size}' for p in files) +
                   f'\n# TOTAL\t{len(files)} files\t{total} bytes\n', encoding='utf-8')
    print(f'{len(files)} files, {total} bytes -> {out}')
    check_budget(len(files), total, args.limit, args.byte_limit)
    if args.copy_to:
        dest = Path(args.copy_to).resolve()
        allowed = Path(os.environ.get('ARTIFACT_ROOT','tools/out')).resolve()
        if not dest.is_relative_to(allowed) or dest == allowed or dest == root.resolve():
            raise ValueError('배포 복사본은 tools/out 안의 별도 하위 폴더여야 합니다.')
        dest.mkdir(parents=True, exist_ok=True)
        # 생성된 배포 복사본의 옛 파일만 정리한다. 원본 dist/public은 변경하지 않는다.
        for old in dest.rglob('*'):
            if old.is_file() and old.relative_to(dest).as_posix() not in files:
                old.unlink()
        for path in files:
            target = dest / path
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(root / path, target)
        print(f'Artifact copy: {dest} ({len(files)} files)')


if __name__ == '__main__':
    main()
