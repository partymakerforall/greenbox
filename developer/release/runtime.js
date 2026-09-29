(() => {
  'use strict';
  const dialog = document.getElementById('recovery-dialog');
  const frame = document.getElementById('recovery-frame');
  const payload = document.getElementById('embedded-recovery');
  let loaded = false;

  function openRecovery(event) {
    event.preventDefault();
    if (!loaded) {
      // Only the build-time production HTML enters srcdoc; no user files do.
      frame.srcdoc = new TextDecoder().decode(Uint8Array.from(atob(payload.content.textContent.trim()), c => c.charCodeAt(0)));
      loaded = true;
    }
    dialog.showModal();
    document.body.classList.add('recovery-open');
  }
  for (const link of document.querySelectorAll('[data-tool]')) link.addEventListener('click', openRecovery);
  document.getElementById('back-to-guide').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => document.body.classList.remove('recovery-open'));
  frame.addEventListener('load', () => {
    const child = frame.contentDocument;
    if (!child) return;
    // Keep the tool's handbook links inside this one downloaded file.
    child.addEventListener('click', event => {
      const link = event.target.closest('a[href^="index.html#"]');
      if (!link) return;
      event.preventDefault();
      dialog.close();
      location.hash = link.getAttribute('href').slice('index.html'.length);
    });
  });
})();
