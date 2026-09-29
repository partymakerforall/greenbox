import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const project = fileURLToPath(new URL('../../', import.meta.url));
const hash = text => createHash('sha256').update(text).digest('base64');
const blocks = (html, tag) => [...html.matchAll(new RegExp('<'+tag+'>([\\s\\S]*?)</'+tag+'>','g'))].map(match=>match[1]);

export function releaseVersion(version, tag) {
  if (typeof version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) throw new Error('Use a stable MAJOR.MINOR.PATCH version.');
  if (tag !== undefined && tag !== 'v'+version) throw new Error('Release tag must match the package version.');
  return version;
}

export async function buildStandalone({guide, tool, version}) {
  releaseVersion(version);
  if (!guide.includes('</body>') || !tool.includes('id="view-recover"')) throw new Error('Build the production handbook and recovery tool first.');
  for (const html of [guide,tool]) {
    if (!html.includes('name="greenbox-version" content="'+version+'"') || !html.includes('http-equiv="Content-Security-Policy"')) throw new Error('Production pages must match the release version and contain a CSP. Rebuild first.');
  }
  const script = await readFile(new URL('runtime.js', import.meta.url), 'utf8');
  const style = await readFile(new URL('style.css', import.meta.url), 'utf8');
  // srcdoc inherits the outer CSP as well as its own policy. Allow the exact
  // hashes from both trusted documents, without allowing inline/eval code.
  const scripts = [...blocks(guide,'script'), ...blocks(tool,'script'), script];
  const styles = [...blocks(guide,'style'), ...blocks(tool,'style'), style];
  const sources = values => [...new Set(values.map(text=>"'sha256-"+hash(text)+"'"))].join(' ');
  const csp = `default-src 'none'; script-src ${sources(scripts)}; style-src ${sources(styles)}; img-src data:; frame-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'`;
  const embedded = Buffer.from(tool).toString('base64');
  let html = guide.replace(/(<meta http-equiv="Content-Security-Policy" content=")[^"]+(">)/, (_,before,after)=>before+csp+after);
  html = html.replace('</head>', `<meta name="greenbox-release" content="v${version}"><style>${style}</style></head>`);
  html = html.replaceAll('href="recovery.html"','href="#recovery-tool"').replaceAll('data-tool href="#recovery-tool" target="_blank" rel="noopener"','data-tool href="#recovery-tool"');
  const wrapper = `<dialog id="recovery-dialog" aria-label="Greenbox recovery tool"><header class="release-toolbar"><button id="back-to-guide" type="button">← Back to guide</button><span>Greenbox v${version} · Standalone</span></header><iframe id="recovery-frame" title="Age and Shamir recovery tool"></iframe></dialog><template id="embedded-recovery">${embedded}</template><script>${script}</script>`;
  return html.replace('</body>', wrapper+'</body>');
}

export async function packageRelease({tag} = {}) {
  const pkg = JSON.parse(await readFile(path.join(project,'developer/age-recovery/package.json'),'utf8'));
  const version = releaseVersion(pkg.version, tag);
  const [guide,tool] = await Promise.all(['index.html','recovery.html'].map(name=>readFile(path.join(project,name),'utf8')));
  const html = await buildStandalone({guide,tool,version});
  const directory = path.join(project,'_releases');
  const filename = `greenbox-v${version}.html`;
  await mkdir(directory,{recursive:true});
  await writeFile(path.join(directory,filename),html);
  const checksum = createHash('sha256').update(html).digest('hex');
  await writeFile(path.join(directory,'SHA256SUMS'),`${checksum}  ${filename}\n`);
  await writeFile(path.join(directory,'RELEASE-NOTES.md'),`Download **${filename}** below. It contains the complete guide, embedded diagrams, and the age/Shamir recovery tool. Open it directly in a modern browser; no server or dependency installation is required to use the file.\n\nHeirs keep saved post-quantum age keys. One package contains one encrypted backup and one encrypted share per heir. Any threshold of distinct shares recovers it in any order; backups are not generated for every possible combination.\n\nSHA256SUMS checks the download bytes. It is not an independent signature. Older wallet packages need the previous tool; migration instructions are included.\n\nThe integration remains a research prototype, not an independently audited recovery product.\n`);
  return {version,filename,checksum,bytes:Buffer.byteLength(html)};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await packageRelease({tag:process.env.RELEASE_TAG}),null,2));
}
