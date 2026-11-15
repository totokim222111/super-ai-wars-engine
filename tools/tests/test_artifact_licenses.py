"""Pack-independent release manifests must preserve attribution and reject omissions."""
import json,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from artifact_files import artifact_files,check_budget
class AudioNoticeTests(unittest.TestCase):
    def test_video_release_budget_is_511_files_and_256_decimal_mb(self):
        check_budget(511,256_000_000)
        with self.assertRaisesRegex(ValueError,'파일 한도'):check_budget(512,1)
        with self.assertRaisesRegex(ValueError,'용량 한도'):check_budget(1,256_000_001)

    def test_notice_is_required_and_selected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            files=['packs/example/audio/pack.json','packs/example/audio/LICENSES.md']
            for name in ['v2.html','game.html','LICENSE','THIRD_PARTY_NOTICES.md']+files:
                target=root/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_text('{}',encoding='utf8')
            (root/'pack-manifest.json').write_text(json.dumps({'format':1,'files':files}),encoding='utf8')
            selected=artifact_files(root)
            self.assertIn(files[1],selected);self.assertIn('LICENSE',selected);self.assertIn('THIRD_PARTY_NOTICES.md',selected)
            (root/files[1]).unlink()
            with self.assertRaisesRegex(ValueError,'LICENSES.md'):artifact_files(root)
    def test_manifest_cannot_escape_distribution(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'pack-manifest.json').write_text(json.dumps({'format':1,'files':['../private.txt']}),encoding='utf8')
            with self.assertRaisesRegex(ValueError,'경로'):artifact_files(root)
