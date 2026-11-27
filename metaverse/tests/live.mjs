// Smoke test for the live site, which has no teleport hook (see tests/run-all.sh for the full suite).
//   MV_URL=https://jerom-world.onrender.com node tests/live.mjs
import { check, done, join, launch, pos, round, touch, zoom } from "./lib.mjs";

const browser = await launch();

console.log("\n# desktop: join, walk, no teleport, all-chat");
const modelLoads = [];
const a = await join(browser, "확인1", { onPage: (pg) => pg.on("response", (r) => r.url().endsWith("/models/xbot.glb") && modelLoads.push(r.status())) });
const b = await join(browser, "확인2");
check(await a.evaluate(() => typeof window.__mvDebug.teleport === "undefined"), "teleport hook is not available on this site");
check(modelLoads.includes(200), "the 3D person model loads", JSON.stringify(modelLoads));
const p0 = await pos(a);
await a.mouse.click(550, 250);
await a.keyboard.down("w");
await a.waitForTimeout(1500);
await a.keyboard.up("w");
await a.keyboard.down("d");
await a.waitForTimeout(2500);
await a.keyboard.up("d");
await a.waitForTimeout(500);
const p1 = await pos(a);
check(Math.hypot(p1.x - p0.x, p1.z - p0.z) > 0.5, "walking with the keyboard still works", `${round(Math.hypot(p1.x - p0.x, p1.z - p0.z))} m`);
check((await a.evaluate(() => window.__mvDebug.corrections())) === 0, "the server's speed check never pulls back normal walking");
const seen = await b.evaluate((id) => window.__mvDebug.remote(id), await a.evaluate(() => window.__mvVoice.selfId));
check(seen && Math.hypot(seen.x - p1.x, seen.z - p1.z) < 0.5, "the other player sees the walker where the walker is", seen ? `${round(Math.hypot(seen.x - p1.x, seen.z - p1.z), 2)} m off` : "not seen");
await a.click(".chat-toggle");
await a.click('.chat-tabs .tab:has-text("전체")');
await a.fill(".chat-form input", "확인 메시지");
await a.press(".chat-form input", "Enter");
await b.click(".chat-toggle");
await b.click('.chat-tabs .tab:has-text("전체")');
await b.waitForFunction(() => document.querySelector(".chat-list")?.textContent.includes("확인 메시지"), null, { timeout: 10000 }).catch(() => {});
check((await b.textContent(".chat-list")).includes("확인 메시지"), "all-chat message arrives");
await a.click(".minimap");
check(!!(await a.waitForSelector(".map-card", { timeout: 5000 }).catch(() => null)), "full map opens");
const errors = [...a.errors, ...b.errors];
await a.context().close();
await b.context().close();

console.log("\n# phone: pinch zoom");
const m = await join(browser, "확인폰", { device: "iPhone 13" });
await m.waitForTimeout(1500);
const t = await touch(m);
await t.pinch(195, 330, 260, 60);
await m.waitForTimeout(600);
await t.pinch(195, 330, 260, 60);
await m.waitForTimeout(600);
check((await zoom(m)) > 7.9, "pinch zooms out to 8x", `zoom ${round(await zoom(m), 2)}`);
errors.push(...m.errors);
await m.context().close();

check(errors.length === 0, "no page errors", errors.join("; "));
await browser.close();
done();
