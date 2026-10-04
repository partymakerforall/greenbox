import { identityToRecipient } from 'age-encryption';
import { GreenboxError, MAX_FILE, recipientCard, parseIdentity, createPackage, validatePackage, verifyReceipt, validateContribution, openShare, recoverFile, unbase64 } from './crypto.mjs';

const el = id => document.getElementById(id);
const state = {busy:false,cards:[],payload:null,built:null,package:null,receipt:null,verified:false,trusted:false,contribution:null,contributions:[],recovered:null,checkCard:null};
function status(message,type='') { el('status').textContent=message;el('status').className='status '+type;el('status').hidden=false; }
function forgetRecovered() { state.recovered?.data.fill(0);state.recovered=null; }
function resetRecovery() { forgetRecovered();state.contribution=null;state.contributions=[];state.verified=false;state.trusted=false;el('trust-receipt').checked=false; }
function act(fn,result) { return async()=>{if(state.busy)return;state.busy=true;render();try{await fn();}catch(error){status(error instanceof GreenboxError?error.message:'The operation failed. Check the selected files and try again.','error');}finally{state.busy=false;render();if(result&&!el(result).hidden)el(result).scrollIntoView({block:'center',behavior:'smooth'});}}; }
function showTab(tab) { for(const name of ['key','build','recover'])el('view-'+name).hidden=name!==tab;for(const b of document.querySelectorAll('[data-tab]')){b.classList.toggle('active',b.dataset.tab===tab);if(b.dataset.tab===tab)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');} }
async function readText(file,max=16384) { if(!file||!file.size||file.size>max)throw new GreenboxError('That file is empty or too large for this step.');return file.text(); }
async function readJson(file,max=4096) { const text=await readText(file,max);try{return JSON.parse(text);}catch{throw new GreenboxError('This is not a readable Greenbox JSON file.');} }
function download(value,name,mime='application/json') {const content=value instanceof Uint8Array?value:JSON.stringify(value,null,2)+'\n';const url=URL.createObjectURL(new Blob([content],{type:mime}));const a=document.createElement('a');a.href=url;a.download=name.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_');document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function requirePackage() {if(!state.package||!state.verified||!state.trusted)throw new GreenboxError('Load the package and trusted receipt, then confirm the receipt’s source.');}
function dots(id,count,filled) {el(id).replaceChildren(...Array.from({length:count},(_,i)=>{const s=document.createElement('span');s.className=i<filled?'filled':'';return s;}));}
function rows(id,people,empty,remove) {
  const result=people.map((p,i)=>{const row=document.createElement('div');row.className='custodian-row';const number=document.createElement('span');number.className='person';number.textContent=String(i+1).padStart(2,'0');const info=document.createElement('div');info.className='person-detail';const name=document.createElement('strong');name.textContent=p.label||'Share '+p.index;const detail=document.createElement('small');detail.className='break';detail.textContent=p.id?'SHA-256 · '+p.id:'Share integrity checked';info.append(name,detail);const button=document.createElement('button');button.className='text-button';button.textContent='Remove';button.disabled=state.busy;button.onclick=()=>{if(!state.busy){remove(i);render();}};row.append(number,info,button);return row;});
  if(!result.length){const p=document.createElement('p');p.className='muted';p.textContent=empty;result.push(p);}el(id).replaceChildren(...result);
}
function render() {
  for(const item of document.querySelectorAll('button,input,select'))item.disabled=state.busy;
  el('check-identity').disabled=state.busy||!state.checkCard;
  rows('custodian-list',state.cards,'No public keys added yet.',i=>{state.cards.splice(i,1);state.built=null;});
  const threshold=Number(el('threshold').value),count=state.cards.length;
  el('total-custodians').textContent=count;dots('threshold-dots',count,Math.min(threshold,count));
  el('build-rule-title').textContent=count>=threshold?'Any '+threshold+' of '+count+' heirs.':'Choose your recovery rule.';
  el('threshold-description').textContent=count>=threshold?'Any '+threshold+' of these '+count+' heirs can recover, in any order.':'Add '+Math.max(0,threshold-count)+' more public recipient file(s).';
  el('payload-detail').textContent=state.payload?state.payload.name+' · '+state.payload.data.length.toLocaleString()+' bytes':'Your KeePass database or Greenbox bundle.tar.';
  el('encrypt-package').disabled=state.busy||count<threshold||!state.payload;
  el('package-result').hidden=!state.built;
  el('receipt-status').textContent=state.verified?(state.trusted?'✓ Exact package verified against the trusted receipt.':'✓ Files match. Confirm the receipt’s source.'):'Load both files to check their match.';
  const ready=state.package&&state.verified&&state.trusted;
  for(const id of ['identity-file','share-recipient','download-envelope','contribution-files'])el(id).disabled=state.busy||!ready;
  const selected=el('share-recipient').value;
  el('share-recipient').replaceChildren(...(state.package?.header.recipients||[]).map((c,i)=>new Option((i+1)+'. '+c.label,String(i))));
  if(selected && Number(selected)<(state.package?.header.recipients.length||0))el('share-recipient').value=selected;
  el('contribution-result').hidden=!state.contribution;
  rows('contribution-list',state.contributions,'No shares collected yet.',i=>{state.contributions.splice(i,1);forgetRecovered();});
  const needed=state.package?.header.threshold,total=state.package?.header.recipients.length||0;
  el('share-count').textContent=state.contributions.length;el('shares-needed').textContent=needed??'—';dots('recovery-dots',total,state.contributions.length);
  el('recovery-rule').textContent=state.package?'This backup needs any '+needed+' of '+total+' heirs. The requirement was set when the backup was created.':'Load a package to see how many shares it needs.';
  el('recovery-progress').textContent=!state.package?'':state.contributions.length>=needed?'Enough shares collected. You can recover the file.':'Collect '+(needed-state.contributions.length)+' more different share(s).';
  el('recover-file').disabled=state.busy||!ready||state.contributions.length<needed;
  el('recovered-result').hidden=!state.recovered;
  if(state.recovered){el('recovered-name').textContent=state.recovered.fileName;el('recovered-help').textContent='Open the downloaded file with its usual application. KeePass still needs its database password.';}
}
function appendCard(card) {if(state.cards.some(c=>c.recipient===card.recipient))throw new GreenboxError('This heir’s public key is already included.');if(state.cards.length>=10)throw new GreenboxError('Use at most ten heirs.');state.cards.push(card);state.built=null;}
async function checkReceipt() {state.verified=false;if(state.package&&state.receipt)state.verified=await verifyReceipt(state.package,state.receipt);}
async function appendContribution(c) {requirePackage();await validateContribution(state.package,state.receipt,c);if(state.contributions.some(s=>s.index===c.index))throw new GreenboxError('That share is already included. Use a different heir.');state.contributions.push(structuredClone(c));forgetRecovered();}
function onFile(id,fn,result) {const input=el(id);input.onchange=act(async()=>{const files=Array.from(input.files);input.value='';await fn(files);},result);}
for(const b of document.querySelectorAll('[data-tab]'))b.onclick=()=>showTab(b.dataset.tab);
document.querySelector('.brand').onclick=e=>{e.preventDefault();showTab('key');};
el('show-notes').onclick=()=>{el('notes').hidden=false;el('notes').scrollIntoView({behavior:'smooth'});};el('hide-notes').onclick=()=>{el('notes').hidden=true;};
el('clear-session').onclick=()=>location.reload();
onFile('check-recipient',async files=>{state.checkCard=null;el('key-check-detail').textContent='Load the public file first.';state.checkCard=await recipientCard(await readText(files[0]));el('key-check-detail').textContent='SHA-256 · '+state.checkCard.id;status('Public recipient loaded. Check your saved private key next.');});
onFile('check-identity',async files=>{const recipient=await identityToRecipient(parseIdentity(await readText(files[0])));if(recipient!==state.checkCard.recipient)throw new GreenboxError('This private key does not match the public recipient.');status('✓ Your saved private key matches the public recipient exactly.','success');});
onFile('public-cards',async files=>{for(const file of files)appendCard(await recipientCard(await readText(file),file.name.replace(/\.recipient$/i,'').slice(0,80)||'Heir'));status('Public recipients added. Confirm their fingerprints with the heirs.','success');});
onFile('previous-package',async files=>{const p=validatePackage(await readJson(files[0],48*1024*1024));const cards=await Promise.all(p.header.recipients.map(c=>recipientCard(c.recipient,c.label)));state.cards=cards;state.built=null;el('threshold').value=String(p.header.threshold);el('recovery-name').value=p.header.label;status('Public recipients reused. Confirm them against your trusted records and choose the new backup file.','success');});
for(const id of ['threshold','recovery-name'])el(id).addEventListener(id==='threshold'?'change':'input',()=>{state.built=null;render();});
onFile('payload-file',async files=>{state.payload?.data.fill(0);state.payload=null;state.built=null;const f=files[0];if(!f||!f.size||f.size>MAX_FILE)throw new GreenboxError('Choose a nonempty file up to 32 MiB.');state.payload={name:f.name,mime:f.type||'application/octet-stream',data:new Uint8Array(await f.arrayBuffer())};status('File loaded in memory. Ready to encrypt.');});
el('encrypt-package').onclick=act(async()=>{state.built=null;state.built=await createPackage({cards:state.cards,threshold:Number(el('threshold').value),label:el('recovery-name').value.trim()||'Greenbox backup',fileName:state.payload.name,mime:state.payload.mime,data:state.payload.data});status('Package encrypted. Download both files, then test recovery.','success');},'package-result');
el('download-package').onclick=()=>state.built&&download(state.built.package,'greenbox-package.json');el('download-receipt').onclick=()=>state.built&&download(state.built.receipt,'greenbox-receipt.json');
onFile('recover-package',async files=>{resetRecovery();state.package=null;el('recover-package-detail').textContent='No package loaded';state.package=validatePackage(await readJson(files[0],48*1024*1024));el('recover-package-detail').textContent=state.package.header.file.name+' · '+state.package.header.threshold+' of '+state.package.header.recipients.length;await checkReceipt();status('Package loaded. Use its trusted receipt to continue.');});
onFile('recover-receipt',async files=>{resetRecovery();state.receipt=null;el('recover-receipt-detail').textContent='No receipt loaded';state.receipt=await readJson(files[0]);await checkReceipt();el('recover-receipt-detail').textContent='Receipt loaded · '+state.receipt.fingerprint;status('Receipt loaded. Confirm its source.');});
el('trust-receipt').onchange=()=>{state.trusted=el('trust-receipt').checked;if(!state.trusted){state.contribution=null;forgetRecovered();}render();};
onFile('identity-file',async files=>{requirePackage();state.contribution=null;state.contribution=await openShare(state.package,state.receipt,await readText(files[0]));status('Your share is open. Download it privately for the recovering person.','success');},'contribution-result');
el('download-envelope').onclick=act(async()=>{requirePackage();const i=Number(el('share-recipient').value);download(unbase64(state.package.wrapped[i].age,16384),'share-'+(i+1)+'.age','application/octet-stream');status('Encrypted share downloaded. Open it with your saved age key in Terminal.');});
el('download-share').onclick=()=>state.contribution&&download(state.contribution,'greenbox-SECRET-share-'+state.contribution.index+'.json');
el('use-share').onclick=act(async()=>{await appendContribution(state.contribution);state.contribution=null;status('Share added to this recovery.','success');});
onFile('contribution-files',async files=>{for(const file of files)await appendContribution(await readJson(file));status('Recovery shares checked and added.','success');});
el('recover-file').onclick=act(async()=>{requirePackage();forgetRecovered();state.recovered=await recoverFile(state.package,state.receipt,state.contributions);status('Original file recovered and integrity checked. Download it from the result panel.','success');},'recovered-result');
el('download-recovered').onclick=()=>state.recovered&&download(state.recovered.data,state.recovered.fileName,'application/octet-stream');
window.addEventListener('pagehide',()=>{state.payload?.data.fill(0);forgetRecovered();state.contribution=null;state.contributions=[];});
render();
if(location.protocol==='https:'&&!['localhost','127.0.0.1','[::1]'].includes(location.hostname))document.querySelector('.local-badge').textContent='Online demo';
if(!window.isSecureContext||!crypto.subtle){status('Open this tool with the local server described in the README. This browser context does not allow encryption.','error');for(const b of document.querySelectorAll('button,input,select'))b.disabled=true;}
