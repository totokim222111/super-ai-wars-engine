"""Re-encode approved local originals only. No downloads; gapless MP3 keeps PCM loop coordinates."""
import argparse,hashlib,json,subprocess
from pathlib import Path
import numpy as np

def read_pcm(path,channels,rate=44100):
    """Known audio demuxers only: never follow a playlist from downloaded data."""
    fmt={'.wav':'wav','.ogg':'ogg','.mp3':'mp3','.flac':'flac'}.get(path.suffix.lower())
    if not fmt:raise ValueError('Unsupported original audio format')
    b=subprocess.check_output(['ffmpeg','-v','error','-nostdin','-protocol_whitelist','file,pipe','-f',fmt,'-i',str(path),'-t','600','-f','f32le','-ac',str(channels),'-ar',str(rate),'pipe:1'])
    return np.frombuffer(b,dtype='<f4').copy().reshape(-1,channels)

def prepare_music(samples,processing,rate=44100):
    """Author-supplied loops are unchanged; optional fades keep full-song length."""
    if processing.get('loopSource',False):return samples
    samples=samples.copy()
    for key,tail in [('fadeIn',False),('fadeOut',True)]:
        seconds=processing.get(key,0)
        if not isinstance(seconds,(int,float)) or not 0<=seconds<=5:raise ValueError('Invalid audio fade')
        n=min(round(seconds*rate),len(samples))
        if n:
            target=samples[-n:] if tail else samples[:n]
            target*=np.linspace(1,0,n)[:,None] if tail else np.linspace(0,1,n)[:,None]
    return samples

def main():
    a=argparse.ArgumentParser(description=__doc__);a.add_argument('--pack',required=True);a.add_argument('--selection',required=True);a.add_argument('--source-root',required=True);a.add_argument('--report',required=True);a.add_argument('--only',nargs='+');args=a.parse_args()
    pack=Path(args.pack).resolve();source=Path(args.source_root).resolve();selection=json.loads(Path(args.selection).read_text(encoding='utf8'));path=pack/'audio/pack.json';data=json.loads(path.read_text(encoding='utf8'));report=[];rate=44100
    def original(name):
        name=name.replace('\\','/');p=(source/name.removeprefix('audio-src/')).resolve()
        if not p.is_relative_to(source) or not p.is_file():raise ValueError('Original unavailable: '+name)
        return p
    for kind in ['sfx','bgm']:
        for ident,e in data[kind].items():
            if args.only and ident not in args.only:continue
            if not ident or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-_' for c in ident):raise ValueError('Unsafe audio id')
            old=(pack/'audio'/e['file']).resolve();row=selection[kind][ident];channels=2 if kind=='bgm' else 1
            originals=[original(n) for n in (row['originals'] if kind=='bgm' else [row['original']])];samples=np.concatenate([read_pcm(p,channels,rate) for p in originals])
            if kind=='sfx':
                start=round(row['trimStart']*rate);count=round(row['after']['seconds']*rate);samples=samples[start:start+count];fade=min(round(rate*.008),len(samples)//8);samples[:min(44,len(samples))]*=np.linspace(0,1,min(44,len(samples)))[:,None];samples[-fade:]*=np.linspace(1,0,fade)[:,None];samples*=.8/max(float(abs(samples).max()),1e-9)
            else:samples=prepare_music(samples,row.get('processing',{}),rate)
            temporary=pack/'audio'/kind/(ident+'.encoding.mp3');temporary.parent.mkdir(parents=True,exist_ok=True)
            subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(rate),'-ac',str(channels),'-i','pipe:0','-c:a','libmp3lame','-q:a','3' if kind=='bgm' else '4','-write_xing','1','-id3v2_version','0','-map_metadata','-1',str(temporary)],input=samples.astype('<f4').tobytes(),check=True)
            blob=temporary.read_bytes();digest=hashlib.sha256(blob).hexdigest();dest=temporary.with_name(ident+'-'+digest[:12]+'.mp3');temporary.replace(dest)
            e.update(file=dest.relative_to(pack/'audio').as_posix(),frames=len(samples),sampleRate=rate,encoderDelay=1105,modifications='승인 원본에서 게임용 MP3 재인코딩 · LAME gapless/Xing · 기존 편집·음량·루프 구간 유지 (2026-11-13)')
            if row.get('processing') and not row['processing'].get('loopSource'):e['modifications']+=' · 전체 곡 유지, 시작 '+str(row['processing'].get('fadeIn',0))+'초/끝 '+str(row['processing'].get('fadeOut',0))+'초 페이드'
            if kind=='bgm':e['loopEnd']=len(samples)/rate
            report.append({'kind':kind,'id':ident,'file':e['file'],'bytes':len(blob),'frames':len(samples),'sha256':digest,'originalSha256':[hashlib.sha256(p.read_bytes()).hexdigest() for p in originals]})
            if old!=dest and old.is_file() and not any(v is not e and v['file']==old.relative_to(pack/'audio').as_posix() for v in data[kind].values()):
                if not old.is_relative_to(pack/'audio'):raise ValueError('Unsafe old asset path')
                old.unlink()
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8');out=Path(args.report);out.parent.mkdir(parents=True,exist_ok=True)
    if args.only and out.is_file():report=[r for r in json.loads(out.read_text(encoding='utf8')) if r['id'] not in args.only]+report
    out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps({'files':len(report),'bytes':sum(r['bytes']for r in report)}))

if __name__=='__main__':main()
