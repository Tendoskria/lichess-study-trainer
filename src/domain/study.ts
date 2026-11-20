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

export interface ChapterEntry {
  /** Position of the chapter in the full list of loaded chapters (a stable identifier). */
  readonly index: number;
  readonly chapter: Chapter;
}

/** The chapters of one study. */
export interface StudySection {
  readonly study: string;
  readonly entries: readonly ChapterEntry[];
}

/**
 * Chapters split into one section per study (in order of first appearance). When `studies` is
 * not empty, only the sections of those studies are returned; empty means every study.
 */
export function chapterSections(
  chapters: readonly Chapter[],
  studies: ReadonlySet<string> = new Set(),
): StudySection[] {
  return studyNames(chapters)
    .filter((study) => studies.size === 0 || studies.has(study))
    .map((study) => ({
      study,
      entries: chapters.flatMap((chapter, index) =>
        chapter.study === study ? [{ index, chapter }] : [],
      ),
    }));
}

/**
 * Chapters to train on: those picked in `picked` (indexes in `chapters`) among the chapters of
 * the selected `studies`. An empty selection means "all": no study picked = every study, no
 * chapter picked (or none still visible) = every chapter of the selected studies.
 */
export function selectChapters(
  chapters: readonly Chapter[],
  studies: ReadonlySet<string>,
  picked: ReadonlySet<number>,
): Chapter[] {
  const visible = chapterSections(chapters, studies).flatMap((section) => section.entries);
  const chosen = visible.filter((entry) => picked.has(entry.index));
  return (chosen.length > 0 ? chosen : visible).map((entry) => entry.chapter);
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
