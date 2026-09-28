#!/usr/bin/env python3
"""Build a portable, self-contained handbook using local pandoc. No downloads."""
from pathlib import Path
from html.parser import HTMLParser
from html import escape
import base64
import hashlib
import importlib.util
import json
import re
import struct
import subprocess
import sys
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
RESEARCH = ROOT.parent
PROJECT = ROOT.parents[1]
CHECKS = RESEARCH / "checks"
CHECKS.mkdir(exist_ok=True)
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('guide_content', ROOT/'src/content.py')
content = importlib.util.module_from_spec(spec)
spec.loader.exec_module(content)
DOC_ROUTES = {str((RESEARCH/path).resolve()): slug for slug,title,path,group in content.REFERENCE_DOCS}
GUIDE_IDS = {p['slug'] for p in content.PAGES} | {d[0] for d in content.REFERENCE_DOCS}
ASSETS = ROOT/'assets/diagrams'
DIAGRAMS = {item['file']: item for item in json.loads((ASSETS/'manifest.json').read_text())}
used_diagrams = []

def diagram_image(src, source=None):
    """Embed only registered local PNGs; the delivered guide needs no image server."""
    parsed = urlsplit(src)
    if parsed.scheme or parsed.netloc or parsed.query or parsed.fragment:
        raise ValueError('Diagram must be a local PNG: ' + src)
    path = ((source.parent if source else ROOT)/unquote(parsed.path)).resolve()
    if path.parent != ASSETS.resolve() or path.name not in DIAGRAMS:
        raise ValueError('Unregistered diagram: ' + src)
    data = path.read_bytes()
    if not data.startswith(b'\x89PNG\r\n\x1a\n'):
        raise ValueError('Invalid PNG: ' + src)
    width, height = struct.unpack('>II', data[16:24])
    item = DIAGRAMS[path.name]
    used_diagrams.append(path.name)
    uri = 'data:image/png;base64,' + base64.b64encode(data).decode()
    return ('<figure class="diagram"><button type="button" class="diagram-open" '
            'data-diagram-title="'+escape(item['title'],quote=True)+'" '
            'aria-label="Enlarge diagram: '+escape(item['title'],quote=True)+'" aria-haspopup="dialog">'
            '<img data-diagram-image="'+escape(item['id'],quote=True)+'" src="'+uri+'" '
            'alt="'+escape(item['alt'],quote=True)+'" width="'+str(width)+'" height="'+str(height)+'" '
            'loading="lazy" decoding="async">'
            '<span class="diagram-hint" aria-hidden="true">Enlarge ↗</span></button></figure>')

def markdown(text):
    result = subprocess.run(['pandoc', '--from=gfm', '--to=html5', '--wrap=none', '--no-highlight'],
                            input=text, text=True, capture_output=True, check=True)
    return result.stdout

class Rewrite(HTMLParser):
    """Prefix section IDs and keep cross-document navigation inside the handbook."""
    def __init__(self, slug, source=None):
        super().__init__(convert_charrefs=False)
        self.slug, self.source = slug, source
        self.out, self.headings = [], []
        self.heading = None
        self.heading_text = []
        self.skip_close = []

    def handle_starttag(self, tag, attrs):
        data = dict(attrs)
        if tag == 'img':
            self.out.append(diagram_image(data.get('src', ''), self.source))
            return
        if 'id' in data:
            original = data['id']
            data['id'] = self.slug + '--' + original
            if tag == 'h2':
                self.heading = original
                self.heading_text = []
        if tag in ['h1','h2','h3','h4']:
            data['tabindex'] = '-1'
        if tag == 'a' and 'href' in data:
            href = data['href']
            parsed = urlsplit(href)
            if parsed.scheme in ['https', 'http']:
                data['target'], data['rel'] = '_blank', 'noopener noreferrer'
                if href.rstrip('/') == 'http://127.0.0.1:8788/tool':
                    data['href'] = 'recovery.html'
                    data['data-tool'] = ''
            elif href.startswith('#'):
                target = href[1:].split('!')[0].split('/')[0]
                if self.source or target not in GUIDE_IDS:
                    data['href'] = '#' + self.slug + '!' + href[1:]
            elif self.source and not parsed.scheme:
                destination = (self.source.parent / unquote(parsed.path)).resolve()
                if destination == PROJECT/'index.html':
                    data['href'] = '#' + (parsed.fragment or 'start')
                elif str(destination) in DOC_ROUTES:
                    data['href'] = '#' + DOC_ROUTES[str(destination)] + ('!' + parsed.fragment if parsed.fragment else '')
                else:
                    # Evidence may contain secrets. Display its location, never expose it via HTTP.
                    tag = 'span'
                    data = {'class': 'source-local', 'title': 'Local source file: ' + str(destination)}
                    self.skip_close.append('a')
            elif parsed.scheme and parsed.scheme not in ['https', 'http']:
                raise ValueError('Unsupported link scheme: ' + href)
        self.out.append('<' + tag + ''.join(' ' + key + ('="' + escape(str(value), quote=True) + '"' if value is not None else '') for key,value in data.items()) + '>')

    def handle_endtag(self, tag):
        if tag == 'img': return
        if tag == 'h2' and self.heading is not None:
            self.headings.append((self.heading, ''.join(self.heading_text)))
            self.heading = None
        if tag == 'a' and self.skip_close:
            self.skip_close.pop()
            tag = 'span'
        self.out.append('</' + tag + '>')

    def handle_data(self, data):
        self.out.append(data)
        if self.heading is not None:
            self.heading_text.append(data)
    def handle_entityref(self, name):
        self.out.append('&' + name + ';')
        if self.heading is not None:
            from html import unescape
            self.heading_text.append(unescape('&' + name + ';'))
    def handle_charref(self, name):
        self.out.append('&#' + name + ';')
    def handle_comment(self, data):
        self.out.append('<!--' + data + '-->')

def render(text, slug, source=None):
    parser = Rewrite(slug, source)
    # A standalone image becomes a figure, not a figure nested inside a paragraph.
    markup = re.sub(r'<p>(<img\b[^>]*>)</p>', r'\1', markdown(text))
    parser.feed(markup)
    html = ''.join(parser.out)
    def code_panel(match):
        language = (match[1] or '') + ' ' + (match[2] or '')
        label = 'TERMINAL · REVIEW BEFORE RUNNING' if any(lang in language for lang in ['sh','bash','shell']) else 'TEXT / FILE CONTENTS'
        return ('<div class="code-panel"><div class="code-bar"><span>' + label + '</span>'
                '<button class="copy-button" type="button" aria-label="Copy this code block">Copy</button></div>' + match[0] + '</div>')
    html = re.sub(r'<pre(?: class="([^"]*)")?><code(?: class="([^"]*)")?>[\s\S]*?</code></pre>', code_panel, html)
    html = re.sub(r'(<table>[\s\S]*?</table>)', r'<div class="table-wrap" tabindex="0" role="region" aria-label="Scrollable reference table">\1</div>', html)
    return html, parser.headings

def outline(links, wizard=False):
    items = ''.join('<a ' + ('data-step-link="'+str(i+1)+'" ' if wizard else '') + 'href="'+escape(href,quote=True)+'">' +
                    (f'<span class="outline-number">{i+1:02}</span>' if wizard else '') + escape(title) + '</a>' for i,(href,title) in enumerate(links))
    return '<aside class="on-page"><details open><summary><span class="eyebrow">' + ('THE STEPS' if wizard else 'IN THIS GUIDE') + '</span></summary><div class="outline-content">' + items + '<a class="help-link" href="#help">Stuck on a step? →</a></div></details></aside>'

NAV_TITLES = {'start':'Start here','basics':'How it works','check-backup':'Verify your backup','owner':'Create your Greenbox','heirs':'Set up your heirs','recover':'Recover a backup','keep':'Storage & updates','files':'What each file does','help':'Questions & troubleshooting','verification':'What has been tested','library':'Complete reference'}
NAV = ''.join('<div class="nav-group"><p class="nav-label">'+group+'</p>' + ''.join(
    '<a class="nav-link" href="#'+page['slug']+'">'+escape(NAV_TITLES[page['slug']])+'</a>'
    for page in content.PAGES if page['group']==group and page['slug'] in NAV_TITLES) + '</div>'
    for group in ['Start here','Build & recover','Reference'])

articles = []
for page in content.PAGES:
    slug = page['slug']
    if page['steps']:
        steps = []
        count = len(page['steps'])
        for i, item in enumerate(page['steps'], 1):
            body, headings = render(item['body'], slug)
            back = '<a class="previous" href="#'+slug+'/'+str(i-1)+'">← Previous step</a>' if i>1 else '<a class="previous" href="#start">← Start here</a>'
            onward = '<a class="button primary" href="#'+slug+'/'+str(i+1)+'">Next step <span aria-hidden="true">→</span></a>' if i<count else '<a class="button primary" href="#start">Back to the handbook <span aria-hidden="true">→</span></a>'
            steps.append(f'<section class="wizard-step" data-step="{i}" data-title="{escape(item["title"],quote=True)}"><span class="step-badge">STEP {i:02}</span><h2 tabindex="-1">{escape(item["title"])}</h2>{body}<nav class="step-toolbar" aria-label="Guide steps">{back}{onward}</nav></section>')
        reading = '<div class="step-summary"><progress max="'+str(count)+'" value="1"></progress><span class="step-label">Step 1 of '+str(count)+'</span><span>· reading progress</span></div>' + ''.join(steps)
        side = outline([(f'#{slug}/{i+1}',s['title']) for i,s in enumerate(page['steps'])], True)
    else:
        reading, headings = render(page['body'], slug)
        side = outline([(f'#{slug}!{anchor}',title) for anchor,title in headings]) if slug!='start' else ''
    source = '<a href="#'+DOC_ROUTES[str((RESEARCH/page['source']).resolve())]+'">Full reference ↗</a>' if page.get('source') else ''
    source_tools = '<div class="article-tools">'+source+'</div>' if source else ''
    head = '<header class="page-head"><span class="eyebrow">'+escape(page['group'])+' / GREENBOX HANDBOOK</span><h1 tabindex="-1">'+escape(page['title'])+'</h1><p class="lede">'+escape(page['subtitle'])+'</p>'+source_tools+'</header>'
    articles.append('<article id="'+slug+'" class="page'+(' active home' if slug=='start' else '')+'" data-title="'+escape(page['title'],quote=True)+'">'+head+'<div class="'+('home-body' if slug=='start' else 'reader-grid')+'"><div class="reading">'+reading+'</div>'+side+'</div></article>')

for slug,title,path,group in content.REFERENCE_DOCS:
    body, headings = render((RESEARCH/path).read_text(), slug, RESEARCH/path)
    source_note = '<div class="reference-banner">Full reference · '+escape(path)+'<br>Extended detail for the current setup. <a href="#library">Browse the library</a> or use the <a href="#start">short guided paths</a>.</div>'
    head = '<header class="page-head"><span class="eyebrow">COMPLETE REFERENCE / '+escape(group)+'</span><h1 tabindex="-1">'+escape(title)+'</h1></header>'
    articles.append('<article id="'+slug+'" class="page reference" data-title="'+escape(title,quote=True)+'">'+head+'<div class="reader-grid"><div class="reading">'+source_note+body+'</div>'+outline([(f'#{slug}!{anchor}',text) for anchor,text in headings])+'</div></article>')

style = (ROOT/'src/style.css').read_text()
script = (ROOT/'src/app.js').read_text()
digest = lambda text: base64.b64encode(hashlib.sha256(text.encode()).digest()).decode()
csp = "default-src 'none'; script-src 'sha256-"+digest(script)+"'; style-src 'sha256-"+digest(style)+"'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'"
shell = '''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta name="description" content="The local Greenbox handbook: clear guides for KeePass backup, owner recovery, and wallet custodians."><meta http-equiv="Content-Security-Policy" content="__CSP__"><title>Greenbox handbook</title><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='5' fill='%23205c43'/%3E%3Ctext x='10' y='29' fill='%23fbfaf7' font-size='31' font-family='Georgia'%3Eg%3C/text%3E%3C/svg%3E"><style>__STYLE__</style></head>
<body>
<a href="#main" class="skip-link">Skip to the guide</a>
<aside class="sidebar" id="guide-menu"><a class="brand" href="#start" aria-label="Greenbox handbook home"><span class="brand-mark" aria-hidden="true">g</span><span class="brand-title">greenbox<small>The recovery handbook</small></span></a><div class="side-scroll"><nav aria-label="Handbook guides">__NAV__</nav></div><div class="sidebar-foot"><span class="local-indicator">Local, on your computer</span><p>Read at your pace.<br>Your files stay with you.</p></div></aside>
<button class="mobile-backdrop" id="menu-backdrop" aria-label="Close guide menu" tabindex="-1"></button>
<header class="topbar"><button id="menu-toggle" class="menu-toggle" aria-expanded="false" aria-controls="guide-menu">☰ Guides</button><div class="breadcrumb">Handbook <span>/</span> <b id="breadcrumb-current">Start here</b></div><div class="top-actions"><button class="search-open" id="open-search" aria-haspopup="dialog"><svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><circle cx="8.5" cy="8.5" r="5.8" stroke="currentColor" stroke-width="1.4"/><path d="m13 13 4 4" stroke="currentColor" stroke-width="1.4"/></svg><span>Find in guides</span><kbd>⌘ K</kbd><span class="sr-only">Search the guides</span></button><a class="tool-link" data-tool href="recovery.html" target="_blank" rel="noopener">Open recovery tool ↗</a></div></header>
<main id="main" tabindex="-1">__ARTICLES__<footer class="page-footer"><span>Greenbox · Local research edition · 25 September 2026</span><a href="#verification">Understand what has been tested ↗</a></footer></main>
<dialog class="search-dialog" id="search-dialog" aria-labelledby="search-title"><div class="search-heading"><h2 id="search-title">Find your next step.</h2><button class="search-close" id="close-search">Close</button></div><label class="sr-only" for="guide-search">Search guides and full references</label><input id="guide-search" class="search-field" type="search" maxlength="160" autocomplete="off" placeholder="Try public card, password, or Trezor…"><p class="search-hint">Search stays on this computer. <span id="search-count" role="status" aria-live="polite"></span></p><div class="search-results" id="search-results"></div></dialog>
<dialog class="diagram-dialog" id="diagram-dialog" aria-labelledby="diagram-title"><div class="diagram-dialog-header"><h2 id="diagram-title">Diagram</h2><div class="diagram-dialog-actions"><button type="button" id="diagram-zoom" aria-pressed="false">Actual size</button><button type="button" id="diagram-close" autofocus>Close</button></div></div><div class="diagram-viewport" id="diagram-viewport"><img id="diagram-full" alt=""></div></dialog>
<div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
<noscript><p>Enable JavaScript for guide navigation, search, and copying commands. The handbook is self-contained and makes no network requests.</p></noscript>
<script>__SCRIPT__</script></body></html>'''
html = shell.replace('__CSP__', escape(csp,quote=True)).replace('__STYLE__', style).replace('__SCRIPT__', script).replace('__NAV__', NAV).replace('__ARTICLES__', '\n'.join(articles))
(PROJECT/'index.html').write_text(html)
manifest = {str((RESEARCH/path).relative_to(RESEARCH)):hashlib.sha256((RESEARCH/path).read_bytes()).hexdigest() for _,_,path,_ in content.REFERENCE_DOCS}
(CHECKS/'guide-build.json').write_text(json.dumps({'guide_sha256':hashlib.sha256(html.encode()).hexdigest(),'guided_pages':len(content.PAGES),'reference_documents':len(content.REFERENCE_DOCS),'source_sha256':manifest,'diagram_placements':len(used_diagrams),'diagram_sha256':{name:hashlib.sha256((ASSETS/name).read_bytes()).hexdigest() for name in sorted(set(used_diagrams))}},indent=2)+'\n')
print(f'Built index.html: {len(content.PAGES)} guide pages, {len(content.REFERENCE_DOCS)} full references; {len(html.encode()):,} bytes.')
