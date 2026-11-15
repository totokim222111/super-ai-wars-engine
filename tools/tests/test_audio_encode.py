"""Signal edits keep source loops intact and never execute unknown input formats."""
import importlib.util,unittest
from pathlib import Path
import numpy as np
spec=importlib.util.spec_from_file_location('audio_encode',Path(__file__).resolve().parents[1]/'reencode_audio.py')
audio=importlib.util.module_from_spec(spec);spec.loader.exec_module(audio)
class AudioEdits(unittest.TestCase):
    def test_loop_source_is_bit_identical(self):
        samples=np.arange(200,dtype=np.float32).reshape(-1,2)/200
        np.testing.assert_array_equal(audio.prepare_music(samples,{'loopSource':True}),samples)
    def test_full_song_fades_preserve_length_and_original(self):
        samples=np.ones((1000,2),dtype=np.float32);result=audio.prepare_music(samples,{'fadeIn':.01,'fadeOut':.75},1000)
        self.assertEqual(len(result),len(samples));np.testing.assert_array_equal(samples,1);self.assertEqual(result[0,0],0);self.assertEqual(result[-1,0],0);self.assertEqual(result[100,0],1)
    def test_invalid_fade_is_rejected(self):
        with self.assertRaises(ValueError):audio.prepare_music(np.ones((10,2)),{'fadeOut':-1})
    def test_playlist_or_executable_is_not_opened(self):
        for name in ['untrusted.m3u','untrusted.py','untrusted.exe']:
            with self.assertRaisesRegex(ValueError,'Unsupported'):audio.read_pcm(Path(name),2)
