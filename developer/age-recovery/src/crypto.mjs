// age handles hybrid post-quantum share encryption. Shamir sets the threshold.
import { Encrypter, Decrypter, identityToRecipient } from 'age-encryption';
import { split, combine } from 'shamir-secret-sharing';

export const MAX_FILE = 32 * 1024 * 1024;
export const FORMATS = Object.freeze({package:'greenbox.age.package/1', receipt:'greenbox.age.receipt/1', contribution:'greenbox.age.share/1'});
export const SUITE = 'age-MLKEM768-X25519-AES256GCM-SSS-GF256-v1';
const encoder = new TextEncoder();
export class GreenboxError extends Error {
  constructor(message, code='INVALID_INPUT') { super(message); this.name='GreenboxError'; this.code=code; }
}
function requireThat(ok,message,code) { if(!ok) throw new GreenboxError(message,code); }
export const bytes = text => encoder.encode(text);
export const hex = value => Array.from(value,b=>b.toString(16).padStart(2,'0')).join('');
const random = n => crypto.getRandomValues(new Uint8Array(n));
export const digest = async value => hex(new Uint8Array(await crypto.subtle.digest('SHA-256',value)));
export function canonical(value) {
  if(Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
  if(value!==null && typeof value==='object') return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
export const objectDigest = object => digest(bytes(canonical(object)));
export function base64(value) {
  let result=''; for(let i=0;i<value.length;i+=8192) result+=String.fromCharCode(...value.subarray(i,i+8192));
  return btoa(result);
}
export function unbase64(value,max=MAX_FILE+16) {
  requireThat(typeof value==='string' && value.length<=Math.ceil(max/3)*4 && value.length%4===0 && !/[^A-Za-z0-9+/=]/.test(value),'Invalid encoded data.');
  let decoded;try { decoded=atob(value); } catch { throw new GreenboxError('Invalid encoded data.'); }
  const out=new Uint8Array(decoded.length);for(let i=0;i<decoded.length;i++)out[i]=decoded.charCodeAt(i);
  requireThat(out.length<=max && base64(out)===value,'Invalid encoded data.'); return out;
}
function shape(value,keys) {
  requireThat(value && typeof value==='object' && !Array.isArray(value),'Expected a Greenbox object.');
  requireThat(Object.keys(value).sort().join('|')===[...keys].sort().join('|'),'Unexpected or missing fields.');
}
function text(value,max,title) {
  requireThat(typeof value==='string' && value.length>0 && value.length<=max && !/[\x00-\x1f\x7f]/.test(value),'Invalid '+title+'.'); return value;
}
function hash(value) { requireThat(typeof value==='string' && /^[a-f0-9]{64}$/.test(value),'Invalid fingerprint or identifier.'); }
function keyLine(value) {
  requireThat(typeof value==='string' && value.length<=16384,'Key file is empty or too large.');
  const lines=value.split(/\r?\n/).map(x=>x.trim()).filter(x=>x && !x.startsWith('#'));
  requireThat(lines.length===1,'Select a file containing exactly one key.'); return lines[0];
}
export function parseRecipient(value) {
  requireThat(typeof value==='string' && !value.includes('AGE-SECRET-KEY-'),'That is a private key. Share only the .recipient file.');
  const recipient=keyLine(value);
  requireThat(recipient.startsWith('age1pq1') && recipient===recipient.toLowerCase(),'Use a post-quantum age recipient created with age-keygen -pq.');
  try { const e=new Encrypter(); e.addRecipient(recipient); }
  catch { throw new GreenboxError('Invalid post-quantum age recipient or checksum.'); }
  return recipient;
}
export function parseIdentity(value) {
  const identity=keyLine(value);
  requireThat(identity.startsWith('AGE-SECRET-KEY-PQ-1'),'Select your unencrypted post-quantum heir.key file. For an encrypted identity, decrypt it locally with age first.');
  try { const d=new Decrypter(); d.addIdentity(identity); }
  catch { throw new GreenboxError('Invalid post-quantum private key or checksum.'); }
  return identity;
}
export async function recipientCard(value,label='Heir') {
  const recipient=parseRecipient(value); text(label,80,'heir name');
  return {recipient,label,id:await digest(bytes(recipient))};
}
function validateCard(card) {
  shape(card,['recipient','label','id']);text(card.label,80,'heir name');hash(card.id);parseRecipient(card.recipient); return card;
}
async function verifyCards(cards) {
  for(const card of cards) requireThat(card.id===await digest(bytes(card.recipient)),'Recipient fingerprint does not match its public key.');
}
async function seal(secret,data,header) {
  const iv=random(12), key=await crypto.subtle.importKey('raw',secret,'AES-GCM',false,['encrypt']);
  const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:bytes(canonical(header)),tagLength:128},key,data));
  return {iv:base64(iv),ciphertext:base64(ciphertext)};
}
async function unseal(secret,sealed,header) {
  try {
    const key=await crypto.subtle.importKey('raw',secret,'AES-GCM',false,['decrypt']);
    return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:unbase64(sealed.iv,12),additionalData:bytes(canonical(header)),tagLength:128},key,unbase64(sealed.ciphertext)));
  } catch { throw new GreenboxError('Decryption failed. The shares or encrypted backup are incorrect.','DECRYPTION_FAILED'); }
}
const contextDigest = pkg => objectDigest({header:pkg.header,payload:pkg.payload});
function validateAge(ciphertext) {
  // Require one native PQ recipient. Reject classic, passphrase and mixed envelopes.
  const input=unbase64(ciphertext,16384);
  const header=new TextDecoder().decode(input.subarray(0,8192)).split('\n--- ')[0];
  requireThat(header.startsWith('age-encryption.org/v1\n-> mlkem768x25519 ') && (header.match(/\n-> /g)||[]).length===1,'Share must be an age file with exactly one post-quantum recipient.');
  return input;
}
export async function createPackage({cards,threshold,fileName,mime='application/octet-stream',data,label='Greenbox backup'}) {
  text(label,80,'backup name');text(fileName,180,'file name');text(mime,100,'file type');
  requireThat(Array.isArray(cards) && cards.length>=2 && cards.length<=10,'Choose between 2 and 10 heirs.');
  requireThat(Number.isInteger(threshold) && threshold>=2 && threshold<=cards.length,'Invalid recovery threshold.');
  const recipients=cards.map(c=>structuredClone(validateCard(c)));
  requireThat(new Set(recipients.map(c=>c.recipient)).size===cards.length,'Duplicate heir public key.');
  await verifyCards(recipients);
  requireThat(data instanceof Uint8Array && data.length>0 && data.length<=MAX_FILE,'Choose a nonempty file up to 32 MiB.');
  const header={suite:SUITE,packageId:hex(random(32)),label,threshold,recipients,file:{name:fileName,size:data.length,mime}};
  const master=random(32);let shares=[];
  try {
    const payload=await seal(master,data,header), context=await contextDigest({header,payload});
    shares=await split(master,cards.length,threshold);
    const wrapped=[];
    for(let i=0;i<cards.length;i++) {
      const contribution={format:FORMATS.contribution,packageId:header.packageId,context,recipientId:recipients[i].id,index:i+1,share:base64(shares[i])};
      const e=new Encrypter();e.addRecipient(recipients[i].recipient);
      const plain=bytes(canonical(contribution));
      try { wrapped.push({index:i+1,commitment:await digest(shares[i]),age:base64(await e.encrypt(plain))}); }
      finally { plain.fill(0); }
    }
    const pkg={format:FORMATS.package,header,payload,wrapped};
    const receipt={format:FORMATS.receipt,packageId:header.packageId,fingerprint:await objectDigest(pkg)};
    return {package:pkg,receipt};
  } finally { master.fill(0);for(const share of shares)share.fill(0); }
}
export function validatePackage(pkg) {
  if(typeof pkg?.format==='string' && pkg.format.startsWith('greenbox.wallet.')) throw new GreenboxError('Legacy wallet package: use the previous release to recover it, then create an age package. See Legacy recovery in the guide.','LEGACY_FORMAT');
  shape(pkg,['format','header','payload','wrapped']);requireThat(pkg.format===FORMATS.package,'Unsupported package format or version.');
  const h=pkg.header;shape(h,['suite','packageId','label','threshold','recipients','file']);
  requireThat(h.suite===SUITE,'Unsupported encryption suite.');hash(h.packageId);text(h.label,80,'backup name');
  requireThat(Array.isArray(h.recipients) && h.recipients.length>=2 && h.recipients.length<=10,'Invalid heir count.');
  requireThat(Number.isInteger(h.threshold) && h.threshold>=2 && h.threshold<=h.recipients.length,'Invalid recovery threshold.');
  h.recipients.forEach(validateCard);
  requireThat(new Set(h.recipients.map(c=>c.recipient)).size===h.recipients.length && new Set(h.recipients.map(c=>c.id)).size===h.recipients.length,'Duplicate heir key or fingerprint.');
  shape(h.file,['name','size','mime']);text(h.file.name,180,'file name');text(h.file.mime,100,'file type');
  requireThat(Number.isInteger(h.file.size) && h.file.size>0 && h.file.size<=MAX_FILE,'Invalid file size.');
  shape(pkg.payload,['iv','ciphertext']);requireThat(unbase64(pkg.payload.iv,12).length===12,'Invalid encryption nonce.');
  requireThat(unbase64(pkg.payload.ciphertext).length===h.file.size+16,'Encrypted file size does not match its metadata.');
  requireThat(Array.isArray(pkg.wrapped) && pkg.wrapped.length===h.recipients.length,'Missing encrypted shares.');
  pkg.wrapped.forEach((w,i)=>{shape(w,['index','commitment','age']);requireThat(w.index===i+1,'Invalid share index.');hash(w.commitment);validateAge(w.age);});
  return pkg;
}
export async function verifyReceipt(pkg,receipt) {
  validatePackage(pkg);await verifyCards(pkg.header.recipients);
  shape(receipt,['format','packageId','fingerprint']);hash(receipt.fingerprint);
  requireThat(receipt.format===FORMATS.receipt && receipt.packageId===pkg.header.packageId && receipt.fingerprint===await objectDigest(pkg),'This package does not match the trusted recovery receipt.','RECEIPT_MISMATCH');return true;
}
async function checkContribution(pkg,contribution,context) {
  shape(contribution,['format','packageId','context','recipientId','index','share']);
  requireThat(contribution.format===FORMATS.contribution,'Unsupported share format.');
  requireThat(contribution.packageId===pkg.header.packageId && contribution.context===context,'Recovery share belongs to a different package.');
  const i=contribution.index-1;
  requireThat(Number.isInteger(i) && i>=0 && i<pkg.wrapped.length && contribution.recipientId===pkg.header.recipients[i].id,'Invalid share index or recipient.');
  const raw=unbase64(contribution.share,33);
  try { requireThat(raw.length===33 && await digest(raw)===pkg.wrapped[i].commitment,'A recovery share has changed or is incorrect.'); }
  finally { raw.fill(0); }
  return contribution;
}
export async function validateContribution(pkg,receipt,contribution) {
  await verifyReceipt(pkg,receipt);return checkContribution(pkg,contribution,await contextDigest(pkg));
}
export async function openShare(pkg,receipt,identityFile) {
  await verifyReceipt(pkg,receipt);
  const identity=parseIdentity(identityFile), recipient=await identityToRecipient(identity);
  const i=pkg.header.recipients.findIndex(c=>c.recipient===recipient);
  requireThat(i>=0,'This private key is not a custodian for this package.');
  const d=new Decrypter();d.addIdentity(identity);let plain;
  try {
    try { plain=await d.decrypt(validateAge(pkg.wrapped[i].age)); }
    catch { throw new GreenboxError('The age share could not be decrypted. The key or file is incorrect.','DECRYPTION_FAILED'); }
    let contribution;try { contribution=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plain)); }
    catch { throw new GreenboxError('Decrypted age file is not a Greenbox share.'); }
    await checkContribution(pkg,contribution,await contextDigest(pkg));
    requireThat(contribution.index===i+1,'The encrypted share belongs to another heir.');return contribution;
  } finally { plain?.fill(0); }
}
export async function recoverFile(pkg,receipt,contributions) {
  await verifyReceipt(pkg,receipt);
  requireThat(Array.isArray(contributions) && contributions.length>=pkg.header.threshold && contributions.length<=pkg.header.recipients.length,'This package needs at least '+pkg.header.threshold+' different recovery shares.');
  const context=await contextDigest(pkg), seen=new Set(), raw=[];let master;
  try {
    for(const c of contributions) {
      await checkContribution(pkg,c,context);requireThat(!seen.has(c.index),'Duplicate recovery share.');seen.add(c.index);raw.push(unbase64(c.share,33));
    }
    master=await combine(raw.slice(0,pkg.header.threshold));
    const data=await unseal(master,pkg.payload,pkg.header);
    requireThat(data.length===pkg.header.file.size,'Recovered file size does not match.');
    return {data,fileName:pkg.header.file.name,mime:pkg.header.file.mime};
  } finally { master?.fill(0);for(const share of raw)share.fill(0); }
}
