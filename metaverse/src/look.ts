// Realistic surfaces without image files: textures are painted on canvases at start-up (grass, field
// soil, painted concrete, brick, pavers, rooftop), and `worldMapped` samples them by world position
// (box projection), so any mesh — instanced boxes included — gets a texture at real-world scale
// without UVs. Grey-scale textures multiply the mesh / instance colour, so colours stay as they were.
import * as THREE from "three";

type Kind = "grass" | "soil" | "concrete" | "brick" | "pavers" | "roof" | "stone" | "planks" | "grain" | "vinyl" | "terrazzo" | "plaster";

// Deterministic noise so textures look the same every visit.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Smooth value noise painted at several scales (gives natural mottling). */
function mottle(ctx: CanvasRenderingContext2D, n: number, rand: () => number, base: number, amp: number, cells: number[]) {
  const img = ctx.getImageData(0, 0, n, n);
  const layers = cells.map((c) => {
    const g = Array.from({ length: (c + 1) * (c + 1) }, () => rand());
    return { c, g };
  });
  const smooth = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      let v = 0;
      let w = 0;
      layers.forEach(({ c, g }, li) => {
        const fx = (x / n) * c;
        const fy = (y / n) * c;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const tx = smooth(fx - x0);
        const ty = smooth(fy - y0);
        const at = (i: number, j: number) => g[((j % c) * (c + 1)) + (i % c)];
        const a = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
        const b = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
        const k = 1 / (li + 1);
        v += (a * (1 - ty) + b * ty) * k;
        w += k;
      });
      const g = base + (v / w - 0.5) * 2 * amp;
      const i = (y * n + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(0, Math.min(255, g * img.data[i] / 255));
    }
  ctx.putImageData(img, 0, 0);
}

function paint(kind: Kind): HTMLCanvasElement {
  const n = 512;
  const cv = document.createElement("canvas");
  cv.width = cv.height = n;
  const ctx = cv.getContext("2d")!;
  const rand = rng([...kind].reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, n, n);
  const specks = (count: number, size: number, lo: number, hi: number, alpha = 1) => {
    for (let i = 0; i < count; i++) {
      const g = Math.round(lo + rand() * (hi - lo));
      ctx.fillStyle = `rgba(${g},${g},${g},${alpha})`;
      const s = size * (0.5 + rand());
      ctx.fillRect(rand() * n, rand() * n, s, s);
    }
  };
  if (kind === "grass") {
    mottle(ctx, n, rand, 235, 26, [4, 9, 24]);
    // blades: short strokes in lighter and darker tones
    for (let i = 0; i < 9000; i++) {
      const g = Math.round(150 + rand() * 105);
      ctx.strokeStyle = `rgba(${g},${g},${g},0.55)`;
      ctx.lineWidth = 1;
      const x = rand() * n;
      const y = rand() * n;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rand() - 0.5) * 3, y - 2 - rand() * 4);
      ctx.stroke();
    }
  } else if (kind === "soil") {
    // 마사토: fine decomposed granite with pebbles
    mottle(ctx, n, rand, 238, 16, [3, 8, 20]);
    specks(26000, 1.2, 170, 255, 0.6);
    specks(900, 3, 140, 230, 0.7);
  } else if (kind === "concrete" || kind === "stone") {
    mottle(ctx, n, rand, kind === "stone" ? 225 : 244, kind === "stone" ? 22 : 9, [2, 6, 18]);
    specks(kind === "stone" ? 14000 : 5000, 1, 190, 255, 0.35);
    if (kind === "concrete") {
      // faint rain streaks
      for (let i = 0; i < 40; i++) {
        const x = rand() * n;
        const grad = ctx.createLinearGradient(x, 0, x, n * (0.3 + rand() * 0.5));
        grad.addColorStop(0, "rgba(120,120,120,0.10)");
        grad.addColorStop(1, "rgba(120,120,120,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(x, 0, 2 + rand() * 5, n);
      }
    }
  } else if (kind === "brick") {
    mottle(ctx, n, rand, 240, 10, [4, 12]);
    const rows = 16;
    const bh = n / rows;
    const bw = n / 4;
    ctx.fillStyle = "rgba(255,255,255,0.0)";
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? bw / 2 : 0;
      for (let c = -1; c < 5; c++) {
        const g = Math.round(185 + rand() * 60);
        ctx.fillStyle = `rgba(${g},${g},${g},0.55)`;
        ctx.fillRect(c * bw + off + 2, r * bh + 2, bw - 4, bh - 4);
      }
    }
    ctx.fillStyle = "rgba(255,255,255,0.85)"; // mortar lines (light, the colour comes from the mesh)
    for (let r = 0; r <= rows; r++) ctx.fillRect(0, r * bh - 1.5, n, 3);
    for (let r = 0; r < rows; r++) for (let c = 0; c <= 4; c++) ctx.fillRect(c * bw + (r % 2 ? bw / 2 : 0) - 1.5, r * bh, 3, bh);
  } else if (kind === "pavers") {
    mottle(ctx, n, rand, 236, 12, [3, 10]);
    const k = 8;
    const s = n / k;
    for (let y = 0; y < k; y++)
      for (let x = 0; x < k; x++) {
        const g = Math.round(205 + rand() * 50);
        ctx.fillStyle = `rgba(${g},${g},${g},0.6)`;
        ctx.fillRect(x * s + 2, y * s + 2, s - 4, s - 4);
      }
    ctx.fillStyle = "rgba(150,150,150,0.9)";
    for (let i = 0; i <= k; i++) {
      ctx.fillRect(i * s - 1, 0, 2, n);
      ctx.fillRect(0, i * s - 1, n, 2);
    }
  } else if (kind === "planks" || kind === "grain") {
    // wood: long boards (floor) or one board (furniture) with grain lines
    const boards = kind === "planks" ? 8 : 1;
    const bh = n / boards;
    for (let b = 0; b < boards; b++) {
      const tone = 200 + rand() * 50;
      ctx.fillStyle = `rgb(${tone},${tone},${tone})`;
      ctx.fillRect(0, b * bh, n, bh);
      for (let i = 0; i < (kind === "planks" ? 26 : 90); i++) {
        const y = b * bh + rand() * bh;
        const g = Math.round(tone - 25 - rand() * 35);
        ctx.strokeStyle = `rgba(${g},${g},${g},${0.25 + rand() * 0.35})`;
        ctx.lineWidth = 0.6 + rand() * 1.4;
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= n; x += 32) ctx.lineTo(x, y + Math.sin(x / 60 + i) * 2 * rand());
        ctx.stroke();
      }
      if (kind === "planks") {
        ctx.fillStyle = "rgba(90,90,90,0.8)"; // board seams and staggered butt joints
        ctx.fillRect(0, b * bh, n, 2);
        const j = (b * 0.37 + rand() * 0.5) % 1;
        ctx.fillRect(j * n, b * bh, 2, bh);
      }
    }
  } else if (kind === "vinyl") {
    mottle(ctx, n, rand, 240, 8, [3, 10]);
    specks(6000, 1.5, 200, 255, 0.35);
    ctx.fillStyle = "rgba(160,160,160,0.7)";
    for (let i = 0; i <= 4; i++) {
      ctx.fillRect((i * n) / 4 - 1, 0, 2, n);
      ctx.fillRect(0, (i * n) / 4 - 1, n, 2);
    }
  } else if (kind === "terrazzo") {
    mottle(ctx, n, rand, 242, 6, [3, 8]);
    for (let i = 0; i < 2600; i++) {
      const g = Math.round(150 + rand() * 105);
      ctx.fillStyle = `rgba(${g},${g},${g},0.8)`;
      ctx.beginPath();
      ctx.ellipse(rand() * n, rand() * n, 1 + rand() * 3, 1 + rand() * 2.5, rand() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === "plaster") {
    mottle(ctx, n, rand, 246, 6, [2, 7, 20]);
    specks(3000, 1, 220, 255, 0.25);
  } else if (kind === "roof") {
    mottle(ctx, n, rand, 238, 14, [3, 9]);
    ctx.fillStyle = "rgba(170,170,170,0.5)";
    for (let i = 0; i <= 4; i++) ctx.fillRect(0, (i * n) / 4 - 1, n, 2);
  }
  return cv;
}

const cache = new Map<Kind, THREE.Texture>();
export function texture(kind: Kind) {
  let t = cache.get(kind);
  if (!t) {
    t = new THREE.CanvasTexture(paint(kind));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    cache.set(kind, t);
  }
  return t;
}

/**
 * A standard material whose texture is sampled from world position (box projection): top faces use
 * x/z, side faces x/y or z/y. `metres` = how many metres one texture tile covers.
 */
export function worldMapped(kind: Kind, metres: number, params: THREE.MeshStandardMaterialParameters = {}) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...params });
  const map = texture(kind);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.wmMap = { value: map };
    shader.uniforms.wmScale = { value: 1 / metres };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWmPos;\nvarying vec3 vWmNormal;")
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        vec4 wmP = vec4(transformed, 1.0);
        vec3 wmN = objectNormal;
        #ifdef USE_INSTANCING
          wmP = instanceMatrix * wmP;
          wmN = mat3(instanceMatrix) * wmN;
        #endif
        vWmPos = (modelMatrix * wmP).xyz;
        vWmNormal = normalize(mat3(modelMatrix) * wmN);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform sampler2D wmMap;\nuniform float wmScale;\nvarying vec3 vWmPos;\nvarying vec3 vWmNormal;")
      .replace(
        "#include <map_fragment>",
        `vec3 wmA = abs(vWmNormal);
        vec2 wmUv = wmA.y > max(wmA.x, wmA.z) ? vWmPos.xz : (wmA.x > wmA.z ? vec2(vWmPos.z, vWmPos.y) : vWmPos.xy);
        vec4 wmTex = texture2D(wmMap, wmUv * wmScale);
        diffuseColor.rgb *= wmTex.rgb;`,
      );
  };
  mat.customProgramCacheKey = () => `wm-${kind}-${metres}`;
  return mat;
}

/** Tiling ripple normal map for water (sum of sine waves → normals). */
let waterNormals: THREE.CanvasTexture | null = null;
export function waterNormalMap() {
  if (waterNormals) return waterNormals;
  const n = 256;
  const cv = document.createElement("canvas");
  cv.width = cv.height = n;
  const ctx = cv.getContext("2d")!;
  const img = ctx.createImageData(n, n);
  const h = (x: number, y: number) => {
    const u = (x / n) * Math.PI * 2;
    const v = (y / n) * Math.PI * 2;
    // many incommensurate directions so the tiling doesn't read as a grid
    return (
      Math.sin(u * 3 + v * 2) * 0.4 + Math.sin(u * 5 - v * 4 + 1.3) * 0.3 + Math.sin(u * 9 + v * 7 + 2.1) * 0.18 +
      Math.sin(-u * 2 + v * 11) * 0.14 + Math.sin(u * 13 - v * 6 + 0.7) * 0.1 + Math.sin(u * 7 + v * 15 + 4) * 0.08
    );
  };
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const dx = h(x + 1, y) - h(x - 1, y);
      const dy = h(x, y + 1) - h(x, y - 1);
      const len = Math.hypot(dx * 4, dy * 4, 1);
      const i = (y * n + x) * 4;
      img.data[i] = ((-dx * 4) / len * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((-dy * 4) / len * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len) * 0.5 * 255 + 127;
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  waterNormals = new THREE.CanvasTexture(cv);
  waterNormals.wrapS = waterNormals.wrapT = THREE.RepeatWrapping;
  return waterNormals;
}

/** Shared materials (create once; many meshes use them). */
let shared: ReturnType<typeof makeShared> | null = null;
function makeShared() {
  return {
    grass: worldMapped("grass", 6),
    soil: worldMapped("soil", 5),
    wall: worldMapped("concrete", 8, { roughness: 0.85 }),
    brick: worldMapped("brick", 2.4),
    pavers: worldMapped("pavers", 3),
    roof: worldMapped("roof", 10, { roughness: 0.75, color: "#6f9877" }), // green waterproofed rooftop
    stone: worldMapped("stone", 3, { roughness: 0.8 }),
    glass: new THREE.MeshStandardMaterial({ color: "#6f93b3", roughness: 0.06, metalness: 0.7, envMapIntensity: 1.6 }),
    frame: new THREE.MeshStandardMaterial({ color: "#d9dcdf", roughness: 0.35, metalness: 0.6 }),
    litGlass: new THREE.MeshStandardMaterial({ color: "#3a3528", emissive: "#e8c97a", emissiveIntensity: 0.9, roughness: 0.2 }), // night: lights on
    steel: new THREE.MeshStandardMaterial({ color: "#c9cdd2", roughness: 0.3, metalness: 0.8 }),
    leaves: worldMapped("grass", 1.6, { roughness: 0.95 }), // hedges and leafy masses
    wood: worldMapped("grain", 1.2, { roughness: 0.7 }),
    water: new THREE.MeshStandardMaterial({ color: "#3d7f9e", roughness: 0.12, metalness: 0.25, envMapIntensity: 1.4, normalMap: waterNormalMap(), normalScale: new THREE.Vector2(0.18, 0.18) }),
    pool: new THREE.MeshStandardMaterial({ color: "#7cc4dc", roughness: 0.08, metalness: 0.2, envMapIntensity: 1.4 }), // small calm water
    domeGlass: new THREE.MeshStandardMaterial({ color: "#d6ecf7", roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.38, envMapIntensity: 1.5, side: THREE.DoubleSide, depthWrite: false }),
    metalRoof: new THREE.MeshStandardMaterial({ color: "#4f86c6", roughness: 0.4, metalness: 0.5, side: THREE.DoubleSide }),
  };
}
export const materials = () => (shared ??= makeShared());
