// Versioned experimental file format. Cryptographic primitives are supplied by
// Web Crypto, ethers, noble-curves and Privy's independently audited SSS library.
import { getAddress, verifyTypedData, verifyMessage } from 'ethers';
import { x25519 } from '@noble/curves/ed25519.js';
import { split, combine } from 'shamir-secret-sharing';

export const MAX_FILE = 32 * 1024 * 1024;
export const METHODS = ['eip712', 'personal_sign'];
export const FORMATS = Object.freeze({
  invitation: 'greenbox.wallet.invitation/1', card: 'greenbox.wallet.custodian/1',
  package: 'greenbox.wallet.package/1', receipt: 'greenbox.wallet.receipt/1',
  contribution: 'greenbox.wallet.contribution/1',
});
export const REUSABLE_FORMATS = Object.freeze({
  card: 'greenbox.wallet.custodian/2', package: 'greenbox.wallet.package/2',
  receipt: 'greenbox.wallet.receipt/2',
});
export const KEY_SCHEME = 'Greenbox/reusable-wallet-key/v2';
export const REUSABLE_PURPOSE = 'Create my PRIVATE reusable Greenbox recovery key. This key is reused across backups. Keep this signature secret. No transaction or spending permission.';
export const SUITE = 'X25519-HKDF-SHA256-AES256GCM-SSS-GF256-v1';
export const PURPOSE = 'Create my PRIVATE Greenbox recovery key. Keep this signature secret. No transaction or spending permission.';
const encoder = new TextEncoder();
const N = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');

export class GreenboxError extends Error {
  constructor(message, code = 'INVALID_INPUT') { super(message); this.name = 'GreenboxError'; this.code = code; }
}
function requireThat(ok, message, code) { if (!ok) throw new GreenboxError(message, code); }
export const bytes = text => encoder.encode(text);
export const randomBytes = n => crypto.getRandomValues(new Uint8Array(n));
export const hex = value => '0x' + Array.from(value, b => b.toString(16).padStart(2, '0')).join('');
export function fromHex(value, length) {
  requireThat(typeof value === 'string' && /^0x(?:[a-fA-F0-9]{2})+$/.test(value), 'Invalid hexadecimal value.');
  const out = Uint8Array.from(value.slice(2).match(/../g), x => parseInt(x, 16));
  requireThat(length === undefined || out.length === length, 'Incorrect key or identifier length.');
  return out;
}
export function base64(value) {
  let text = '';
  for (let i = 0; i < value.length; i += 8192) text += String.fromCharCode(...value.subarray(i, i + 8192));
  return btoa(text);
}
export function unbase64(value, max = MAX_FILE + 16) {
  requireThat(typeof value === 'string' && value.length <= Math.ceil(max / 3) * 4 && value.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(value), 'Invalid encoded data.');
  const out = Uint8Array.from(atob(value), x => x.charCodeAt(0));
  requireThat(out.length <= max && base64(out) === value, 'Invalid encoded data.');
  return out;
}
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export const digest = async value => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', value)));
export const objectDigest = object => digest(bytes(canonical(object)));
function shape(value, keys) {
  requireThat(value && typeof value === 'object' && !Array.isArray(value), 'Expected a Greenbox object.');
  requireThat(Object.keys(value).sort().join('|') === [...keys].sort().join('|'), 'Unexpected or missing fields in this file.');
}
function text(value, max, title) { requireThat(typeof value === 'string' && value.length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value), 'Invalid ' + title + '.'); return value; }
export function accountAddress(value) {
  try { return getAddress(value).toLowerCase(); } catch { throw new GreenboxError('Invalid Ethereum account.'); }
}
function methodName(method) { requireThat(METHODS.includes(method), 'Unsupported signing method.'); return method; }
export function createInvitation(label = 'Greenbox recovery') {
  return {format: FORMATS.invitation, recoveryId: hex(randomBytes(32)), label: text(label, 80, 'recovery name')};
}
export function validateInvitation(invitation) {
  shape(invitation, ['format', 'recoveryId', 'label']);
  requireThat(invitation.format === FORMATS.invitation, 'Unsupported invitation format or version.');
  fromHex(invitation.recoveryId, 32); text(invitation.label, 80, 'recovery name');
  requireThat(invitation.recoveryId === invitation.recoveryId.toLowerCase(), 'Noncanonical recovery ID.');
  return structuredClone(invitation);
}
export function derivationRequest(invitation, account, method) {
  if (invitation == null) {
    account = accountAddress(account); methodName(method);
    if (method === 'personal_sign') return {method, message: [
      'GREENBOX PRIVATE REUSABLE RECOVERY KEY', 'Protocol version: 2',
      'Key scheme: ' + KEY_SCHEME, 'Ethereum account: ' + account, REUSABLE_PURPOSE,
    ].join('\n')};
    return {method, domain: {name: 'Greenbox PRIVATE Reusable Recovery Key', version: '2', chainId: 1},
      types: {GreenboxReusableRecoveryKey: [{name: 'purpose', type: 'string'}, {name: 'keyScheme', type: 'string'}, {name: 'custodian', type: 'address'}]},
      message: {purpose: REUSABLE_PURPOSE, keyScheme: KEY_SCHEME, custodian: account}};
  }
  // Version 1 requests remain byte-for-byte compatible with existing cards.
  validateInvitation(invitation); account = accountAddress(account); methodName(method);
  if (method === 'personal_sign') return {method, message: [
    'GREENBOX PRIVATE RECOVERY KEY', 'Protocol version: 1',
    'Recovery ID: ' + invitation.recoveryId, 'Ethereum account: ' + account,
    PURPOSE,
  ].join('\n')};
  return {method, domain: {name: 'Greenbox PRIVATE Recovery Key', version: '1', chainId: 1},
    types: {GreenboxRecoveryKey: [{name: 'purpose', type: 'string'}, {name: 'recoveryId', type: 'bytes32'}, {name: 'custodian', type: 'address'}]},
    message: {purpose: PURPOSE, recoveryId: invitation.recoveryId, custodian: account}};
}
export function registrationRequest(invitation, account, method, publicKey) {
  if (invitation == null) {
    account = accountAddress(account); methodName(method); fromHex(publicKey, 32);
    const purpose = 'Publish my reusable Greenbox public encryption key. This proof is public and grants no spending permission.';
    if (method === 'personal_sign') return {method, message: [
      'GREENBOX PUBLIC REUSABLE KEY REGISTRATION', 'Protocol version: 2',
      'Key scheme: ' + KEY_SCHEME, 'Ethereum account: ' + account,
      'Signing method: ' + method, 'Encryption public key: ' + publicKey, purpose,
    ].join('\n')};
    return {method, domain: {name: 'Greenbox PUBLIC Reusable Key Registration', version: '2', chainId: 1},
      types: {GreenboxReusableRegistration: [{name: 'purpose', type: 'string'}, {name: 'keyScheme', type: 'string'}, {name: 'custodian', type: 'address'}, {name: 'signingMethod', type: 'string'}, {name: 'encryptionPublicKey', type: 'bytes32'}]},
      message: {purpose, keyScheme: KEY_SCHEME, custodian: account, signingMethod: method, encryptionPublicKey: publicKey}};
  }
  validateInvitation(invitation); account = accountAddress(account); methodName(method); fromHex(publicKey, 32);
  const purpose = 'Publish my Greenbox public encryption key. This proof is public and grants no spending permission.';
  if (method === 'personal_sign') return {method, message: [
    'GREENBOX PUBLIC KEY REGISTRATION', 'Protocol version: 1',
    'Recovery ID: ' + invitation.recoveryId, 'Ethereum account: ' + account,
    'Signing method: ' + method, 'Encryption public key: ' + publicKey, purpose,
  ].join('\n')};
  return {method, domain: {name: 'Greenbox PUBLIC Key Registration', version: '1', chainId: 1},
    types: {GreenboxRegistration: [{name: 'purpose', type: 'string'}, {name: 'recoveryId', type: 'bytes32'}, {name: 'custodian', type: 'address'}, {name: 'signingMethod', type: 'string'}, {name: 'encryptionPublicKey', type: 'bytes32'}]},
    message: {purpose, recoveryId: invitation.recoveryId, custodian: account, signingMethod: method, encryptionPublicKey: publicKey}};
}
export function normalizeSignature(signature) {
  requireThat(typeof signature === 'string' && /^0x[0-9a-fA-F]{130}$/.test(signature), 'Wallet must return a 65-byte Ethereum signature.');
  let r = BigInt(signature.slice(0, 66));
  let s = BigInt('0x' + signature.slice(66, 130));
  let parity = parseInt(signature.slice(130, 132), 16);
  if (parity >= 27) parity -= 27;
  requireThat(r > 0n && r < N && s > 0n && s < N && [0, 1].includes(parity), 'Invalid Ethereum signature.');
  if (s > N / 2n) { s = N - s; parity ^= 1; }
  return '0x' + r.toString(16).padStart(64, '0') + s.toString(16).padStart(64, '0') + (27 + parity).toString(16);
}
export function verifyRequest(request, signature, account) {
  try {
    const normalized = normalizeSignature(signature);
    const recovered = request.method === 'eip712'
      ? verifyTypedData(request.domain, request.types, request.message, normalized)
      : verifyMessage(request.message, normalized);
    requireThat(accountAddress(recovered) === accountAddress(account), 'Signature does not match the requested account.');
    return normalized;
  } catch { throw new GreenboxError('Signature or registration proof does not match the requested account. Single signing accounts are required.', 'INVALID_SIGNATURE'); }
}
async function hkdf(secret, salt, info) {
  const key = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({name: 'HKDF', hash: 'SHA-256', salt, info: bytes(info)}, key, 256));
}
export async function deriveIdentity(invitation, account, method, signature) {
  const normalized = verifyRequest(derivationRequest(invitation, account, method), signature, account);
  const material = fromHex(normalized).subarray(0, 64);
  try {
    const salt = invitation == null ? fromHex(await digest(bytes(KEY_SCHEME)), 32) : fromHex(invitation.recoveryId, 32);
    const prefix = invitation == null ? 'Greenbox/wallet-derived-X25519/v2/' : 'Greenbox/wallet-derived-X25519/v1/';
    const secret = await hkdf(material, salt, prefix + method + '/' + accountAddress(account));
    return {secret, publicKey: hex(x25519.getPublicKey(secret))};
  } finally { material.fill(0); }
}
export function createCard(invitation, account, method, publicKey, proof) {
  const context = invitation == null ? {format: REUSABLE_FORMATS.card, keyScheme: KEY_SCHEME}
    : {format: FORMATS.card, invitation: validateInvitation(invitation)};
  const card = {...context, account: accountAddress(account), method: methodName(method), publicKey, proof: verifyRequest(registrationRequest(invitation, account, method, publicKey), proof, account)};
  return validateCard(card);
}
export function validateCard(card) {
  const legacy = card?.format === FORMATS.card;
  requireThat(legacy || card?.format === REUSABLE_FORMATS.card, 'Unsupported public key format or version.');
  shape(card, ['format', legacy ? 'invitation' : 'keyScheme', 'account', 'method', 'publicKey', 'proof']);
  if (legacy) validateInvitation(card.invitation);
  else requireThat(card.keyScheme === KEY_SCHEME, 'Unsupported reusable key scheme or version.');
  methodName(card.method);
  requireThat(accountAddress(card.account) === card.account, 'Noncanonical account address.');
  fromHex(card.publicKey, 32); requireThat(card.publicKey === card.publicKey.toLowerCase(), 'Noncanonical encryption key.');
  // Reject low-order public keys before any package can be made with them.
  try { x25519.getSharedSecret(new Uint8Array(32).fill(42), fromHex(card.publicKey)); }
  catch { throw new GreenboxError('Invalid encryption public key.'); }
  verifyRequest(registrationRequest(card.invitation, card.account, card.method, card.publicKey), card.proof, card.account);
  return structuredClone(card);
}
async function seal(secret, plaintext, aad) {
  const iv = randomBytes(12);
  const key = await crypto.subtle.importKey('raw', secret, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: aad, tagLength: 128}, key, plaintext));
  return {iv: base64(iv), ciphertext: base64(ciphertext)};
}
async function unseal(secret, sealed, aad) {
  try {
    const key = await crypto.subtle.importKey('raw', secret, 'AES-GCM', false, ['decrypt']);
    return new Uint8Array(await crypto.subtle.decrypt({name: 'AES-GCM', iv: unbase64(sealed.iv, 12), additionalData: aad, tagLength: 128}, key, unbase64(sealed.ciphertext)));
  } catch { throw new GreenboxError('Decryption failed. The key is incorrect or this package has changed.', 'DECRYPTION_FAILED'); }
}
function validateSealed(value, max) {
  shape(value, ['iv', 'ciphertext']);
  requireThat(unbase64(value.iv, 12).length === 12, 'Invalid encryption nonce.');
  const length = unbase64(value.ciphertext, max).length;
  requireThat(length >= 16, 'Encrypted content is incomplete.');
}
function wrapContext(headerDigest, payloadDigest, card, index, ephemeralKey) {
  return bytes(canonical({purpose: 'Greenbox/share-wrap/v1', headerDigest, payloadDigest, account: card.account, publicKey: card.publicKey, index, ephemeralKey}));
}
export async function createPackage({invitation, cards, threshold, fileName, mime = 'application/octet-stream', data, label = 'Greenbox backup'}) {
  const legacy = invitation != null;
  if (legacy) invitation = validateInvitation(invitation);
  else text(label, 80, 'backup name');
  requireThat(Array.isArray(cards) && cards.length >= 2 && cards.length <= 10, 'Choose between 2 and 10 custodians.');
  requireThat(Number.isInteger(threshold) && threshold >= 2 && threshold <= cards.length, 'Invalid recovery threshold.');
  const validCards = cards.map(validateCard);
  if (legacy) requireThat(validCards.every(c => c.format === FORMATS.card && c.invitation.recoveryId === invitation.recoveryId), 'Public keys belong to different recovery invitations.');
  requireThat(new Set(validCards.map(c => c.account)).size === cards.length && new Set(validCards.map(c => c.publicKey)).size === cards.length, 'Duplicate custodian account or encryption key.');
  requireThat(data instanceof Uint8Array && data.length > 0 && data.length <= MAX_FILE, 'Choose a nonempty file up to 32 MiB.');
  text(fileName, 180, 'file name'); text(mime, 100, 'file type');
  const header = {suite: SUITE, ...(legacy ? {invitation} : {label}), threshold, recipients: validCards,
    packageId: hex(randomBytes(32)), file: {name: fileName, size: data.length, mime}};
  const master = randomBytes(32);
  let shares = [];
  try {
    const payload = await seal(master, data, bytes(canonical(header)));
    const headerDigest = await objectDigest(header), payloadDigest = await objectDigest(payload);
    shares = await split(master, cards.length, threshold);
    const wrapped = [];
    for (let i = 0; i < cards.length; i++) {
      const card = validCards[i], ephemeralSecret = randomBytes(32);
      let shared, wrapping;
      try {
        const ephemeralKey = hex(x25519.getPublicKey(ephemeralSecret));
        shared = x25519.getSharedSecret(ephemeralSecret, fromHex(card.publicKey));
        const context = wrapContext(headerDigest, payloadDigest, card, i + 1, ephemeralKey);
        wrapping = await hkdf(shared, fromHex(headerDigest), new TextDecoder().decode(context));
        wrapped.push({index: i + 1, ephemeralKey, commitment: await digest(shares[i]), sealed: await seal(wrapping, shares[i], context)});
      } finally { ephemeralSecret.fill(0); shared?.fill(0); wrapping?.fill(0); }
    }
    const pkg = {format: legacy ? FORMATS.package : REUSABLE_FORMATS.package, header, payload, wrapped};
    const receipt = {format: legacy ? FORMATS.receipt : REUSABLE_FORMATS.receipt, packageId: header.packageId,
      ...(legacy ? {recoveryId: invitation.recoveryId} : {}), fingerprint: await objectDigest(pkg)};
    return {package: pkg, receipt};
  } finally { master.fill(0); for (const share of shares) share.fill(0); }
}
export function validatePackage(pkg) {
  shape(pkg, ['format', 'header', 'payload', 'wrapped']);
  const legacy = pkg.format === FORMATS.package;
  requireThat(legacy || pkg.format === REUSABLE_FORMATS.package, 'Unsupported package format or version.');
  const h = pkg.header;
  shape(h, ['suite', legacy ? 'invitation' : 'label', 'threshold', 'recipients', 'packageId', 'file']);
  requireThat(h.suite === SUITE, 'Unsupported encryption suite.');
  if (legacy) validateInvitation(h.invitation);
  else text(h.label, 80, 'backup name');
  fromHex(h.packageId, 32);
  requireThat(Array.isArray(h.recipients) && h.recipients.length >= 2 && h.recipients.length <= 10, 'Invalid custodian count.');
  requireThat(Number.isInteger(h.threshold) && h.threshold >= 2 && h.threshold <= h.recipients.length, 'Invalid recovery threshold.');
  h.recipients.forEach(validateCard);
  if (legacy) requireThat(h.recipients.every(c => c.format === FORMATS.card && c.invitation.recoveryId === h.invitation.recoveryId), 'Public key has a different recovery ID.');
  requireThat(new Set(h.recipients.map(c => c.account)).size === h.recipients.length && new Set(h.recipients.map(c => c.publicKey)).size === h.recipients.length, 'Duplicate custodian account or key.');
  shape(h.file, ['name', 'size', 'mime']); text(h.file.name, 180, 'file name'); text(h.file.mime, 100, 'file type');
  requireThat(Number.isInteger(h.file.size) && h.file.size > 0 && h.file.size <= MAX_FILE, 'Invalid file size.');
  validateSealed(pkg.payload, MAX_FILE + 16);
  requireThat(unbase64(pkg.payload.ciphertext).length === h.file.size + 16, 'Encrypted file size does not match its metadata.');
  requireThat(Array.isArray(pkg.wrapped) && pkg.wrapped.length === h.recipients.length, 'Missing encrypted shares.');
  pkg.wrapped.forEach((w, i) => {
    shape(w, ['index', 'ephemeralKey', 'commitment', 'sealed']);
    requireThat(w.index === i + 1, 'Invalid share index.'); fromHex(w.ephemeralKey, 32); fromHex(w.commitment, 32);
    validateSealed(w.sealed, 49); requireThat(unbase64(w.sealed.ciphertext, 49).length === 49, 'Invalid encrypted share size.');
  });
  return pkg;
}
export async function verifyReceipt(pkg, receipt) {
  validatePackage(pkg);
  const legacy = pkg.format === FORMATS.package;
  shape(receipt, ['format', 'packageId', 'fingerprint', ...(legacy ? ['recoveryId'] : [])]);
  requireThat(receipt.format === (legacy ? FORMATS.receipt : REUSABLE_FORMATS.receipt), 'Unsupported recovery receipt format.');
  requireThat(receipt.packageId === pkg.header.packageId && (!legacy || receipt.recoveryId === pkg.header.invitation.recoveryId) && receipt.fingerprint === await objectDigest(pkg), 'This package does not match the trusted recovery receipt.', 'RECEIPT_MISMATCH');
  return true;
}
export async function openShare(pkg, receipt, identity, account) {
  await verifyReceipt(pkg, receipt); account = accountAddress(account);
  const i = pkg.header.recipients.findIndex(c => c.account === account);
  requireThat(i >= 0, 'This account is not a custodian for this package.');
  const card = pkg.header.recipients[i], wrapped = pkg.wrapped[i];
  requireThat(identity.publicKey === card.publicKey && hex(x25519.getPublicKey(identity.secret)) === card.publicKey, 'This wallet did not recreate the registered encryption key.');
  let shared, wrapping, share;
  try {
    try { shared = x25519.getSharedSecret(identity.secret, fromHex(wrapped.ephemeralKey)); }
    catch { throw new GreenboxError('Invalid encrypted share key.'); }
    const headerDigest = await objectDigest(pkg.header), payloadDigest = await objectDigest(pkg.payload);
    const context = wrapContext(headerDigest, payloadDigest, card, wrapped.index, wrapped.ephemeralKey);
    wrapping = await hkdf(shared, fromHex(headerDigest), new TextDecoder().decode(context));
    share = await unseal(wrapping, wrapped.sealed, context);
    requireThat(share.length === 33 && await digest(share) === wrapped.commitment, 'Recovered share failed its integrity check.');
    return {format: FORMATS.contribution, packageId: pkg.header.packageId, fingerprint: receipt.fingerprint, account, index: wrapped.index, share: base64(share)};
  } finally { shared?.fill(0); wrapping?.fill(0); share?.fill(0); }
}
export async function recoverFile(pkg, receipt, contributions) {
  await verifyReceipt(pkg, receipt);
  requireThat(Array.isArray(contributions) && contributions.length >= pkg.header.threshold && contributions.length <= pkg.header.recipients.length, 'This package needs at least ' + pkg.header.threshold + ' different recovery shares.');
  const seen = new Set(), raw = [];
  let master;
  try {
    for (const contribution of contributions) {
      shape(contribution, ['format', 'packageId', 'fingerprint', 'account', 'index', 'share']);
      requireThat(contribution.format === FORMATS.contribution, 'Unsupported contribution format.');
      requireThat(contribution.packageId === pkg.header.packageId && contribution.fingerprint === receipt.fingerprint, 'Recovery share belongs to a different package.');
      const i = contribution.index - 1;
      requireThat(Number.isInteger(i) && i >= 0 && i < pkg.wrapped.length && contribution.account === pkg.header.recipients[i].account, 'Invalid recovery share index or account.');
      requireThat(!seen.has(i), 'Duplicate recovery share.'); seen.add(i);
      const share = unbase64(contribution.share, 33); raw.push(share);
      requireThat(share.length === 33 && await digest(share) === pkg.wrapped[i].commitment, 'A recovery share has changed or is incorrect.');
    }
    master = await combine(raw.slice(0, pkg.header.threshold));
    const data = await unseal(master, pkg.payload, bytes(canonical(pkg.header)));
    requireThat(data.length === pkg.header.file.size, 'Recovered file size does not match.');
    return {data, fileName: pkg.header.file.name, mime: pkg.header.file.mime};
  } finally { master?.fill(0); for (const share of raw) share.fill(0); }
}
