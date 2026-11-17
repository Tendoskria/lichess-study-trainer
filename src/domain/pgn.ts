import type { Chapter, MoveNode, Orientation } from './types';

const TOKEN = /\{[^}]*\}|[()]|\$\d+|\d+\.+|[^\s(){}]+/g;
const RESULT = /^(?:1-0|0-1|1\/2-1\/2|\*)$/;
const HEADER_LINE = /^\[(\w+)\s+"([^"]*)"\]\s*$/gm;
const GAME_START = /^(?=\[Event )/m;

/** Strips check/annotation marks so that SAN strings can be compared reliably. */
export function normalizeSan(san: string): string {
  return san
    .replace(/[+#!?]+/g, '')
    .replace(/^0-0-0$/, 'O-O-O')
    .replace(/^0-0$/, 'O-O');
}

function isSkippable(token: string): boolean {
  return token.startsWith('$') || /^\d+\./.test(token) || RESULT.test(token);
}

/** Builds the move tree (main line and variations) from a PGN movetext. */
function parseMovetext(movetext: string): MoveNode {
  const root: MoveNode = { san: null, ply: 0, comment: '', parent: null, children: [] };
  let current = root;
  const variationStack: MoveNode[] = [];

  for (const token of movetext.match(TOKEN) ?? []) {
    if (token.startsWith('{')) {
      current.comment += token.slice(1, -1);
    } else if (token === '(') {
      variationStack.push(current);
      current = current.parent ?? root;
    } else if (token === ')') {
      current = variationStack.pop() ?? root;
    } else if (!isSkippable(token)) {
      const node: MoveNode = {
        san: normalizeSan(token),
        ply: current.ply + 1,
        comment: '',
        parent: current,
        children: [],
      };
      current.children.push(node);
      current = node;
    }
  }
  return root;
}

function parseGame(game: string): Chapter {
  const headers: Record<string, string> = {};
  for (const [, key, value] of game.matchAll(HEADER_LINE)) {
    if (key !== undefined && value !== undefined) headers[key] = value;
  }
  const orientation: Orientation =
    (headers['Orientation'] ?? '').toLowerCase() === 'black' ? 'black' : 'white';
  const event = headers['Event'] ?? '';

  return {
    study: headers['StudyName'] ?? event.replace(/: [^:]*$/, ''),
    name: headers['ChapterName'] ?? event,
    orientation,
    startFen: headers['FEN'] ?? null,
    root: parseMovetext(game.replace(HEADER_LINE, '')),
  };
}

/** Parses a (possibly multi-game) PGN as exported by Lichess studies into chapters. */
export function parsePgn(text: string): Chapter[] {
  return text
    .split(GAME_START)
    .filter((game) => game.trim() !== '')
    .map(parseGame);
}
