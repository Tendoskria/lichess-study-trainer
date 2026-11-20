import { describe, expect, it } from 'vitest';
import { parsePgn } from '../src/domain/pgn';
import type { TrainingSession } from '../src/domain/training';
import { startSession } from '../src/domain/training';

const WHITE = `[Event "S: w"]
[Orientation "white"]

1. e4 e5 2. Nf3 (2. Bc4 { [%cal Gc4f7] }) 2... Nc6 *`;

const BLACK = `[Event "S: b"]
[Orientation "black"]

1. e4 c6 2. d4 d5 *`;

const BLACK_ANNOTATED = `[Event "S: a"]
[Orientation "black"]

1. e4 { [%csl Rd5][%cal Ge2e4] } c6 2. d4 d5 *`;

function sessionFor(pgn: string, mode: 'random' | 'beginning' = 'beginning'): TrainingSession {
  const session = startSession(parsePgn(pgn), mode, () => 0);
  if (!session) throw new Error('no session');
  return session;
}

describe('TrainingSession (white)', () => {
  it('waits for the user at the start of a white chapter', () => {
    const s = sessionFor(WHITE);
    expect(s.awaitingUser).toBe(true);
    expect(s.legalTargets('e2').map((t) => t.square)).toEqual(['e3', 'e4']);
    expect(s.ownsPiece('e2')).toBe(true);
    expect(s.ownsPiece('e7')).toBe(false);
  });

  it('distinguishes illegal, wrong and correct moves', () => {
    const s = sessionFor(WHITE);
    expect(s.attempt('e2', 'e5')).toEqual({ status: 'illegal' });
    expect(s.attempt('d2', 'd4')).toEqual({ status: 'wrong', tries: 1 });
    expect(s.attempt('a2', 'a3')).toEqual({ status: 'wrong', tries: 2 });
    expect(s.history).toEqual([]);

    expect(s.attempt('e2', 'e4')).toEqual({ status: 'correct', san: 'e4', finished: false });
    expect(s.tries).toBe(0);
    expect(s.history).toEqual(['e4']);
  });

  it('plays the opponent reply, then accepts any variation of the study', () => {
    const s = sessionFor(WHITE);
    s.attempt('e2', 'e4');
    expect(s.awaitingOpponent).toBe(true);
    expect(s.playOpponent()).toBe(true);
    expect(s.history).toEqual(['e4', 'e5']);

    const bishop = s.attempt('f1', 'c4');
    expect(bishop.status).toBe('correct');
    expect(s.authorShapes.arrows).toEqual([{ from: 'c4', to: 'f7', color: 'G' }]);
  });

  it('finishes the line and refuses further play', () => {
    const s = sessionFor(WHITE);
    s.attempt('e2', 'e4');
    s.playOpponent();
    s.attempt('g1', 'f3');
    s.playOpponent();
    expect(s.isFinished).toBe(true);
    expect(s.awaitingUser).toBe(false);
    expect(s.attempt('d2', 'd4')).toEqual({ status: 'ignored' });
    expect(s.playOpponent()).toBe(false);
  });

  it('offers a hint and reveals the expected moves', () => {
    const s = sessionFor(WHITE);
    s.hint();
    expect(s.requestedShapes.marks).toEqual([{ square: 'e2', color: 'Y' }]);
    expect(s.requestedShapes.arrows).toEqual([]);
    expect(s.reveal()).toEqual(['e4']);
    expect(s.requestedShapes.arrows).toEqual([{ from: 'e2', to: 'e4', color: 'G' }]);
  });
});

describe('TrainingSession (black)', () => {
  it('lets the opponent open when the user studies black', () => {
    const s = sessionFor(BLACK);
    expect(s.awaitingOpponent).toBe(true);
    expect(s.awaitingUser).toBe(false);
    s.playOpponent();
    expect(s.awaitingUser).toBe(true);
    expect(s.attempt('c7', 'c6').status).toBe('correct');
  });

  it('starts from an arbitrary position in random mode', () => {
    const s = sessionFor(BLACK, 'random');
    expect(s.history).toEqual(['e4']);
    expect(s.awaitingUser).toBe(true);
    expect(s.position().lastMove).toEqual({ from: 'e2', to: 'e4' });
  });
});

describe('author annotations', () => {
  it('shows the annotations of the opponent move when it is the user turn', () => {
    const s = sessionFor(BLACK_ANNOTATED);
    expect(s.authorShapes.arrows).toEqual([]);
    s.playOpponent();
    expect(s.awaitingUser).toBe(true);
    expect(s.authorShapes.arrows).toEqual([{ from: 'e2', to: 'e4', color: 'G' }]);
    expect(s.authorShapes.marks).toEqual([{ square: 'd5', color: 'R' }]);
  });

  it('shows them from the start when the exercise begins on an annotated position', () => {
    const s = sessionFor(BLACK_ANNOTATED, 'random');
    expect(s.awaitingUser).toBe(true);
    expect(s.authorShapes.arrows).toHaveLength(1);
  });

  it('keeps them on the board after a wrong answer', () => {
    const s = sessionFor(BLACK_ANNOTATED, 'random');
    expect(s.attempt('a7', 'a6').status).toBe('wrong');
    expect(s.authorShapes.arrows).toHaveLength(1);
  });
});

describe('hint', () => {
  it('only highlights the piece to move, never the author annotations or the destination', () => {
    const s = sessionFor(BLACK_ANNOTATED, 'random');
    s.hint();
    expect(s.requestedShapes).toEqual({ arrows: [], marks: [{ square: 'c7', color: 'Y' }] });
    expect(s.authorShapes.arrows).toHaveLength(1); // untouched: the lightbulb owns these
  });

  it('highlights each origin square once when several moves are expected', () => {
    const s = sessionFor('[Event "S: m"]\n[Orientation "white"]\n\n1. e4 (1. e3) 1... e5 *');
    s.hint();
    expect(s.requestedShapes.marks).toEqual([{ square: 'e2', color: 'Y' }]);
  });

  it('is cleared once the user answers', () => {
    const s = sessionFor(BLACK_ANNOTATED, 'random');
    s.hint();
    s.attempt('c7', 'c6');
    expect(s.requestedShapes.marks).toEqual([]);
  });
});

describe('history browsing', () => {
  it('shows earlier positions without touching the live game', () => {
    const s = sessionFor(WHITE);
    s.attempt('e2', 'e4');
    s.playOpponent();

    s.step(-1);
    expect(s.isBrowsing).toBe(true);
    expect(s.ply).toBe(1);
    expect(s.position().pieces).toHaveLength(32);
    expect(s.position().pieces.some((p) => p.square === 'e5')).toBe(false);
    expect(s.attempt('g1', 'f3')).toEqual({ status: 'ignored' });
    expect(s.authorShapes.arrows).toEqual([]);
    expect(s.requestedShapes.marks).toEqual([]);

    s.goTo(0);
    expect(s.position().lastMove).toBeNull();
    s.goTo(99);
    expect(s.isBrowsing).toBe(false);
    expect(s.ply).toBe(2);
    expect(s.awaitingUser).toBe(true);
  });
});

describe('captures', () => {
  it('reports whether the last live move was a capture', () => {
    const s = sessionFor('[Event "S: c"]\n\n1. e4 d5 2. exd5 *');
    expect(s.lastCapture).toBe(false);

    s.attempt('e2', 'e4');
    expect(s.lastCapture).toBe(false);
    s.playOpponent();
    expect(s.lastCapture).toBe(false);

    s.attempt('e4', 'd5');
    expect(s.lastCapture).toBe(true);
  });
});

describe('startSession', () => {
  it('returns null when there is no chapter', () => {
    expect(startSession([], 'random')).toBeNull();
  });
});
