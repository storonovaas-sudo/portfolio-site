"""Run with Pillow available: python3 -m unittest discover -s tests -p 'test_*.py'."""
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
import runpy
import shutil
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent


class OptimizeImagesTest(unittest.TestCase):
    def test_larger_candidate_preserves_published_webp_and_html(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'scripts').mkdir()
            script = root / 'scripts/optimize-remaining-images.py'
            shutil.copyfile(ROOT / 'scripts/optimize-remaining-images.py', script)
            sources = ['anastasia-avatar.png', 'footer-illustration.png',
                       'appruvo-field-research-hero.jpg']
            for name in sources:
                Image.new('RGB', (1, 1), 'white').save(root / name)
                (root / name).with_suffix('.webp').write_bytes(b'previous published image')
            html = '<img src="anastasia-avatar.webp" alt="">'
            (root / 'index.html').write_text(html)

            def larger_candidate(_image, filename, *_args, **_kwargs):
                Path(filename).write_bytes(b'x' * 10000)

            with patch.object(Image.Image, 'save', larger_candidate), redirect_stdout(StringIO()):
                runpy.run_path(str(script), run_name='__main__')
            for name in sources:
                self.assertEqual((root / name).with_suffix('.webp').read_bytes(),
                                 b'previous published image')
            self.assertEqual((root / 'index.html').read_text(), html)
            self.assertEqual(len(list(root.glob('*.webp'))), len(sources))


if __name__ == '__main__':
    unittest.main()
