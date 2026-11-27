---
name: hanbit-metaverse
description: Work on the 한빛초등학교 metaverse in metaverse/ (Vite + React Three Fiber client, Express + Socket.IO server, deployed on Render as jerom-world). Use this skill for ANY change to that app - adding or moving rooms, floors, buildings or park attractions, editing the floor plan data, chat / meeting / voice behaviour, rides (elephant train, sky lift), minimap, click-to-move, camera pan/zoom, mobile controls, bug fixes, testing, or deploying - even when the user only says "메타버스", "학교 맵", "교실 추가", "대공원", "배포해줘" or names a room without mentioning code.
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
| `src/World.tsx` | Canvas, LocalPlayer (input, collisions, portals, rides, click-to-move path following, camera follow/pan/zoom), RemotePlayer (interpolation or ride pose), ClickToMove (tap vs drag), ZoomControls (pinch/wheel), fog-follows-zoom. Zoom range `ZOOM_MIN`/`ZOOM_MAX` = 0.5–8 in `src/net.ts`. |
| `src/School.tsx` | Campus scenery + colliders (`resolveCollisions`). Exports building rects used by the minimap. |
| `src/Interior.tsx` | Builds every floor from the layout: walls with door gaps, per-kind room builders (`BUILDERS`), nameplates, stairs pads, colliders (`resolveInterior`). |
| `src/Park.tsx` | Park scenery, animals, ambient rides, `RideVehicles` (vehicles carrying riders), `resolvePark`. |
| `src/zones.ts` | Typed wrapper over layout + HUD labels (`locationAt`). |
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

**Park changes** — scenery/colliders in `Park.tsx` (park-local coords), quick-travel/ride stations
in `PARK_RIDES` + paths/durations in `RIDES` (layout). Keep fences as colliders so pens stay closed.

**Zoom range** — `ZOOM_MAX` in `src/net.ts` (now 8). Going higher also needs the Canvas camera
`far` (World.tsx, 2500) and the ground planes in `School.tsx`/`Park.tsx` (+600) enlarged, and the
`zoom` e2e check (`zoom > 7.9`) updated; look at max-zoom screenshots of campus, a floor and the park.

**HUD text / labels** — `zones.ts` (`campusLabel`, `parkLabel`, `locationAt`).

## Verify (always, before telling the user it works)

```bash
cd metaverse
npm run build                         # tsc + vite
bash tests/run-all.sh                 # sim + bots + all e2e sections (≈10 min)
bash tests/run-all.sh stairs rides    # sim + bots + chosen e2e sections
MV_URL=https://jerom-world.onrender.com node tests/live.mjs   # against production (no teleport there)
```

`tests/e2e.mjs` sections: `sync stairs rides click pan zoom map voice`. Also look at screenshots
(Playwright `page.screenshot`, phone emulation with `devices['iPhone 13']`) for visual changes —
layout bugs (overlapping HUD, labels, occlusion) only show up visually.

Testing gotchas learned the hard way:
- Software WebGL runs at a few fps: walking is slow, frame-time-based logic looks laggy. Don't
  "fix" the app for that; give tests generous timeouts.
- CDP touch events: pass explicit `timestamp`s (see `tests/lib.mjs`) or busy pages turn taps into
  long presses. App code must use `e.timeStamp`, not `performance.now()`, for tap timing.
- Two heavy pages in one browser slow each other; close contexts between sections.
- Random-walk tests must start from standable points (`isFree`), not inside furniture.

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
