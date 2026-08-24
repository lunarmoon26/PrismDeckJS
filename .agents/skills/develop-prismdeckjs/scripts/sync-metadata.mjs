import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const packageRoot = join(repositoryRoot, 'packages/prismdeck');

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

const packageMetadata = await readJson(join(packageRoot, 'package.json'));
const repositoryUrl = packageMetadata.repository.url
  .replace(/^git\+/, '')
  .replace(/\.git$/, '');
const author = typeof packageMetadata.author === 'string'
  ? packageMetadata.author
  : packageMetadata.author.name;

const claudePluginPath = join(packageRoot, '.claude-plugin/plugin.json');
const claudePlugin = await readJson(claudePluginPath);
Object.assign(claudePlugin, {
  name: packageMetadata.name,
  displayName: 'PrismDeckJS',
  version: packageMetadata.version,
  description: packageMetadata.description,
  author: { name: author },
  homepage: packageMetadata.homepage,
  repository: repositoryUrl,
  license: packageMetadata.license,
});
await writeJson(claudePluginPath, claudePlugin);

const codexPluginPath = join(packageRoot, '.codex-plugin/plugin.json');
const codexPlugin = await readJson(codexPluginPath);
Object.assign(codexPlugin, {
  name: packageMetadata.name,
  version: packageMetadata.version,
  description: packageMetadata.description,
  author: { name: author, url: repositoryUrl },
  homepage: packageMetadata.homepage,
  repository: repositoryUrl,
  license: packageMetadata.license,
});
await writeJson(codexPluginPath, codexPlugin);

const antigravityPath = join(packageRoot, 'plugin.json');
const antigravity = await readJson(antigravityPath);
Object.assign(antigravity, {
  name: packageMetadata.name,
  description: packageMetadata.description,
});
await writeJson(antigravityPath, antigravity);

const claudeMarketplacePath = join(repositoryRoot, '.claude-plugin/marketplace.json');
const claudeMarketplace = await readJson(claudeMarketplacePath);
Object.assign(claudeMarketplace.owner, { name: author });
Object.assign(claudeMarketplace.plugins[0], {
  name: packageMetadata.name,
  displayName: 'PrismDeckJS',
  description: packageMetadata.description,
  author: { name: author },
});
await writeJson(claudeMarketplacePath, claudeMarketplace);

console.log(`Synchronized agent metadata for ${packageMetadata.name}@${packageMetadata.version}`);
