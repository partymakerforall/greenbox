#!/usr/bin/env python3
"""Validate delivered HTML, current local links, command syntax, and exact CSP hashes."""
from pathlib import Path
from html.parser import HTMLParser
from collections import Counter
from urllib.parse import unquote
import base64
import hashlib
import json
import re
import subprocess

root = Path(__file__).resolve().parents[1]
project = root.parents[1]
checks = project / "developer/checks"
checks.mkdir(exist_ok=True)
text = (project/'index.html').read_text()

class Inspect(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids, self.links, self.commands, self.images = [], [], [], []
        self.collect = False
        self.command = ''
    def handle_starttag(self, tag, attrs):
        data = dict(attrs)
        if 'id' in data: self.ids.append(data['id'])
        if tag == 'a': self.links.append(data.get('href',''))
        if tag == 'img' and data.get('src'): self.images.append(data)
        if tag == 'pre' and data.get('class') in ['sh','bash']:
            self.collect = True
            self.command = ''
    def handle_endtag(self, tag):
        if tag == 'pre' and self.collect:
            self.commands.append(self.command)
            self.collect = False
    def handle_data(self, data):
        if self.collect: self.command += data

parser = Inspect()
parser.feed(text)
duplicates = [item for item,count in Counter(parser.ids).items() if count>1]
assert not duplicates, duplicates
bad_links = []
for href in parser.links:
    if not href.startswith('#'): continue
    fragment = unquote(href[1:])
    target = fragment.split('!')[0].split('/')[0]
    if '!' in fragment: target = fragment.split('!')[0] + '--' + fragment.split('!',1)[1]
    if target not in parser.ids: bad_links.append(href)
assert not bad_links, bad_links
expected_diagrams = {'two-routes', 'owner-recovery', 'pack-and-protect', 'cards-and-shares', 'wallet-protocol', 'backup-kit'}
assert len(parser.images) == 7, 'Replace all seven diagram locations with embedded images'
assert {item.get('data-diagram-image') for item in parser.images} == expected_diagrams
for item in parser.images:
    assert item.get('alt', '').strip(), 'Diagram needs a text alternative'
    assert item['src'].startswith('data:image/png;base64,'), 'Diagram must work offline'
    data = base64.b64decode(item['src'].split(',', 1)[1], validate=True)
    source = root/'assets/diagrams'/(item['data-diagram-image']+'.png')
    assert data == source.read_bytes(), 'Embedded image differs from its source'
assert not re.search(r'class="(?:route-mini|flow|file-sequence)"', text), 'Old diagram remains'
for command in parser.commands:
    result = subprocess.run(['sh','-n'],input=command,text=True,capture_output=True)
    assert result.returncode == 0, result.stderr
for tag in ['script','style']:
    body = re.search('<'+tag+r'>([\s\S]*?)</'+tag+'>',text)[1]
    digest = base64.b64encode(hashlib.sha256(body.encode()).digest()).decode()
    assert digest in text, 'Content Security Policy mismatch for '+tag
for href in parser.links:
    if href.startswith(('#', 'http://', 'https://')): continue
    assert (project/unquote(href.split('#')[0])).is_file(), 'Missing local file: '+href
assert 'data-print' not in text and 'window.print' not in text
assert 'source-local' not in re.sub(r'<style>[\s\S]*?</style>', '', text), 'Unresolved reference file link'
report = dict(internal_and_external_links=len(parser.links), unique_ids=len(parser.ids),
              shell_blocks_syntax_checked=len(parser.commands), code_copy_controls=text.count('class="copy-button"'),
              duplicate_ids=duplicates, broken_internal_links=bad_links,
              inline_script_and_style_csp='match', print_controls=0,
              embedded_diagrams=len(parser.images), unique_diagram_images=len(expected_diagrams))
(checks/'artifact-checks.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
