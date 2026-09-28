import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Wallet, getBytes } from 'ethers';
import {
  FORMATS, REUSABLE_FORMATS, KEY_SCHEME, createInvitation, derivationRequest,
  registrationRequest, deriveIdentity, createCard, validateCard, createPackage,
  validatePackage, verifyReceipt, openShare, recoverFile, canonical, hex,
  fromHex, objectDigest, unbase64, base64,
} from '../src/crypto.mjs';
import { enrollReusable, recreate } from '../src/wallet.mjs';
import { DEMO_DATABASE } from './fixtures/keepass-data.mjs';

const sign = (wallet, request) => request.method === 'eip712'
  ? wallet.signTypedData(request.domain, request.types, request.message)
  : wallet.signMessage(request.message);
function provider(wallet) {
  const calls = [];
  return { calls, async request({method, params}) {
    calls.push(method);
    if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [wallet.address];
    if (method === 'eth_chainId') return '0x1';
    if (method === 'personal_sign') return wallet.signMessage(getBytes(params[0]));
    if (method === 'eth_signTypedData_v4') {
      const {domain, types, message} = JSON.parse(params[1]); delete types.EIP712Domain;
      return wallet.signTypedData(domain, types, message);
    }
    throw new Error('Unexpected wallet call: ' + method);
  }};
}
async function member(method = 'eip712', invitation = null) {
  const wallet = Wallet.createRandom();
  const signature = await sign(wallet, derivationRequest(invitation, wallet.address, method));
  const identity = await deriveIdentity(invitation, wallet.address, method, signature);
  const proof = await sign(wallet, registrationRequest(invitation, wallet.address, method, identity.publicKey));
  return {wallet, signature, identity, card: createCard(invitation, wallet.address, method, identity.publicKey, proof)};
}
function combinations(xs, n) {
  return n ? xs.flatMap((x,i)=>combinations(xs.slice(i+1),n-1).map(t=>[x,...t])) : [[]];
}
function permutations(xs) {
  return xs.length ? xs.flatMap((x,i)=>permutations(xs.filter((_,j)=>j!==i)).map(t=>[x,...t])) : [[]];
}
const members = await Promise.all(Array.from({length:5},(_,i)=>member(i===4?'personal_sign':'eip712')));
const cards = members.map(m=>m.card), data = unbase64(DEMO_DATABASE);
const first = await createPackage({cards, threshold:3, fileName:'greenbox-demo.kdbx', label:'Release 1', data});
const shares = await Promise.all(members.map(m=>openShare(first.package,first.receipt,m.identity,m.wallet.address)));

test('a wallet creates its reusable card without an invitation in either signing method', async () => {
  for (const method of ['eip712','personal_sign']) {
    const wallet = Wallet.createRandom(), p = provider(wallet);
    const card = await enrollReusable(p, wallet.address, method);
    assert.equal(card.format, REUSABLE_FORMATS.card);
    assert.equal(card.keyScheme, KEY_SCHEME);
    assert.ok(!('invitation' in card));
    assert.equal(p.calls.filter(c=>c === (method==='eip712'?'eth_signTypedData_v4':'personal_sign')).length,3);
    const restored = await recreate(provider(new Wallet(wallet.privateKey)),card);
    assert.equal(restored.publicKey,card.publicKey);
    restored.secret.fill(0);
  }
});
test('creating the same reusable card again gives the same key; method remains significant', async () => {
  const wallet = members[0].wallet;
  const again = await enrollReusable(provider(wallet),wallet.address,'eip712');
  assert.deepEqual(again,members[0].card);
  const readable = await enrollReusable(provider(wallet),wallet.address,'personal_sign');
  assert.notEqual(readable.publicKey,again.publicKey);
});
test('successive releases and different thresholds reuse the exact cards without wallet calls', async () => {
  const before = canonical(cards);
  const secondData = new TextEncoder().encode('Release 2 updated contents');
  const second = await createPackage({cards:JSON.parse(before),threshold:4,fileName:'release-2.txt',label:'A different backup name',data:secondData});
  assert.equal(second.package.format,REUSABLE_FORMATS.package);
  assert.equal(second.receipt.format,REUSABLE_FORMATS.receipt);
  assert.ok(!('invitation' in second.package.header));
  assert.ok(!('recoveryId' in second.receipt));
  assert.equal(canonical(second.package.header.recipients),before);
  assert.notEqual(first.package.header.packageId,second.package.header.packageId);
  assert.notEqual(first.receipt.fingerprint,second.receipt.fingerprint);
  const contributions=await Promise.all(members.slice(0,4).map(m=>openShare(second.package,second.receipt,m.identity,m.wallet.address)));
  assert.deepEqual((await recoverFile(second.package,second.receipt,contributions)).data,secondData);
  await assert.rejects(recoverFile(second.package,second.receipt,[shares[0],...contributions.slice(1)]),/different package/);
  await assert.rejects(verifyReceipt(second.package,first.receipt),/receipt/);
  assert.equal(canonical(cards),before);
});
test('v2 recovers the genuine KeePass bytes for all 60 three-of-five combinations and orders', async () => {
  let count=0;
  for(const group of combinations(shares,3)) for(const order of permutations(group)) {
    const copied=JSON.parse(JSON.stringify(first));
    assert.deepEqual((await recoverFile(copied.package,copied.receipt,order)).data,data); count++;
  }
  assert.equal(count,60);
});
test('v2 rejects one or two shares, duplicates and incorrect private keys', async () => {
  for(const n of [1,2]) for(const group of combinations(shares,n)) await assert.rejects(recoverFile(first.package,first.receipt,group),/3/);
  await assert.rejects(recoverFile(first.package,first.receipt,[shares[0],shares[0],shares[1]]),/Duplicate/);
  await assert.rejects(openShare(first.package,first.receipt,members[1].identity,members[0].wallet.address),/key/);
});
test('unchanged legacy v1 vectors still reproduce signatures, keys and the original encrypted file', async () => {
  const fixture=JSON.parse(await readFile(new URL('./fixtures/legacy-v1.json',import.meta.url)));
  const contributions=[];
  for(const m of fixture.members) {
    const wallet=new Wallet(m.dummyPrivateKey);
    const signature=await sign(wallet,derivationRequest(m.card.invitation,wallet.address,m.card.method));
    assert.equal(signature,m.privateSignature);
    const identity=await recreate(provider(wallet),m.card);
    assert.equal(hex(identity.secret),m.derivedSecret);
    contributions.push(await openShare(fixture.package,fixture.receipt,identity,wallet.address));
    identity.secret.fill(0);
  }
  assert.equal(new TextDecoder().decode((await recoverFile(fixture.package,fixture.receipt,[contributions[4],contributions[0],contributions[2]])).data),fixture.plaintext);
});
test('previously downloaded real dummy v1 package and contributions remain recoverable', async () => {
  const folder=new URL('./fixtures/legacy-downloads/',import.meta.url);
  const load=async name=>JSON.parse(await readFile(new URL(name,folder)));
  const pkg=await load('greenbox-package.json'), receipt=await load('greenbox-receipt.json');
  const contributions=await Promise.all([5,1,3].map(i=>load(`greenbox-SECRET-share-${i}.json`)));
  assert.deepEqual((await recoverFile(pkg,receipt,contributions)).data,data);
});
test('legacy public cards from different invitations mix with new cards without new enrollment', async () => {
  const oldA=await member('eip712',createInvitation('Older setup A'));
  const oldB=await member('personal_sign',createInvitation('Older setup B'));
  const mixed=[members[0],oldA,oldB];
  const savedCards=JSON.stringify(mixed.map(m=>m.card));
  const pkg=await createPackage({cards:JSON.parse(savedCards),threshold:2,fileName:'mixed.kdbx',data});
  const contributions=[];
  for(const m of mixed){
    const identity=await recreate(provider(m.wallet),m.card);
    contributions.push(await openShare(pkg.package,pkg.receipt,identity,m.wallet.address));
    identity.secret.fill(0);
  }
  for(const group of combinations(contributions,2)) assert.deepEqual((await recoverFile(pkg.package,pkg.receipt,group)).data,data);
  assert.equal(JSON.stringify(mixed.map(m=>m.card)),savedCards);
});
test('v2 private signatures and public proofs have distinct domains; secrets are never exported', async () => {
  const exported=canonical({...first,cards});
  for(const m of members){
    await assert.rejects(deriveIdentity(null,m.wallet.address,m.card.method,m.card.proof),/Signature/);
    for(const secret of [m.signature,hex(m.identity.secret),m.wallet.privateKey]) assert.ok(!exported.includes(secret.slice(2)));
  }
});
test('v1 and reusable signatures cannot be silently exchanged', async () => {
  const m=members[0],invitation=createInvitation();
  const signature=await sign(m.wallet,derivationRequest(invitation,m.wallet.address,m.card.method));
  await assert.rejects(deriveIdentity(null,m.wallet.address,m.card.method,signature),/Signature/);
  await assert.rejects(deriveIdentity(invitation,m.wallet.address,m.card.method,m.signature),/Signature/);
});
test('unknown or relabeled card, scheme, package and receipt versions fail closed', async () => {
  const badCard={...cards[0],keyScheme:'future-scheme'};
  assert.throws(()=>validateCard(badCard),/scheme|version/i);
  assert.throws(()=>validateCard({...cards[0],format:FORMATS.card}),/fields|version/i);
  assert.throws(()=>validateCard({...cards[0],publicKey:cards[1].publicKey}),/Signature/);
  assert.throws(()=>validatePackage({...first.package,format:FORMATS.package}),/fields/);
  await assert.rejects(verifyReceipt(first.package,{...first.receipt,format:FORMATS.receipt}),/receipt/i);
  await assert.rejects(createPackage({cards:[cards[0],cards[0]],threshold:2,fileName:'x',data}),/Duplicate/);
});
test('v2 rejects tampered public metadata and AEAD rejects modified ciphertext despite a replacement receipt', async () => {
  for(const modify of [p=>p.header.label='Changed',p=>p.header.threshold=2]) {
    const p=structuredClone(first.package);modify(p);
    await assert.rejects(verifyReceipt(p,first.receipt),/receipt/i);
  }
  const p=structuredClone(first.package),raw=unbase64(p.payload.ciphertext);raw[0]^=1;p.payload.ciphertext=base64(raw);
  const receipt={...first.receipt,fingerprint:await objectDigest(p)};
  await assert.rejects(recoverFile(p,receipt,shares.slice(0,3).map(s=>({...s,fingerprint:receipt.fingerprint}))),/Decryption failed/);
});
