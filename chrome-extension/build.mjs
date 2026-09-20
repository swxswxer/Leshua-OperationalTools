import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

const root = new URL('.', import.meta.url);
const dist = new URL('./dist/', root);

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await build({
  entryPoints: {
    sidepanel: new URL('./src/sidepanel/index.ts', root).pathname,
    background: new URL('./src/background/index.ts', root).pathname,
  },
  bundle: true,
  outdir: dist.pathname,
  target: ['chrome120'],
  format: 'iife',
  sourcemap: false,
  legalComments: 'none',
});
await cp(new URL('./src/styles/sidepanel.css', root), new URL('./sidepanel.css', dist));
await cp(new URL('./src/sidepanel/index.html', root), new URL('./sidepanel.html', dist));
await cp(new URL('./manifest.json', root), new URL('./manifest.json', dist));
await cp(new URL('./assets/', root), new URL('./assets/', dist), { recursive: true });

console.log('构建完成：dist/ 已生成，可在 Chrome 加载该目录。');
