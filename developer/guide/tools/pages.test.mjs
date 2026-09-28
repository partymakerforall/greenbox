import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readdir, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { packagePages } from './package-pages.mjs';

test('Pages publishes only the two release pages and removes stale output', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'greenbox-pages-'));
  try {
    const source = path.join(temp, 'source'), output = path.join(temp, '_site');
    await mkdir(source); await mkdir(output);
    await writeFile(path.join(source, 'index.html'), '<h1>Guide</h1>');
    await writeFile(path.join(source, 'recovery.html'), '<h1>Recovery</h1>');
    await writeFile(path.join(source, 'private.key'), 'not for publication');
    await writeFile(path.join(output, 'old-test-data.json'), 'stale');
    await packagePages({ source, output });
    assert.deepEqual((await readdir(output)).sort(), ['.nojekyll', 'index.html', 'recovery.html']);
    for (const name of ['index.html', 'recovery.html']) {
      assert.deepEqual(await readFile(path.join(output, name)), await readFile(path.join(source, name)));
    }
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('Pages refuses a staging symlink pointing at the source', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'greenbox-pages-'));
  try {
    const source = path.join(temp, 'source'), output = path.join(temp, '_site');
    await mkdir(source); await writeFile(path.join(source, 'index.html'), 'preserve me');
    await symlink(source, output, 'dir');
    await assert.rejects(packagePages({ source, output }), /output/i);
    assert.equal(await readFile(path.join(source, 'index.html'), 'utf8'), 'preserve me');
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('Pages output cannot overwrite the source or one of its parent folders', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'greenbox-pages-'));
  try {
    const source = path.join(temp, 'source'); await mkdir(source);
    await writeFile(path.join(source, 'index.html'), 'preserve me');
    for (const output of [source, temp]) await assert.rejects(packagePages({ source, output }), /output/i);
    assert.equal(await readFile(path.join(source, 'index.html'), 'utf8'), 'preserve me');
  } finally { await rm(temp, { recursive: true, force: true }); }
});
