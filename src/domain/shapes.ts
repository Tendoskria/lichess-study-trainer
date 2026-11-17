import { NO_SHAPES } from './types';
import type { Arrow, Mark, ShapeColor, Shapes, Square } from './types';

const SQUARE = /^[a-h][1-8]$/;

function isSquare(value: string): value is Square {
  return SQUARE.test(value);
}

function isShapeColor(value: string): value is ShapeColor {
  return value === 'G' || value === 'R' || value === 'B' || value === 'Y';
}

function entries(comment: string, command: 'cal' | 'csl'): string[] {
  const match = new RegExp(`%${command} ([^\\]]+)`).exec(comment);
  return (match?.[1] ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** Extracts the arrows (`%cal`) and highlighted squares (`%csl`) of a PGN comment. */
export function parseShapes(comment: string): Shapes {
  const arrows: Arrow[] = [];
  for (const entry of entries(comment, 'cal')) {
    const color = entry.charAt(0);
    const from = entry.slice(1, 3);
    const to = entry.slice(3, 5);
    if (isShapeColor(color) && isSquare(from) && isSquare(to)) arrows.push({ from, to, color });
  }

  const marks: Mark[] = [];
  for (const entry of entries(comment, 'csl')) {
    const color = entry.charAt(0);
    const square = entry.slice(1, 3);
    if (isShapeColor(color) && isSquare(square)) marks.push({ square, color });
  }

  return arrows.length === 0 && marks.length === 0 ? NO_SHAPES : { arrows, marks };
}

export function hasShapes(shapes: Shapes): boolean {
  return shapes.arrows.length > 0 || shapes.marks.length > 0;
}
