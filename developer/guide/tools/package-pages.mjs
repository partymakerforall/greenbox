import { readFile, writeFile, mkdir, rm, realpath } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const project = fileURLToPath(new URL('../../../', import.meta.url));
const releaseFiles = ['index.html', 'recovery.html'];

export async function packagePages({ source = project, output = path.join(project, '_site') } = {}) {
  source = await realpath(source);
  output = path.resolve(output);
  try { output = await realpath(output); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    output = path.join(await realpath(path.dirname(output)), path.basename(output));
  }
  if (output === source || source.startsWith(output + path.sep) || output === path.parse(output).root) {
    throw new Error('Pages output must not replace the source folder or its parents.');
  }
  // Read the complete release before replacing the previous staging directory.
  const pages = await Promise.all(releaseFiles.map(name => readFile(path.join(source, name))));
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  for (const [i, name] of releaseFiles.entries()) await writeFile(path.join(output, name), pages[i]);
  await writeFile(path.join(output, '.nojekyll'), '');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await packagePages();
  console.log('Pages release: index.html and recovery.html in _site/.');
}
