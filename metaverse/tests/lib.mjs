// Shared helpers for the metaverse test scripts (Node 20+, Playwright with Chromium installed).
// Point MV_URL at a running server (default http://localhost:4100). Through an HTTPS proxy the
// browser is launched with HTTPS_PROXY and certificate errors ignored, so the live site works too.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
export const { chromium, devices } = require("playwright");

export const URL = process.env.MV_URL || "http://localhost:4100";
const results = [];

/** Record a check; prints ✔ / ✘ and is summarized by `done()`. */
export function check(ok, label, detail = "") {
  results.push({ ok: !!ok, label });
  console.log(`${ok ? "✔" : "✘"} ${label}${detail ? `  (${detail})` : ""}`);
  return !!ok;
}
export function done() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    for (const f of failed) console.log(`  FAILED: ${f.label}`);
    process.exitCode = 1;
  }
}
export const round = (v, d = 1) => +v.toFixed(d);

export async function launch() {
  const proxy = URL.startsWith("https") && process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  return chromium.launch({
    proxy,
    args: [
      "--use-gl=swiftshader",
      "--enable-unsafe-swiftshader",
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
    ],
  });
}

/** Open a page, enter a nickname and wait for the world. `device` is a Playwright device name. */
export async function join(browser, name, { device, viewport = { width: 1100, height: 700 }, mic = false } = {}) {
  const ctx = await browser.newContext({
    ...(device ? devices[device] : { viewport }),
    ignoreHTTPSErrors: true,
    permissions: mic ? ["microphone"] : [],
  });
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  await page.goto(URL, { timeout: 90000 });
  await page.fill("#nick", name);
  await page.click("button.primary");
  await page.waitForSelector(".minimap", { timeout: 60000 });
  if (!device && (await page.$(".chat.open"))) await page.click(".chat-toggle"); // keep the scene clear
  return page;
}

// window.__mvDebug test hooks (see src/App.tsx)
export const teleport = (p, x, z) => p.evaluate(([x, z]) => window.__mvDebug.teleport(x, z), [x, z]);
export const pos = (p) => p.evaluate(() => window.__mvDebug.pos());
export const rides = (p) => p.evaluate(() => window.__mvDebug.rides());
export const order = (p) => p.evaluate(() => window.__mvDebug.order());
export const zoom = (p) => p.evaluate(() => window.__mvDebug.zoom());
export const pan = (p) => p.evaluate(() => window.__mvDebug.pan());
export const place = async (p) => (await p.textContent(".hud-place")).trim();
export const selfId = (p) => p.evaluate(() => window.__mvVoice.selfId);

/** Hold a key until `pred(pos)` is true or `ms` passes. */
export async function walkUntil(p, key, pred, ms = 10000) {
  await p.keyboard.down(key);
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (pred(await pos(p))) break;
    await p.waitForTimeout(80);
  }
  await p.keyboard.up(key);
  await p.waitForTimeout(700);
}

/**
 * Touch gestures through CDP. Pass explicit timestamps: a busy software-rendered page delays CDP
 * dispatch, which would otherwise make a quick tap look like a long press.
 */
export async function touch(page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type, touchPoints, timestamp) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints, timestamp });
  return {
    async tap(x, y) {
      const t = Date.now() / 1000;
      await send("touchStart", [{ x, y, id: 1 }], t);
      await send("touchEnd", [], t + 0.08);
    },
    async drag(x0, y0, x1, y1, steps = 10) {
      let t = Date.now() / 1000;
      await send("touchStart", [{ x: x0, y: y0, id: 1 }], t);
      for (let i = 1; i <= steps; i++) await send("touchMove", [{ x: x0 + ((x1 - x0) * i) / steps, y: y0 + ((y1 - y0) * i) / steps, id: 1 }], (t += 0.03));
      await send("touchEnd", [], t + 0.03);
    },
    /** Two fingers from `from` px apart to `to` px apart around (cx, cy). */
    async pinch(cx, cy, from, to, steps = 8) {
      const pts = (d) => [
        { x: cx - d / 2, y: cy, id: 1 },
        { x: cx + d / 2, y: cy, id: 2 },
      ];
      await send("touchStart", pts(from));
      for (let i = 1; i <= steps; i++) await send("touchMove", pts(from + ((to - from) * i) / steps));
      await send("touchEnd", []);
    },
  };
}
