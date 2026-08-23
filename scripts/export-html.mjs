import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { savePrismDeckHtml } from '../packages/prismdeck/dist/prism-deck.min.js';

const [inputArgument, outputArgument] = process.argv.slice(2);
if (!inputArgument || !outputArgument) {
  throw new Error('Usage: npm run export:html -- input.json output.html');
}
if (!outputArgument.toLowerCase().endsWith('.html')) {
  throw new Error('Output path must end in .html');
}

const inputPath = resolve(inputArgument);
const outputPath = resolve(outputArgument);
const document = JSON.parse(await readFile(inputPath, 'utf8'));
const html = await savePrismDeckHtml({ document, assets: new Map() });

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, new Uint8Array(await html.arrayBuffer()));
console.log(outputPath);
