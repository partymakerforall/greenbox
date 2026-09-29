import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = await build({entryPoints: [path.join(root, 'src/app.mjs')], bundle: true, write: false, metafile: true, minify: true, legalComments: 'inline', target: ['chrome110','firefox115','safari16'], format: 'iife', platform: 'browser', define: {'process.env.NODE_ENV': '"production"'}});
// A release may contain only the application modules and installed dependencies.
// Fail before replacing the delivered HTML if a fixture or helper enters it.
const bundledModules = [...new Set(Object.values(bundle.metafile.outputs).flatMap(output =>
  Object.entries(output.inputs).filter(([,info]) => info.bytesInOutput > 0).map(([name]) =>
    path.relative(root, path.resolve(name)).split(path.sep).join('/'))))];
const applicationModules = bundledModules.filter(name => !name.split('/').includes('node_modules')).sort();
const allowed = new Set(['src/app.mjs', 'src/crypto.mjs']);
if (applicationModules.some(name => !allowed.has(name))) throw new Error('Non-production module in release: ' + applicationModules.filter(name => !allowed.has(name)).join(', '));
const script = bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const style = await readFile(path.join(root, 'src/style.css'), 'utf8');
const hash = text => createHash('sha256').update(text).digest('base64');
const csp = `default-src 'none'; script-src 'sha256-${hash(script)}'; style-src 'sha256-${hash(style)}'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
const version = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version;
const template = await readFile(path.join(root, 'src/page.html'), 'utf8');
const html = template.replaceAll('__VERSION__', version).replace('__CSP__', () => csp).replace('__STYLE__', () => style).replace('__SCRIPT__', () => script);
const project = path.resolve(root, '../..');
const checks = path.resolve(root, '../checks');
await mkdir(checks, {recursive: true});
await writeFile(path.join(project, 'recovery.html'), html);
await writeFile(path.join(checks, 'age-build.json'), JSON.stringify({file: 'recovery.html', profile: 'production', applicationModules, bytes: Buffer.byteLength(html), sha256: createHash('sha256').update(html).digest('hex'), externalRuntimeDependencies: 0}, null, 2) + '\n');
console.log('Built self-contained recovery.html (' + Math.round(Buffer.byteLength(html) / 1024) + ' KiB). No runtime CDN requests.');
