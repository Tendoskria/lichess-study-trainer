import type { Color, PieceSymbol, Square } from 'chess.js';

export type { Color, PieceSymbol, Square };

/** Side from whose point of view a chapter is studied (and the board is drawn). */
export type Orientation = 'white' | 'black';

/** A node of the move tree built from a PGN. The root node has `san === null`. */
export interface MoveNode {
  readonly san: string | null;
  /** Number of half-moves played to reach this node (0 for the root). */
  readonly ply: number;
  comment: string;
  readonly parent: MoveNode | null;
  readonly children: MoveNode[];
}

/** One chapter of a Lichess study: a move tree plus its metadata. */
export interface Chapter {
  readonly study: string;
  readonly name: string;
  readonly orientation: Orientation;
  /** FEN of a custom starting position (unsupported for now), null for the standard one. */
  readonly startFen: string | null;
  readonly root: MoveNode;
}

export type ShapeColor = 'G' | 'R' | 'B' | 'Y';

export interface Arrow {
  readonly from: Square;
  readonly to: Square;
  readonly color: ShapeColor;
}

export interface Mark {
  readonly square: Square;
  readonly color: ShapeColor;
}

/** Board annotations drawn by the study author (`[%cal ...]` and `[%csl ...]`). */
export interface Shapes {
  readonly arrows: readonly Arrow[];
  readonly marks: readonly Mark[];
}

export const NO_SHAPES: Shapes = { arrows: [], marks: [] };

export interface PieceOnSquare {
  readonly square: Square;
  readonly type: PieceSymbol;
  readonly color: Color;
}

export interface LastMove {
  readonly from: Square;
  readonly to: Square;
}
