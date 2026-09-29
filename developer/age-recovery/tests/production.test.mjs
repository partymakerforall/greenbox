import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

test('the shipped HTML excludes sample data, simulated wallets and testing controls', async () => {
  const root = new URL('../', import.meta.url);
  execFileSync(process.execPath, ['tools/build.mjs'], {cwd: root, stdio: 'pipe'});
  const html = await readFile(new URL('../../recovery.html', root), 'utf8');
  for (const marker of ['greenbox-test-database-2026', 'greenbox-demo.kdbx',
    'PracticeProvider', 'Practice wallets active', 'Try a practice run',
    'eth_requestAccounts', 'personal_sign', 'eth_signTypedData_v4', 'id="connect"', 'id="practice"', 'id="practice-account"', 'id="try-recovery"',
    'Test recovery in this browser', 'A9mimmf7S7UBAAMAAhAAMcHy5r9xQ1C+']) {
    assert.ok(!html.includes(marker), `Production HTML contains ${marker}`);
  }
  for (const id of ['check-recipient', 'check-identity', 'encrypt-package', 'recover-package',
    'recover-receipt', 'trust-receipt', 'identity-file', 'download-envelope', 'recover-file']) {
    assert.ok(html.includes(`id="${id}"`), `Missing real operation: ${id}`);
  }
  const build = JSON.parse(await readFile(new URL('../checks/age-build.json', root)));
  assert.equal(build.profile, 'production');
  assert.deepEqual(build.applicationModules.sort(), ['src/app.mjs', 'src/crypto.mjs']);
  for (const tag of ['script', 'style']) {
    const body = html.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))[1];
    assert.ok(html.includes('sha256-' + createHash('sha256').update(body).digest('base64')));
  }
});
