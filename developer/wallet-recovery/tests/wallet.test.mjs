import test from 'node:test';
import assert from 'node:assert/strict';
import { Wallet, getBytes } from 'ethers';
import { createInvitation, deriveIdentity, derivationRequest, GreenboxError } from '../src/crypto.mjs';
import { enroll, recreate, discoverWallets } from '../src/wallet.mjs';

function mockProvider(wallet, overrides = {}) {
  const calls = [];
  return {calls, async request({method, params}) {
    calls.push(method);
    if (overrides[method]) return overrides[method](params);
    if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [wallet.address];
    if (method === 'eth_chainId') return '0x1';
    if (method === 'eth_signTypedData_v4') {
      const {domain, types, message} = JSON.parse(params[1]); delete types.EIP712Domain;
      return wallet.signTypedData(domain, types, message);
    }
    if (method === 'personal_sign') return wallet.signMessage(getBytes(params[0]));
    throw new Error('Unexpected wallet request');
  }};
}
test('enrollment uses two private signatures and a distinct public registration proof', async () => {
  const wallet = Wallet.createRandom(), provider = mockProvider(wallet), invitation = createInvitation('Wallet test');
  const card = await enroll(provider, invitation, wallet.address, 'eip712');
  assert.equal(card.account, wallet.address.toLowerCase());
  assert.equal(provider.calls.filter(x => x === 'eth_signTypedData_v4').length, 3);
  assert.ok(!provider.calls.some(x => /sendTransaction|eth_sign$|decrypt/.test(x)));
  const identity = await recreate(provider, card);
  assert.equal(identity.publicKey, card.publicKey);
  identity.secret.fill(0);
});
test('hardware-compatible personal_sign is explicit and does not silently change methods', async () => {
  const wallet = Wallet.createRandom(), provider = mockProvider(wallet);
  await enroll(provider, createInvitation(), wallet.address, 'personal_sign');
  assert.equal(provider.calls.filter(x => x === 'personal_sign').length, 3);
  assert.equal(provider.calls.filter(x => x === 'eth_signTypedData_v4').length, 0);
});
test('user rejection stops immediately without a fallback or repeated signing', async () => {
  const wallet = Wallet.createRandom();
  const provider = mockProvider(wallet, {eth_signTypedData_v4: () => { throw {code: 4001, message: 'private wallet details'}; }});
  await assert.rejects(enroll(provider, createInvitation(), wallet.address, 'eip712'), e => e instanceof GreenboxError && !e.message.includes('private wallet details') && /declined/i.test(e.message));
  assert.equal(provider.calls.filter(x => x === 'eth_signTypedData_v4').length, 1);
  assert.ok(!provider.calls.includes('personal_sign'));
});
test('an account change during a signing request aborts', async () => {
  const wallet = Wallet.createRandom(), other = Wallet.createRandom();
  let checks = 0;
  const provider = mockProvider(wallet, {eth_accounts: () => (++checks <= 1 ? [wallet.address] : [other.address])});
  await assert.rejects(enroll(provider, createInvitation(), wallet.address, 'eip712'), /account changed/i);
});
test('wrong chain aborts EIP-712 without switching networks automatically', async () => {
  const wallet = Wallet.createRandom();
  const provider = mockProvider(wallet, {eth_chainId: () => '0x89'});
  await assert.rejects(enroll(provider, createInvitation(), wallet.address, 'eip712'), /Ethereum mainnet/i);
  assert.ok(!provider.calls.includes('eth_signTypedData_v4'));
});
test('different signatures for one message fail repeatability even when both are valid', async () => {
  const { secp256k1 } = await import('@noble/curves/secp256k1.js');
  const { TypedDataEncoder } = await import('ethers');
  const wallet = Wallet.createRandom(); let count = 0;
  const provider = mockProvider(wallet, {eth_signTypedData_v4: params => {
    const {domain, types, message} = JSON.parse(params[1]); delete types.EIP712Domain;
    const digest = getBytes(TypedDataEncoder.hash(domain, types, message));
    // Extra entropy gives different valid ECDSA signatures, modelling a signer
    // that doesn't guarantee deterministic signatures.
    const recovered = secp256k1.sign(digest, getBytes(wallet.privateKey), {prehash: false, extraEntropy: new Uint8Array(32).fill(++count), format: 'recovered'});
    return '0x' + Buffer.from(recovered.subarray(1)).toString('hex') + (recovered[0] + 27).toString(16);
  }});
  await assert.rejects(enroll(provider, createInvitation(), wallet.address, 'eip712'), /repeat|same key|different/i);
});
test('EIP-6963 discovery separates providers and discards duplicate announcements', () => {
  class Surface extends EventTarget {}
  const surface = new Surface(), seen = [];
  const stop = discoverWallets(surface, list => seen.push(list));
  const p1 = mockProvider(Wallet.createRandom()), p2 = mockProvider(Wallet.createRandom());
  for (const [provider, uuid, name] of [[p1,'a','Rabby'],[p2,'b','MetaMask'],[p1,'a','Rabby']]) {
    const event = new Event('eip6963:announceProvider');
    event.detail = {info: {uuid, name, rdns: name === 'Rabby' ? 'io.rabby' : 'io.metamask'}, provider};
    surface.dispatchEvent(event);
  }
  assert.equal(seen.at(-1).length, 2);
  assert.equal(seen.at(-1)[0].provider, p1);
  assert.equal(seen.at(-1)[1].provider, p2);
  stop();
});
