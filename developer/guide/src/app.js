(() => {
  'use strict';
  const pages = [...document.querySelectorAll('.page')];
  const byId = new Map(pages.map(page => [page.id, page]));
  const nav = [...document.querySelectorAll('.nav-link')];
  const dialog = document.querySelector('#search-dialog');
  const searchInput = document.querySelector('#guide-search');
  const results = document.querySelector('#search-results');
  const menu = document.querySelector('#menu-toggle');
  let current = null;
  let toastTimer;

  function announce(message) {
    const toast = document.querySelector('#toast');
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
  }

  function closeMenu() {
    document.body.classList.remove('nav-open');
    menu.setAttribute('aria-expanded', 'false');
  }

  function route({ initial = false } = {}) {
    let fragment;
    try { fragment = decodeURIComponent(location.hash.slice(1)); }
    catch { fragment = ''; }
    const [locationPart, anchor] = fragment.split('!');
    if (locationPart === 'main') { document.querySelector('main').focus(); return; }
    const [requested, requestedStep] = locationPart.split('/');
    const page = byId.get(requested) || byId.get('start');
    const steps = [...page.querySelectorAll('.wizard-step')];
    const stepNumber = steps.length ? Math.max(1, Math.min(steps.length, Number.parseInt(requestedStep, 10) || 1)) : 0;
    if (!byId.has(requested) && requested) announce('That guide was not found. Choose a path below.');
    for (const item of pages) item.classList.toggle('active', item === page);
    for (const [index, step] of steps.entries()) step.classList.toggle('active', index === stepNumber - 1);
    for (const link of page.querySelectorAll('[data-step-link]')) {
      if (Number(link.dataset.stepLink) === stepNumber) link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
    }
    if (steps.length) {
      page.querySelector('.step-label').textContent = `Step ${stepNumber} of ${steps.length}`;
      page.querySelector('progress').value = stepNumber;
      page.querySelector('progress').setAttribute('aria-label', `Reading step ${stepNumber} of ${steps.length}`);
    }
    const navId = page.id.startsWith('ref-') ? 'library'
      : page.id.startsWith('recover-') ? 'recover' : page.id;
    for (const link of nav) {
      if (link.getAttribute('href') === `#${navId}`) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    document.querySelector('#breadcrumb-current').textContent = page.dataset.title;
    document.title = `${page.dataset.title} · Greenbox handbook`;
    closeMenu();
    const changed = current !== `${page.id}/${stepNumber}`;
    current = `${page.id}/${stepNumber}`;
    if (anchor) {
      const target = document.getElementById(`${page.id}--${anchor}`);
      if (target && page.contains(target)) {
        for (let ancestor = target.parentElement; ancestor && ancestor !== page; ancestor = ancestor.parentElement) {
          if (ancestor.tagName === 'DETAILS') ancestor.open = true;
        }
        const step = target.closest('.wizard-step');
        if (step && !step.classList.contains('active')) {
          location.hash = `${page.id}/${Number(step.dataset.step)}!${anchor}`;
          return;
        }
        requestAnimationFrame(() => {
          target.tabIndex = -1;
          target.focus({ preventScroll: true });
          target.scrollIntoView({ block: 'start' });
        });
        return;
      }
    }
    if (changed) {
      window.scrollTo({ top: 0, behavior: 'instant' });
      if (!initial) (steps[stepNumber - 1]?.querySelector('h2') || page.querySelector('h1')).focus({ preventScroll: true });
    }
  }

  // All content is present locally. Search never transmits a query or reads a wallet.
  const searchEntries = pages.flatMap(page => {
    const steps = [...page.querySelectorAll('.wizard-step')];
    return (steps.length ? steps : [page.querySelector('.reading')]).map((element, i) => ({
      title: page.dataset.title + (steps.length ? ` · ${element.dataset.title}` : ''),
      href: `#${page.id}${steps.length ? `/${i + 1}` : ''}`,
      text: (element.textContent + ' ' + [...element.querySelectorAll('img')].map(image => image.alt).join(' ')).replace(/\s+/g, ' ').trim(),
      reference: page.id.startsWith('ref-'),
    }));
  });

  function search() {
    const query = searchInput.value.trim().toLocaleLowerCase();
    const terms = query.split(/\s+/).filter(Boolean);
    results.replaceChildren();
    if (!terms.length) {
      document.querySelector('#search-count').textContent = '';
      const hint = document.createElement('p');
      hint.className = 'empty-search';
      hint.textContent = 'Try “public card”, “owner.age”, “Trezor”, or “password”.';
      results.append(hint);
      return;
    }
    const matches = searchEntries.filter(entry => terms.every(term => `${entry.title} ${entry.text}`.toLocaleLowerCase().includes(term)))
      .sort((a, b) => Number(a.reference) - Number(b.reference) || Number(b.title.toLocaleLowerCase().includes(query)) - Number(a.title.toLocaleLowerCase().includes(query)))
      .slice(0, 16);
    if (!matches.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-search';
      empty.textContent = 'No matching guide. Try a shorter word, or browse the complete reference.';
      results.append(empty);
    }
    for (const entry of matches) {
      const link = document.createElement('a');
      link.href = entry.href;
      const title = document.createElement('strong');
      title.textContent = entry.title;
      const snippet = document.createElement('p');
      const index = Math.max(0, entry.text.toLocaleLowerCase().indexOf(terms[0]) - 45);
      snippet.textContent = (index ? '…' : '') + entry.text.slice(index, index + 170) + '…';
      link.append(title, snippet);
      link.addEventListener('click', () => dialog.close());
      results.append(link);
    }
    document.querySelector('#search-count').textContent = matches.length ? `${matches.length} result${matches.length === 1 ? '' : 's'} shown` : 'No results';
  }

  function openSearch() {
    if (dialog.open) return;
    closeMenu();
    dialog.showModal();
    searchInput.focus();
    search();
  }
  document.querySelector('#open-search').addEventListener('click', openSearch);
  document.querySelector('#close-search').addEventListener('click', () => dialog.close());
  searchInput.addEventListener('input', search);
  searchInput.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') { event.preventDefault(); results.querySelector('a')?.focus(); }
    if (event.key === 'Enter') { const first = results.querySelector('a'); if (first) { dialog.close(); location.hash = first.hash; } }
  });
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); }
    if (event.key === 'Escape' && document.body.classList.contains('nav-open')) { closeMenu(); menu.focus(); }
  });
  menu.addEventListener('click', () => {
    const isOpen = document.body.classList.toggle('nav-open');
    menu.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) document.querySelector('.nav-link[aria-current=page]')?.focus();
  });
  document.querySelector('#menu-backdrop').addEventListener('click', () => { closeMenu(); menu.focus(); });
  document.querySelector('.skip-link').addEventListener('click', event => {
    event.preventDefault();
    document.querySelector('main').focus();
  });

  const outlineQuery = matchMedia('(min-width: 1021px)');
  function updateOutlines() { document.querySelectorAll('.on-page details').forEach(details => { details.open = outlineQuery.matches; }); }
  outlineQuery.addEventListener('change', updateOutlines);
  updateOutlines();

  const diagramDialog = document.querySelector('#diagram-dialog');
  const diagramImage = document.querySelector('#diagram-full');
  const diagramViewport = document.querySelector('#diagram-viewport');
  const diagramZoom = document.querySelector('#diagram-zoom');
  for (const button of document.querySelectorAll('.diagram-open')) {
    button.addEventListener('click', () => {
      const image = button.querySelector('img');
      document.querySelector('#diagram-title').textContent = button.dataset.diagramTitle;
      diagramImage.src = image.src;
      diagramImage.alt = image.alt;
      diagramViewport.classList.remove('actual-size');
      diagramZoom.textContent = 'Actual size';
      diagramZoom.setAttribute('aria-pressed', 'false');
      diagramDialog.showModal();
      diagramViewport.scrollTo(0, 0);
    });
  }
  document.querySelector('#diagram-close').addEventListener('click', () => diagramDialog.close());
  diagramDialog.addEventListener('click', event => {
    if (event.target === diagramDialog) diagramDialog.close();
  });
  diagramDialog.addEventListener('close', () => {
    diagramImage.removeAttribute('src');
    diagramImage.alt = '';
  });
  diagramZoom.addEventListener('click', () => {
    const actualSize = diagramViewport.classList.toggle('actual-size');
    diagramZoom.textContent = actualSize ? 'Fit to screen' : 'Actual size';
    diagramZoom.setAttribute('aria-pressed', String(actualSize));
    diagramViewport.scrollTo(0, 0);
  });

  // Relative recovery.html links work offline, locally, and under a Pages subpath.
  if (location.protocol === 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
    document.querySelector('.local-indicator').textContent = 'Online demo';
  }
  document.querySelectorAll('.copy-button').forEach(button => {
    button.addEventListener('click', async () => {
      const code = button.closest('.code-panel').querySelector('code');
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(code.textContent);
        button.textContent = 'Copied ✓';
        announce('Copied. Paste into the correct app and review before running.');
        setTimeout(() => { button.textContent = 'Copy'; }, 1800);
      } catch {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(code);
        selection.removeAllRanges();
        selection.addRange(range);
        announce('Text selected. Press ⌘C on Mac or Ctrl+C to copy.');
      }
    });
  });
  window.addEventListener('hashchange', () => {
    if (diagramDialog.open) diagramDialog.close();
    route();
  });
  route({ initial: true });
})();
