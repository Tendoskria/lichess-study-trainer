import { describe, expect, it } from 'vitest';
import { hasShapes, parseShapes } from '../src/domain/shapes';

describe('parseShapes', () => {
  it('reads arrows and highlighted squares', () => {
    const shapes = parseShapes('text [%csl Gd4,Rf6][%cal Gc3d4,Ye2e4]');
    expect(shapes.arrows).toEqual([
      { from: 'c3', to: 'd4', color: 'G' },
      { from: 'e2', to: 'e4', color: 'Y' },
    ]);
    expect(shapes.marks).toEqual([
      { square: 'd4', color: 'G' },
      { square: 'f6', color: 'R' },
    ]);
  });

  it('ignores malformed entries', () => {
    const shapes = parseShapes('[%cal Zc3d4,Gz9d4,G] [%csl Gk1]');
    expect(hasShapes(shapes)).toBe(false);
  });

  it('returns no shapes for a plain comment', () => {
    expect(hasShapes(parseShapes('just words'))).toBe(false);
  });
});
