"""Dependency-free static-site checks: python3 scripts/check-site.py."""
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
import json
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
errors = []
warnings = []


class Page(HTMLParser):
    def __init__(self, path):
        super().__init__(convert_charrefs=True)
        self.path = path
        self.ids = []
        self.refs = []
        self.headings = []
        self.title = False
        self.description = False
        self.canonical = False
        self.og = False

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        line = self.getpos()[0]
        label = f'{self.path.name}:{line}'
        if 'id' in attrs:
            self.ids.append(attrs['id'])
        if tag == 'html' and not attrs.get('lang'):
            errors.append(f'{label}: missing language')
        if tag == 'title':
            self.title = True
        if tag == 'meta':
            self.description |= attrs.get('name') == 'description' and bool(attrs.get('content'))
            self.og |= attrs.get('property') == 'og:title'
        if tag == 'link':
            self.canonical |= attrs.get('rel') == 'canonical'
        if re.fullmatch(r'h[1-6]', tag):
            self.headings.append(int(tag[1]))
        if attrs.get('role') == 'heading':
            self.headings.append(int(attrs.get('aria-level', '2')))
        if tag == 'img' and 'alt' not in attrs:
            errors.append(f'{label}: image without alt')
        if tag == 'a' and attrs.get('target') == '_blank':
            if not {'noopener', 'noreferrer'} & set(attrs.get('rel', '').split()):
                errors.append(f'{label}: external window without noopener')
        for attr in ('href', 'src'):
            if attrs.get(attr):
                self.refs.append((attrs[attr], line))
        for entry in attrs.get('srcset', '').split(','):
            if entry.strip():
                self.refs.append((entry.strip().split()[0], line))
        for attr in ('aria-labelledby', 'aria-describedby', 'aria-controls'):
            for target in attrs.get(attr, '').split():
                self.refs.append(('#' + target, line))


def local_target(source, url):
    parts = urlsplit(url)
    if parts.scheme or parts.netloc:
        return None, ''
    path = unquote(parts.path)
    target = (ROOT / path.lstrip('/')) if path.startswith('/') else source.parent / path
    if not path:
        target = source
    if target.is_dir():
        target /= 'index.html'
    elif not target.suffix and target.with_suffix('.html').exists():
        target = target.with_suffix('.html')
    return target.resolve(), unquote(parts.fragment)


pages = {}
for path in sorted(ROOT.glob('*.html')):
    page = Page(path)
    page.feed(path.read_text())
    pages[path.resolve()] = page
    if not page.title:
        errors.append(f'{path.name}: missing title')
    if page.headings.count(1) != 1:
        errors.append(f'{path.name}: expected exactly one h1')
    duplicates = [key for key, count in Counter(page.ids).items() if count > 1]
    if duplicates:
        errors.append(f'{path.name}: duplicate IDs {duplicates}')
    if any(b > a + 1 for a, b in zip(page.headings, page.headings[1:])):
        warnings.append(f'{path.name}: heading levels skip a level')
    if path.name != '404.html':
        if not page.description:
            errors.append(f'{path.name}: missing meta description')
        if not page.canonical or not page.og:
            warnings.append(f'{path.name}: canonical/Open Graph incomplete')

for path, page in pages.items():
    for url, line in page.refs:
        target, fragment = local_target(path, url)
        if target is None:
            continue
        if not target.is_file():
            errors.append(f'{path.name}:{line}: missing local target {url}')
        elif fragment and target in pages and fragment not in pages[target].ids:
            errors.append(f'{path.name}:{line}: missing fragment {url}')

for path in [*ROOT.glob('*.css'), *ROOT.glob('assets/**/*.css')]:
    for url in re.findall(r'url\([\s\"\']*([^\)\"\']+)', path.read_text()):
        target, _ = local_target(path, url.strip())
        if target is not None and not target.is_file():
            errors.append(f'{path.name}: missing CSS resource {url}')

json.loads((ROOT / 'vercel.json').read_text())
for path in [*ROOT.glob('*.js'), *ROOT.glob('api/*.js'), *ROOT.glob('assets/**/*.js'), *ROOT.glob('tests/*.js')]:
    result = subprocess.run(['node', '--check', str(path)], capture_output=True, text=True)
    if result.returncode:
        errors.append(result.stderr.strip())

for message in warnings:
    print(f'WARN {message}')
for message in errors:
    print(f'ERROR {message}')
print(f'{len(pages)} pages; {len(errors)} errors; {len(warnings)} recommendations')
sys.exit(bool(errors))
