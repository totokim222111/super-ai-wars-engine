"""Join local media cuts. Requires ffmpeg/ffprobe on PATH; never executes source files.
Usage: python -I tools/merge_video.py cuts.json --output packs/example/video/demo.mp4
Paths in JSON are relative to that JSON file. Source directories are read-only.
"""
import argparse
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import tempfile


def number(value, default, minimum=0):
    value = default if value is None else value
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < minimum:
        raise ValueError('Invalid duration/gain/start')
    return value


def local(base, name):
    if not isinstance(name, str) or '://' in name or name.startswith(('pipe:', 'http:', 'https:')):
        raise ValueError('Only local media files are allowed')
    path = (base / name).resolve()
    if path.suffix.lower() not in {'.mp4','.m4v','.mov','.webm','.mkv','.avi','.mp3','.m4a','.wav','.aac','.ogg','.flac','.aif','.aiff'}:
        raise ValueError('Unsupported media extension')
    if not path.is_file():
        raise ValueError('Missing media: ' + str(path))
    return path


def run(args):
    result = subprocess.run([str(x) for x in args], capture_output=True, text=True, encoding='utf-8', errors='replace', check=False)
    if result.returncode:
        raise RuntimeError(result.stderr[-6000:])
    return result.stdout


def probe(file, binary):
    return json.loads(run([binary, '-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_streams', '-show_format', '-of', 'json', file]))


def plan(config, base):
    fps = config.get('fps', 24)
    if fps not in (24, 30):
        raise ValueError('fps must be 24 or 30')
    rows = config.get('cuts')
    if not isinstance(rows, list) or not rows:
        raise ValueError('cuts must contain at least one item')
    rows = sorted(enumerate(rows), key=lambda item: (item[1].get('order', item[0]), item[0]))
    cuts = []
    for _, row in rows:
        cut = dict(row, file=local(base, row['file']), start=number(row.get('start'), 0), duration=number(row.get('duration'), 6, .1))
        transition = row.get('transition', 'cut')
        if transition not in ('cut', 'crossfade', 'white-flash'):
            raise ValueError('Unknown transition')
        cut['transition'] = transition
        cut['transitionSeconds'] = number(row.get('transitionSeconds'), .25, .04)
        cut['sfx'] = [dict(s, file=local(base, s['file']), at=number(s.get('at'), 0), gain=number(s.get('gain'), 1)) for s in row.get('sfx', [])]
        cuts.append(cut)
    for i in range(1, len(cuts)):
        if cuts[i]['transition'] != 'cut' and cuts[i]['transitionSeconds'] >= min(cuts[i-1]['duration'], cuts[i]['duration']):
            raise ValueError('Transition must be shorter than both cuts')
    return fps, cuts


def merge(config_file, output, ffmpeg='ffmpeg', ffprobe='ffprobe'):
    config_file, output = Path(config_file).resolve(), Path(output).resolve()
    config = json.loads(config_file.read_text(encoding='utf-8-sig'))
    base = config_file.parent
    fps, cuts = plan(config, base)
    bgm = local(base, config['music']) if config.get('music') else None
    inputs = [c['file'] for c in cuts] + [s['file'] for c in cuts for s in c['sfx']] + ([bgm] if bgm else [])
    if output in inputs or output == config_file:
        raise ValueError('Output must not replace a source')
    output.parent.mkdir(parents=True, exist_ok=True)
    common = [ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-threads', '2', '-filter_complex_threads', '1']
    with tempfile.TemporaryDirectory(prefix='srpg-video-') as temp:
        normalized = []
        for index, cut in enumerate(cuts):
            info = probe(cut['file'], ffprobe)
            duration = float(info['format']['duration'])
            if cut['start'] + cut['duration'] > duration + .1:
                raise ValueError('Requested trim exceeds source duration')
            has_audio = any(s.get('codec_type') == 'audio' for s in info['streams']) and cut.get('sound', True)
            args = common + ['-protocol_whitelist', 'file,pipe', '-ss', cut['start'], '-t', cut['duration'], '-i', cut['file']]
            if not has_audio:
                args += ['-f', 'lavfi', '-t', cut['duration'], '-i', 'anullsrc=r=48000:cl=stereo']
            audio = '0:a' if has_audio else '1:a'
            count = 1 if has_audio else 2
            graph = [f'[0:v]fps={fps},scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p,settb=AVTB,setpts=PTS-STARTPTS[v]', f'[{audio}]aformat=sample_rates=48000:channel_layouts=stereo,asetpts=PTS-STARTPTS[base]']
            labels = ['[base]']
            for n, sfx in enumerate(cut['sfx']):
                args += ['-protocol_whitelist', 'file,pipe', '-i', sfx['file']]
                delay = round(sfx['at'] * 1000)
                graph += [f'[{count+n}:a]volume={sfx["gain"]},adelay={delay}|{delay}[s{n}]']
                labels += [f'[s{n}]']
            graph += [''.join(labels) + f'amix=inputs={len(labels)}:duration=first:normalize=0[a]']
            path = Path(temp) / f'{index}.mp4'
            args += ['-filter_complex', ';'.join(graph), '-map', '[v]', '-map', '[a]', '-t', cut['duration'], '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', path]
            run(args)
            normalized.append(path)
        joined, duration = normalized[0], cuts[0]['duration']
        # Pairwise intermediates keep mixed cut/xfade chains at a constant frame rate.
        for i, cut in enumerate(cuts[1:], 1):
            pair = [f'[0:v]setpts=PTS-STARTPTS,fps={fps},settb=AVTB[v0]', f'[1:v]setpts=PTS-STARTPTS,fps={fps},settb=AVTB[v1]']
            if cut['transition'] == 'cut':
                pair += ['[v0][0:a][v1][1:a]concat=n=2:v=1:a=1[v][a]']
                duration += cut['duration']
            else:
                t = cut['transitionSeconds']
                style = 'fadewhite' if cut['transition'] == 'white-flash' else 'fade'
                pair += [f'[v0][v1]xfade=transition={style}:duration={t}:offset={duration-t}[v]', f'[0:a][1:a]acrossfade=d={t}[a]']
                duration += cut['duration'] - t
            dest = Path(temp) / f'joined-{i}.mp4'
            run(common + ['-i', joined, '-i', normalized[i], '-filter_complex', ';'.join(pair), '-map', '[v]', '-map', '[a]', '-r', fps, '-t', duration, '-c:v', 'libx264', '-crf', '18', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', dest])
            joined = dest
        args = common + ['-i', joined]
        graph = []
        v, a = '0:v', '0:a'
        if bgm:
            args += ['-stream_loop', '-1', '-protocol_whitelist', 'file,pipe', '-i', bgm]
            gain = number(config.get('musicGain'), .5)
            graph += [f'[1:a]volume={gain},atrim=duration={duration},afade=t=out:st={max(0,duration-.3)}:d=0.3[bgm]', f'[{a}][bgm]amix=inputs=2:duration=first:normalize=0[mixed]']
            a = 'mixed'
        ending = config.get('endTransition')
        if ending not in (None, 'white-flash'):
            raise ValueError('Unknown endTransition')
        white = f',fade=t=out:st={max(0,duration-.25)}:d=0.25:color=white' if ending else ''
        graph += [f'[{a}]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[finala]', f'[{v}]fps={fps},format=yuv420p{white}[finalv]']
        staged = Path(temp) / 'output.mp4'
        run(args + ['-filter_complex', ';'.join(graph), '-map', '[finalv]', '-map', '[finala]', '-t', duration, '-c:v', 'libx264', '-profile:v', 'high', '-level:v', '3.1', '-preset', 'slow', '-b:v', '2M', '-maxrate', '2M', '-bufsize', '4M', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', '-map_metadata', '-1', staged])
        shutil.copyfile(staged, output)
    result = probe(output, ffprobe)
    print(json.dumps({'output': output.name, 'bytes': output.stat().st_size, 'duration': float(result['format']['duration']), 'fps': fps}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('list')
    parser.add_argument('--output', required=True)
    parser.add_argument('--ffmpeg', default=os.environ.get('FFMPEG', 'ffmpeg'))
    parser.add_argument('--ffprobe', default=os.environ.get('FFPROBE', 'ffprobe'))
    options = parser.parse_args()
    merge(options.list, options.output, options.ffmpeg, options.ffprobe)



