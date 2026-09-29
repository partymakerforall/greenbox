// Developer-only disposable inputs for the headless file workflow.
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DEMO_DATABASE } from '../tests/fixtures/keepass-data.mjs';
const dir=await mkdtemp(path.join(tmpdir(),'greenbox-age-browser-'));
await mkdir(path.join(dir,'downloads'));
for(let i=1;i<=5;i++){
  const key=path.join(dir,'heir-'+i+'.key');
  execFileSync('age-keygen',['-pq','-o',key],{stdio:'pipe'});
  await writeFile(path.join(dir,'heir-'+i+'.recipient'),execFileSync('age-keygen',['-y',key]),{mode:0o600});
}
await writeFile(path.join(dir,'original.kdbx'),Buffer.from(DEMO_DATABASE,'base64'),{mode:0o600});
console.log(dir);
