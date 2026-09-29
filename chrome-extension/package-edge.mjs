import './build.mjs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { strToU8, unzipSync, zipSync } from 'fflate';

const root = new URL('.', import.meta.url);
const dist = new URL('./dist/', root);
const files = {};

async function collect(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${prefix}${entry.name}`;
    const url = new URL(entry.name, directory);
    if (entry.isDirectory()) await collect(new URL(`${entry.name}/`, directory), `${path}/`);
    else if (entry.isFile()) files[path] = new Uint8Array(await readFile(url));
  }
}

await collect(dist);
const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
// 商店分配扩展 ID；仅商店包删除开发环境的固定公钥。
delete manifest.key;
files['manifest.json'] = strToU8(`${JSON.stringify(manifest, null, 2)}\n`);
const archive = zipSync(files);
const checked = unzipSync(archive);
const checkedManifest = JSON.parse(new TextDecoder().decode(checked['manifest.json']));
if ('key' in checkedManifest || !checked['sidepanel.html'] || !checked['background.js']) {
  throw new Error('Edge 上传包校验失败');
}
const filename = `leshua-operations-edge-${manifest.version}.zip`;
await writeFile(new URL(filename, root), archive);
console.log(`Edge 上传包已生成：${filename}（manifest 位于根目录，不包含 key）`);
