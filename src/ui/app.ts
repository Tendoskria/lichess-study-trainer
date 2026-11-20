import { parsePgn } from '../domain/pgn';
import { hasShapes, mergeShapes } from '../domain/shapes';
import { chapterSections, isTrainable, selectChapters, studyNames } from '../domain/study';
import { startSession } from '../domain/training';
import type { Rng, StartMode, TrainingSession } from '../domain/training';
import { NO_SHAPES } from '../domain/types';
import type { Chapter, Shapes, Square } from '../domain/types';
import { fetchUserStudiesPgn } from '../services/lichess';
import type { FetchLike } from '../services/lichess';
import { SoundPlayer } from '../services/sound';
import type { SoundOutput } from '../services/sound';
import type { SettingsStore } from '../services/storage';
import { BoardView } from './board';
import { requireElement } from './dom';
import { ImportPanel } from './import-panel';
import { messages } from './messages';
import { MultiSelect } from './multi-select';
import { MoveList } from './move-list';
import { VictoryOverlay } from './victory';
import { Router } from './router';

export interface AppOptions {
  readonly settings: SettingsStore;
  readonly fetch?: FetchLike;
  readonly rng?: Rng;
  /** Defaults to synthesised sounds, enabled unless the user muted them. */
  readonly sound?: SoundOutput;
  /** Pause before the opponent answers, in ms. */
  readonly opponentDelayMs?: number;
  /** Longer pause used when the user's last move carries author annotations to read. */
  readonly annotatedDelayMs?: number;
}

type StatusKind = 'info' | 'ok' | 'error';

/** Wires the DOM, the board, the pages and the training session together. */
export class App {
  private readonly board: BoardView;
  private readonly moveList: MoveList;
  private readonly importPanel: ImportPanel;
  private readonly router: Router;
  private readonly victory: VictoryOverlay;
  private readonly sound: SoundOutput;
  private readonly studyFilter: MultiSelect;
  private readonly chapterFilter: MultiSelect;
  private readonly els: {
    mode: HTMLSelectElement;
    message: HTMLElement;
    chapterName: HTMLElement;
    announcer: HTMLElement;
    soundToggle: HTMLButtonElement;
    aidsToggle: HTMLButtonElement;
    showMoves: HTMLInputElement;
  };
  /** Whether the author's arrows and circles are shown. */
  private aids: boolean;

  private chapters: Chapter[] = [];
  private session: TrainingSession | null = null;
  private chapterRevealed = false;
  private opponentTimer: ReturnType<typeof setTimeout> | undefined;
  private refresh: AbortController | undefined;

  constructor(
    private readonly root: HTMLElement,
    private readonly options: AppOptions,
  ) {
    this.els = {
      mode: requireElement(root, '#mode'),
      message: requireElement(root, '#message'),
      chapterName: requireElement(root, '#chapter-name'),
      announcer: requireElement(root, '#announcer'),
      soundToggle: requireElement(root, '#sound-toggle'),
      aidsToggle: requireElement(root, '#aids-toggle'),
      showMoves: requireElement(root, '#show-moves'),
    };

    this.studyFilter = new MultiSelect(requireElement<HTMLElement>(root, '#study'), {
      label: messages.studyLabel,
      summary: (picked, total) =>
        this.summarize(picked, total, messages.allStudies, messages.studiesSelected),
      clearLabel: messages.clearSelection,
      doneLabel: messages.closeSelection,
      onCommit: () => {
        this.fillChapterOptions();
        this.newPosition();
      },
    });
    this.chapterFilter = new MultiSelect(requireElement<HTMLElement>(root, '#chapter'), {
      label: messages.chapterLabel,
      summary: (picked, total) =>
        this.summarize(picked, total, messages.allChapters, messages.chaptersSelected),
      clearLabel: messages.clearSelection,
      doneLabel: messages.closeSelection,
      onCommit: () => this.newPosition(),
    });

    this.aids = options.settings.read('aids') !== 'off';

    this.sound =
      options.sound ?? new SoundPlayer({ enabled: options.settings.read('sound') !== 'off' });

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
    this.victory = new VictoryOverlay(
      requireElement(root, '#victory'),
      { onNewPosition: () => this.newPosition() },
      options.rng,
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
    this.els.mode.addEventListener('change', () => {
      this.els.mode.blur();
      this.newPosition();
    });
    document.addEventListener('keydown', this.onKeyDown);
    // Browsers only allow audio after a user gesture.
    document.addEventListener('pointerdown', this.unlockAudio);
    document.addEventListener('keydown', this.unlockAudio);
    this.els.soundToggle.addEventListener('click', () => this.toggleSound());
    this.syncSoundToggle();
    this.els.aidsToggle.addEventListener('click', () => this.toggleAids());
    this.syncAidsToggle();

    this.importPanel.setUsername(this.options.settings.read('username') ?? '');
    const saved = this.options.settings.read('pgn');
    if (saved && this.loadChapters(saved)) this.newPosition();
    this.router.start();

    // Studies loaded from a Lichess username may have changed since last time: fetch them again.
    // Copies saved before the source was recorded (no `source` yet) are assumed to come from it.
    const username = this.options.settings.read('username');
    const source = this.options.settings.read('source');
    if (username && (source === 'username' || source === null)) {
      void this.refreshFromLichess(username, saved);
    }
  }

  dispose(): void {
    this.refresh?.abort();
    this.cancelOpponent();
    this.router.stop();
    this.studyFilter.destroy();
    this.chapterFilter.destroy();
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('pointerdown', this.unlockAudio);
    document.removeEventListener('keydown', this.unlockAudio);
    this.board.destroy();
  }

  /** Replaces the loaded chapters, starts an exercise and shows it. Returns false if nothing is playable. */
  importPgn(text: string, source: { username?: string }): boolean {
    if (!this.loadChapters(text)) return false;
    this.options.settings.write('pgn', text);
    if (source.username) this.options.settings.write('username', source.username);
    this.options.settings.write('source', source.username ? 'username' : 'other');
    this.newPosition();
    this.router.navigate('trainer');
    return true;
  }

  /**
   * Re-downloads the public studies of `username` in the background. The saved copy (if any) is
   * already on screen, so a failure is silent; the running exercise is never interrupted, the
   * fresh chapters are simply used from the next position on.
   */
  private async refreshFromLichess(username: string, saved: string | null): Promise<void> {
    const controller = new AbortController();
    this.refresh?.abort();
    this.refresh = controller;

    const hadStudies = this.chapters.length > 0;
    if (!hadStudies) this.importPanel.setStatus(messages.loading, 'info');

    let pgn: string;
    try {
      pgn = await fetchUserStudiesPgn(username, {
        signal: controller.signal,
        cache: 'no-cache',
        ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      if (!hadStudies) this.importPanel.setStatus(messages.lichessError(error), 'error');
      return;
    }

    // Something else was loaded while we were waiting: that choice wins.
    if (controller.signal.aborted || this.options.settings.read('pgn') !== saved) return;
    if (!hadStudies) this.importPanel.setStatus('', 'info');
    if (pgn === saved) return;
    if (!this.loadChapters(pgn)) {
      if (!hadStudies) this.importPanel.setStatus(messages.noChapters, 'error');
      return;
    }

    this.options.settings.write('pgn', pgn);
    if (!this.session) this.newPosition();
    this.router.render();
  }

  newPosition(): void {
    this.cancelOpponent();
    this.victory.hide();
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
    this.studyFilter.clear();
    this.studyFilter.setGroups([
      {
        label: null,
        options: names.map((name) => ({ value: name, label: name || messages.untitledStudy })),
      },
    ]);
    this.studyFilter.hidden = names.length < 2;
    this.chapterFilter.clear();
    this.fillChapterOptions();
    return true;
  }

  /**
   * Lists the chapters of the selected studies (all studies when none is selected), one titled
   * section per study as soon as several studies are shown.
   */
  private fillChapterOptions(): void {
    const sections = chapterSections(this.chapters, this.studyFilter.selected);
    this.chapterFilter.setGroups(
      sections.map((section) => ({
        label: sections.length > 1 ? section.study || messages.untitledStudy : null,
        options: section.entries.map(({ index, chapter }) => ({
          value: String(index),
          label: chapter.name || messages.untitledChapter,
        })),
      })),
    );
  }

  private summarize(
    picked: readonly string[],
    total: number,
    all: (count: number) => string,
    several: (count: number) => string,
  ): string {
    if (picked.length === 0) return all(total);
    return picked.length === 1 ? (picked[0] ?? '') : several(picked.length);
  }

  private selectedChapters(): Chapter[] {
    const picked = new Set([...this.chapterFilter.selected].map(Number));
    return selectChapters(this.chapters, this.studyFilter.selected, picked);
  }

  private attempt(from: Square, to: Square): void {
    const session = this.session;
    if (!session) return;

    const result = session.attempt(from, to);
    if (result.status === 'correct') {
      this.chapterRevealed = true;
      this.els.announcer.textContent = '';
      this.sound.play(session.lastCapture ? 'capture' : 'move');
      this.setStatus(messages.correct(result.san), 'ok');
    }
    this.render();
    if (result.status === 'wrong') {
      this.board.flashError(to);
      this.sound.play('error');
      this.els.announcer.textContent = messages.wrongAnnouncement(result.tries);
    }
    if (result.status === 'correct') this.continueLine();
  }

  /** Plays the opponent's replies (with a short pause) until it is the user's turn again. */
  private continueLine(): void {
    const session = this.session;
    if (!session) return;
    if (session.isFinished) {
      this.els.announcer.textContent = messages.lineCompleteAnnouncement;
      this.victory.show();
      this.sound.play('victory');
      return;
    }
    if (!session.awaitingOpponent) return;

    const { opponentDelayMs = 600, annotatedDelayMs = 1800 } = this.options;
    const annotated = this.aids && hasShapes(session.authorShapes);
    const delay = annotated ? annotatedDelayMs : opponentDelayMs;
    this.opponentTimer = setTimeout(() => {
      if (this.session !== session) return;
      if (session.playOpponent()) this.sound.play(session.lastCapture ? 'capture' : 'move');
      this.render();
      this.continueLine();
    }, delay);
  }

  private toggleSound(): void {
    const enabled = !this.sound.enabled;
    this.sound.setEnabled(enabled);
    if (enabled) this.sound.unlock();
    this.options.settings.write('sound', enabled ? 'on' : 'off');
    this.syncSoundToggle();
  }

  private syncSoundToggle(): void {
    this.els.soundToggle.setAttribute('aria-pressed', String(this.sound.enabled));
  }

  private toggleAids(): void {
    this.aids = !this.aids;
    this.options.settings.write('aids', this.aids ? 'on' : 'off');
    this.syncAidsToggle();
    this.render();
  }

  private syncAidsToggle(): void {
    this.els.aidsToggle.setAttribute('aria-pressed', String(this.aids));
  }

  /** The author's arrows and circles (when the aids are on) plus what the user asked for. */
  private visibleShapes(session: TrainingSession): Shapes {
    const authored = this.aids ? session.authorShapes : NO_SHAPES;
    return mergeShapes(authored, session.requestedShapes);
  }

  private readonly unlockAudio = (): void => {
    this.sound.unlock();
    document.removeEventListener('pointerdown', this.unlockAudio);
    document.removeEventListener('keydown', this.unlockAudio);
  };

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
    this.victory.hide();
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
      shapes: this.visibleShapes(session),
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
    if (event.key === 'Escape' && this.victory.visible) {
      this.victory.hide();
      return;
    }

    const ply = this.navigationTarget(event.key, session.ply, session.history.length);
    if (ply === null) return;
    event.preventDefault();
    this.browseTo(ply);
  };

  private isTypingTarget(target: EventTarget | null): boolean {
    return (
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof Element && target.closest('.multiselect') !== null) ||
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
