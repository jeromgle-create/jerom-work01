# Models

| File | What | Source | Notes |
|---|---|---|---|
| `xbot.glb` | Avatar: rigged human mannequin with `idle`, `walk`, `run` clips | three.js examples (`examples/models/gltf/Xbot.glb`), originally Adobe Mixamo "X Bot" | Trimmed to three clips and meshopt-compressed with glTF Transform (`optimize --compress meshopt`). Used under Mixamo's terms for characters and animations in projects. |

Rebuild: keep only the needed clips, then `gltf-transform optimize in.glb xbot.glb --compress meshopt`.
The loader in `src/Human.tsx` registers three's `MeshoptDecoder` (bundled, no CDN).
