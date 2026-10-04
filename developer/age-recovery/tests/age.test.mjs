import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generateHybridIdentity, generateX25519Identity, identityToRecipient, Encrypter } from 'age-encryption';
import { parseRecipient, parseIdentity, recipientCard, createPackage, openShare,
  recoverFile, validatePackage, verifyReceipt, validateContribution, unbase64,
  objectDigest, FORMATS } from '../src/crypto.mjs';

const identities = await Promise.all(Array.from({length:5}, () => generateHybridIdentity()));
const cards = await Promise.all(identities.map(async (key,i) => recipientCard(await identityToRecipient(key), 'Heir '+(i+1))));
const data = new TextEncoder().encode('Disposable Greenbox age interoperability challenge.');
const make = () => createPackage({cards, threshold:3, fileName:'bundle.tar', data});
const saved = await make();
const shares = await Promise.all(identities.map(key => openShare(saved.package,saved.receipt,key)));
const permutations = a => a.length ? a.flatMap((x,i)=>permutations(a.filter((_,j)=>j!==i)).map(p=>[x,...p])) : [[]];

test('all ten groups of three recover in all six orders', async () => {
  let count=0;
  for(let a=0;a<3;a++)for(let b=a+1;b<4;b++)for(let c=b+1;c<5;c++) {
    for(const group of permutations([shares[a],shares[b],shares[c]])) {
      const out=await recoverFile(saved.package,saved.receipt,group);
      assert.deepEqual(out.data,data); out.data.fill(0); count++;
    }
  }
  assert.equal(count,60);
});
test('too few, duplicate, and altered shares fail', async () => {
  await assert.rejects(recoverFile(saved.package,saved.receipt,shares.slice(0,2)),/at least 3/);
  await assert.rejects(recoverFile(saved.package,saved.receipt,[shares[0],shares[0],shares[1]]),/Duplicate/);
  const changed=structuredClone(shares[0]);changed.share=shares[1].share;
  await assert.rejects(validateContribution(saved.package,saved.receipt,changed),/incorrect|changed/);
});
test('a later backup reuses keys but gets independent keys, shares and receipt', async () => {
  const next=await make();
  assert.deepEqual(next.package.header.recipients,saved.package.header.recipients);
  assert.notEqual(next.package.payload.ciphertext,saved.package.payload.ciphertext);
  const nextShares=await Promise.all(identities.slice(0,3).map(key=>openShare(next.package,next.receipt,key)));
  assert.notEqual(nextShares[0].share,shares[0].share);
  assert.deepEqual((await recoverFile(next.package,next.receipt,nextShares)).data,data);
  await assert.rejects(recoverFile(next.package,next.receipt,shares.slice(0,3)),/different package/);
});
test('saved identity recreates its public recipient without a signing implementation', async () => {
  const text='# created by age-keygen\n# public key: '+cards[0].recipient+'\n'+identities[0]+'\n';
  assert.equal(parseIdentity(text),identities[0]);
  assert.equal(await identityToRecipient(parseIdentity(text)),cards[0].recipient);
  assert.equal(parseRecipient('# heir\n'+cards[0].recipient+'\r\n'),cards[0].recipient);
});
test('classic keys, secret keys in public input, multiple keys and bad checksums fail', async () => {
  const classical=await generateX25519Identity();
  assert.throws(()=>parseRecipient(identities[0]),/private key/i);
  assert.throws(()=>parseRecipient(cards[0].recipient+'\n'+cards[1].recipient),/one/);
  assert.throws(()=>parseRecipient(cards[0].recipient.slice(0,-1)+(cards[0].recipient.endsWith('q')?'p':'q')),/Invalid|post-quantum/);
  assert.throws(()=>parseRecipient('x'.repeat(20000)),/large/);
  assert.throws(()=>parseIdentity(classical),/post-quantum/);
  assert.throws(()=>parseIdentity(identities.join('\n')),/one/);
  const classicRecipient=await identityToRecipient(classical);
  assert.throws(()=>parseRecipient(classicRecipient),/post-quantum/);
});
test('wrong heir key cannot open a share', async () => {
  await assert.rejects(openShare(saved.package,saved.receipt,await generateHybridIdentity()),/not a custodian/);
});
test('package tampering and receipt substitution are rejected', async () => {
  const changed=structuredClone(saved.package); changed.header.label='Replaced';
  await assert.rejects(verifyReceipt(changed,saved.receipt),/receipt/);
  const receipt={...saved.receipt,fingerprint:await objectDigest(changed)};
  await assert.rejects(openShare(changed,receipt,identities[0]),/different package/);
  const corrupt=structuredClone(saved.package); corrupt.payload.ciphertext=corrupt.payload.ciphertext.slice(0,-4)+'AAAA';
  await assert.rejects(verifyReceipt(corrupt,saved.receipt));
});
test('legacy formats fail with migration instructions', () => {
  assert.throws(()=>validatePackage({format:'greenbox.wallet.package/2'}),/previous release|legacy/i);
});
test('duplicate recipients and invalid thresholds fail before encryption', async () => {
  await assert.rejects(createPackage({cards:[cards[0],cards[0]],threshold:2,fileName:'x',data}),/Duplicate/);
  for(const threshold of [0,1,6,2.5]) await assert.rejects(createPackage({cards,threshold,fileName:'x',data}),/threshold/);
});
test('Go age restores keys and decrypts every browser-encrypted share', async () => {
  const dir=await mkdtemp(path.join(tmpdir(),'greenbox-age-interop-'));
  try {
    assert.match(execFileSync('age',['--version'],{encoding:'utf8'}),/^v?1\./);
    for(let i=0;i<5;i++) {
      const key=path.join(dir,'heir.key'), encrypted=path.join(dir,'share.age');
      await writeFile(key,identities[i]+'\n',{mode:0o600});
      assert.equal(execFileSync('age-keygen',['-y',key],{encoding:'utf8'}).trim(),cards[i].recipient);
      await writeFile(encrypted,unbase64(saved.package.wrapped[i].age));
      const contribution=JSON.parse(execFileSync('age',['-d','-i',key,encrypted],{encoding:'utf8'}));
      assert.deepEqual(contribution,shares[i]);
    }
    const key=path.join(dir,'cli.key');
    execFileSync('age-keygen',['-pq','-o',key],{stdio:'pipe'});
    const identity=parseIdentity(await readFile(key,'utf8'));
    const recipient=execFileSync('age-keygen',['-y',key],{encoding:'utf8'}).trim();
    const cliCard=await recipientCard(recipient,'CLI heir');
    const cliPackage=await createPackage({cards:[cliCard,cards[0]],threshold:2,fileName:'x',data});
    const opened=await openShare(cliPackage.package,cliPackage.receipt,identity);
    assert.equal(opened.format,FORMATS.contribution);
    // A CLI re-encryption of the same contribution can be opened by the browser.
    const recipientFile=path.join(dir,'heir.recipient');await writeFile(recipientFile,recipient+'\n');
    const cipher=execFileSync('age',['-R',recipientFile],{input:JSON.stringify(opened)});
    cliPackage.package.wrapped[0].age=cipher.toString('base64');
    cliPackage.receipt.fingerprint=await objectDigest(cliPackage.package);
    assert.deepEqual(await openShare(cliPackage.package,cliPackage.receipt,identity),opened);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('encrypted shares cannot be swapped, downgraded or rebound to another recipient', async()=>{
  const swapped=structuredClone(saved.package);
  [swapped.wrapped[0].age,swapped.wrapped[1].age]=[swapped.wrapped[1].age,swapped.wrapped[0].age];
  await assert.rejects(openShare(swapped,{...saved.receipt,fingerprint:await objectDigest(swapped)},identities[0]),/decrypt/i);
  const e=new Encrypter();e.addRecipient(await identityToRecipient(await generateX25519Identity()));
  const downgraded=structuredClone(saved.package);downgraded.wrapped[0].age=Buffer.from(await e.encrypt('secret')).toString('base64');
  assert.throws(()=>validatePackage(downgraded),/post-quantum/);
  const wrong={...shares[0],recipientId:cards[1].id};
  await assert.rejects(validateContribution(saved.package,saved.receipt,wrong),/recipient/);
  const forged=structuredClone(saved.package);forged.header.recipients[0].id='a'.repeat(64);
  await assert.rejects(verifyReceipt(forged,{...saved.receipt,fingerprint:await objectDigest(forged)}),/fingerprint/i);
});

test('threshold endpoints 2-of-2 and 10-of-10 restore binary files',async()=>{
  for(const n of [2,10]){
    const keys=await Promise.all(Array.from({length:n},()=>generateHybridIdentity()));
    const recipients=await Promise.all(keys.map(async k=>recipientCard(await identityToRecipient(k))));
    const binary=Uint8Array.from({length:1024},(_,i)=>i%256);
    const p=await createPackage({cards:recipients,threshold:n,fileName:'binary.dat',data:binary});
    const parts=await Promise.all(keys.map(k=>openShare(p.package,p.receipt,k)));
    assert.deepEqual((await recoverFile(p.package,p.receipt,parts.reverse())).data,binary);
  }
});

test('6-of-10 requires six distinct shares and recovers in any supplied order',async()=>{
  const keys=await Promise.all(Array.from({length:10},()=>generateHybridIdentity()));
  const recipients=await Promise.all(keys.map(async key=>recipientCard(await identityToRecipient(key))));
  const p=await createPackage({cards:recipients,threshold:6,fileName:'six-of-ten.dat',data});
  assert.equal(p.package.header.threshold,6);
  assert.equal(p.package.header.recipients.length,10);
  const parts=await Promise.all(keys.map(key=>openShare(p.package,p.receipt,key)));
  const order=[9,1,7,0,5,3].map(i=>parts[i]);
  await assert.rejects(recoverFile(p.package,p.receipt,order.slice(0,5)),/at least 6/);
  await assert.rejects(recoverFile(p.package,p.receipt,[...order.slice(0,5),order[0]]),/Duplicate/);
  assert.deepEqual((await recoverFile(p.package,p.receipt,order)).data,data);
  assert.deepEqual((await recoverFile(p.package,p.receipt,order.reverse())).data,data);
  assert.deepEqual((await recoverFile(p.package,p.receipt,parts.reverse())).data,data);
});

test('the advertised 32 MiB file size round-trips without parser failure',async()=>{
  const large=new Uint8Array(32*1024*1024);large[0]=255;large[large.length-1]=127;
  const p=await createPackage({cards:cards.slice(0,2),threshold:2,fileName:'large.dat',data:large});
  const parts=await Promise.all(identities.slice(0,2).map(k=>openShare(p.package,p.receipt,k)));
  assert.deepEqual((await recoverFile(p.package,p.receipt,parts)).data,large);
});
