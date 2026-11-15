import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('merge_video', Path(__file__).resolve().parents[1] / 'merge_video.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class MergeVideoTests(unittest.TestCase):
    def test_plan_order_trim_and_local_only(self):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            (base/'a.mp4').write_bytes(b'fixture')
            fps, cuts = module.plan({'fps':30,'cuts':[{'file':'a.mp4','order':2,'start':1,'duration':5,'transition':'white-flash'},{'file':'a.mp4','order':1,'duration':6}]}, base)
            self.assertEqual(fps,30)
            self.assertEqual([row['duration'] for row in cuts],[6,5])
            self.assertEqual(cuts[1]['start'],1)
            with self.assertRaises(ValueError): module.local(base,'https://invalid.example/remote.mp4')
            with self.assertRaises(ValueError): module.plan({'fps':60,'cuts':[{'file':'a.mp4'}]},base)
            with self.assertRaises(ValueError): module.plan({'cuts':[{'file':'a.mp4'},{'file':'a.mp4','duration':1,'transition':'crossfade','transitionSeconds':2}]},base)
            with self.assertRaises(ValueError): module.plan({'cuts':[{'file':'a.mp4','duration':float('nan')}]},base)

if __name__ == '__main__': unittest.main()
