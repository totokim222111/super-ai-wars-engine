"""어셋 물결 검사·표정 정렬·WebP·팩 등록. 사용법은 docs/v2-content-pack.md.

원본은 읽기만 한다. --register 전에도 결과 WebP와 검수 모음을 만든다.
"""
from __future__ import annotations
import argparse
import os
import json
import re
import sys
import tempfile
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
MOODS = ['default', 'smile', 'laugh', 'attack', 'serious', 'hit', 'shock', 'sad', 'angry', 'shy']
RECT = [0.18, 0, 0.64, 0.42]
HEIGHTS = {'SS': 280, 'S': 305, 'M': 335, 'L': 420, 'LL': 540}
SPECS = {'bust': ((1024, 1536), 280), 'mech': ((1024, 1024), 200),
         'portrait': ((768, 768), 120), 'bg': ((1600, 900), 350),
         'battle-bg': ((1600, 900), 350), 'cg': ((1600, 900), 400),
         'map-surface': ((512, 512), 150), 'map-prop': ((256, 256), 80),
         'map-building': ((2048, 1024), 700), 'map-painted': ((1440, 960), 700)}
ALIASES = {'상반신': 'bust', '표정': 'moods', '기체': 'mech', '자코 초상': 'portrait', '배경': 'bg', '삽화': 'cg'}


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def write_json(path, data):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')


def bbox(image):
    alpha = np.asarray(image.convert('RGBA'))[:, :, 3]
    ys, xs = np.where(alpha >= 24)
    return (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1) if len(xs) else None


def metrics(image, kind):
    rgba = np.asarray(image.convert('RGBA'))
    w, h = image.size
    box = bbox(image)
    transparent = all(rgba[y, x, 3] < 24 for y, x in [(0, 0), (0, w-1), (h-1, 0), (h-1, w-1)])
    if box is None:
        return {'size': f'{w}x{h}', 'corners': transparent, 'head': '빈 그림', 'bottom': '-', 'ground': '-', 'center': '-'}
    x0, y0, x1, y1 = box
    # 의미상 얼굴 검출은 하지 않는다. 불투명 영역의 위쪽 42%를 머리 위치 초안으로 보고한다.
    head = rgba[:max(1, round(h*.42)), :, 3] >= 24
    hy, hx = np.where(head)
    return {'size': f'{w}x{h}', 'corners': transparent,
            'head': f'위 {y0/h:.1%}, 중심 {np.mean(hx)/w:.1%}' if len(hx) else '머리 영역 비어 있음',
            'bottom': f'{h-y1}px', 'ground': f'{y1/h:.1%}', 'center': f'{(x0+x1)/2/w:.1%}'}


def check(image, kind, flying=False, expected=None):
    result = metrics(image, kind)
    warnings = []
    expected = expected or SPECS[kind][0]
    if image.size != expected:
        warnings.append(f'크기: {image.size}, 권장 {expected} (자동 변형 안 함)')
    if kind in ('bust', 'mech', 'portrait', 'map-prop', 'map-building') and not result['corners']:
        warnings.append('네 귀퉁이에 불투명 픽셀: 배경 제거 확인')
    box = bbox(image)
    if box and kind in ('bust', 'mech', 'portrait'):
        x0, y0, x1, y1 = box
        w, h = image.size
        if abs((x0+x1)/2/w-.5) > .04:
            warnings.append('불투명 영역 가로 중심 ±4% 초과')
        if kind == 'bust':
            if not .05 <= y0/h <= .08:
                warnings.append('머리 맨 위 추정치 5~8% 밖 (장식은 사람이 확인)')
            if h-y1 > 2:
                warnings.append('몸이 캔버스 아래 끝에 닿지 않음')
        if kind == 'mech':
            lo, hi = (.84, .90) if flying else (.91, .93)
            if y0/h < .06 or not lo <= y1/h <= hi:
                warnings.append('기체 위 여백/지면선 범위 밖')
    if box is None:
        warnings.append('불투명 영역 없음')
    if kind == 'battle-bg':
        warnings.append('지면선 목표 84%: 배경은 의미상 지면을 자동 판정하지 않으므로 모음에서 확인')
    return result, warnings


def displacement(base, expression, rect):
    """표정 밖 몸 영역으로 전체 평행 이동을 구한다. 반환값은 원본의 이동량(px)."""
    a = np.asarray(base.convert('RGBA'), dtype=np.float32)
    b = np.asarray(expression.convert('RGBA'), dtype=np.float32)
    if a.shape != b.shape:
        raise ValueError('기본 그림과 표정 그림의 캔버스가 다릅니다')
    h, w = a.shape[:2]
    def gray(data):
        return data[:, :, :3].mean(axis=2) * data[:, :, 3] / 255
    a, b = gray(a), gray(b)
    x, y, rw, rh = rect
    if rw*rh < .9:  # 자코 전체 초상은 전체 윤곽으로 맞춘다.
        a[int(y*h):int((y+rh)*h), int(x*w):int((x+rw)*w)] = 0
        b[int(y*h):int((y+rh)*h), int(x*w):int((x+rw)*w)] = 0
    if np.std(a) < .01 or np.std(b) < .01:
        return 0., 0., '몸 영역 정보 부족: 수동 확인'
    try:
        import cv2
        (dx, dy), confidence = cv2.phaseCorrelate(a, b)
        return dx, dy, '' if confidence >= .1 else '위상 상관 신뢰도 낮음: 수동 확인'
    except ImportError:
        f = np.fft.fft2(b) * np.conj(np.fft.fft2(a))
        f /= np.maximum(np.abs(f), 1e-10)
        yy, xx = np.unravel_index(np.argmax(np.fft.ifft2(f).real), a.shape)
        return float(xx if xx <= w/2 else xx-w), float(yy if yy <= h/2 else yy-h), ''


def sheet(base, expressions, rect, cols=4, rows=3, order=None, align=True):
    order = order or MOODS
    if len(order) > cols*rows or len(set(order)) != len(order):
        raise ValueError('order는 중복 없이 칸 수 이하여야 합니다')
    w, h = base.size
    # 규격에 적힌 656×645을 그대로 사용한다. 비율의 반올림 결과(655×645)와 구분한다.
    cw, ch = (656, 645) if base.size == (1024, 1536) and rect == RECT else (round(w*rect[2]), round(h*rect[3]))
    result = Image.new('RGBA', (cw*cols, ch*rows))
    warnings = []
    for i, mood in enumerate(order):
        original = base if mood == 'default' else expressions.get(mood)
        if original is None:
            warnings.append(f'{mood}: 빈 칸 (표정 원본 없음)')
            continue
        if original.size != base.size:
            warnings.append(f'{mood}: 크기 불일치, 빈 칸으로 둠')
            continue
        dx, dy, warning = displacement(base, original, rect) if mood != 'default' and align else (0, 0, '')
        if max(abs(dx), abs(dy)) > 8:
            warnings.append(f'{mood}: 원본 어긋남 {dx:.1f}, {dy:.1f}px (>8px), 평행 이동 보정')
        if warning:
            warnings.append(f'{mood}: {warning}')
        aligned = original.convert('RGBA').transform(original.size, Image.Transform.AFFINE, (1, 0, dx, 0, 1, dy), resample=Image.Resampling.BICUBIC)
        x, y = round(rect[0]*w), round(rect[1]*h)
        tile = aligned.crop((x, y, x+cw, y+ch))
        result.paste(tile, (i % cols*cw, i // cols*ch))
    return result, warnings


def anchors(image, size='M'):
    """알파 영역의 질량 중심·왼쪽 윤곽으로 어림. 좌표는 기존 엔진의 보이는 영역 기준."""
    box = bbox(image)
    if not box:
        return {}
    x0, y0, x1, y1 = box
    mask = np.asarray(image.convert('RGBA'))[y0:y1, x0:x1, 3] >= 24
    ys, xs = np.where(mask)
    h, w = mask.shape
    def outline(y):
        band = mask[max(0, round((y-.05)*h)):min(h, round((y+.05)*h))]
        _, xx = np.where(band)
        return round(float(np.quantile(xx, .12))/w, 3) if len(xx) else .2
    arm_y = .54 if size in ('SS', 'S') else .59 if size in ('L', 'LL') else .57
    topy, topx = np.where(mask[:max(1, round(h*.28))])
    return {'muzzle': [outline(.42), .42], 'core': [round(float(np.mean(xs))/w, 3), round(float(np.mean(ys))/h, 3)],
            'shoulder': [outline(.32), .32], 'head': [round(float(np.mean(topx))/w, 3) if len(topx) else .5, .18], 'hand': [outline(arm_y), arm_y]}


def save_webp(image, path, replace=False):
    if path.exists() and not replace:
        raise ValueError(f'기존 결과 보호: {path} (--replace로 명시)')
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, 'WEBP', quality=80, alpha_quality=90, method=6, exact=True)


def font(size):
    for path in [os.environ.get('FONT_PATH'), str(Path(os.environ.get('WINDIR',os.environ.get('SystemRoot','/Windows')))/'Fonts/malgun.ttf'), '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']:
        if path and Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def contact(items, path):
    cols = min(6, len(items))
    cellw, cellh = 400, 320
    output = Image.new('RGB', (cols*cellw, ((len(items)+cols-1)//cols)*cellh), '#080d20')
    d = ImageDraw.Draw(output)
    for i, item in enumerate(items):
        name, image, game_height = item
        x, y = i % cols*cellw, i // cols*cellh
        d.text((x+10, y+8), name[:34], fill='white', font=font(15))
        for half in range(2):
            if half:
                for yy in range(y+40, y+300, 16):
                    for xx in range(x+200, x+400, 16):
                        d.rectangle((xx, yy, xx+15, yy+15), fill='#687180' if ((xx-x)//16+(yy-y)//16) % 2 else '#b0b7c0')
            thumb = image.convert('RGBA').copy()
            content = bbox(thumb)
            if content:
                thumb = thumb.crop(content)
            # 게임의 보이는 높이를 공통 1/3 배율로 줄여 크기 등급을 비교한다.
            thumb.thumbnail((186, max(1, round(game_height/3))))
            output.paste(thumb, (x+half*200+(200-thumb.width)//2, y+295-thumb.height), thumb)
        d.line((x, y+296, x+399, y+296), fill='#ffd23f')
    path.parent.mkdir(parents=True, exist_ok=True)
    output.save(path)


def ingest(wave, *, register=False, replace=False, root=ROOT, out=None, manifest_name='manifest.json', pack=None):
    if Path(manifest_name).name != manifest_name:
        raise ValueError('--manifest는 물결 폴더 안의 파일 이름입니다')
    pack = Path(pack or (os.environ.get('PACK_DIR', str(root/'packs/example')) if root==ROOT else root/'packs/example'))
    manifest = read_json(wave/manifest_name)
    entries = manifest['assets']
    output = out or root/'tools/out/art'
    records, grouped, changes = [], {}, []
    for entry in entries:
        ident = entry['id']
        if not re.fullmatch(r'[a-zA-Z0-9_-]+', ident):
            raise ValueError(f'잘못된 id: {ident}')
        kind = ALIASES.get(entry['kind'], entry['kind'])
        kind = ('portrait' if entry.get('portrait') else 'bust') if kind == 'moods' else kind
        if kind not in SPECS:
            raise ValueError(f'모르는 종류: {kind}')
        source = (wave/entry['source']).resolve()
        if not source.is_relative_to(wave.resolve()):
            raise ValueError('source는 물결 폴더 안이어야 합니다')
        image = Image.open(source).convert('RGB' if kind in ('bg', 'battle-bg', 'cg', 'map-surface', 'map-painted') else 'RGBA')
        expected = None
        if kind == 'map-painted':
            grid = entry.get('grid', [image.width//80, image.height//80])
            if not isinstance(grid,list) or len(grid)!=2 or any(type(n) is not int or n<=0 for n in grid):
                raise ValueError('덧칠 그림 grid는 [열, 행] 양의 정수입니다')
            expected = tuple(n*80 for n in grid)
        info, warnings = check(image, kind, entry.get('flying', False), expected)
        folder = {'bust': 'bust', 'portrait': 'portrait', 'mech': 'mech', 'cg': 'cg', 'bg': 'bg', 'battle-bg': 'bg', 'map-surface': 'maps', 'map-prop': 'maps', 'map-building': 'maps', 'map-painted': 'maps'}[kind]
        prefix = {'bust': 'bust-', 'portrait': 'portrait-', 'mech': 'mech-', 'cg': 'cg-', 'bg': 'bg-', 'battle-bg': 'bbg-', 'map-surface': 'map-', 'map-prop': 'map-', 'map-building': 'map-', 'map-painted': 'map-'}[kind]
        filename = ('talk-' if kind == 'bg' else 'battle-' if kind == 'battle-bg' else '')+ident
        if kind.startswith('map-'):
            setting = entry.get('setting', '')
            material = entry.get('material', '')
            if not re.fullmatch(r'[a-z0-9-]+', setting) or not re.fullmatch(r'[a-z0-9-]+', material):
                raise ValueError('맵 재료는 setting과 material을 소문자 id로 적어야 합니다')
            if ident != setting+'-'+material:
                raise ValueError('맵 재료 id는 setting-material이어야 합니다')
            folder += '/'+setting
            filename = material
        dest = pack/'art'/folder/(filename+'.webp')
        save_webp(image, dest, replace)
        artid = prefix+ident
        kb = dest.stat().st_size/1024
        if kb > SPECS[kind][1]:
            warnings.append(f'용량 {kb:.1f}KB > {SPECS[kind][1]}KB')
        records.append({'id': ident, **info, 'kb': round(kb, 1), 'warnings': warnings})
        grouped.setdefault(kind, []).append((ident, image, HEIGHTS[entry.get('size', 'M')] if kind == 'mech' else 690 if kind == 'bust' else 440 if kind == 'portrait' else 720))
        urls = {artid: dest.relative_to(pack).as_posix()}
        sheetdef = None
        if 'moods' in entry:
            expressions = {}
            for mood, path in entry['moods'].items():
                target = (wave/path).resolve()
                if not target.is_relative_to(wave.resolve()):
                    raise ValueError('moods 경로는 물결 폴더 안이어야 합니다')
                expressions[mood] = Image.open(target).convert('RGBA')
                metrics_, warnings_ = check(expressions[mood], kind, entry.get('flying', False))
                records.append({'id': ident+'/'+mood, **metrics_, 'kb': round(target.stat().st_size/1024, 1), 'warnings': warnings_})
            rect = entry.get('rect', [0, 0, 1, 1] if kind == 'portrait' else RECT)
            cols, rows = (entry.get('cols', 2), entry.get('rows', 1)) if kind == 'portrait' else (4, 3)
            order = entry.get('order', ['default', 'hit'] if kind == 'portrait' else MOODS)
            atlas, warnings_ = sheet(image, expressions, rect, cols, rows, order, align=entry.get('alignMoods', True))
            target = dest.with_stem(dest.stem+'-moods')
            save_webp(atlas, target, replace)
            sheetid = artid+'-moods'
            urls[sheetid] = target.relative_to(pack).as_posix()
            limit = 200 if kind == 'portrait' else 850
            if target.stat().st_size > limit*1024:
                warnings_.append(f'묶음 용량 초과: {target.stat().st_size/1024:.1f}KB > {limit}KB')
            records.append({'id': ident+'/moods', 'size': f'{atlas.width}x{atlas.height}', 'corners': '-', 'head': '-', 'bottom': '-', 'ground': '-', 'center': '-', 'kb': round(target.stat().st_size/1024, 1), 'warnings': warnings_})
            sheetdef = {'art': sheetid, 'rect': rect, 'cols': cols, 'rows': rows, 'order': order}
            grouped.setdefault('moods', []).append((ident, atlas, 720))
        changes.append((entry, kind, artid, urls, sheetdef, anchors(image, entry.get('size', 'M'))))
    for kind, items in grouped.items():
        contact(items, output/f'{wave.name}-{kind}.png')
    if register:
        game, cast, units = [read_json(pack/(name+'.json')) for name in ('game', 'cast', 'units')]
        # 모두 검사한 뒤 등록한다. 관계없는 값은 보존한다.
        for entry, kind, artid, urls, sheetdef, points in changes:
            game['art']['files'].update(urls)
            if kind in ('bust', 'portrait'):
                ident = entry.get('cast', entry['id'])
                if ident not in cast:
                    raise ValueError(f'먼저 cast.json에 인물을 등록하세요: {ident}')
                c = cast[ident]
                c['bust'] = artid
                if sheetdef:
                    c['moodSheet'] = sheetdef
                c.pop('temporary', None)
                covered = set(c.get('moods', {})) & set((sheetdef or {}).get('order', []))
                if covered:
                    print(f'주의 {ident}: 기존 전체 표정 그림 우선 유지: {", ".join(sorted(covered))}', file=sys.stderr)
            if kind == 'mech':
                ident = entry.get('unit', entry['id'])
                u = units.setdefault(ident, {})
                if entry.get('form'):
                    u = u.setdefault('forms', {}).setdefault(entry['form'], {})
                u.update({'art': artid, 'faces': 'left', 'height': HEIGHTS[entry.get('size', 'M')], 'anchors': points})
                u.pop('temporary', None)
        for name, data in [('game', game), ('cast', cast), ('units', units)]:
            write_json(pack/(name+'.json'), data)
        if game['art'].get('metadata'):
            metadata=(pack/game['art']['metadata']).resolve()
            if not metadata.is_relative_to(pack.resolve()):raise ValueError('art.metadata는 팩 폴더 안 경로입니다')
            sheets={c['moodSheet']['art']:c['moodSheet'] for c in cast.values() if c.get('moodSheet')}
            write_json(metadata,inspect_art({'files':game['art']['files'],'sheets':sheets,'paths':{k:str(pack/v)for k,v in game['art']['files'].items()}},root))
    write_json(output/f'{wave.name}-report.json', records)
    return records


def inspect_art(request,root=ROOT):
    result = {}
    for ident, filename in request['files'].items():
        path = Path(request['paths'][ident]) if ident in request.get('paths', {}) else root/'public'/filename.lstrip('/')
        if not path.is_file():
            continue
        with Image.open(path) as image:
            info = {'width': image.width, 'height': image.height, 'bytes': path.stat().st_size}
            config = request.get('sheets', {}).get(ident)
            if config:
                alpha = np.asarray(image.convert('RGBA'))[:, :, 3]
                cw, ch = image.width//config['cols'], image.height//config['rows']
                info['empty'] = [i for i in range(len(config['order'])) if not np.any(alpha[(i//config['cols'])*ch:(i//config['cols']+1)*ch, (i % config['cols'])*cw:(i % config['cols']+1)*cw] >= 24)]
            result[ident] = info
    return result


def self_test():
    with tempfile.TemporaryDirectory(prefix='v2-art-self-') as tmp:
        root = Path(tmp)
        wave = root/'art-src/synthetic'
        wave.mkdir(parents=True)
        rng = np.random.default_rng(9)
        base = Image.new('RGBA', (1024, 1536))
        d = ImageDraw.Draw(base)
        d.ellipse((240, 85, 780, 590), fill='#eec8ba')
        d.rectangle((285, 570, 740, 1535), fill='#365dc0')
        # 몸 무늬로 위상 상관을 안정시킨다.
        for x, y in rng.integers([300, 690], [720, 1500], (90, 2)):
            d.rectangle((int(x), int(y), int(x)+7, int(y)+7), fill='#eeb622')
        base.save(wave/'base.png')
        expr = Image.new('RGBA', base.size)
        expr.paste(base, (12, 3))
        expr.save(wave/'hit.png')
        dx, dy, _ = displacement(base, expr, RECT)
        assert abs(dx-12) < 1 and abs(dy-3) < 1, (dx, dy)
        atlas, warnings = sheet(base, {'hit': expr}, RECT, order=['default', 'hit'])
        assert atlas.size == (2624, 1935) and any('>8px' in w for w in warnings)
        assert not check(base, 'bust')[1]
        assert .4 < anchors(base)['core'][0] < .6
        write_json(wave/'manifest.json', {'assets': [{'id': 'test', 'kind': 'bust', 'source': 'base.png', 'moods': {'hit': 'hit.png'}, 'order': ['default', 'hit']}, {'id': 'robot', 'kind': 'mech', 'source': 'base.png', 'size': 'SS'}]})
        pack = root/'packs/example'
        write_json(pack/'game.json', {'art': {'files': {'keep': 'unchanged'}}})
        write_json(pack/'cast.json', {'test': {'name': '보존', 'moods': {'special': 'keep'}, 'temporary': True}})
        write_json(pack/'units.json', {'robot': {'pilotCast': 'keep', 'temporary': True}})
        records = ingest(wave, register=True, root=root)
        assert len(records) == 4
        assert read_json(pack/'cast.json')['test']['moodSheet']['cols'] == 4
        assert read_json(pack/'cast.json')['test']['moods'] == {'special': 'keep'}
        assert read_json(pack/'units.json')['robot']['height'] == 280
        assert read_json(pack/'units.json')['robot']['pilotCast'] == 'keep'
        assert Image.open(root/'packs/example/art/bust/test.webp').size == (1024, 1536)
        assert (root/'tools/out/art/synthetic-bust.png').exists()
        # 자코는 가로 두 칸이다.
        portrait = base.resize((768, 768))
        assert sheet(portrait, {'hit': portrait}, [0, 0, 1, 1], 2, 1, ['default', 'hit'])[0].size == (1536, 768)
        maps = root/'synthetic-maps'
        maps.mkdir()
        Image.new('RGB', (512, 512), '#375066').save(maps/'ground.png')
        prop = Image.new('RGBA', (256, 256))
        ImageDraw.Draw(prop).rectangle((50, 50, 210, 210), fill='#66ddbb')
        prop.save(maps/'cache.png')
        write_json(maps/'manifest.json', {'assets': [
            {'id': 'test-ground', 'kind': 'map-surface', 'setting': 'test', 'material': 'ground', 'source': 'ground.png'},
            {'id': 'test-cache', 'kind': 'map-prop', 'setting': 'test', 'material': 'cache', 'source': 'cache.png'}]})
        assert len(ingest(maps, register=True, root=root)) == 2
        assert read_json(pack/'game.json')['art']['files']['map-test-ground'] == 'art/maps/test/ground.webp'
        assert Image.open(root/'packs/example/art/maps/test/cache.webp').size == (256, 256)
    print('art_ingest self-test PASS (검사·위상 정렬·묶음·WebP·등록 보존·모음·자코·맵 재료)')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('wave', nargs='?', type=Path)
    parser.add_argument('--out',type=Path)
    parser.add_argument('--pack-dir',type=Path)
    parser.add_argument('--register', action='store_true')
    parser.add_argument('--manifest', default='manifest.json', help='물결 폴더 안의 넣기 목록 파일')
    parser.add_argument('--replace', action='store_true', help='이미 있는 규격 결과 파일 덮어쓰기')
    parser.add_argument('--self-test', action='store_true')
    parser.add_argument('--inspect-art', action='store_true', help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.self_test:
        self_test()
    elif args.inspect_art:
        print(json.dumps(inspect_art(json.load(sys.stdin))))
    elif args.wave:
        records = ingest(args.wave, register=args.register, replace=args.replace, manifest_name=args.manifest,out=args.out,pack=args.pack_dir)
        print('id | 크기 | 투명 귀퉁이 | 머리(어림) | 아래 여백 | 지면선 | 가로 중심 | KB | 경고')
        for r in records:
            print(' | '.join(str(r[k]) for k in ['id', 'size', 'corners', 'head', 'bottom', 'ground', 'center', 'kb'])+' | '+'; '.join(r['warnings']))
    else:
        parser.error('물결 폴더 또는 --self-test를 주세요')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError) as error:
        print(f'어셋 오류: {error}', file=sys.stderr)
        sys.exit(1)
