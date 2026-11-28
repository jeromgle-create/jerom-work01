// 사용법: node scripts/preview_test.cjs <assets 폴더> <스크린샷 출력 폴더>
// 인터넷 없이 로컬 Chromium(Playwright)으로 뷰어를 띄워 플레이 모드를 1회 돌려 보고 스크린샷을 남긴다.
// CDN(jsdelivr)의 three@0.160.0 요청은 assets/node_modules/three로 대신 응답한다.
// window.claude가 없으므로 멀티플레이는 "혼자 보기"로 동작한다(정상).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [src = 'assets', out = '.'] = process.argv.slice(2);
const A = path.resolve(src), O = path.resolve(out);
fs.writeFileSync(path.join(A, '_preview.html'), '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">' + fs.readFileSync(path.join(A, 'index.html'), 'utf8'));
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1200, height: 820 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => { const u = r.request().url();
    if (u.includes('cdn.jsdelivr.net/npm/three@0.160.0/')) return r.fulfill({ path: path.join(A, 'node_modules/three', u.split('three@0.160.0/')[1]), contentType: 'application/javascript' });
    if (u.includes('fonts.g')) return r.abort();
    if (u.startsWith('http://local/')) { const f = path.join(A, u.slice(13)); return r.fulfill({ path: f, contentType: f.endsWith('.js') ? 'application/javascript' : 'text/html' }); }
    r.continue(); });
  await p.goto('http://local/_preview.html'); await p.waitForTimeout(1500);
  await p.screenshot({ path: path.join(O, 'preview_character.png') });
  await p.click('#v-play'); await p.click('#stage');
  await p.keyboard.down('KeyW'); await p.waitForTimeout(2500); await p.keyboard.up('KeyW');
  await p.keyboard.press('KeyE'); await p.waitForTimeout(800);
  await p.keyboard.down('KeyW'); await p.waitForTimeout(2500); await p.keyboard.up('KeyW'); await p.waitForTimeout(800);
  await p.screenshot({ path: path.join(O, 'preview_play.png') });
  console.log(errs.length ? 'ERRORS: ' + errs.join(' | ') : 'no script errors');
  fs.unlinkSync(path.join(A, '_preview.html'));
  await b.close();
})();
