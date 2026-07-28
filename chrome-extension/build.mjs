import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

const root = new URL('.', import.meta.url);
const dist = new URL('./dist/', root);

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await build({
  entryPoints: [new URL('./src/content/index.ts', root).pathname],
  bundle: true,
  outfile: new URL('./content.js', dist).pathname,
  target: ['chrome120'],
  format: 'iife',
  sourcemap: false,
  legalComments: 'none',
});
await cp(new URL('./src/styles/content.css', root), new URL('./content.css', dist));
await cp(new URL('./manifest.json', root), new URL('./manifest.json', dist));

console.log('构建完成：dist/ 已生成，可在 Chrome 加载该目录。');
