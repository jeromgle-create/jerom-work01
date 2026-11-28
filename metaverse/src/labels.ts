// DOM name tags / speech bubbles positioned over 3D objects (drei <Html> renders empty here).
import * as THREE from "three";
import { labelEls } from "./net";

const tmp = new THREE.Vector3();
/** Place the label `id` above `obj` (its world position) in screen space. */
export function placeLabel(id: string, obj: THREE.Object3D, camera: THREE.Camera, w: number, h: number, height = 2.45) {
  const el = labelEls.get(id);
  if (!el) return;
  obj.getWorldPosition(tmp);
  tmp.y += height;
  tmp.project(camera);
  if (!obj.visible || tmp.z > 1 || Math.abs(tmp.x) > 1.2 || Math.abs(tmp.y) > 1.2) {
    el.style.visibility = "hidden";
    return;
  }
  el.style.visibility = "visible";
  el.style.transform = `translate(${((tmp.x + 1) / 2) * w}px, ${((1 - tmp.y) / 2) * h}px) translate(-50%, -100%)`;
}
