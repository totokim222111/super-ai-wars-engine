"""Check authored eye anchors against the actual 190px cut-in band. No source image changes."""
import argparse,json,os
from pathlib import Path

def check(cast):
    rows=[]
    for id,c in cast.items():
        crop=c.get('cutin');eye=c.get('cutinEye')
        if not crop:continue
        if not eye:rows.append({'id':id,'status':'unmeasured'});continue
        x,y,w,h=crop
        if len(eye)!=2 or not all(isinstance(v,(int,float))and 0<=v<=1 for v in eye):raise ValueError('invalid eye anchor: '+id)
        band=((eye[1]-y)/h*330-165+95)/190
        rows.append({'id':id,'eye':eye,'crop':crop,'bandEye':band,'status':'ok'if abs(band-.45)<=.08 else'offset'})
    return rows

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--pack',type=Path,default=Path(os.environ.get('PACK_DIR','packs/example')));ap.add_argument('--out',type=Path);ap.add_argument('--check',action='store_true');ap.add_argument('--apply',action='store_true');a=ap.parse_args();path=a.pack/'cast.json';cast=json.loads(path.read_text(encoding='utf-8-sig'))
    if a.apply:
        for c in cast.values():
            if c.get('cutin')and c.get('cutinEye'):
                c['cutin'][1]=round(max(0,min(1-c['cutin'][3],c['cutinEye'][1]-(.5-.05*190/330)*c['cutin'][3])),6)
        path.write_text(json.dumps(cast,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
    rows=check(cast)
    if a.out:a.out.parent.mkdir(parents=True,exist_ok=True);a.out.write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print('cut-in:',len(rows),'pilots;',sum(r['status']=='offset'for r in rows),'offset;',sum(r['status']=='unmeasured'for r in rows),'unmeasured')
    if a.check and any(r['status']=='offset'for r in rows):raise SystemExit(1)
if __name__=='__main__':main()
