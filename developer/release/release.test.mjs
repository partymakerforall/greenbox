import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildStandalone, releaseVersion } from './build.mjs';

const root = new URL('../../', import.meta.url);
const guide = await readFile(new URL('index.html', root), 'utf8');
const tool = await readFile(new URL('recovery.html', root), 'utf8');
const version = JSON.parse(await readFile(new URL('developer/age-recovery/package.json', root),'utf8')).version;
const sha = text => createHash('sha256').update(text).digest('base64');

test('the standalone release embeds the exact production tool and all handbook images', async () => {
  const html = await buildStandalone({guide, tool, version});
  const embedded = html.match(/<template id="embedded-recovery">([A-Za-z0-9+/=]+)<\/template>/)[1];
  assert.equal(Buffer.from(embedded, 'base64').toString('utf8'), tool);
  assert.equal((html.match(/data-diagram-image=/g)||[]).length, 7);
  assert.ok(html.includes('Greenbox v'+version));
  assert.ok(html.includes('id="recovery-dialog"'));
  assert.ok(html.includes('srcdoc'));
  assert.equal(html.includes('href="recovery.html"'), false);
  assert.ok(!tool.includes('greenbox-test-database-2026'));
  assert.ok(!tool.includes('PracticeProvider'));
});

test('both document CSPs permit only hashed local scripts and styles', async () => {
  const html = await buildStandalone({guide, tool, version});
  const policy=html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  assert.ok(policy.includes("connect-src 'none'"));
  assert.ok(!policy.includes('unsafe-inline') && !policy.includes('unsafe-eval'));
  for(const page of [html,tool])for(const tag of ['script','style']){
    for(const match of page.matchAll(new RegExp('<'+tag+'>([\\s\\S]*?)</'+tag+'>','g'))){
      assert.ok(policy.includes('sha256-'+sha(match[1])), 'Missing '+tag+' hash');
    }
  }
});

test('release tag must match a stable package version and cannot choose output paths', () => {
  assert.equal(releaseVersion('2.1.0','v2.1.0'),'2.1.0');
  assert.throws(()=>releaseVersion('2.1.0','v2.0.0'),/match/);
  for(const version of ['../secret','2.1','v2.1.0','02.1.0','2.1.0-beta','2.1.0\n']){
    assert.throws(()=>releaseVersion(version),/version/);
  }
});

test('rebuilding the same release produces identical bytes', async()=>{
  const args={guide,tool,version};
  assert.equal(await buildStandalone(args),await buildStandalone(args));
});

test('stale production pages cannot be labeled as a new release', async()=>{
  await assert.rejects(buildStandalone({guide,tool,version:'999.0.0'}),/match the release version/);
});
