import type { Orientation, Square } from '../domain/types';

export const SQUARE_SIZE = 60;
export const BOARD_SIZE = SQUARE_SIZE * 8;
const FILES = 'abcdefgh';

export interface Point {
  readonly x: number;
  readonly y: number;
}

function indices(square: Square): { file: number; rank: number } {
  return { file: square.charCodeAt(0) - 97, rank: Number(square.charAt(1)) - 1 };
}

/** Top-left corner of a square in board units, for the given orientation. */
export function squareOrigin(square: Square, orientation: Orientation): Point {
  const { file, rank } = indices(square);
  return orientation === 'white'
    ? { x: file * SQUARE_SIZE, y: (7 - rank) * SQUARE_SIZE }
    : { x: (7 - file) * SQUARE_SIZE, y: rank * SQUARE_SIZE };
}

export function squareCenter(square: Square, orientation: Orientation): Point {
  const { x, y } = squareOrigin(square, orientation);
  return { x: x + SQUARE_SIZE / 2, y: y + SQUARE_SIZE / 2 };
}

/** Square under a point given in board units, or null when outside the board. */
export function pointToSquare(x: number, y: number, orientation: Orientation): Square | null {
  const column = Math.floor(x / SQUARE_SIZE);
  const row = Math.floor(y / SQUARE_SIZE);
  if (column < 0 || column > 7 || row < 0 || row > 7) return null;
  const file = orientation === 'white' ? column : 7 - column;
  const rank = orientation === 'white' ? 7 - row : row;
  return `${FILES.charAt(file)}${rank + 1}` as Square;
}

export interface ArrowGeometry {
  readonly shaftStart: Point;
  readonly shaftEnd: Point;
  /** `points` attribute of the arrow head polygon. */
  readonly head: string;
}

export function arrowGeometry(from: Square, to: Square, orientation: Orientation): ArrowGeometry {
  const a = squareCenter(from, orientation);
  const b = squareCenter(to, orientation);
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / length;
  const uy = (b.y - a.y) / length;

  const tip = { x: b.x - ux * SQUARE_SIZE * 0.1, y: b.y - uy * SQUARE_SIZE * 0.1 };
  const base = { x: tip.x - ux * SQUARE_SIZE * 0.3, y: tip.y - uy * SQUARE_SIZE * 0.3 };
  const half = SQUARE_SIZE * 0.17;
  const left = { x: base.x - uy * half, y: base.y + ux * half };
  const right = { x: base.x + uy * half, y: base.y - ux * half };

  return {
    shaftStart: a,
    shaftEnd: base,
    head: `${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`,
  };
}

/** SVG path of a square with a circular hole, used to flag capturable pieces. */
export function captureRingPath(origin: Point): string {
  const r = SQUARE_SIZE / 2;
  const { x, y } = origin;
  return (
    `M${x} ${y}h${SQUARE_SIZE}v${SQUARE_SIZE}h${-SQUARE_SIZE}z` +
    `M${x} ${y + r}a${r} ${r} 0 1 0 ${SQUARE_SIZE} 0a${r} ${r} 0 1 0 ${-SQUARE_SIZE} 0z`
  );
}
