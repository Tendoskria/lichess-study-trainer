import { Chess } from 'chess.js';
import type { Chapter, MoveNode, Orientation } from './types';

/** True when the node is a position where the studied side has to move. */
export function isUserTurn(node: MoveNode, orientation: Orientation): boolean {
  return node.children.length > 0 && (node.ply % 2 === 0) === (orientation === 'white');
}

/** Every position of the chapter (variations included) the user can be quizzed on. */
export function trainableNodes(chapter: Chapter): MoveNode[] {
  const result: MoveNode[] = [];
  const stack: MoveNode[] = [chapter.root];
  for (let node = stack.pop(); node; node = stack.pop()) {
    if (isUserTurn(node, chapter.orientation)) result.push(node);
    stack.push(...node.children);
  }
  return result;
}

/** Moves leading from the root (excluded) to `node` (included). */
export function pathTo(node: MoveNode): MoveNode[] {
  const path: MoveNode[] = [];
  for (let current: MoveNode | null = node; current?.parent; current = current.parent) {
    path.unshift(current);
  }
  return path;
}

export function studyNames(chapters: readonly Chapter[]): string[] {
  return [...new Set(chapters.map((chapter) => chapter.study))];
}

/** Chapters belonging to `study`, or all of them when `study` is null. */
export function chaptersOfStudy(chapters: readonly Chapter[], study: string | null): Chapter[] {
  return study === null ? [...chapters] : chapters.filter((chapter) => chapter.study === study);
}

function allMovesLegal(node: MoveNode, chess: Chess): boolean {
  for (const child of node.children) {
    if (child.san === null) return false;
    try {
      chess.move(child.san);
    } catch {
      return false;
    }
    const legal = allMovesLegal(child, chess);
    chess.undo();
    if (!legal) return false;
  }
  return true;
}

/**
 * A chapter can be trained on when it starts from the standard position, every move of every
 * line is legal, and the studied side has at least one move to find.
 */
export function isTrainable(chapter: Chapter): boolean {
  return (
    chapter.startFen === null &&
    trainableNodes(chapter).length > 0 &&
    allMovesLegal(chapter.root, new Chess())
  );
}
