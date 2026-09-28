import {
  MAX_FILE, FORMATS, GreenboxError, derivationRequest,
  validateCard, validatePackage, createPackage, verifyReceipt, openShare, recoverFile,
  digest, fromHex, unbase64, accountAddress,
} from './crypto.mjs';
import { discoverWallets, friendlyWalletError, enrollReusable, recreate } from './wallet.mjs';

const el = id => document.getElementById(id);
const short = value => value ? value.slice(0, 8) + '…' + value.slice(-6) : '';
const methodLabel = method => method === 'eip712' ? 'Structured message' : 'Readable message';
const state = {
  wallets: [], selectedId: '', provider: null, account: '', walletName: '',
  method: 'eip712', card: null, keyFingerprint: '', restoreCard: null, cards: [], payload: null,
  built: null, package: null, receipt: null, receiptVerified: false, trusted: false,
  contribution: null, contributions: [], recovered: null, busy: false, epoch: 0,
  detachWallet: () => {},
};
function status(message, kind = '') { el('status').textContent = message; el('status').className = 'status ' + kind; el('status').hidden = false; }
function act(fn, resultId) {
  return async event => {
    if (state.busy) return;
    state.busy = true; render(); let succeeded = false;
    try { await fn(event); succeeded = true; }
    catch (error) { status(error instanceof GreenboxError ? error.message : 'This step could not be completed. Check the selected files and try again.', 'error'); }
    finally {
      state.busy = false; render();
      if (succeeded && resultId) {
        el(resultId).scrollIntoView({block: 'center', behavior: 'smooth'});
        el(resultId).querySelector('button')?.focus({preventScroll: true});
      }
    }
  };
}
function showTab(tab) {
  for (const name of ['key', 'build', 'recover']) el('view-' + name).hidden = name !== tab;
  for (const button of document.querySelectorAll('[data-tab]')) {
    button.classList.toggle('active', button.dataset.tab === tab);
    if (button.dataset.tab === tab) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  }
}
function forgetRecovered() { state.recovered?.data.fill(0); state.recovered = null; }
function clearWallet() {
  state.detachWallet(); state.detachWallet = () => {};
  state.provider = null; state.account = ''; state.walletName = ''; state.card = null; state.contribution = null; state.epoch++;
}
function requireWallet() { if (!state.provider || !state.account) throw new GreenboxError('Connect the wallet account you want to use first.'); }
function ensureSameSession(epoch) { if (epoch !== state.epoch) throw new GreenboxError('The account or setup changed during signing. Start this step again.'); }
function requirePackage() { if (!state.package || !state.receiptVerified || !state.trusted) throw new GreenboxError('Load the package and its trusted receipt, then confirm where the receipt came from.'); }
async function readJson(file, max = 24 * 1024) {
  if (!file || !file.size || file.size > max) throw new GreenboxError('That file is empty or too large for this step.');
  try { return JSON.parse(await file.text()); } catch { throw new GreenboxError('This is not a readable Greenbox JSON file.'); }
}
function download(value, name, mime = 'application/json') {
  const content = value instanceof Uint8Array ? value : JSON.stringify(value, null, 2) + '\n';
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement('a'); link.href = url; link.download = name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_');
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function dots(id, count, filled) {
  el(id).replaceChildren(...Array.from({length: count}, (_, i) => { const dot = document.createElement('span'); dot.className = i < filled ? 'filled' : ''; return dot; }));
}
function personRows(id, people, empty, remove) {
  const rows = people.map((person, i) => {
    const row = document.createElement('div'); row.className = 'custodian-row';
    const number = document.createElement('span'); number.className = 'person'; number.textContent = String(i + 1).padStart(2, '0');
    const info = document.createElement('div'); info.className = 'person-detail'; const account = document.createElement('strong'); account.textContent = person.account; account.title = person.account;
    const detail = document.createElement('small'); detail.textContent = person.method ? methodLabel(person.method) + ' · public proof checked' : 'Share ' + person.index + ' · integrity checked';
    info.append(account, detail); const button = document.createElement('button'); button.className = 'text-button'; button.textContent = 'Remove'; button.disabled = state.busy;
    button.setAttribute('aria-label', 'Remove ' + person.account); button.onclick = () => { if (!state.busy) { remove(i); render(); } };
    row.append(number, info, button); return row;
  });
  if (!rows.length) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = empty; rows.push(p); }
  el(id).replaceChildren(...rows);
}
function renderWallets() {
  if (!state.wallets.some(w => w.id === state.selectedId)) state.selectedId = state.wallets[0]?.id || '';
  el('wallet-select').replaceChildren(...state.wallets.map(w => new Option(w.name, w.id)));
  if (!state.wallets.length) el('wallet-select').add(new Option('Open in a browser with Rabby or MetaMask', ''));
  el('wallet-select').value = state.selectedId; el('wallet-select').disabled = state.busy || !!state.provider;
  el('connect').disabled = state.busy || !state.selectedId; el('connect').hidden = !!state.provider; el('disconnect').hidden = !state.provider;
  el('wallet-status').textContent = state.account ? state.walletName + ' · ' + short(state.account) : 'No wallet connected';
  el('wallet-status').title = state.account;
}
function render() {
  renderWallets();
  for (const input of document.querySelectorAll('input, #threshold')) input.disabled = state.busy;
  for (const id of ['public-cards', 'previous-package', 'restore-card', 'payload-file', 'recover-package', 'recover-receipt', 'contribution-files']) el(id).disabled = state.busy;
  el('message-preview').textContent = state.account ? JSON.stringify(derivationRequest(null, state.account, state.method), null, 2) : 'Connect your wallet above to preview its message.';
  el('make-key').disabled = state.busy || !state.account;
  el('key-empty').hidden = !!state.card; el('key-result').hidden = !state.card;
  if (state.card) { el('key-account').textContent = state.card.account; el('public-key').textContent = state.card.publicKey; el('key-fingerprint').textContent = state.keyFingerprint; }
  el('check-restored').hidden = !state.restoreCard; el('check-restored').disabled = state.busy || !state.account;
  el('restore-detail').textContent = state.restoreCard ? short(state.restoreCard.account) + ' · ' + methodLabel(state.restoreCard.method) : '';
  personRows('custodian-list', state.cards, 'No public keys added yet.', i => { state.cards.splice(i, 1); state.built = null; });
  const threshold = Number(el('threshold').value), count = state.cards.length;
  el('build-rule-title').textContent = 'Any ' + threshold + '. Any order.';
  el('total-custodians').textContent = count; dots('threshold-dots', count || 5, Math.min(threshold, count));
  el('threshold-description').textContent = count >= threshold ? 'Any ' + threshold + ' of these ' + count + ' custodians can recover, in any order.' : 'Add ' + Math.max(0, threshold - count) + ' more public key card(s) to use this threshold.';
  el('payload-detail').textContent = state.payload ? state.payload.name + ' · ' + state.payload.data.length.toLocaleString() + ' bytes' : 'Your KeePass database or Greenbox key bundle.';
  el('encrypt-package').disabled = state.busy || count < threshold || !state.payload;
  el('package-result').hidden = !state.built;
  el('receipt-status').textContent = state.receiptVerified ? (state.trusted ? '✓ Exact package verified against the trusted receipt.' : '✓ Files match. Confirm that the receipt came from a trusted source.') : 'Load both files to check their match.';
  const ready = state.package && state.receiptVerified && state.trusted;
  const isCustodian = state.package?.header.recipients.some(c => c.account === state.account);
  el('release-share').disabled = state.busy || !ready || !isCustodian;
  el('contribution-result').hidden = !state.contribution;
  personRows('contribution-list', state.contributions, 'No shares collected yet.', i => { state.contributions.splice(i, 1); forgetRecovered(); });
  const needed = state.package?.header.threshold || 3;
  el('share-count').textContent = state.contributions.length; el('shares-needed').textContent = needed;
  dots('recovery-dots', state.package?.header.recipients.length || 5, state.contributions.length);
  el('recovery-progress').textContent = !state.package ? 'Load a package to begin.' : state.contributions.length >= needed ? 'Enough shares collected. You can recover the file.' : 'Collect ' + (needed - state.contributions.length) + ' more different share(s).';
  el('recover-file').disabled = state.busy || !ready || state.contributions.length < needed;
  el('recovered-result').hidden = !state.recovered;
  if (state.recovered) {
    el('recovered-name').textContent = state.recovered.fileName;
    el('recovered-help').textContent = 'Open the downloaded file with its usual application. A KeePass database still needs its own database password.';
  }
}
async function connectSelected() {
  const wallet = state.wallets.find(w => w.id === state.selectedId);
  if (!wallet) throw new GreenboxError('Choose an available wallet first.');
  let accounts;
  try { accounts = await wallet.provider.request({method: 'eth_requestAccounts'}); } catch (error) { throw friendlyWalletError(error); }
  if (!Array.isArray(accounts) || !accounts[0]) throw new GreenboxError('No wallet account was connected.');
  const account = accountAddress(accounts[0]); clearWallet();
  state.provider = wallet.provider; state.account = account; state.walletName = wallet.name;
  const changed = accounts => {
    state.epoch++; state.card = null; state.contribution = null;
    try { state.account = Array.isArray(accounts) && accounts[0] ? accountAddress(accounts[0]) : ''; } catch { state.account = ''; }
    status('Wallet account changed. New signing steps will use ' + (short(state.account) || 'no account') + '.'); render();
  };
  const chainChanged = () => { state.epoch++; state.card = null; state.contribution = null; status('Wallet network changed. Structured signing requires Ethereum mainnet.'); render(); };
  const disconnected = () => { clearWallet(); render(); status('Wallet disconnected.'); };
  wallet.provider.on?.('accountsChanged', changed); wallet.provider.on?.('chainChanged', chainChanged); wallet.provider.on?.('disconnect', disconnected);
  state.detachWallet = () => { wallet.provider.removeListener?.('accountsChanged', changed); wallet.provider.removeListener?.('chainChanged', chainChanged); wallet.provider.removeListener?.('disconnect', disconnected); };
  status('Connected ' + wallet.name + ' · ' + short(account) + '.');
}
function appendCard(value) {
  const card = validateCard(value);
  if (state.cards.some(c => c.account === card.account || c.publicKey === card.publicKey)) throw new GreenboxError('This custodian is already included.');
  if (state.cards.length >= 10) throw new GreenboxError('This prototype supports at most ten custodians.');
  state.cards.push(card); state.built = null;
}
async function checkReceipt() {
  state.receiptVerified = false;
  if (state.package && state.receipt) state.receiptVerified = await verifyReceipt(state.package, state.receipt);
}
async function appendContribution(value) {
  requirePackage();
  const i = value?.index - 1;
  if (value?.format !== FORMATS.contribution || value.packageId !== state.package.header.packageId || value.fingerprint !== state.receipt.fingerprint || !Number.isInteger(i) || i < 0 || i >= state.package.wrapped.length || value.account !== state.package.header.recipients[i].account) throw new GreenboxError('This recovery share does not belong to this package.');
  if (state.contributions.some(c => c.index === value.index)) throw new GreenboxError('That share is already included. Use another custodian.');
  const raw = unbase64(value.share, 33);
  try { if (raw.length !== 33 || await digest(raw) !== state.package.wrapped[i].commitment) throw new GreenboxError('This recovery share is damaged or incorrect.'); }
  finally { raw.fill(0); }
  state.contributions.push(structuredClone(value)); forgetRecovered();
}

for (const button of document.querySelectorAll('[data-tab]')) button.onclick = () => showTab(button.dataset.tab);
document.querySelector('.brand').onclick = event => { event.preventDefault(); showTab('key'); };
el('show-notes').onclick = () => { el('notes').hidden = false; el('notes').scrollIntoView({behavior: 'smooth'}); };
el('hide-notes').onclick = () => { el('notes').hidden = true; };
el('clear-session').onclick = () => location.reload();
el('connect').onclick = act(connectSelected);
el('disconnect').onclick = () => { clearWallet(); render(); status('Wallet disconnected.'); };
el('wallet-select').onchange = () => { state.selectedId = el('wallet-select').value; };
for (const radio of document.querySelectorAll('[name=method]')) radio.onchange = () => { if (!state.busy) { state.method = radio.value; state.card = null; state.epoch++; render(); } };
el('make-key').onclick = act(async () => {
  requireWallet();
  const epoch = state.epoch; state.card = null;
  const card = await enrollReusable(state.provider, state.account, state.method, message => status(message));
  ensureSameSession(epoch); state.card = card; state.keyFingerprint = (await digest(fromHex(card.publicKey))).slice(2).match(/.{1,8}/g).join(' ');
  status('Your reusable public card is ready. Keep it for future backups. Test a restored wallet before real use.', 'success');
}, 'key-result');
el('download-card').onclick = () => { if (state.card) download(state.card, 'greenbox-public-key-' + state.card.account.slice(2, 10) + '.json'); };
el('add-my-card').onclick = act(async () => { appendCard(state.card); showTab('build'); status('Your public card was added to the package.', 'success'); });
el('restore-card').onchange = act(async () => { state.restoreCard = validateCard(await readJson(el('restore-card').files[0])); el('restore-card').value = ''; status('Public card loaded. Connect its wallet account and run the check.'); });
el('check-restored').onclick = act(async () => {
  requireWallet(); if (state.account !== state.restoreCard.account) throw new GreenboxError('Connect the account listed on this public card.');
  const epoch = state.epoch; let identity;
  try { identity = await recreate(state.provider, state.restoreCard, message => status(message)); ensureSameSession(epoch); status('This wallet recreated exactly the registered encryption key.', 'success'); }
  finally { identity?.secret.fill(0); }
});
el('public-cards').onchange = act(async () => { for (const file of el('public-cards').files) appendCard(await readJson(file)); el('public-cards').value = ''; status('Public cards added and their account proofs checked.', 'success'); });
el('previous-package').onchange = act(async () => {
  const previous = validatePackage(await readJson(el('previous-package').files[0], 48 * 1024 * 1024));
  state.cards = previous.header.recipients.map(validateCard); state.built = null;
  el('threshold').value = String(previous.header.threshold);
  el('recovery-name').value = previous.header.label ?? previous.header.invitation.label;
  el('previous-package').value = '';
  status('Saved public cards loaded. Check the full account addresses and choose the file for this backup. No custodian signing is needed.', 'success');
});
el('recovery-name').oninput = () => { state.built = null; render(); };
el('threshold').onchange = () => { state.built = null; render(); };
el('payload-file').onchange = act(async () => {
  const file = el('payload-file').files[0];
  if (!file || file.size < 1 || file.size > MAX_FILE) throw new GreenboxError('Choose a nonempty file up to 32 MiB.');
  state.payload?.data.fill(0); state.payload = {name: file.name, mime: file.type || 'application/octet-stream', data: new Uint8Array(await file.arrayBuffer())}; state.built = null;
  el('payload-file').value = ''; status('File loaded in memory. It is ready to encrypt.');
});
el('encrypt-package').onclick = act(async () => {
  if (!state.payload) throw new GreenboxError('Choose a file first.');
  state.built = await createPackage({label: el('recovery-name').value.trim() || 'Greenbox backup', cards: state.cards, threshold: Number(el('threshold').value), fileName: state.payload.name, mime: state.payload.mime, data: state.payload.data});
  status('Package encrypted. Download the package and its public receipt, then test recovery.', 'success');
}, 'package-result');
el('download-package').onclick = () => { if (state.built) download(state.built.package, 'greenbox-package.json'); };
el('download-receipt').onclick = () => { if (state.built) download(state.built.receipt, 'greenbox-receipt.json'); };
el('recover-package').onchange = act(async () => {
  forgetRecovered(); state.contribution = null; state.contributions = []; state.receiptVerified = false; state.trusted = false; el('trust-receipt').checked = false; state.package = null;
  state.package = validatePackage(await readJson(el('recover-package').files[0], 48 * 1024 * 1024)); el('recover-package').value = '';
  el('recover-package-detail').textContent = state.package.header.file.name + ' · ' + state.package.header.threshold + ' of ' + state.package.header.recipients.length;
  await checkReceipt(); status('Encrypted package loaded. Load its trusted receipt to continue.');
});
el('recover-receipt').onchange = act(async () => {
  forgetRecovered(); state.contribution = null; state.contributions = []; state.receiptVerified = false; state.trusted = false; el('trust-receipt').checked = false; state.receipt = null;
  state.receipt = await readJson(el('recover-receipt').files[0], 4096); el('recover-receipt').value = '';
  await checkReceipt(); el('recover-receipt-detail').textContent = 'Receipt loaded · ' + short(state.receipt.fingerprint);
  status('Receipt loaded. Confirm that you obtained it from a trusted source.');
});
el('trust-receipt').onchange = () => { state.trusted = el('trust-receipt').checked; render(); };
el('release-share').onclick = act(async () => {
  requirePackage(); requireWallet(); const card = state.package.header.recipients.find(c => c.account === state.account);
  if (!card) throw new GreenboxError('This account is not a custodian in the package.');
  const epoch = state.epoch; let identity; state.contribution = null;
  try { identity = await recreate(state.provider, card, message => status(message)); ensureSameSession(epoch); const contribution = await openShare(state.package, state.receipt, identity, state.account); ensureSameSession(epoch); state.contribution = contribution; status('Your share is open. Download it for the recovering person, or add it to this recovery.', 'success'); }
  finally { identity?.secret.fill(0); }
});
el('download-share').onclick = () => { if (state.contribution) download(state.contribution, 'greenbox-SECRET-share-' + state.contribution.index + '.json'); };
el('use-share').onclick = act(async () => { await appendContribution(state.contribution); state.contribution = null; status('Share added. Choose another custodian, or recover when enough shares are collected.', 'success'); });
el('contribution-files').onchange = act(async () => {
  const input = el('contribution-files');
  try {
    for (const file of input.files) await appendContribution(await readJson(file, 4096));
    status('Recovery shares checked and added.', 'success');
  } finally {
    // Choosing the same files must trigger another change after a rejected import.
    input.value = '';
  }
});
el('recover-file').onclick = act(async () => { requirePackage(); forgetRecovered(); state.recovered = await recoverFile(state.package, state.receipt, state.contributions); status('The original file was recovered and authenticated. Download it from the result panel.', 'success'); }, 'recovered-result');
el('download-recovered').onclick = () => { if (state.recovered) download(state.recovered.data, state.recovered.fileName, 'application/octet-stream'); };

const stopDiscovery = discoverWallets(window, wallets => { state.wallets = wallets; renderWallets(); });
window.addEventListener('pagehide', () => { stopDiscovery(); state.detachWallet(); state.payload?.data.fill(0); forgetRecovered(); state.contribution = null; state.contributions = []; });
render();
if (location.protocol === 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
  document.querySelector('.local-badge').textContent = 'Online demo';
}
if (!window.isSecureContext || !crypto.subtle) { status('Start the local server using the README, then open http://127.0.0.1:8788/tool. This browser context does not allow the required encryption.', 'error'); for (const button of document.querySelectorAll('button')) button.disabled = true; }
