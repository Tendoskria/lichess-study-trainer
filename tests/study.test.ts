import { describe, expect, it } from 'vitest';
import { parsePgn } from '../src/domain/pgn';
import {
  chaptersOfStudy,
  isTrainable,
  isUserTurn,
  pathTo,
  studyNames,
  trainableNodes,
} from '../src/domain/study';

const PGN = `[Event "A: white"]
[StudyName "A"]
[ChapterName "white"]

1. e4 e5 2. Nf3 (2. Bc4) 2... Nc6 *

[Event "B: black"]
[StudyName "B"]
[ChapterName "black"]
[Orientation "black"]

1. e4 c6 *
`;

describe('study helpers', () => {
  const [white, black] = parsePgn(PGN);
  if (!white || !black) throw new Error('fixture');

  it('knows whose turn it is at each node', () => {
    expect(isUserTurn(white.root, 'white')).toBe(true);
    expect(isUserTurn(white.root, 'black')).toBe(false);
    expect(isUserTurn(black.root.children[0] as never, 'black')).toBe(true);
  });

  it('lists every position of the studied side, variations included', () => {
    // White to move at the root and after 1. e4 e5; nothing to play after 2... Nc6.
    expect(
      trainableNodes(white)
        .map((n) => n.ply)
        .sort(),
    ).toEqual([0, 2]);
    expect(trainableNodes(black).map((n) => n.ply)).toEqual([1]);
  });

  it('returns the path from the root to a node', () => {
    const e5 = white.root.children[0]?.children[0];
    expect(e5 && pathTo(e5).map((n) => n.san)).toEqual(['e4', 'e5']);
    expect(pathTo(white.root)).toEqual([]);
  });

  it('groups chapters by study', () => {
    expect(studyNames([white, black])).toEqual(['A', 'B']);
    expect(chaptersOfStudy([white, black], 'B')).toEqual([black]);
    expect(chaptersOfStudy([white, black], null)).toHaveLength(2);
  });
});

describe('isTrainable', () => {
  const trainable = (pgn: string): boolean => parsePgn(pgn).every(isTrainable);

  it('accepts a legal chapter, variations included', () => {
    expect(trainable(PGN)).toBe(true);
  });

  it('rejects illegal moves, even inside a variation', () => {
    expect(trainable('[Event "T"]\n\n1. e4 e5 (1... e4) *')).toBe(false);
    expect(trainable('not a pgn')).toBe(false);
  });

  it('rejects custom starting positions and chapters with nothing to play', () => {
    const fen = '8/8/8/8/8/8/8/K6k w - - 0 1';
    expect(trainable(`[Event "T"]\n[FEN "${fen}"]\n\n1. Kb2 *`)).toBe(false);
    expect(trainable('[Event "T"]\n\n*')).toBe(false);
  });
});
