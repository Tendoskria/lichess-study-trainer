import { describe, expect, it } from 'vitest';
import { hasShapes, mergeShapes, parseShapes } from '../src/domain/shapes';
import { NO_SHAPES } from '../src/domain/types';

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

describe('mergeShapes', () => {
  const a = parseShapes('[%cal Ge2e4][%csl Rd5]');
  const b = parseShapes('[%cal Gd2d4][%csl Yc3]');

  it('draws both sets of shapes', () => {
    const merged = mergeShapes(a, b);
    expect(merged.arrows).toHaveLength(2);
    expect(merged.marks).toHaveLength(2);
  });

  it('returns the other set untouched when one is empty', () => {
    expect(mergeShapes(a, NO_SHAPES)).toBe(a);
    expect(mergeShapes(NO_SHAPES, b)).toBe(b);
  });
});
