// Browser end-to-end checks with Playwright (software WebGL). Needs a running server.
//   MV_URL=http://localhost:4100 node tests/e2e.mjs            # all sections
//   node tests/e2e.mjs stairs rides                             # only some
// Sections: sync, stairs, rides, click, pan, zoom, map, voice, cafe, viewpad, loops
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
    // the first frame in the park builds it: wait until we are really there before walking
    await p.waitForFunction(([x, z]) => Math.hypot(window.__mvDebug.pos().x - x, window.__mvDebug.pos().z - z) < 1, [x, z], { timeout: 30000 });
    await p.mouse.click(550, 220);
    await p.keyboard.down("w");
    await p.waitForFunction(() => !!window.__mvDebug.rides()[window.__mvVoice.selfId], null, { timeout: 30000 });
    await p.keyboard.up("w");
    const r = (await rides(p))[await selfId(p)];
    return { ...r, hud: await place(p) }; // read the HUD right after boarding, before departure
  };
  // Both walk onto the stop at the same time (boarding one after the other can miss the 8 s wait
  // when software rendering is slow).
  const [ra, rb] = await Promise.all([board(a, P + 12, 56.4), board(b, P + 12.5, 56.4)]);
  check(ra.vehicle === rb.vehicle && ra.start === rb.start && ra.seat !== rb.seat, "same train, same departure, different seats", `${ra.vehicle} seats ${ra.seat}/${rb.seat}`);
  check([ra.hud, rb.hud].some((h) => h.includes("출발까지")), "HUD shows the departure countdown", `${ra.hud} / ${rb.hud}`);
  await a.waitForFunction((s) => Date.now() > s + 4000, ra.start, { timeout: 30000 });
  // Same car = side by side: both seats' poses at the same moment are next to each other. Each page
  // is checked against its own seat's pose at the time it was read (pages render at a few fps, so
  // reading two pages "at once" can be a second apart and put metres between moving riders; a page
  // also shows the pose of its last frame, up to ~1 s old under software rendering).
  const at = async (p, r) => {
    const { pos: q, t } = await p.evaluate(() => ({ pos: window.__mvDebug.pos(), t: Date.now() }));
    const u = Math.min(1, Math.max(0, (t - r.start) / L.RIDES[r.ride].duration));
    const e = L.seatPose(r.ride, r.dir, u, r.seat);
    return Math.hypot(q.x - e.x, q.z - e.z);
  };
  const [da, db] = await Promise.all([at(a, ra), at(b, rb)]);
  const u0 = 0.4;
  const ea = L.seatPose(ra.ride, ra.dir, u0, ra.seat);
  const eb = L.seatPose(rb.ride, rb.dir, u0, rb.seat);
  const gap = Math.hypot(ea.x - eb.x, ea.z - eb.z);
  check(L.seatCar(ra.ride, ra.seat) === L.seatCar(rb.ride, rb.seat) && gap < 1.5 && da < 8 && db < 8, "riding side by side (same car)", `car ${L.seatCar(ra.ride, ra.seat)}/${L.seatCar(rb.ride, rb.seat)}, seats ${gap.toFixed(2)} m apart, off the path ${da.toFixed(1)}/${db.toFixed(1)} m`);
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
  await t.pinch(195, 330, 260, 60); // a second pinch: the limit is 8x
  await m.waitForTimeout(600);
  check((await zoom(m)) > 7.9, "pinching in zooms out to the 8x limit", `zoom ${round(await zoom(m), 2)}`);
  const before = await pan(m);
  await t.pinch(195, 330, 60, 260);
  await m.waitForTimeout(600);
  const after = await pan(m);
  await t.pinch(195, 330, 60, 260);
  await m.waitForTimeout(600);
  check((await zoom(m)) < 1.5 && Math.hypot(after.x - before.x, after.z - before.z) < 0.01, "spreading zooms back in without panning");
  await closeAll();
}

if (on("map")) {
  console.log("\n# minimap and full map");
  const p = await open("지도");
  const t0 = Date.now();
  await teleport(p, L.FLOOR_BY_ID.E2.cx - 10, 0);
  // the first visit to a floor builds it (and compiles its materials): slow under software rendering
  await p.waitForFunction(() => document.querySelector(".minimap-title")?.textContent.includes("본관 2층"), null, { timeout: 20000 }).catch(() => {});
  check((await p.textContent(".minimap-title")).includes("본관 2층"), "minimap follows the current floor", `${((Date.now() - t0) / 1000).toFixed(1)} s`);
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
  const aId = await selfId(a);
  // Measure only once the listener sees the speaker at the new spot (slow pages lag behind).
  const vol = async (x, z) => {
    if (x !== undefined) {
      await teleport(a, x, z);
      await b.waitForFunction(([id, x, z]) => { const t = window.__mvDebug.remote(id); return t && Math.hypot(t.x - x, t.z - z) < 0.5; }, [aId, x, z], { timeout: 20000 }).catch(() => {});
    }
    await b.waitForTimeout(900);
    return (await b.evaluate(() => window.__mvVoice.debug()))[0].volume;
  };
  check((await vol()) > 0.95, "2 m apart: full volume");
  const v10 = await vol(-8, 17);
  check(Math.abs(v10 - 0.46) < 0.05, "10 m apart: about half volume", `${v10}`);
  check((await vol(0, 26)) === 0, "20 m apart: silent");
  await closeAll();
}

if (on("cafe")) {
  console.log("\n# cafe: order, pick up, sit, sip, stand (server-decided, seen by others); customers, dogs");
  const shots = process.env.MV_SHOTS; // folder for screenshots (optional)
  const a = await open("카페손님");
  const b = await open("구경꾼");
  const c = L.CAFE;
  await teleport(a, P + c.order.x, c.order.z);
  await teleport(b, P + c.order.x + 2.5, c.order.z + 3);
  const actions = (p) => p.evaluate(() => window.__mvDebug.actions());
  await a.waitForFunction(() => window.__mvDebug.actions().includes("order"), null, { timeout: 30000 }).catch(() => {});
  check((await actions(a)).includes("order"), "cafe: at the counter the order button appears");
  await a.evaluate(() => window.__mvDebug.act("order"));
  await a.waitForSelector(".cafe-menu button[data-item='0']", { timeout: 10000 });
  await a.click(".cafe-menu button[data-item='0']");
  await a.waitForFunction(() => window.__mvDebug.actions().includes("pickup"), null, { timeout: 30000 }).catch(() => {});
  check((await actions(a)).includes("pickup"), "cafe: the drink is ready after the barista's time (pickup button)");
  await a.evaluate(() => window.__mvDebug.act("pickup"));
  const st = L.cafeStandSpot(0);
  await a.waitForTimeout(800);
  await teleport(a, P + st.x, st.z);
  await a.waitForFunction(() => window.__mvDebug.actions().includes("sit"), null, { timeout: 30000 }).catch(() => {});
  await a.evaluate(() => window.__mvDebug.act("sit"));
  const seat = L.CAFE_SEATS[0];
  await a.waitForFunction(([x, z]) => { const q = window.__mvDebug.pos(); return Math.hypot(q.x - x, q.z - z) < 0.05; }, [P + seat.x, seat.z], { timeout: 20000 }).catch(() => {});
  const ap = await pos(a);
  check(Math.hypot(ap.x - (P + seat.x), ap.z - seat.z) < 0.05, "cafe: sitting puts the player on the stool", `${round(ap.x - P)},${round(ap.z)}`);
  const aId = await selfId(a);
  await b.waitForFunction((id) => window.__mvDebug.cafe()[id]?.order?.stage === "placed", aId, { timeout: 20000 }).catch(() => {});
  check((await b.evaluate((id) => window.__mvDebug.cafe()[id], aId))?.order?.stage === "placed", "cafe: the other player sees the drink on the table");
  await a.evaluate(() => window.__mvDebug.act("sip"));
  await b.waitForFunction((id) => window.__mvDebug.cafe()[id]?.order?.left === 2, aId, { timeout: 20000 }).catch(() => {});
  check((await b.evaluate((id) => window.__mvDebug.cafe()[id], aId))?.order?.left === 2, "cafe: a sip is seen by the other player (2 left)");
  if (shots) {
    await a.waitForTimeout(700);
    await a.screenshot({ path: `${shots}/cafe-sip.png` });
    await b.screenshot({ path: `${shots}/cafe-other.png` });
  }
  await a.waitForTimeout(2500);
  await a.evaluate(() => window.__mvDebug.act("stand"));
  await a.waitForFunction(([x, z]) => { const q = window.__mvDebug.pos(); return Math.hypot(q.x - x, q.z - z) < 0.1; }, [P + st.x, st.z], { timeout: 20000 }).catch(() => {});
  const up = await pos(a);
  check(Math.hypot(up.x - (P + st.x), up.z - st.z) < 0.1, "cafe: standing up steps off beside the stool");
  check((await a.evaluate(() => window.__mvDebug.corrections())) === 0, "cafe: sitting / standing never triggers a server snap-back");
  // regular customers: same routine on both pages
  const na = await a.evaluate(() => window.__mvDebug.npc(0));
  const nb = await b.evaluate(() => window.__mvDebug.npc(0));
  check(na.phase === nb.phase && Math.hypot(na.x - nb.x, na.z - nb.z) < 1.5, "cafe customers: both players see 민지 at the same place", `${na.phase}`);
  if (shots) {
    // a wider look: the cafe with the barista, and the lake trail
    await teleport(b, P + 52, 50);
    await b.waitForTimeout(2500);
    await b.screenshot({ path: `${shots}/cafe-wide.png` });
  }
  await closeAll();
}

if (on("loops")) {
  console.log("\n# round trips: the lake loop train and a swan boat bring you back to where you got on");
  const a = await open("뱃놀이");
  for (const name of ["오리배", "호수 순환열차"]) {
    const i = L.PARK_RIDES.findIndex((r) => r.name === name);
    const [x0, x1, z0, z1] = L.PARK_RIDES[i].a.mat;
    await teleport(a, P + (x0 + x1) / 2, z1 + 1.2);
    await a.waitForTimeout(3000);
    await a.keyboard.down("w");
    await a.waitForFunction(() => !!window.__mvDebug.rides()[window.__mvVoice.selfId], null, { timeout: 30000 }).catch(() => {});
    await a.keyboard.up("w");
    const r = (await rides(a))[await selfId(a)];
    const hud = await place(a);
    await a.waitForFunction(() => !window.__mvDebug.rides()[window.__mvVoice.selfId], null, { timeout: 120000 }).catch(() => {});
    await a.waitForTimeout(1000);
    const p = await pos(a);
    const land = L.PARK_RIDES[i].a.land;
    check(r?.ride === i && Math.hypot(p.x - (P + land[0]), p.z - land[1]) < 2.5, `${name}: board, go round, step off at the same stop`, `${hud} → ${(p.x - P).toFixed(1)},${p.z.toFixed(1)}`);
  }
  check((await a.evaluate(() => window.__mvDebug.corrections())) === 0, "round trips: the server never pulled the rider back");
  await closeAll();
}

if (on("viewpad")) {
  console.log("\n# view pad: turn, tilt, zoom, slide and reset the camera with the corner buttons");
  const a = await open("카메라");
  await teleport(a, -14, 18);
  await a.waitForTimeout(3000);
  const v = () => a.evaluate(() => window.__mvDebug.view());
  const hold = async (sel, ms) => {
    const b = await a.locator(`[data-vp="${sel}"]`).boundingBox();
    await a.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await a.mouse.down();
    await a.waitForTimeout(ms);
    await a.mouse.up();
    await a.waitForTimeout(300);
  };
  await hold("yaw+", 1500);
  await hold("pitch+", 1200);
  await hold("zoom+", 1200);
  const v1 = await v();
  check(v1.yaw > 0.1 && v1.pitch > 0.05 && v1.zoom > 1.05, "holding turn / tilt / zoom-out buttons changes the camera", JSON.stringify(v1));
  const p0 = await pos(a);
  await a.keyboard.down("w");
  await a.waitForTimeout(1200);
  await a.keyboard.up("w");
  await a.waitForTimeout(400);
  const p1 = await pos(a);
  const dx = p1.x - p0.x, dz = p1.z - p0.z, d = Math.hypot(dx, dz);
  const fx = -Math.sin(v1.yaw), fz = -Math.cos(v1.yaw);
  check(d > 0.5 && (dx * fx + dz * fz) / d > 0.9, "after turning, W walks towards where the camera looks", `${dx.toFixed(2)},${dz.toFixed(2)} vs ${fx.toFixed(2)},${fz.toFixed(2)}`);
  await hold("panX+", 1000);
  const pn = await pan(a);
  check(Math.hypot(pn.x, pn.z) > 0.5, "the arrow buttons slide the view", JSON.stringify(pn));
  await a.click(".vp-reset");
  await a.waitForTimeout(2500);
  const v2 = await v();
  const pn2 = await pan(a);
  check(v2.yaw === 0 && v2.pitch === 0 && v2.zoom === 1 && Math.hypot(pn2.x, pn2.z) < 0.3, "⌖ puts the camera back as it was", JSON.stringify({ ...v2, ...pn2 }));
  await closeAll();
}

for (const p of pages) if (p.errors.length) check(false, "page errors", p.errors.join("; "));
await browser.close();
done();
