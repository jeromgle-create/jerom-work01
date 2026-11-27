// Browser end-to-end checks with Playwright (software WebGL). Needs a running server.
//   MV_URL=http://localhost:4100 node tests/e2e.mjs            # all sections
//   node tests/e2e.mjs stairs rides                             # only some
// Sections: sync, stairs, rides, click, pan, zoom, map, voice
// Note: software rendering runs at a few fps, so walking is slow; timeouts are generous.
import * as L from "../shared/layout.js";
import { check, done, join, launch, order, pan, place, pos, rides, round, selfId, teleport, touch, walkUntil, zoom } from "./lib.mjs";

const want = new Set(process.argv.slice(2));
const on = (s) => want.size === 0 || want.has(s);
const browser = await launch();
const pages = [];
const open = async (...a) => {
  const p = await join(browser, ...a);
  pages.push(p);
  return p;
};
const closeAll = async () => {
  for (const p of pages.splice(0)) await p.context().close();
};
const P = L.PARK.cx;

if (on("sync")) {
  console.log("\n# sync: movement and all-chat between two players");
  const a = await open("가람");
  const b = await open("나래");
  await teleport(a, -17, 18);
  await teleport(b, -14, 18);
  await a.waitForTimeout(1500);
  await a.mouse.click(550, 250);
  const z0 = (await pos(a)).z;
  await a.keyboard.down("w");
  await a.waitForTimeout(1500);
  await a.keyboard.up("w");
  await b.waitForTimeout(800);
  const seen = await b.evaluate(() => {
    const el = [...document.querySelectorAll(".tag")].find((e) => e.textContent.includes("가람"));
    return el?.style.visibility;
  });
  check((await pos(a)).z < z0 - 1 && seen === "visible", "moving player is visible to the other player");
  await a.click(".chat-toggle");
  await a.click('.chat-tabs .tab:has-text("전체")');
  await a.fill(".chat-form input", "안녕!");
  await a.press(".chat-form input", "Enter");
  await b.click(".chat-toggle");
  await b.click('.chat-tabs .tab:has-text("전체")');
  await b.waitForFunction(() => document.querySelector(".chat-list")?.textContent.includes("안녕!"), null, { timeout: 10000 }).catch(() => {});
  check((await b.textContent(".chat-list")).includes("안녕!"), "all-chat message arrives");
  await closeAll();
}

if (on("stairs")) {
  console.log("\n# stairs: walk into every building, up to the top, down, and out (real key presses)");
  const p = await open("계단");
  await p.mouse.click(550, 220);
  const zoneOf = async () => L.zoneAt((await pos(p)).x);
  for (const door of L.CAMPUS_DOORS) {
    const path = [];
    await teleport(p, (door.mat.minX + door.mat.maxX) / 2, door.mat.maxZ + 1.2);
    await p.waitForTimeout(500);
    await walkUntil(p, "w", (q) => L.zoneAt(q.x) !== "outdoor");
    path.push(await zoneOf());
    for (const kind of ["up", "down"])
      for (;;) {
        const cur = await zoneOf();
        const pt = L.PORTALS.find((q) => q.from === cur && q.kind === kind);
        if (!pt) break;
        await teleport(p, (pt.minX + pt.maxX) / 2, pt.maxZ + 1.6);
        await p.waitForTimeout(400);
        await walkUntil(p, "w", (q) => L.zoneAt(q.x) !== cur);
        path.push(await zoneOf());
      }
    const cur = await zoneOf();
    const ex = L.PORTALS.find((q) => q.from === cur && q.kind === "exit");
    await teleport(p, (ex.minX + ex.maxX) / 2, ex.minZ - 1.4);
    await p.waitForTimeout(400);
    await walkUntil(p, "s", (q) => L.zoneAt(q.x) === "outdoor");
    path.push(await zoneOf());
    const floors = L.FLOORS.filter((f) => f.building === L.FLOOR_BY_ID[door.floor].building).map((f) => f.id);
    const expect = [...floors, ...floors.slice(0, -1).reverse(), "outdoor"];
    check(path.join(",") === expect.join(","), `${L.FLOOR_BY_ID[door.floor].building}: ${path.join(" → ")}`);
  }
  await closeAll();
}

if (on("rides")) {
  console.log("\n# rides: two friends share one train car; a late rider gets the next train");
  const a = await open("승객1");
  const b = await open("승객2");
  const board = async (p, x, z) => {
    await teleport(p, x, z);
    await p.waitForTimeout(700);
    await p.mouse.click(550, 220);
    await p.keyboard.down("w");
    await p.waitForFunction(() => !!window.__mvDebug.rides()[window.__mvVoice.selfId], null, { timeout: 10000 });
    await p.keyboard.up("w");
    return (await rides(p))[await selfId(p)];
  };
  const ra = await board(a, P + 12, 56.4);
  const rb = await board(b, P + 12.5, 56.4);
  check(ra.vehicle === rb.vehicle && ra.start === rb.start && ra.seat !== rb.seat, "same train, same departure, different seats", `${ra.vehicle} seats ${ra.seat}/${rb.seat}`);
  check((await place(a)).includes("출발까지"), "HUD shows the departure countdown", await place(a));
  await a.waitForFunction((s) => Date.now() > s + 4000, ra.start, { timeout: 30000 });
  const [pa, pb] = [await pos(a), await pos(b)];
  check(Math.hypot(pa.x - pb.x, pa.z - pb.z) < 1.5, "riding side by side", `${Math.hypot(pa.x - pb.x, pa.z - pb.z).toFixed(2)} m apart`);
  for (const p of [a, b]) await p.waitForFunction(() => !window.__mvDebug.rides()[window.__mvVoice.selfId], null, { timeout: 40000 });
  const end = await pos(a);
  check(L.zoneAt(end.x) === "park" && end.z < 0, "both stepped off at the zoo stop");
  await closeAll();
}

if (on("click")) {
  console.log("\n# click / tap to move");
  const d = await open("클릭");
  await teleport(d, -17, 20);
  await d.waitForTimeout(1500);
  await d.mouse.click(820, 330);
  await d.waitForTimeout(300);
  const o = await order(d);
  await d.waitForFunction(() => !window.__mvDebug.order().active, null, { timeout: 40000 });
  const q = await pos(d);
  check(o.active && Math.hypot(q.x - o.x, q.z - o.z) < 0.5, "desktop click walks to the clicked point", `${Math.hypot(q.x - o.x, q.z - o.z).toFixed(2)} m off`);
  const seq = (await order(d)).seq;
  await d.mouse.move(400, 400);
  await d.mouse.down();
  await d.mouse.move(520, 450, { steps: 5 });
  await d.mouse.up();
  check((await order(d)).seq === seq, "a drag is not a move order");
  await d.mouse.click(300, 300);
  await d.waitForTimeout(200);
  await d.keyboard.down("s");
  await d.waitForTimeout(400);
  await d.keyboard.up("s");
  check(!(await order(d)).active, "keyboard cancels a click move");
  await closeAll();
  const m = await open("터치", { device: "iPhone 13" });
  await teleport(m, -17, 20);
  await m.waitForTimeout(1500);
  const t = await touch(m);
  await t.tap(280, 360);
  await m.waitForTimeout(300);
  const mo = await order(m);
  await m.waitForFunction(() => !window.__mvDebug.order().active, null, { timeout: 40000 }).catch(() => {});
  const mq = await pos(m);
  check(mo.active && Math.hypot(mq.x - mo.x, mq.z - mo.z) < 0.5, "phone tap walks to the tapped point");
  await closeAll();
}

if (on("pan") || on("zoom")) {
  console.log("\n# pan and pinch zoom on a phone");
  const m = await open("드래그", { device: "iPhone 13" });
  await teleport(m, -17, 20);
  await m.waitForTimeout(1500);
  const t = await touch(m);
  const seq = (await order(m)).seq;
  await t.drag(195, 450, 195, 250);
  await m.waitForTimeout(700);
  const p1 = await pan(m);
  check(Math.abs(p1.z) > 3 && (await order(m)).seq === seq, "one-finger drag pans the camera (no move order)", `pan z ${round(p1.z)}`);
  await m.waitForTimeout(400);
  check(!!(await m.$(".recenter")), "'내 위치로' button appears");
  await m.click(".recenter");
  await m.waitForTimeout(1500);
  const p2 = await pan(m);
  check(Math.hypot(p2.x, p2.z) < 0.1, "'내 위치로' brings the camera back");
  await t.pinch(195, 330, 260, 60);
  await m.waitForTimeout(600);
  check((await zoom(m)) > 3.9, "pinch in zooms out to the 4x limit", `zoom ${round(await zoom(m), 2)}`);
  const before = await pan(m);
  await t.pinch(195, 330, 60, 260);
  await m.waitForTimeout(600);
  const after = await pan(m);
  check((await zoom(m)) < 1.5 && Math.hypot(after.x - before.x, after.z - before.z) < 0.01, "spread zooms back in without panning");
  await closeAll();
}

if (on("map")) {
  console.log("\n# minimap and full map");
  const p = await open("지도");
  await teleport(p, L.FLOOR_BY_ID.E2.cx - 10, 0);
  await p.waitForTimeout(1500);
  check((await p.textContent(".minimap-title")).includes("본관 2층"), "minimap follows the current floor");
  await p.click(".minimap");
  await p.waitForSelector(".map-card");
  await p.click('.map-tabs button:has-text("서울대공원")');
  await p.waitForTimeout(300);
  check((await p.textContent(".map-head")).includes("서울대공원"), "full map switches to another zone");
  await p.keyboard.press("Escape");
  check(!(await p.$(".map-card")), "Esc closes the full map");
  await closeAll();
}

if (on("voice")) {
  console.log("\n# proximity voice (fake microphones)");
  const a = await open("말하기", { mic: true });
  const b = await open("듣기", { mic: true });
  await teleport(a, -20, 17);
  await teleport(b, -18, 17);
  await a.click(".voice-btn");
  await b.click(".voice-btn");
  await b.waitForFunction(() => window.__mvVoice.debug().some((p) => p.state === "connected" && p.hasAudio), null, { timeout: 30000 });
  const vol = async () => {
    await b.waitForTimeout(900);
    return (await b.evaluate(() => window.__mvVoice.debug()))[0].volume;
  };
  check((await vol()) > 0.95, "2 m apart: full volume");
  await teleport(a, -8, 17);
  const v10 = await vol();
  check(Math.abs(v10 - 0.46) < 0.05, "10 m apart: about half volume", `${v10}`);
  await teleport(a, 0, 26);
  check((await vol()) === 0, "20 m apart: silent");
  await closeAll();
}

for (const p of pages) if (p.errors.length) check(false, "page errors", p.errors.join("; "));
await browser.close();
done();
