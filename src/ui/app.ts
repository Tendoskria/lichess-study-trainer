import { parsePgn } from '../domain/pgn';
import { hasShapes } from '../domain/shapes';
import { chaptersOfStudy, isTrainable, studyNames } from '../domain/study';
import { startSession } from '../domain/training';
import type { Rng, StartMode, TrainingSession } from '../domain/training';
import type { Chapter, Square } from '../domain/types';
import type { FetchLike } from '../services/lichess';
import type { SettingsStore } from '../services/storage';
import { BoardView } from './board';
import { requireElement } from './dom';
import { ImportPanel } from './import-panel';
import { messages } from './messages';
import { MoveList } from './move-list';
import { Router } from './router';

const ALL = '__all__';

export interface AppOptions {
  readonly settings: SettingsStore;
  readonly fetch?: FetchLike;
  readonly rng?: Rng;
  /** Pause before the opponent answers, in ms. */
  readonly opponentDelayMs?: number;
  /** Longer pause used when the user's last move carries author annotations to read. */
  readonly annotatedDelayMs?: number;
}

interface Option {
  readonly value: string;
  readonly label: string;
}

type StatusKind = 'info' | 'ok' | 'error';

/** Wires the DOM, the board, the pages and the training session together. */
export class App {
  private readonly board: BoardView;
  private readonly moveList: MoveList;
  private readonly importPanel: ImportPanel;
  private readonly router: Router;
  private readonly els: {
    study: HTMLSelectElement;
    chapter: HTMLSelectElement;
    mode: HTMLSelectElement;
    message: HTMLElement;
    chapterName: HTMLElement;
    announcer: HTMLElement;
    showMoves: HTMLInputElement;
  };

  private chapters: Chapter[] = [];
  private session: TrainingSession | null = null;
  private chapterRevealed = false;
  private opponentTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly root: HTMLElement,
    private readonly options: AppOptions,
  ) {
    this.els = {
      study: requireElement(root, '#study'),
      chapter: requireElement(root, '#chapter'),
      mode: requireElement(root, '#mode'),
      message: requireElement(root, '#message'),
      chapterName: requireElement(root, '#chapter-name'),
      announcer: requireElement(root, '#announcer'),
      showMoves: requireElement(root, '#show-moves'),
    };

    this.board = new BoardView(requireElement<SVGSVGElement>(root, '#board'), {
      canSelect: (square) => this.session?.ownsPiece(square) ?? false,
      targetsFrom: (square) => this.session?.legalTargets(square) ?? [],
      onMove: (from, to) => this.attempt(from, to),
    });
    this.moveList = new MoveList(requireElement(root, '#moves'), (ply) => this.browseTo(ply));
    this.importPanel = new ImportPanel(
      root,
      { importPgn: (text, source) => this.importPgn(text, source) },
      options.fetch,
    );
    this.router = new Router(
      {
        trainer: requireElement(root, '#view-trainer'),
        settings: requireElement(root, '#view-settings'),
        welcome: requireElement(root, '#view-welcome'),
      },
      () => this.chapters.length > 0,
    );
  }

  /** Binds events, restores the last loaded study, and shows the right page. */
  start(): void {
    requireElement(this.root, '#new-position').addEventListener('click', () => this.newPosition());
    requireElement(this.root, '#hint').addEventListener('click', () => this.showHint());
    requireElement(this.root, '#solution').addEventListener('click', () => this.showSolution());
    this.els.showMoves.addEventListener('change', () => this.render());
    this.els.study.addEventListener('change', () => {
      this.els.study.blur();
      this.fillChapterOptions();
      this.newPosition();
    });
    for (const select of [this.els.chapter, this.els.mode]) {
      select.addEventListener('change', () => {
        select.blur();
        this.newPosition();
      });
    }
    document.addEventListener('keydown', this.onKeyDown);

    this.importPanel.setUsername(this.options.settings.read('username') ?? '');
    const saved = this.options.settings.read('pgn');
    if (saved && this.loadChapters(saved)) this.newPosition();
    this.router.start();
  }

  dispose(): void {
    this.cancelOpponent();
    this.router.stop();
    document.removeEventListener('keydown', this.onKeyDown);
    this.board.destroy();
  }

  /** Replaces the loaded chapters, starts an exercise and shows it. Returns false if nothing is playable. */
  importPgn(text: string, source: { username?: string }): boolean {
    if (!this.loadChapters(text)) return false;
    this.options.settings.write('pgn', text);
    if (source.username) this.options.settings.write('username', source.username);
    this.newPosition();
    this.router.navigate('trainer');
    return true;
  }

  newPosition(): void {
    this.cancelOpponent();
    const mode: StartMode = this.els.mode.value === 'beginning' ? 'beginning' : 'random';

    let session: TrainingSession | null;
    try {
      session = startSession(this.selectedChapters(), mode, this.options.rng);
    } catch {
      this.setStatus(messages.invalidChapter, 'error');
      return;
    }
    if (!session) return;

    this.session = session;
    this.chapterRevealed = false;
    this.els.announcer.textContent = '';
    this.setStatus(messages.yourTurn(session.orientation), 'info');
    this.render();
    this.continueLine();
  }

  private loadChapters(pgn: string): boolean {
    const chapters = parsePgn(pgn).filter(isTrainable);
    if (chapters.length === 0) return false;
    this.chapters = chapters;

    const names = studyNames(chapters);
    this.fillSelect(this.els.study, [
      { value: ALL, label: messages.allStudies(names.length) },
      ...names.map((name) => ({ value: name, label: name || messages.untitledStudy })),
    ]);
    this.els.study.hidden = names.length < 2;
    this.fillChapterOptions();
    return true;
  }

  private fillChapterOptions(): void {
    const visible = this.visibleChapters();
    this.fillSelect(this.els.chapter, [
      { value: ALL, label: messages.allChapters(visible.length) },
      ...visible.map((chapter, index) => ({
        value: String(index),
        label: chapter.name || messages.untitledChapter,
      })),
    ]);
  }

  private fillSelect(select: HTMLSelectElement, options: readonly Option[]): void {
    select.replaceChildren(
      ...options.map(({ value, label }) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        return option;
      }),
    );
  }

  private visibleChapters(): Chapter[] {
    const study = this.els.study.value;
    return chaptersOfStudy(this.chapters, study === ALL || study === '' ? null : study);
  }

  private selectedChapters(): Chapter[] {
    const visible = this.visibleChapters();
    const value = this.els.chapter.value;
    const chosen = value === ALL ? undefined : visible[Number(value)];
    return chosen ? [chosen] : visible;
  }

  private attempt(from: Square, to: Square): void {
    const session = this.session;
    if (!session) return;

    const result = session.attempt(from, to);
    if (result.status === 'correct') {
      this.chapterRevealed = true;
      this.els.announcer.textContent = '';
      this.setStatus(messages.correct(result.san), 'ok');
    }
    this.render();
    if (result.status === 'wrong') {
      this.board.flashError(to);
      this.els.announcer.textContent = messages.wrongAnnouncement(result.tries);
    }
    if (result.status === 'correct') this.continueLine();
  }

  /** Plays the opponent's replies (with a short pause) until it is the user's turn again. */
  private continueLine(): void {
    const session = this.session;
    if (!session) return;
    if (session.isFinished) {
      this.setStatus(messages.finished, 'ok');
      return;
    }
    if (!session.awaitingOpponent) return;

    const { opponentDelayMs = 600, annotatedDelayMs = 1800 } = this.options;
    const delay = hasShapes(session.shapes) ? annotatedDelayMs : opponentDelayMs;
    this.opponentTimer = setTimeout(() => {
      if (this.session !== session) return;
      session.playOpponent();
      this.render();
      this.continueLine();
    }, delay);
  }

  private cancelOpponent(): void {
    clearTimeout(this.opponentTimer);
    this.opponentTimer = undefined;
  }

  private showHint(): void {
    if (!this.session?.awaitingUser) return;
    this.session.hint();
    this.setStatus(messages.hint, 'info');
    this.render();
  }

  private showSolution(): void {
    if (!this.session?.awaitingUser) return;
    this.setStatus(messages.solution(this.session.reveal()), 'info');
    this.render();
  }

  private browseTo(ply: number): void {
    if (!this.session) return;
    this.session.goTo(ply);
    this.render();
  }

  private render(): void {
    const session = this.session;
    if (!session) return;

    const { pieces, lastMove } = session.position();
    this.board.render({
      orientation: session.orientation,
      pieces,
      lastMove,
      shapes: session.shapes,
      interactive: session.awaitingUser,
    });
    this.moveList.render(session.history, session.ply, this.els.showMoves.checked);
    this.els.chapterName.textContent = this.chapterRevealed
      ? messages.chapter(session.chapter.name || messages.untitledChapter)
      : messages.chapterHidden;
  }

  private setStatus(text: string, kind: StatusKind): void {
    this.els.message.textContent = text;
    this.els.message.className = `message ${kind}`;
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const session = this.session;
    if (!session || this.router.current !== 'trainer' || this.isTypingTarget(event.target)) return;

    const ply = this.navigationTarget(event.key, session.ply, session.history.length);
    if (ply === null) return;
    event.preventDefault();
    this.browseTo(ply);
  };

  private isTypingTarget(target: EventTarget | null): boolean {
    return (
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLInputElement && target.type === 'text')
    );
  }

  private navigationTarget(key: string, ply: number, last: number): number | null {
    switch (key) {
      case 'ArrowLeft':
        return ply - 1;
      case 'ArrowRight':
        return ply + 1;
      case 'ArrowUp':
      case 'Home':
        return 0;
      case 'ArrowDown':
      case 'End':
        return last;
      default:
        return null;
    }
  }
}
