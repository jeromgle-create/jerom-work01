// Where each person's right hand is (world space, the grip point), written by Human every frame for
// avatars that pass `hand`. Cups and cookies follow it while carried or lifted to the mouth.
import * as THREE from "three";

export const hands = new Map<string, THREE.Vector3>();

/** Right-arm pose weights (0..1): hold = carrying a cup, table = seated hand on the table, mouth = drinking. */
export type ArmPose = { hold?: number; table?: number; mouth?: number };

/** Local bone rotations (radians, XYZ euler) added on top of the idle clip, per pose. */
// Mixamo right arm: local y swings the upper arm forward / bends the elbow, local x brings it in.
// Tuned on screenshots (seated side view): hold = forearm level in front (cup at the table / carried),
// mouth = hand in front of the mouth.
export const ARM = {
  hold: { arm: [0, 0.3, 0], fore: [0, 1.3, 0], hand: [0, 0, 0] },
  table: { arm: [0, 0.9, 0], fore: [0, 0.9, 0], hand: [0, 0, 0] },
  mouth: { arm: [0.4, 0.7, 0], fore: [0, 2.3, 0], hand: [0, 0, 0] },
  /** grip point from the hand bone, in the bone's own units (cm) */
  grip: [0, 8, 3],
};
