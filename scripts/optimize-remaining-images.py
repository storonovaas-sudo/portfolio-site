"""Generate WebP assets from remaining PNG/JPEG sources; keep originals intact."""
from pathlib import Path
import re
from tempfile import NamedTemporaryFile
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
sources = [*ROOT.glob('appruvo-field-*.png'), ROOT/'appruvo-field-research-hero.jpg',
           ROOT/'anastasia-avatar.png', ROOT/'footer-illustration.png',
           *ROOT.glob('outside-*.jpg')]
replacements = {}
old_total = new_total = 0
for source in sorted(sources):
    image = ImageOps.exif_transpose(Image.open(source))
    limit = 2400
    if source.name == 'anastasia-avatar.png': limit = 108
    elif source.name == 'footer-illustration.png': limit = 720
    elif source.name.startswith('outside-'): limit = 1800
    image.thumbnail((limit, limit), Image.Resampling.LANCZOS)
    if image.mode not in ('RGB', 'RGBA'): image = image.convert('RGBA' if 'transparency' in image.info else 'RGB')
    target = source.with_suffix('.webp')
    quality = 92 if source.name.startswith('appruvo-field-') and source.suffix == '.png' else 86
    # Do not overwrite/delete an existing published WebP while trying a candidate.
    with NamedTemporaryFile(dir=target.parent, suffix='.webp') as temporary:
        candidate = Path(temporary.name)
        image.save(candidate, 'WEBP', quality=quality, method=6)
        if candidate.stat().st_size >= source.stat().st_size:
            image.save(candidate, 'WEBP', quality=80, method=6)
        if candidate.stat().st_size >= source.stat().st_size:
            print(f'{source.name}: already compact; kept original and existing WebP')
            continue
        target.write_bytes(candidate.read_bytes())
    replacements[source.name] = target.name
    old_total += source.stat().st_size
    new_total += target.stat().st_size
    print(f'{source.name}: {source.stat().st_size // 1024} → {target.stat().st_size // 1024} KB; {image.size}')
for html in ROOT.glob('*.html'):
    text = html.read_text()
    for old, new in replacements.items():
        text = re.sub(re.escape(old) + r'(?:\?v=[\w-]+)?', new, text)
    html.write_text(text)
saved = 1 - new_total / old_total if old_total else 0
print(f'TOTAL: {old_total} → {new_total} bytes; saved {saved:.1%}')
