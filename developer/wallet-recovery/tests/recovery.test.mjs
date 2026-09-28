import test from 'node:test';
import assert from 'node:assert/strict';
import { Wallet } from 'ethers';
import { DEMO_DATABASE } from './fixtures/keepass-data.mjs';
import {
  createInvitation, derivationRequest, registrationRequest, deriveIdentity, createCard,
  createPackage, openShare, recoverFile, validateCard, validatePackage, normalizeSignature,
  verifyReceipt, hex, fromHex, canonical, objectDigest, base64, unbase64,
} from '../src/crypto.mjs';

async function signed(wallet, request) {
  return request.method === 'eip712'
    ? wallet.signTypedData(request.domain, request.types, request.message)
    : wallet.signMessage(request.message);
}
async function member(invitation, method = 'eip712') {
  const wallet = Wallet.createRandom();
  const signature = await signed(wallet, derivationRequest(invitation, wallet.address, method));
  const identity = await deriveIdentity(invitation, wallet.address, method, signature);
  const proof = await signed(wallet, registrationRequest(invitation, wallet.address, method, identity.publicKey));
  const card = createCard(invitation, wallet.address, method, identity.publicKey, proof);
  return {wallet, identity, card, signature};
}
function combinations(xs, n) {
  if (!n) return [[]];
  return xs.flatMap((x, i) => combinations(xs.slice(i + 1), n - 1).map(t => [x, ...t]));
}
function permutations(xs) {
  if (!xs.length) return [[]];
  return xs.flatMap((x, i) => permutations(xs.filter((_, j) => j !== i)).map(t => [x, ...t]));
}
const invitation = createInvitation('Test recovery');
const members = await Promise.all(Array.from({length: 5}, (_, i) => member(invitation, i === 4 ? 'personal_sign' : 'eip712')));
const data = unbase64(DEMO_DATABASE);
const built = await createPackage({invitation, cards: members.map(m => m.card), threshold: 3, fileName: 'greenbox-demo.kdbx', data});
const shares = await Promise.all(members.map(m => openShare(built.package, built.receipt, m.identity, m.wallet.address)));

test('all ten groups of three recover the actual dummy KeePass bytes in every order', async () => {
  let count = 0;
  for (const group of combinations(shares, 3)) for (const order of permutations(group)) {
    const recovered = await recoverFile(built.package, built.receipt, order);
    assert.deepEqual(recovered.data, data);
    assert.equal(recovered.fileName, 'greenbox-demo.kdbx');
    count++;
  }
  assert.equal(count, 60);
});
test('every group of one or two is rejected', async () => {
  for (const n of [1, 2]) for (const group of combinations(shares, n))
    await assert.rejects(recoverFile(built.package, built.receipt, group), /three|3|enough|threshold/i);
});
test('four and five valid contributions also recover', async () => {
  for (const n of [4, 5]) assert.deepEqual((await recoverFile(built.package, built.receipt, shares.slice(0, n))).data, data);
});
test('duplicate shares cannot satisfy the threshold', async () => {
  await assert.rejects(recoverFile(built.package, built.receipt, [shares[0], shares[0], shares[1]]), /duplicate/i);
});
test('tampering with encrypted payload fails receipt validation', async () => {
  const changed = structuredClone(built.package);
  changed.payload.ciphertext = (changed.payload.ciphertext[0] === 'A' ? 'B' : 'A') + changed.payload.ciphertext.slice(1);
  await assert.rejects(recoverFile(changed, built.receipt, shares.slice(0, 3)), /receipt|fingerprint/i);
});
test('wrong share contents fail their commitment check', async () => {
  const changed = structuredClone(shares[0]);
  changed.share = (changed.share[0] === 'A' ? 'B' : 'A') + changed.share.slice(1);
  await assert.rejects(recoverFile(built.package, built.receipt, [changed, shares[1], shares[2]]), /share|changed/i);
});
test('AES-GCM rejects tampered payload even if an attacker supplies a replacement receipt', async () => {
  const changed = structuredClone(built.package);
  const ciphertext = unbase64(changed.payload.ciphertext); ciphertext[0] ^= 1;
  changed.payload.ciphertext = base64(ciphertext);
  const receipt = {...built.receipt, fingerprint: await objectDigest(changed)};
  const relabeled = shares.slice(0, 3).map(s => ({...s, fingerprint: receipt.fingerprint}));
  await assert.rejects(recoverFile(changed, receipt, relabeled), /Decryption failed/);
});
test('AEAD rejects modified encrypted shares even with a replacement receipt', async () => {
  const changed = structuredClone(built.package);
  const ciphertext = unbase64(changed.wrapped[0].sealed.ciphertext); ciphertext[0] ^= 1;
  changed.wrapped[0].sealed.ciphertext = base64(ciphertext);
  const receipt = {...built.receipt, fingerprint: await objectDigest(changed)};
  await assert.rejects(openShare(changed, receipt, members[0].identity, members[0].wallet.address), /Decryption failed/);
});
test('base64 validates large backups without a repeated-group regex stack overflow', () => {
  const input = new Uint8Array(2 * 1024 * 1024).fill(173);
  assert.deepEqual(unbase64(base64(input)), input);
  for (const invalid of ['A', 'AAAA=', 'A===', 'AB==', 'AA=A', ' AA==']) assert.throws(() => unbase64(invalid));
});
test('changing the threshold cannot make two shares sufficient', async () => {
  const changed = structuredClone(built.package);
  changed.header.threshold = 2;
  await assert.rejects(recoverFile(changed, built.receipt, shares.slice(0, 2)), /receipt|fingerprint/i);
});
test('share and receipt from another package are rejected', async () => {
  const other = await createPackage({invitation, cards: members.map(m => m.card), threshold: 3, fileName: 'other.txt', data: new TextEncoder().encode('other')});
  const foreign = await openShare(other.package, other.receipt, members[0].identity, members[0].wallet.address);
  await assert.rejects(recoverFile(built.package, built.receipt, [foreign, shares[1], shares[2]]), /package/i);
  await assert.rejects(verifyReceipt(built.package, other.receipt), /receipt|fingerprint/i);
});
test('wrong derived private key cannot decrypt someone else’s share', async () => {
  await assert.rejects(openShare(built.package, built.receipt, members[1].identity, members[0].wallet.address), /key|account/i);
});
test('public registration proof rejects a substituted encryption public key', () => {
  const card = structuredClone(members[0].card);
  card.publicKey = members[1].card.publicKey;
  assert.throws(() => validateCard(card), /proof|signature/i);
});
test('duplicate account and duplicate encryption key registrations are rejected', async () => {
  await assert.rejects(createPackage({invitation, cards: [members[0].card, members[0].card, members[1].card], threshold: 2, data, fileName: 'x'}), /duplicate/i);
});
test('a restored software wallet derives exactly the same key for each signing method', async () => {
  for (const method of ['eip712', 'personal_sign']) {
    const m = await member(invitation, method);
    const restored = new Wallet(m.wallet.privateKey);
    const signature = await signed(restored, derivationRequest(invitation, restored.address, method));
    const identity = await deriveIdentity(invitation, restored.address, method, signature);
    assert.equal(identity.publicKey, m.identity.publicKey);
    assert.deepEqual(identity.secret, m.identity.secret);
  }
});
test('signing method and recovery ID are separate derivation contexts', async () => {
  const m = members[0];
  const alternate = await signed(m.wallet, derivationRequest(invitation, m.wallet.address, 'personal_sign'));
  assert.notEqual((await deriveIdentity(invitation, m.wallet.address, 'personal_sign', alternate)).publicKey, m.identity.publicKey);
  const other = createInvitation('Other');
  const signature = await signed(m.wallet, derivationRequest(other, m.wallet.address, 'eip712'));
  assert.notEqual((await deriveIdentity(other, m.wallet.address, 'eip712', signature)).publicKey, m.identity.publicKey);
});
test('an ordinary registration signature cannot be used as the private derivation signature', async () => {
  await assert.rejects(deriveIdentity(invitation, members[0].wallet.address, 'eip712', members[0].card.proof), /signature|account/i);
});
test('r/s normalization gives one encoding for high-s and v=0/1 equivalents', () => {
  const normalized = normalizeSignature(members[0].signature);
  const raw = fromHex(normalized);
  raw[64] -= 27;
  assert.equal(normalizeSignature(hex(raw)), normalized);
  const n = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');
  const highS = (n - BigInt('0x' + normalized.slice(66, 130))).toString(16).padStart(64, '0');
  const alternate = normalized.slice(0, 66) + highS + (raw[64] === 0 ? '1c' : '1b');
  assert.equal(normalizeSignature(alternate), normalized);
});
test('invalid signatures and unsupported protocol versions fail closed', async () => {
  assert.throws(() => normalizeSignature('0x' + '00'.repeat(65)), /signature/i);
  await assert.rejects(deriveIdentity(invitation, members[1].wallet.address, 'eip712', members[0].signature), /signature|account/i);
  const altered = structuredClone(built.package); altered.format = 'future-version';
  assert.throws(() => validatePackage(altered), /format|version/i);
});
test('exported public artifacts contain no private derivation signatures or private keys', () => {
  const exported = canonical({invitation, cards: members.map(m => m.card), package: built.package, receipt: built.receipt});
  for (const m of members) {
    assert.ok(!exported.includes(m.signature.slice(2)));
    assert.ok(!exported.includes(hex(m.identity.secret).slice(2)));
    assert.ok(!exported.includes(m.wallet.privateKey.slice(2)));
  }
});

export {signed, member};
