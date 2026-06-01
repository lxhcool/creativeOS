export interface Point {
  x: number;
  y: number;
}

export interface WalkFrame {
  headCenter: Point;
  neck: Point;
  leftShoulder: Point;
  rightShoulder: Point;
  leftElbow: Point;
  rightElbow: Point;
  leftHand: Point;
  rightHand: Point;
  pelvis: Point;
  leftHip: Point;
  rightHip: Point;
  leftKnee: Point;
  rightKnee: Point;
  leftFoot: Point;
  rightFoot: Point;
}

export interface WalkCycleSample {
  cycleDurationMs: number;
  phase: number;
  frame: WalkFrame;
}

const CYCLE_DURATION_MS = 880;

const KEY_FRAMES: Array<WalkFrame & { phase: number }> = [
  {
    phase: 0,
    headCenter: { x: 210, y: 88 },
    neck: { x: 211, y: 142 },
    leftShoulder: { x: 197, y: 150 },
    rightShoulder: { x: 223, y: 150 },
    leftElbow: { x: 194, y: 179 },
    rightElbow: { x: 221, y: 178 },
    leftHand: { x: 190, y: 208 },
    rightHand: { x: 225, y: 207 },
    pelvis: { x: 211, y: 221 },
    leftHip: { x: 203, y: 220 },
    rightHip: { x: 219, y: 220 },
    leftKnee: { x: 183, y: 250 },
    rightKnee: { x: 235, y: 251 },
    leftFoot: { x: 158, y: 278 },
    rightFoot: { x: 256, y: 281 },
  },
  {
    phase: 0.125,
    headCenter: { x: 210, y: 90 },
    neck: { x: 211, y: 144 },
    leftShoulder: { x: 198, y: 151 },
    rightShoulder: { x: 223, y: 151 },
    leftElbow: { x: 196, y: 179 },
    rightElbow: { x: 220, y: 180 },
    leftHand: { x: 193, y: 205 },
    rightHand: { x: 224, y: 208 },
    pelvis: { x: 211, y: 224 },
    leftHip: { x: 204, y: 223 },
    rightHip: { x: 218, y: 223 },
    leftKnee: { x: 190, y: 252 },
    rightKnee: { x: 225, y: 253 },
    leftFoot: { x: 172, y: 278 },
    rightFoot: { x: 244, y: 281 },
  },
  {
    phase: 0.25,
    headCenter: { x: 210, y: 87 },
    neck: { x: 211, y: 141 },
    leftShoulder: { x: 198, y: 149 },
    rightShoulder: { x: 222, y: 149 },
    leftElbow: { x: 201, y: 177 },
    rightElbow: { x: 216, y: 178 },
    leftHand: { x: 203, y: 202 },
    rightHand: { x: 215, y: 204 },
    pelvis: { x: 211, y: 217 },
    leftHip: { x: 204, y: 217 },
    rightHip: { x: 218, y: 217 },
    leftKnee: { x: 203, y: 247 },
    rightKnee: { x: 211, y: 246 },
    leftFoot: { x: 194, y: 279 },
    rightFoot: { x: 221, y: 276 },
  },
  {
    phase: 0.375,
    headCenter: { x: 210, y: 86 },
    neck: { x: 211, y: 140 },
    leftShoulder: { x: 199, y: 148 },
    rightShoulder: { x: 222, y: 148 },
    leftElbow: { x: 208, y: 176 },
    rightElbow: { x: 211, y: 176 },
    leftHand: { x: 217, y: 201 },
    rightHand: { x: 205, y: 202 },
    pelvis: { x: 211, y: 214 },
    leftHip: { x: 204, y: 214 },
    rightHip: { x: 218, y: 214 },
    leftKnee: { x: 218, y: 244 },
    rightKnee: { x: 196, y: 242 },
    leftFoot: { x: 237, y: 277 },
    rightFoot: { x: 199, y: 267 },
  },
  {
    phase: 0.5,
    headCenter: { x: 210, y: 88 },
    neck: { x: 211, y: 142 },
    leftShoulder: { x: 197, y: 150 },
    rightShoulder: { x: 223, y: 150 },
    leftElbow: { x: 221, y: 178 },
    rightElbow: { x: 194, y: 179 },
    leftHand: { x: 225, y: 207 },
    rightHand: { x: 190, y: 208 },
    pelvis: { x: 211, y: 221 },
    leftHip: { x: 203, y: 220 },
    rightHip: { x: 219, y: 220 },
    leftKnee: { x: 235, y: 251 },
    rightKnee: { x: 183, y: 250 },
    leftFoot: { x: 256, y: 281 },
    rightFoot: { x: 158, y: 278 },
  },
  {
    phase: 0.625,
    headCenter: { x: 210, y: 90 },
    neck: { x: 211, y: 144 },
    leftShoulder: { x: 198, y: 151 },
    rightShoulder: { x: 223, y: 151 },
    leftElbow: { x: 220, y: 180 },
    rightElbow: { x: 196, y: 179 },
    leftHand: { x: 224, y: 208 },
    rightHand: { x: 193, y: 205 },
    pelvis: { x: 211, y: 224 },
    leftHip: { x: 204, y: 223 },
    rightHip: { x: 218, y: 223 },
    leftKnee: { x: 225, y: 253 },
    rightKnee: { x: 190, y: 252 },
    leftFoot: { x: 244, y: 281 },
    rightFoot: { x: 172, y: 278 },
  },
  {
    phase: 0.75,
    headCenter: { x: 210, y: 87 },
    neck: { x: 211, y: 141 },
    leftShoulder: { x: 198, y: 149 },
    rightShoulder: { x: 222, y: 149 },
    leftElbow: { x: 216, y: 178 },
    rightElbow: { x: 201, y: 177 },
    leftHand: { x: 215, y: 204 },
    rightHand: { x: 203, y: 202 },
    pelvis: { x: 211, y: 217 },
    leftHip: { x: 204, y: 217 },
    rightHip: { x: 218, y: 217 },
    leftKnee: { x: 211, y: 246 },
    rightKnee: { x: 203, y: 247 },
    leftFoot: { x: 221, y: 276 },
    rightFoot: { x: 194, y: 279 },
  },
  {
    phase: 0.875,
    headCenter: { x: 210, y: 86 },
    neck: { x: 211, y: 140 },
    leftShoulder: { x: 199, y: 148 },
    rightShoulder: { x: 222, y: 148 },
    leftElbow: { x: 211, y: 176 },
    rightElbow: { x: 208, y: 176 },
    leftHand: { x: 205, y: 202 },
    rightHand: { x: 217, y: 201 },
    pelvis: { x: 211, y: 214 },
    leftHip: { x: 204, y: 214 },
    rightHip: { x: 218, y: 214 },
    leftKnee: { x: 196, y: 242 },
    rightKnee: { x: 218, y: 244 },
    leftFoot: { x: 199, y: 267 },
    rightFoot: { x: 237, y: 277 },
  },
  {
    phase: 1,
    headCenter: { x: 210, y: 88 },
    neck: { x: 211, y: 142 },
    leftShoulder: { x: 197, y: 150 },
    rightShoulder: { x: 223, y: 150 },
    leftElbow: { x: 194, y: 179 },
    rightElbow: { x: 221, y: 178 },
    leftHand: { x: 190, y: 208 },
    rightHand: { x: 225, y: 207 },
    pelvis: { x: 211, y: 221 },
    leftHip: { x: 203, y: 220 },
    rightHip: { x: 219, y: 220 },
    leftKnee: { x: 183, y: 250 },
    rightKnee: { x: 235, y: 251 },
    leftFoot: { x: 158, y: 278 },
    rightFoot: { x: 256, y: 281 },
  },
];

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}

function mix(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}

function mixPoint(a: Point, b: Point, amount: number): Point {
  return {
    x: mix(a.x, b.x, amount),
    y: mix(a.y, b.y, amount),
  };
}

function mixFrame(a: WalkFrame, b: WalkFrame, amount: number): WalkFrame {
  const eased = smoothstep(amount);

  return {
    headCenter: mixPoint(a.headCenter, b.headCenter, eased),
    neck: mixPoint(a.neck, b.neck, eased),
    leftShoulder: mixPoint(a.leftShoulder, b.leftShoulder, eased),
    rightShoulder: mixPoint(a.rightShoulder, b.rightShoulder, eased),
    leftElbow: mixPoint(a.leftElbow, b.leftElbow, eased),
    rightElbow: mixPoint(a.rightElbow, b.rightElbow, eased),
    leftHand: mixPoint(a.leftHand, b.leftHand, eased),
    rightHand: mixPoint(a.rightHand, b.rightHand, eased),
    pelvis: mixPoint(a.pelvis, b.pelvis, eased),
    leftHip: mixPoint(a.leftHip, b.leftHip, eased),
    rightHip: mixPoint(a.rightHip, b.rightHip, eased),
    leftKnee: mixPoint(a.leftKnee, b.leftKnee, eased),
    rightKnee: mixPoint(a.rightKnee, b.rightKnee, eased),
    leftFoot: mixPoint(a.leftFoot, b.leftFoot, eased),
    rightFoot: mixPoint(a.rightFoot, b.rightFoot, eased),
  };
}

function getFrameAtPhase(normalized: number): WalkFrame {
  for (let index = 0; index < KEY_FRAMES.length - 1; index += 1) {
    const current = KEY_FRAMES[index]!;
    const next = KEY_FRAMES[index + 1]!;

    if (normalized >= current.phase && normalized <= next.phase) {
      const span = next.phase - current.phase;
      return mixFrame(current, next, span === 0 ? 0 : (normalized - current.phase) / span);
    }
  }

  return KEY_FRAMES[0]!;
}

export function sampleWalkCycle(timeMs: number): WalkCycleSample {
  const loopTime = ((timeMs % CYCLE_DURATION_MS) + CYCLE_DURATION_MS) % CYCLE_DURATION_MS;
  const normalized = loopTime / CYCLE_DURATION_MS;

  return {
    cycleDurationMs: CYCLE_DURATION_MS,
    phase: normalized,
    frame: getFrameAtPhase(normalized),
  };
}
