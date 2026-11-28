// 사용법: node scripts/export_glb.mjs <models.js가 있는 폴더> <GLB 출력 폴더>
// models.js의 빌더 함수로 모든 에셋을 만들고 애니메이션 포함 GLB로 내보낸다.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [srcDir = 'assets', outDir = 'glb'] = process.argv.slice(2);
const T = (p) => import(pathToFileURL(path.resolve(srcDir, 'node_modules/three', p)).href); // three는 assets/node_modules에서 읽음
const { GLTFExporter } = await T('examples/jsm/exporters/GLTFExporter.js');
const M = await import(pathToFileURL(path.resolve(srcDir, 'models.js')).href);
// Node에는 FileReader가 없어 GLTFExporter용으로 최소 구현
globalThis.FileReader = class {
  readAsArrayBuffer(b) { b.arrayBuffer().then((r) => { this.result = r; this.onloadend?.(); this.onload?.({ target: this }); }); }
  readAsDataURL(b) { b.arrayBuffer().then((r) => { this.result = `data:${b.type};base64,` + Buffer.from(r).toString('base64'); this.onloadend?.(); this.onload?.({ target: this }); }); }
};
fs.mkdirSync(outDir, { recursive: true });
const exporter = new GLTFExporter();
const H = [0.95, 1.0, 0.92, 1.08, 0.97, 1.05], Wd = [0.95, 1.0, 0.9, 1.2, 1.0, 1.1];
const jobs = [
  ...M.HAIR_STYLES.map((h, i) => [`customer_${h}`, () => M.buildCharacter({ name: `Customer_${h}`, hair: h, build: { h: H[i], w: Wd[i] } })]),
  ['character', () => M.buildCharacter()], ['barista', () => M.buildBarista()],
  ['building', () => M.buildBuilding()], ['animal', () => M.buildAnimal()],
];
for (const [file, fn] of jobs) {
  const obj = fn(); obj.updateMatrixWorld(true);
  const s = M.stats(obj);
  const buf = await exporter.parseAsync(obj, { binary: true, animations: obj.animations });
  fs.writeFileSync(path.join(outDir, `${file}.glb`), Buffer.from(buf));
  console.log(file.padEnd(18), `${s.tris} tris, ${s.size.x.toFixed(2)}x${s.size.y.toFixed(2)}x${s.size.z.toFixed(2)} m, anims: ${obj.animations.map((a) => a.name).join(',') || '-'}, ${(buf.byteLength / 1024).toFixed(1)} KB`);
}
