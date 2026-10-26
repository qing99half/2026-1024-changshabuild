// Clockwise compass headings, beginning at world-space up.
const diagonal = Math.SQRT1_2;
const vectors = Object.freeze([
  Object.freeze({ x: 0, y: 1 }),
  Object.freeze({ x: diagonal, y: diagonal }),
  Object.freeze({ x: 1, y: 0 }),
  Object.freeze({ x: diagonal, y: -diagonal }),
  Object.freeze({ x: 0, y: -1 }),
  Object.freeze({ x: -diagonal, y: -diagonal }),
  Object.freeze({ x: -1, y: 0 }),
  Object.freeze({ x: -diagonal, y: diagonal })
]);

function validHeading(heading) {
  if (!Number.isInteger(heading) || heading < 0 || heading > 7)
    throw new RangeError('Heading must be an integer from 0 to 7');
}

export function directionVector(heading) {
  validHeading(heading);
  return vectors[heading];
}

export function turnHeading(heading, clockwise, angle45 = false) {
  validHeading(heading);
  const step = angle45 ? 1 : 2;
  return (heading + (clockwise ? step : 8 - step)) % 8;
}

// A diagonal shares its sound band with the next clockwise cardinal heading.
// Original melody samples only define the four cardinal directions.
export function toneDirection(heading) {
  validHeading(heading);
  return Math.floor((heading + 1) / 2) % 4;
}
