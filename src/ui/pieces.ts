import type { Color, PieceSymbol } from '../domain/types';
import bB from '../assets/pieces/bB.svg';
import bK from '../assets/pieces/bK.svg';
import bN from '../assets/pieces/bN.svg';
import bP from '../assets/pieces/bP.svg';
import bQ from '../assets/pieces/bQ.svg';
import bR from '../assets/pieces/bR.svg';
import wB from '../assets/pieces/wB.svg';
import wK from '../assets/pieces/wK.svg';
import wN from '../assets/pieces/wN.svg';
import wP from '../assets/pieces/wP.svg';
import wQ from '../assets/pieces/wQ.svg';
import wR from '../assets/pieces/wR.svg';

type PieceKey = `${Color}${Uppercase<PieceSymbol>}`;

const IMAGES: Record<PieceKey, string> = {
  wK,
  wQ,
  wR,
  wB,
  wN,
  wP,
  bK,
  bQ,
  bR,
  bB,
  bN,
  bP,
};

export function pieceImage(color: Color, type: PieceSymbol): string {
  return IMAGES[`${color}${type.toUpperCase() as Uppercase<PieceSymbol>}`];
}
