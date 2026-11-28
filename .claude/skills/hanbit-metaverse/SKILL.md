---
name: hanbit-metaverse
description: Work on the 한빛초등학교 metaverse in metaverse/ (Vite + React Three Fiber client, Express + Socket.IO server, deployed on Render as jerom-world). Use this skill for ANY change to that app - adding or moving rooms, floors, buildings or park attractions, editing the floor plan data, chat / meeting / voice behaviour, rides (elephant train, sky lift), minimap, click-to-move, camera pan/zoom, mobile controls, graphics / realism (sky, lighting, textures, buildings, trees), avatars / characters, anti-cheat (teleport, speed check), bug fixes, testing, or deploying - even when the user only says "메타버스", "학교 맵", "교실 추가", "대공원", "그래픽", "캐릭터", "순간이동", "배포해줘" or names a room without mentioning code.
---

# 한빛초등학교 metaverse

A browser 3D multiplayer school (fictional school name, layout transcribed from a real schematic
classroom plan) plus a 서울대공원-inspired park. Live at https://jerom-world.onrender.com.
Everything lives in `metaverse/`; the Next.js site at the repo root is unrelated.

The user writes in Korean and prefers: conclusion first, short bullet/table answers, clarifying
questions (1–2) before big work, no invented facts. They are not a developer — explain in plain
Korean, avoid jargon, and always verify in a real browser before saying something works.

## Architecture in one screen

| Path | Role |
|---|---|
| `shared/layout.js` | **Single source of truth** for the world: zones, 13 building floors (113 rooms), campus doors, park zone, portals (doors/stairs/exits/rides), ride paths + `ridePose`/`seatPose`, `locationKey`. Imported by both client and server. |
| `server/index.js` | Socket.IO relay: join/move (clamped to `ZONE_RECTS`, speed-checked: distance budget refilling at `MOVE_SPEED` 9 m/s up to `MOVE_BURST` 12 m; longer jumps only through a door/stairs portal, else `correct` snap-back; riders placed by the server from `seatPose`), state tick 15 Hz, chat scopes (near/group/all — **server picks recipients**), meeting groups, voice signaling relay, rides (vehicles, seats, departure). Serves `dist/`. |
| `src/World.tsx` | Canvas, LocalPlayer (input, collisions, portals, rides, click-to-move path following, camera follow/pan/zoom), RemotePlayer (interpolation or ride pose), ClickToMove (tap vs drag), ZoomControls (pinch/wheel), fog-follows-zoom. Zoom range `ZOOM_MIN`/`ZOOM_MAX` = 0.5–8 in `src/net.ts`. Camera turn / tilt: `view.yaw` / `view.pitch` applied by `orbit(offset)` (elevation clamped to `PITCH_MIN`–`PITCH_MAX`), look-ahead turned with yaw; keys / joystick go through `screenToGround` so W is always screen-forward. `src/ViewPad.tsx` (top-right): hold-to-act buttons write rates into `viewPad` (net.ts), applied per frame in LocalPlayer; ⌖ resets yaw/pitch/zoom/pan; folded by default on touch devices. Drag-pan raycasts the ground so it already works when turned. |
| `src/School.tsx` | Campus scenery + colliders (`resolveCollisions`). Exports building rects used by the minimap. Realistic pass: `Building` (floor bands, framed glass, pillars, parapet, green roof, rooftop tower/tank), `Entrances` (glass doors + canopies, visual only), `Cutaway` (남관 sinks while the player is in the courtyard), instanced `Forest` trees, noise `HILL`s. |
| `src/look.ts` | Canvas-painted textures (grass, soil, concrete, brick, pavers, roof, stone) and `worldMapped(kind, metres)`: a MeshStandardMaterial sampling by world position (box projection) so instanced boxes get real-scale textures without UVs; `materials()` = shared set (+ glass, frame, steel, litGlass). `BoxInstances` takes `material`. |
| `src/Atmosphere.tsx` | `Atmosphere` (owns `scene.background`): Sky shader rendered ONCE into a cube map (static sun) as the day background, PMREM environment from a soft LDR gradient dome (outdoor) or RoomEnvironment (indoor/night), per-zone `environmentIntensity`. `Sun`: directional light + soft shadow box following the player. |
| `src/Interior.tsx` | Builds every floor from the layout: walls with door gaps, per-kind room builders (`BUILDERS`), nameplates, stairs pads, colliders (`resolveInterior`). Realistic pass: items carry `m` (`grain` for colours in `WOODS`, `planks`/`vinyl` from `k.floor`), rendered per material (`interiorMaterials()`); terrazzo corridor, plaster walls; daylight windows on the outer north wall wherever no board/cabinet/sign (taller than the sill) uses it. |
| `src/Park.tsx` | Park scenery, animals, ambient rides, `RideVehicles` (vehicles carrying riders), `resolvePark`. Realistic pass: grounds split by colour into pavers/soil/wood/leaves materials, `RingRoad` (smooth ring), `Water` (normal-map ripples drifting; `calm` for the fountain), shared `Forest` trees and `HILL`s from School.tsx, animals drawn with `Soft` (ellipsoids / tapered limbs from box sizes), round rose `BLOOM`s, glass dome with ribs. Module-level code must not create canvas textures (sim runs in Node): make them lazy. |
| `src/Cafe.tsx`, `src/cafeNpcs.ts`, `src/cafe/models.js` | 잔디광장 카페 (lawn, east): building from the metaverse-cafe kit (copied builders, lights removed), outdoor counter + barista (X Bot), terrace with 3 tables (`CAFE`, `CAFE_SEATS`, `CAFE_MENU` in layout.js; table 2 is the regulars' reserved table). **Server decides** orders / pickup (`readyAt`) / one guest per stool / sips (`cafe:*` events, broadcast `cafe`); clients render seats, cups and the sip lift from that. Regulars 민지·준호·서연 follow a 3-minute routine computed from `serverNow()` only (`npcAt`), so everyone sees the same thing with no traffic; one sits at a time. Context buttons + menu in App.tsx (E key = first button). Wallet: `CAFE.wallet` 20,000원, `CAFE_MENU[i].price`; server keeps `p.wallet` (deducts on `cafe:order`, `cafe:allowance` refills only below `CAFE_MIN_PRICE`, private `cafe:wallet` event + `wallet` in the join ack). Enterable building: `CAFE.building.ry = -π/2` (door faces west), sunk by `CAFE_ROOM.floor`; `CAFE_ROOM` (model-local room, door, 2 indoor tables), `cafeRoomToPark` / `parkToCafeRoom` / `inCafeRoom`; walls with a 1.6 m door gap in `CAFE_COLLIDERS`; 4 indoor stools appended to `CAFE_SEATS` (have `tx/tz/stand`, keep terrace indices first); door opens near anyone; inside, `Bld_East` (south-facing) + roof hidden and `camFor` uses the indoor camera; `locationKey` → `park:cafe`. Drinking: `Human` takes `arm` (`ArmPose` weights hold / table / mouth) and `hand` (key); it bends `mixamorigRightArm/ForeArm/Hand` by `ARM` in `src/hands.ts` (local y = swing forward / bend elbow, x = bring in; tuned on side-view screenshots) and writes the grip's world position to `hands`; whenever the body sits (stools, rides) both forearms rest on the thighs (`ARM.lap`, `ARM.left.lap`), and at a cafe table the left forearm lies on the table (`ARM.left.table`; the left rig is mirrored: negative y); cups follow `hands` (carried, lifted for a sip). Test builds: `window.__mvArm` (angles), `__mvArmForce` (pose), `__mvSip` (freeze a sip) for screenshots, since software rendering is too slow to catch a 2.2 s sip. |
| `src/ParkDogs.tsx` | Two dogs on the lake trail (grass between the train road and the shore), walk / tail wag / sit from `serverNow()`; they look at and wag at the nearest player within 3.5 m (each client). |
| `src/labels.ts` | `placeLabel` (DOM tag over an object's world position), shared by players, barista and cafe customers. |
| `public/signs/` | Sign images designed in Adobe Express (gate name plate, park arch, 105 room nameplates in `rooms/` mapped by name in `src/roomPlates.ts`), shown with `ImageSign` (parts.tsx) with a text-sign fallback. |
| `src/zones.ts` | Typed wrapper over layout + HUD labels (`locationAt`). |
| `src/Human.tsx` | Avatar: rigged mannequin `public/models/xbot.glb` (Mixamo X Bot, meshopt) cloned per player with `SkeletonUtils.clone`, dressed as a student by `outfitMaterial` (shader colours by bind-pose region: skin / shirt = player colour / trousers / shoes, short sleeves) plus hair and eyes on `mixamorigHead` (bone units = cm, head ≈ 13 cm radius; hair/pants/skin from a hash of the player id — use `>>>`, not `>>`, on the hash); idle/walk/run blended by measured speed; sitting pose by bending leg bones while riding. Capsule `Avatar` in World.tsx is the loading fallback. |
| `src/parts.tsx` | Box/BoxInstances/Sign meshes, 2D colliders + `pushOut`. |
| `src/pathfind.ts` | A* over a walkability grid built from `collide()`; avoids portal mats unless targeted. |
| `src/Minimap.tsx`, `Chat.tsx`, `chatState.ts`, `voice.ts`, `App.tsx` | Minimap/full map, three-tab chat, WebRTC proximity voice, HUD + `window.__mvDebug` test hooks (read-only on the live site; `teleport` only when built with `VITE_MV_DEBUG=1`). |
| `tests/` | `sim.mjs` (headless reachability/collision/path), `bots.mjs` (server rules), `e2e.mjs` (Playwright, needs the teleport test build), `speed.mjs` (server movement check, own server on :4102), `live.mjs` (production smoke, no teleport), `run-all.sh`. |

Key ideas to keep intact (they make features cheap and must not be broken):

- **Zones are far-apart rectangles in one coordinate space**: campus around 0, floors at x = 200 + 150·i,
  park at x = 2400. Position sync, proximity voice and chat need no special cases — distance does it.
- **One layout file drives 3D, collisions, minimap, server clamp and chat rooms.** Change the data, not
  five places. The server imports `../shared/layout.js`; the Dockerfile copies `shared/`.
- **Rides are deterministic**: server stamps `start` (departure); clients compute pose (incl. height)
  from the shared path + server clock offset. Never sync y.
- **Chat privacy**: recipients are computed on the server from positions and `locationKey`
  (walls separate rooms; hall/stairs/entrance count as corridor).
- Dollhouse interiors: no ceilings, camera-side outer wall low (`LOW_WALL_H`), boards on the north
  wall facing +z (the camera looks north, -z).

## Common changes

**Add / rename / resize a room** — edit `RAW_FLOORS` in `shared/layout.js` (`R(name, kind, width)`).
Widths are metres; rows are padded with `void`. Pick a `kind` that has a builder in
`Interior.tsx` (`BUILDERS`), or add a builder: furnish in room-local coords (front wall at
z = -d/2), use `k.box(...)` (auto-skips the doorway), `solid: true` for things players can't walk
through, `k.span(front)` for wall runs that must avoid the door. Then run `node tests/sim.mjs` —
it proves every room is still reachable.

**Add a floor / building** — append to `RAW_FLOORS` with the same `building` name and next `level`
(stairs and portals are generated). A new building also needs a campus door in `CAMPUS_DOORS` and a
building mesh + collider in `School.tsx`. Mark ground floors `exit: true`.

**Round-trip rides** — `PARK_RIDES` entries with `loop: true` (and `b` = `a`): one station, one
portal (`ab` only; the server turns `ba` into `ab`), you land back at the stop. `RIDES` entries add
`parked: true` (RideVehicles always shows one vehicle waiting at the stop when none is boarding) and
optionally `gap` (car spacing as a fraction of the route; use `carGap(ride)`, never `CAR_GAP`
directly, for long routes). Current: 호수 순환열차 (ride 2, `LOOP_PATH` = the whole train-road ellipse
from angle `LOOP_A0`; it replaced the decorative circling train) and 오리배 (ride 3, vehicle "boat",
`BOAT_PATH` = dock → circle `BOAT_R` → dock; decorative boats stay inside / outside that circle).
New ride indices must be appended (indices are used by the server and tests).

**Sky lift** — one cable loop defined in `shared/layout.js` (`LIFT_LINE`: `station` cable height,
`ramp` fraction, `side` = line offset, `hang` = cable → seated feet; `liftCableY(k)`, `LIFT_LEFT`). Riders
use `ridePose` with `lane`: a→b on the left line, b→a on the right, height = cable − hang, so they board
at seat height. Lift mats sit under the waiting chair, landings beside the arriving line (PARK_RIDES).
`Park.tsx`: `loopPoint(s)` (lines + half-circles round both bullwheels) drives the tube cable and the
ambient chairs; `LiftStation` (platform, bullwheel, drive housing, frame, roof), towers with crossarms
and sheave trains, shared `Chair`. Lift mats are drawn on the platform (y 0.13).

**Park changes** — scenery/colliders in `Park.tsx` (park-local coords), quick-travel/ride stations
in `PARK_RIDES` + paths/durations in `RIDES` (layout). Keep fences as colliders so pens stay closed.

**Zoom range** — `ZOOM_MAX` in `src/net.ts` (now 8). Going higher also needs the Canvas camera
`far` (World.tsx, 2500) and the ground planes in `School.tsx`/`Park.tsx` (+600) enlarged, and the
`zoom` e2e check (`zoom > 7.9`) updated; look at max-zoom screenshots of campus, a floor and the park.

**Graphics / look** — surfaces come from `look.ts` (no image files: textures are painted on canvases,
so no downloads, licences or size). Change a colour on the item/instance; the grey texture multiplies
it. Lighting lives in `Atmosphere.tsx` + the hemisphere light in `World.tsx`. Never light with the
Sky shader itself (HDR: everything washes out white) — the env map is the LDR gradient dome; tune
`environmentIntensity` per zone and compare before/after screenshots of the same views (field,
main entrance, courtyard, gate, far zoom, phone, park, a floor, dark mode). Visual-only additions
(canopies, doors, rooftop) need no collider; anything players could walk into does.

**Designed signs (Adobe)** — the Adobe for creativity connector: `adobe_mandatory_init` → author HTML
(one `.slide` per sign with `data-canvas-width/height`, Adobe Fonts kit from `get_fontkit_embed_url`,
simple shapes: rect/ellipse divs and basic SVG; curved custom paths may be clipped) →
`html_export_readiness_skill` → `export_html_to_express` (editable Express doc) → `download_design`
PNG (multi-page docs time out as PNG: export PDF and render with `pdftoppm` instead) → convert to
WebP into `public/signs/`. Export responses echo every slide's HTML (large): batch ~25 slides per doc. Network hosts needed (already on the environment):
adobe-creativity.adobe.io, to.adobe.com and its S3 redirect host; the typekit kit only serves allowed
domains, so render through Express, not locally. Never ship font files.

**Avatar / character models** — `src/Human.tsx` + `public/models/` (sources and licence notes in its
README). Compress new models with glTF Transform (`optimize --compress meshopt`, webp textures);
keep only needed clips. Another Mixamo body can NOT borrow the X Bot's clips by bone name: rest
poses and rig scales differ (it rendered upside down/huge) — give it its own clips or retarget
properly. Only GitHub raw and npm are reachable from the cloud session for downloading assets.
Look at screenshots: standing, walking, a classroom, the lift (seated), and a phone.

**Cafe, dog, NPC assets (metaverse-cafe kit)** — for a park cafe/kiosk, a dog or other pet, barista or
customer NPCs, or ordering / sitting / drinking interactions, load the `metaverse-cafe` skill and read its
`references/hanbit-metaverse.md`. Its builders (`models.js`) run on this app's three 0.187 and can be copied
into `src/` (allowJs). Keep this skill's rules on top: layout/colliders in `shared/layout.js`, shared state
(seats, orders) decided by the Socket.IO server, chat through the existing scopes, X Bot stays the player avatar.

**Cafe changes** — positions in `CAFE` (layout.js) drive the scene, colliders (`CAFE_COLLIDERS`), the
server's reach checks and the customers' route (`cafeNpcs.ts` waypoints: re-run `node tests/sim.mjs`, which
walks the whole routine and checks the reserved table). New menu items: `CAFE_MENU` only. Tests: sim
(paths, routine), bots (order/pickup/stool/sip rules), e2e section `cafe`.

**HUD text / labels** — `zones.ts` (`campusLabel`, `parkLabel`, `locationAt`).

## Verify (always, before telling the user it works)

```bash
cd metaverse
npm run build                         # tsc + vite
bash tests/run-all.sh                 # sim + bots + all e2e sections (≈10 min)
bash tests/run-all.sh stairs rides    # sim + bots + chosen e2e sections
MV_URL=https://jerom-world.onrender.com node tests/live.mjs   # against production (no teleport there)
```

`tests/e2e.mjs` sections: `sync stairs rides click pan zoom map voice cafe viewpad loops`. Also look at screenshots
(Playwright `page.screenshot`, phone emulation with `devices['iPhone 13']`) for visual changes —
layout bugs (overlapping HUD, labels, occlusion) only show up visually.

Testing gotchas learned the hard way:
- Software WebGL runs at a few fps: walking is slow, frame-time-based logic looks laggy. Don't
  "fix" the app for that; give tests generous timeouts.
- CDP touch events: pass explicit `timestamp`s (see `tests/lib.mjs`) or busy pages turn taps into
  long presses. App code must use `e.timeStamp`, not `performance.now()`, for tap timing.
- Two heavy pages in one browser slow each other; close contexts between sections.
- Random-walk tests must start from standable points (`isFree`), not inside furniture.
- Never run `npm run build` while `run-all.sh` is running: the test server serves `dist/`, a plain
  build drops the teleport hook mid-run and the results are invalid. Rebuild with
  `VITE_MV_DEBUG=1` or wait.
- Richer graphics lower software-WebGL fps (≈4 → 2): timing between two pages gets tight, so start
  multi-player actions in parallel (`Promise.all`, as in the shared-train check), never rely on a
  page being quick. After moving one player, wait until the OTHER page sees them there
  (`__mvDebug.remote(id)`) before measuring anything that depends on distance (voice volume, chat).
  Wait for conditions (`waitForFunction`) instead of fixed sleeps: a floor's first visit takes ~5 s
  under software rendering (build + material compile).

## Deploy

Render web service `jerom-world` (id `srv-dc3pdtd9el5s7397ss00`, owner `tea-dc3p4elg1s2s73ca34sg`,
Singapore, free plan, root dir `metaverse`, build `npm ci --include=dev && npm run build`,
start `npm start`, health `/healthz`) auto-deploys `master`.

1. Work on the session's feature branch, commit, push, open a PR to `master` and merge it
   (the user has asked for this flow; the PR body follows the repo's usual Summary / Test plan).
2. Poll `GET https://api.render.com/v1/services/<id>/deploys?limit=1` until the merge commit is
   `live` (normally < 1 min). The API key is injected by the session proxy for api.render.com —
   never ask for or print it.
3. If a deploy sits in `update_in_progress` for several minutes, `POST .../deploys/<id>/cancel`
   and `POST .../deploys` to redeploy (happened once; the old version keeps serving meanwhile).
4. Run `tests/live.mjs` against production (full e2e runs locally only) and send the user screenshots.

The free plan sleeps when idle (first visit takes tens of seconds). Test bots on production are
visible to real users — mention it if someone was online.

## Pitfalls already hit (don't repeat)

- `const` arrays used by module-level IIFEs must be declared above them (TDZ crash on load).
- drei `<Html>` renders empty with this React version — labels are DOM elements positioned by
  projection in `placeLabel`.
- Emoji don't render in canvas textures on all systems — keep sign text plain.
- Python `str.replace` edits matched more than intended (e.g. `.joystick {` inside a media query) —
  assert uniqueness or include more context.
- Adjacent colliders form seams; `pushOut` escapes inside-box cases toward a side not inside another
  collider. Buildings that could hide players extend their collider to the zone edge.
- Things near the camera-side wall get occluded: keep important signs above wall height or on the
  north wall; the courtyard uses a steeper camera.
- Teleport is blocked on the live site (user's request): `__mvDebug.teleport` is only added when
  built with `VITE_MV_DEBUG=1`, which `tests/run-all.sh` sets. `tests/e2e.mjs` therefore cannot run
  against production; use `tests/live.mjs` there. Never ship the flag to Render.
- The server refuses jumps too (user's request), so even a modified client can't teleport. The test
  server runs with `MV_ALLOW_TELEPORT=1` (set by `run-all.sh`) so the teleport hook works; never
  set it on Render. Any new way of moving fast (new portal kind, new vehicle, faster walking) must
  be allowed in the `move` handler (`throughPortal`, the ride branch, `MOVE_SPEED`) or players get
  pulled back — add a case to `tests/speed.mjs`.
- Real school plan PDFs are not committed — only room names/order go into `layout.js`.
- **Other Claude sessions work on this repo too** (the lawn cafe #27 came from one). Before merging,
  `git fetch origin master` and look at what landed; never stack a second version of a feature on top.
  If your branch must drop its own commits, a force-push is refused here: build the wanted tree on
  `origin/master`, then `git merge -s ours origin/<branch>` so the push is a fast-forward.
- Software WebGL in tests runs at well under 1 fps once the park is busy (zoomed in: ~7 s per
  screenshot), so short animations (a 2.2 s sip) can't be caught live: add test-build-only hooks that
  freeze the state (`__mvSip`, `__mvArmForce`) and screenshot those. Timing checks (ride HUD
  countdown) can miss for the same reason; rerun before treating them as real failures.
- One `PointLight` makes every material in the zone costlier (it halved test fps): use emissive
  bulbs instead of real lamp lights.
- Bone poses on the X Bot: add rotations after `mixer.update` (clips overwrite bones each frame) and
  tune the angles on side-view screenshots, one axis at a time.
