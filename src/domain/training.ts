import { Chess } from 'chess.js';
import type { Move } from 'chess.js';
import { normalizeSan } from './pgn';
import { hasShapes, parseShapes } from './shapes';
import { isUserTurn, pathTo, trainableNodes } from './study';
import { NO_SHAPES } from './types';
import type {
  Chapter,
  Color,
  LastMove,
  MoveNode,
  Orientation,
  PieceOnSquare,
  Shapes,
  Square,
} from './types';

export type StartMode = 'random' | 'beginning';
export type Rng = () => number;

export interface Target {
  readonly square: Square;
  readonly capture: boolean;
}

export type AttemptResult =
  /** Not the user's turn, or the user is browsing the history. */
  | { readonly status: 'ignored' }
  | { readonly status: 'illegal' }
  | { readonly status: 'wrong'; readonly tries: number }
  | { readonly status: 'correct'; readonly san: string; readonly finished: boolean };

export interface PositionSnapshot {
  readonly pieces: PieceOnSquare[];
  readonly lastMove: LastMove | null;
}

function toPieces(chess: Chess): PieceOnSquare[] {
  return chess
    .board()
    .flatMap((rank) =>
      rank.flatMap((cell) =>
        cell ? [{ square: cell.square, type: cell.type, color: cell.color }] : [],
      ),
    );
}

export function initialPieces(): PieceOnSquare[] {
  return toPieces(new Chess());
}

function replay(sans: readonly string[]): {
  chess: Chess;
  played: string[];
  last: LastMove | null;
} {
  const chess = new Chess();
  const played: string[] = [];
  let last: LastMove | null = null;
  for (const san of sans) {
    const move = chess.move(san);
    played.push(move.san);
    last = { from: move.from, to: move.to };
  }
  return { chess, played, last };
}

/**
 * One training exercise: replays a chapter up to a starting position, then quizzes the user
 * on each move of the studied side while playing the opponent's replies.
 *
 * This class is pure game logic (no DOM, no timers) so it can be unit-tested in isolation.
 */
export class TrainingSession {
  private readonly chess: Chess;
  private readonly played: string[];
  private current: MoveNode;
  private last: LastMove | null;
  private wrongAttempts = 0;
  private viewedPly: number | null = null;
  private annotations: Shapes = NO_SHAPES;

  constructor(
    readonly chapter: Chapter,
    startNode: MoveNode,
    private readonly rng: Rng = Math.random,
  ) {
    const path = pathTo(startNode).flatMap((node) => (node.san === null ? [] : [node.san]));
    const { chess, played, last } = replay(path);
    this.chess = chess;
    this.played = played;
    this.last = last;
    this.current = startNode;
  }

  get orientation(): Orientation {
    return this.chapter.orientation;
  }

  /** SAN of every move played so far on the live board. */
  get history(): readonly string[] {
    return this.played;
  }

  /** Ply displayed on the board (differs from the live ply while browsing the history). */
  get ply(): number {
    return this.viewedPly ?? this.played.length;
  }

  get isBrowsing(): boolean {
    return this.viewedPly !== null;
  }

  get isFinished(): boolean {
    return this.current.children.length === 0;
  }

  get awaitingUser(): boolean {
    return !this.isBrowsing && isUserTurn(this.current, this.orientation);
  }

  get awaitingOpponent(): boolean {
    return !this.isFinished && !isUserTurn(this.current, this.orientation);
  }

  /** Number of wrong answers given for the current position. */
  get tries(): number {
    return this.wrongAttempts;
  }

  /** Annotations to draw on the board (hidden while browsing the history). */
  get shapes(): Shapes {
    return this.isBrowsing ? NO_SHAPES : this.annotations;
  }

  position(): PositionSnapshot {
    if (this.viewedPly === null) return { pieces: toPieces(this.chess), lastMove: this.last };
    const { chess, last } = replay(this.played.slice(0, this.viewedPly));
    return { pieces: toPieces(chess), lastMove: last };
  }

  goTo(ply: number): void {
    const clamped = Math.max(0, Math.min(this.played.length, ply));
    this.viewedPly = clamped === this.played.length ? null : clamped;
  }

  step(delta: number): void {
    this.goTo(this.ply + delta);
  }

  ownsPiece(square: Square): boolean {
    return this.awaitingUser && this.chess.get(square)?.color === this.userColor;
  }

  legalTargets(from: Square): Target[] {
    if (!this.awaitingUser) return [];
    const targets = new Map<Square, Target>();
    for (const move of this.chess.moves({ square: from, verbose: true })) {
      targets.set(move.to, { square: move.to, capture: /[ce]/.test(move.flags) });
    }
    return [...targets.values()];
  }

  attempt(from: Square, to: Square): AttemptResult {
    if (!this.awaitingUser) return { status: 'ignored' };

    let move: Move;
    try {
      move = this.chess.move({ from, to, promotion: 'q' });
    } catch {
      return { status: 'illegal' };
    }

    const expected = this.current.children.find((child) => child.san === normalizeSan(move.san));
    if (!expected) {
      this.chess.undo();
      this.wrongAttempts += 1;
      this.annotations = NO_SHAPES;
      return { status: 'wrong', tries: this.wrongAttempts };
    }

    this.commit(expected, move);
    this.wrongAttempts = 0;
    this.annotations = parseShapes(expected.comment);
    return { status: 'correct', san: move.san, finished: this.isFinished };
  }

  /** Plays one of the opponent's book replies. Returns false if it is not the opponent's turn. */
  playOpponent(): boolean {
    if (!this.awaitingOpponent) return false;
    const children = this.current.children;
    const next = children[Math.floor(this.rng() * children.length)];
    if (!next?.san) return false;
    this.commit(next, this.chess.move(next.san));
    this.annotations = NO_SHAPES;
    return true;
  }

  /** Shows the author's annotations for this position, or the origin square of the answer. */
  hint(): void {
    const authored = parseShapes(this.current.comment);
    this.annotations = hasShapes(authored)
      ? authored
      : { arrows: [], marks: this.expectedMoves().map((m) => ({ square: m.from, color: 'Y' })) };
  }

  /** Draws the expected move(s) on the board and returns their SAN. */
  reveal(): string[] {
    const moves = this.expectedMoves();
    this.annotations = {
      arrows: moves.map((m) => ({ from: m.from, to: m.to, color: 'G' })),
      marks: [],
    };
    return moves.map((m) => m.san);
  }

  private get userColor(): Color {
    return this.orientation === 'white' ? 'w' : 'b';
  }

  private expectedMoves(): Move[] {
    return this.chess
      .moves({ verbose: true })
      .filter((move) => this.current.children.some((c) => c.san === normalizeSan(move.san)));
  }

  private commit(node: MoveNode, move: Move): void {
    this.current = node;
    this.played.push(move.san);
    this.last = { from: move.from, to: move.to };
  }
}

/**
 * Starts a session on a random chapter of `chapters`.
 * Returns null when there is nothing to train on.
 */
export function startSession(
  chapters: readonly Chapter[],
  mode: StartMode,
  rng: Rng = Math.random,
): TrainingSession | null {
  const chapter = chapters[Math.floor(rng() * chapters.length)];
  if (!chapter) return null;
  const candidates = mode === 'random' ? trainableNodes(chapter) : [];
  const start = candidates[Math.floor(rng() * candidates.length)] ?? chapter.root;
  return new TrainingSession(chapter, start, rng);
}
