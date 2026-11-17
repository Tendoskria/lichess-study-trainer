import { describe, expect, it } from 'vitest';
import {
  arrowGeometry,
  BOARD_SIZE,
  pointToSquare,
  SQUARE_SIZE,
  squareCenter,
  squareOrigin,
} from '../src/ui/geometry';

describe('board geometry', () => {
  it('places a1 bottom-left for white and top-right for black', () => {
    expect(squareOrigin('a1', 'white')).toEqual({ x: 0, y: 7 * SQUARE_SIZE });
    expect(squareOrigin('a1', 'black')).toEqual({ x: 7 * SQUARE_SIZE, y: 0 });
    expect(squareOrigin('h8', 'white')).toEqual({ x: 7 * SQUARE_SIZE, y: 0 });
  });

  it('maps points back to squares (round trip) for both orientations', () => {
    for (const orientation of ['white', 'black'] as const) {
      for (const square of ['a1', 'h1', 'a8', 'h8', 'e4', 'd5'] as const) {
        const { x, y } = squareCenter(square, orientation);
        expect(pointToSquare(x, y, orientation)).toBe(square);
      }
    }
  });

  it('returns null outside the board', () => {
    expect(pointToSquare(-1, 10, 'white')).toBeNull();
    expect(pointToSquare(10, BOARD_SIZE, 'white')).toBeNull();
  });

  it('computes an arrow whose head ends near the target centre', () => {
    const { shaftStart, shaftEnd, head } = arrowGeometry('e2', 'e4', 'white');
    expect(shaftStart).toEqual(squareCenter('e2', 'white'));
    expect(shaftEnd.x).toBeCloseTo(shaftStart.x);
    expect(shaftEnd.y).toBeLessThan(shaftStart.y);
    expect(head.split(' ')).toHaveLength(3);
  });
});
