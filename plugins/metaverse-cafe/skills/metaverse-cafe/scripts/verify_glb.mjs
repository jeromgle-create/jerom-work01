// 사용법: node scripts/verify_glb.mjs <GLB 폴더> [assets 폴더]  — 모든 GLB를 다시 읽어 메시·스킨·애니메이션 수를 출력
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = process.argv[2] || 'glb', srcDir = process.argv[3] || 'assets';
const T = (p) => import(pathToFileURL(path.resolve(srcDir, 'node_modules/three', p)).href); // three는 assets/node_modules에서 읽음
const { GLTFLoader } = await T('examples/jsm/loaders/GLTFLoader.js');
const loader = new GLTFLoader();
let bad = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.glb'))) {
  const b = fs.readFileSync(path.join(dir, f));
  await new Promise((res) => loader.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', (g) => {
    let meshes = 0, skinned = 0; g.scene.traverse((o) => { if (o.isMesh) meshes++; if (o.isSkinnedMesh) skinned++; });
    console.log('OK ', f.padEnd(22), `meshes ${meshes}, skinned ${skinned}, anims ${g.animations.map((a) => a.name).join(',') || '-'}`); res();
  }, (e) => { bad++; console.log('ERR', f, e.message); res(); }));
}
process.exit(bad ? 1 : 0);
