import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeSan, parsePgn } from '../src/domain/pgn';

const caroKann = readFileSync(new URL('./fixtures/caro-kann.pgn', import.meta.url), 'utf8');

describe('normalizeSan', () => {
  it('strips check, mate and annotation marks', () => {
    expect(normalizeSan('Qa5+')).toBe('Qa5');
    expect(normalizeSan('Qxf7#')).toBe('Qxf7');
    expect(normalizeSan('e4!?')).toBe('e4');
  });

  it('converts zero-based castling', () => {
    expect(normalizeSan('0-0')).toBe('O-O');
    expect(normalizeSan('0-0-0')).toBe('O-O-O');
  });
});

describe('parsePgn', () => {
  it('parses every chapter of a Lichess study export', () => {
    const chapters = parsePgn(caroKann);
    expect(chapters).toHaveLength(2);
    expect(chapters.every((c) => c.study === 'Caro-Kann Defense')).toBe(true);
    expect(chapters.every((c) => c.orientation === 'black')).toBe(true);
    expect(chapters[0]?.name).toBe('d4 Heist');
  });

  it('builds the main line as a chain of nodes', () => {
    const [chapter] = parsePgn(caroKann);
    const first = chapter?.root.children[0];
    expect(first?.san).toBe('e4');
    expect(first?.children[0]?.san).toBe('c6');
    expect(first?.children[0]?.ply).toBe(2);
  });

  it('keeps variations as siblings', () => {
    const [chapter] = parsePgn('[Event "T"]\n\n1. e4 (1. d4 d5) 1... e5 *');
    expect(chapter?.root.children.map((n) => n.san)).toEqual(['e4', 'd4']);
    expect(chapter?.root.children[0]?.children[0]?.san).toBe('e5');
    expect(chapter?.root.children[1]?.children[0]?.san).toBe('d5');
  });

  it('attaches comments to the preceding move and ignores NAGs and results', () => {
    const [chapter] = parsePgn('[Event "T"]\n\n1. e4 $1 { [%cal Ge2e4] nice } e5 1-0');
    const e4 = chapter?.root.children[0];
    expect(e4?.comment).toContain('%cal Ge2e4');
    expect(e4?.children).toHaveLength(1);
  });

  it('splits several games and derives defaults from missing headers', () => {
    const chapters = parsePgn('[Event "Study: One"]\n\n1. e4 *\n\n[Event "Study: Two"]\n\n1. d4 *');
    expect(chapters.map((c) => c.study)).toEqual(['Study', 'Study']);
    expect(chapters.map((c) => c.name)).toEqual(['Study: One', 'Study: Two']);
    expect(chapters.every((c) => c.orientation === 'white')).toBe(true);
  });

  it('records a custom starting position', () => {
    const [chapter] = parsePgn('[Event "T"]\n[FEN "8/8/8/8/8/8/8/K6k w - - 0 1"]\n\n1. Kb2 *');
    expect(chapter?.startFen).toBe('8/8/8/8/8/8/8/K6k w - - 0 1');
  });

  it('returns no chapter for empty input', () => {
    expect(parsePgn('  \n')).toEqual([]);
  });
});
