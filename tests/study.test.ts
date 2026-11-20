import { describe, expect, it } from 'vitest';
import { parsePgn } from '../src/domain/pgn';
import {
  chapterSections,
  chaptersOfStudy,
  isTrainable,
  isUserTurn,
  pathTo,
  selectChapters,
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

describe('multi-study selection', () => {
  const pgn = (study: string, chapter: string): string =>
    // prettier-ignore
    `[Event "${study}: ${chapter}"]\n[StudyName "${study}"]\n[ChapterName "${chapter}"]\n\n1. e4 e5 *\n`;
  // Chapters of study A are interleaved with those of B to check the grouping.
  const chapters = parsePgn(
    [pgn('A', 'a1'), pgn('B', 'b1'), pgn('A', 'a2'), pgn('C', 'c1')].join('\n'),
  );
  const names = (list: readonly { name: string }[]): string[] => list.map((c) => c.name);

  it('shows every study, one section each, when none is selected', () => {
    const sections = chapterSections(chapters);
    expect(sections.map((s) => s.study)).toEqual(['A', 'B', 'C']);
    expect(sections.map((s) => s.entries.map((e) => e.index))).toEqual([[0, 2], [1], [3]]);
  });

  it('only keeps the chapters of the selected studies, sorted by study', () => {
    const sections = chapterSections(chapters, new Set(['C', 'A']));
    expect(sections.map((s) => s.study)).toEqual(['A', 'C']);
    expect(names(sections.flatMap((s) => s.entries.map((e) => e.chapter)))).toEqual([
      'a1',
      'a2',
      'c1',
    ]);
  });

  it('trains on all visible chapters when none is picked', () => {
    expect(names(selectChapters(chapters, new Set(), new Set()))).toEqual(['a1', 'a2', 'b1', 'c1']);
    expect(names(selectChapters(chapters, new Set(['A', 'B']), new Set()))).toEqual([
      'a1',
      'a2',
      'b1',
    ]);
  });

  it('trains on the picked chapters only', () => {
    expect(names(selectChapters(chapters, new Set(), new Set([3, 1])))).toEqual(['b1', 'c1']);
  });

  it('ignores picked chapters of studies that are no longer selected', () => {
    // Chapter 3 (c1) is hidden once only A is selected: fall back to all of A.
    expect(names(selectChapters(chapters, new Set(['A']), new Set([3])))).toEqual(['a1', 'a2']);
    expect(names(selectChapters(chapters, new Set(['A']), new Set([3, 2])))).toEqual(['a2']);
  });
});
