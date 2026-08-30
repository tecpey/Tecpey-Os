export type TecpeyMotionMark = {
  seed: number;
  size: number;
  opacity: number;
  speed: number;
  phase: number;
  drift: number;
};

export type TecpeyMotionMarkFrame = {
  x: number;
  y: number;
  opacity: number;
  cycleIndex: number;
};

export const TECPEY_MOTION_MARKS = [
  { seed: 17, size: 18, opacity: 0.1, speed: 0.48, phase: 0.04, drift: 5 },
  { seed: 43, size: 24, opacity: 0.13, speed: 0.64, phase: 0.16, drift: 7 },
  { seed: 71, size: 32, opacity: 0.14, speed: 0.82, phase: 0.29, drift: 9 },
  { seed: 101, size: 20, opacity: 0.09, speed: 0.55, phase: 0.41, drift: 6 },
  { seed: 137, size: 38, opacity: 0.12, speed: 0.92, phase: 0.54, drift: 11 },
  { seed: 173, size: 26, opacity: 0.11, speed: 0.71, phase: 0.68, drift: 8 },
  { seed: 211, size: 16, opacity: 0.08, speed: 0.59, phase: 0.81, drift: 5 },
  { seed: 251, size: 30, opacity: 0.12, speed: 0.86, phase: 0.93, drift: 10 },
  { seed: 293, size: 22, opacity: 0.09, speed: 0.67, phase: 0.35, drift: 6 },
  { seed: 337, size: 28, opacity: 0.11, speed: 0.76, phase: 0.73, drift: 9 },
  { seed: 383, size: 14, opacity: 0.08, speed: 0.52, phase: 0.23, drift: 4 },
  { seed: 431, size: 34, opacity: 0.12, speed: 0.89, phase: 0.62, drift: 10 },
  { seed: 479, size: 19, opacity: 0.09, speed: 0.61, phase: 0.87, drift: 5 },
  { seed: 523, size: 25, opacity: 0.1, speed: 0.79, phase: 0.48, drift: 8 },
] as const satisfies readonly TecpeyMotionMark[];

function positiveModulo(value: number, modulus: number) {
  return ((value % modulus) + modulus) % modulus;
}

export function hashTecpeyMotionRoute(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seededTecpeyMotionUnit(seed: number) {
  let value = seed >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  value ^= value >>> 15;
  return (value >>> 0) / 4_294_967_296;
}

export function calculateTecpeyMotionMarkFrame(
  mark: TecpeyMotionMark,
  options: {
    scrollY: number;
    viewportWidth: number;
    viewportHeight: number;
    routeSeed: number;
  }
): TecpeyMotionMarkFrame {
  const { scrollY, viewportWidth, viewportHeight, routeSeed } = options;
  const edgeMargin = Math.max(mark.size * 2, 72);
  const cycleTravel = viewportHeight + edgeMargin * 2;
  const travelled = Math.max(0, scrollY) * mark.speed + mark.phase * cycleTravel;
  const cycleIndex = Math.floor(travelled / cycleTravel);
  const progress = positiveModulo(travelled, cycleTravel) / cycleTravel;
  const y = viewportHeight + edgeMargin - progress * cycleTravel;
  const horizontalPadding = Math.max(18, mark.size * 0.75);
  const horizontalRange = Math.max(
    0,
    viewportWidth - horizontalPadding * 2 - mark.size
  );
  const xSeed = routeSeed + mark.seed + cycleIndex * 101;
  const baseX = horizontalPadding + seededTecpeyMotionUnit(xSeed) * horizontalRange;
  const driftX = Math.sin(progress * Math.PI * 2 + mark.seed) * mark.drift;
  const fadeBand = 0.13;
  const fadeIn = Math.min(progress / fadeBand, 1);
  const fadeOut = Math.min((1 - progress) / fadeBand, 1);
  const opacity = mark.opacity * Math.max(0, Math.min(fadeIn, fadeOut));

  return {
    x: baseX + driftX,
    y,
    opacity,
    cycleIndex,
  };
}
