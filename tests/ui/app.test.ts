// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SoundOutput } from '../../src/services/sound';
import { SettingsStore } from '../../src/services/storage';
import { App } from '../../src/ui/app';

// Vitest runs from the project root.
const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
const caroKann = readFileSync(join(process.cwd(), 'tests/fixtures/caro-kann.pgn'), 'utf8');

function memoryStore(initial: Record<string, string> = {}): SettingsStore {
  const data = new Map(Object.entries(initial));
  return new SettingsStore({
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  });
}

/** Records the sounds requested by the app instead of playing them. */
function stubSound(enabled = true) {
  const sound = {
    enabled,
    setEnabled: vi.fn((value: boolean) => {
      sound.enabled = value;
    }),
    unlock: vi.fn(),
    play: vi.fn(),
  };
  return sound;
}

describe('App', () => {
  let app: App | null = null;
  const $ = <T extends Element>(selector: string): T => {
    const element = document.querySelector<T>(selector);
    if (!element) throw new Error(selector);
    return element;
  };

  beforeEach(() => {
    window.location.hash = '';
    document.body.innerHTML = /<body>([\s\S]*)<\/body>/.exec(html)?.[1] ?? '';
  });

  afterEach(() => {
    app?.dispose();
    app = null;
    vi.useRealTimers();
  });

  const chapterBoxes = (): HTMLInputElement[] => [
    ...document.querySelectorAll<HTMLInputElement>('#chapter input[type="checkbox"]'),
  ];

  const visibleViews = (): string[] =>
    [...document.querySelectorAll<HTMLElement>('main > section')]
      .filter((section) => !section.hidden)
      .map((section) => section.id);

  it('shows the welcome page when no study is stored', () => {
    app = new App($('#app'), { settings: memoryStore() });
    app.start();
    expect(visibleViews()).toEqual(['view-welcome']);
  });

  it('opens the settings page from a deep link, even without studies', () => {
    window.location.hash = '#/settings';
    app = new App($('#app'), { settings: memoryStore() });
    app.start();
    expect(visibleViews()).toEqual(['view-settings']);
  });

  it('loads a PGN, starts an exercise and fills the selectors', () => {
    const settings = memoryStore();
    app = new App($('#app'), { settings, rng: () => 0 });
    app.start();
    $<HTMLSelectElement>('#mode').value = 'beginning';

    expect(app.importPgn(caroKann, { username: 'Tendoskria' })).toBe(true);

    expect(chapterBoxes()).toHaveLength(2);
    expect($('#chapter-name').textContent).toBe('Chapitre : ?');
    expect($('#message').textContent).toContain('noirs');
    expect(visibleViews()).toEqual(['view-trainer']);
    expect(settings.read('username')).toBe('Tendoskria');
    expect(settings.read('pgn')).toBe(caroKann);
  });

  it('restores the stored study on start', () => {
    app = new App($('#app'), { settings: memoryStore({ 'lichess-study-trainer:pgn': caroKann }) });
    app.start();
    expect(chapterBoxes().length).toBeGreaterThan(0);
    expect(visibleViews()).toEqual(['view-trainer']);
  });

  describe('several studies', () => {
    const chapter = (study: string, name: string): string =>
      `[Event "${study}: ${name}"]\n[StudyName "${study}"]\n[ChapterName "${name}"]\n\n1. e4 e5 *`;
    const THREE_STUDIES = [
      chapter('A', 'a1'),
      chapter('B', 'b1'),
      chapter('A', 'a2'),
      chapter('C', 'c1'),
    ].join('\n\n');

    const start = (): void => {
      app = new App($('#app'), { settings: memoryStore(), rng: () => 0 });
      app.start();
      app.importPgn(THREE_STUDIES, {});
    };
    const texts = (selector: string): (string | null)[] =>
      [...document.querySelectorAll(selector)].map((element) => element.textContent);
    /** Checks the given studies (by position) and closes the list, as a user would. */
    const pickStudies = (...positions: number[]): void => {
      const boxes = [...document.querySelectorAll<HTMLInputElement>('#study input')];
      for (const position of positions) boxes[position]?.click();
      $<HTMLButtonElement>('#study [data-done]').click();
    };

    it('lists every study, with the chapters grouped by study, when none is selected', () => {
      start();
      expect($<HTMLElement>('#study').hidden).toBe(false);
      expect(texts('#study label')).toEqual(['A', 'B', 'C']);
      expect(texts('#chapter legend')).toEqual(['A', 'B', 'C']);
      expect(texts('#chapter label')).toEqual(['a1', 'a2', 'b1', 'c1']);
      expect($('#study summary').textContent).toBe('Toutes les études (3)');
    });

    it('only offers the chapters of the selected studies, one section per study', () => {
      start();
      pickStudies(0, 2);
      expect($('#study summary').textContent).toBe('2 études sélectionnées');
      expect(texts('#chapter legend')).toEqual(['A', 'C']);
      expect(texts('#chapter label')).toEqual(['a1', 'a2', 'c1']);
    });

    it('shows no section heading when a single study is selected', () => {
      start();
      pickStudies(1);
      expect($('#study summary').textContent).toBe('B');
      expect(document.querySelectorAll('#chapter legend')).toHaveLength(0);
      expect(texts('#chapter label')).toEqual(['b1']);
    });

    it('trains on the picked chapters and starts a new position when the list closes', () => {
      start();
      const before = $('#message').textContent;
      document.querySelector<HTMLInputElement>('#chapter input')?.click();
      $<HTMLButtonElement>('#chapter [data-done]').click();
      expect($('#chapter summary').textContent).toBe('a1');
      expect($('#message').textContent).toBe(before);
      expect($<HTMLElement>('#chapter-name').textContent).toBe('Chapitre : ?');
    });

    it('forgets the picked chapters of a study that is no longer selected', () => {
      start();
      document.querySelectorAll<HTMLInputElement>('#chapter input')[3]?.click(); // c1
      $<HTMLButtonElement>('#chapter [data-done]').click();
      expect($('#chapter summary').textContent).toBe('c1');

      pickStudies(0); // only A: c1 is gone, back to "all chapters of A"
      expect($('#chapter summary').textContent).toBe('Tous les chapitres (2)');
    });

    it('does not browse the history with the arrow keys while a list has the focus', () => {
      start();
      const box = document.querySelector<HTMLInputElement>('#chapter input');
      const event = new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true });
      box?.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    });
  });

  it('rejects a PGN without playable lines and keeps the current state', () => {
    app = new App($('#app'), { settings: memoryStore() });
    app.start();
    expect(app.importPgn('not a pgn', {})).toBe(false);
  });

  it('navigates the history with the arrow keys', () => {
    app = new App($('#app'), { settings: memoryStore(), rng: () => 0.99 });
    app.start();
    app.importPgn(caroKann, {});

    const before = document.querySelectorAll('#moves .move').length;
    expect(before).toBeGreaterThan(0);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect($('#moves .current').getAttribute('data-ply')).toBe(String(before - 1 || 1));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
    expect(document.querySelector('#moves .current')).toBeNull();
  });

  describe('answering a position', () => {
    /** Presses a square of the (black-oriented) 480px board mounted at (0, 0). */
    const press = (svg: SVGSVGElement, square: string): void => {
      const file = square.charCodeAt(0) - 97;
      const rank = Number(square.charAt(1)) - 1;
      const event = new MouseEvent('pointerdown', {
        clientX: (7 - file) * 60 + 30,
        clientY: rank * 60 + 30,
        bubbles: true,
      });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      svg.dispatchEvent(event);
    };

    /** Starts the first chapter from the beginning: the opponent plays 1. e4, black to answer. */
    const startOnBlackToMove = (
      pgn = caroKann,
      sound: SoundOutput = stubSound(),
      settings: SettingsStore = memoryStore(),
    ): { board: SVGSVGElement; messageBefore: string } => {
      vi.useFakeTimers();
      app = new App($('#app'), { settings, rng: () => 0, sound });
      app.start();
      $<HTMLSelectElement>('#mode').value = 'beginning';
      app.importPgn(pgn, {});
      vi.advanceTimersByTime(600);

      const board = $<SVGSVGElement>('#board');
      board.getBoundingClientRect = () => new DOMRect(0, 0, 480, 480);
      board.setPointerCapture = () => undefined;
      board.hasPointerCapture = () => false;
      return { board, messageBefore: $('#message').textContent ?? '' };
    };

    it('plays the hit effect on a wrong move instead of showing an error message', () => {
      const { board, messageBefore } = startOnBlackToMove();

      press(board, 'a7');
      press(board, 'a6'); // the study expects ...c6

      expect(board.classList.contains('hit')).toBe(true);
      expect(board.querySelectorAll('.hit-flash')).toHaveLength(1);
      expect($('#message').textContent).toBe(messageBefore);
      expect($('#announcer').textContent).toBe('Mauvais coup (essai 1).');

      vi.advanceTimersByTime(700);
      expect(board.classList.contains('hit')).toBe(false);
    });

    it('does not play the effect on the right move', () => {
      const { board } = startOnBlackToMove();

      press(board, 'c7');
      press(board, 'c6');

      expect(board.classList.contains('hit')).toBe(false);
      expect($('#message').textContent).toContain('Correct');
      expect($('#announcer').textContent).toBe('');
    });

    describe('completing a line', () => {
      const SHORT_LINE = '[Event "S: t"]\n[Orientation "black"]\n\n1. e4 c6 *';
      const victory = (): HTMLElement => $('#victory');

      const finishLine = (): SVGSVGElement => {
        const { board } = startOnBlackToMove(SHORT_LINE);
        press(board, 'c7');
        press(board, 'c6');
        return board;
      };

      it('celebrates with the victory banner', () => {
        finishLine();
        expect(victory().hidden).toBe(false);
        expect(document.querySelectorAll('.confetti')).toHaveLength(56);
        expect($('#announcer').textContent).toBe('Ligne terminée. Bravo !');
      });

      it('does not celebrate while the line goes on', () => {
        const { board } = startOnBlackToMove();
        press(board, 'c7');
        press(board, 'c6');
        expect(victory().hidden).toBe(true);
      });

      it('goes away when browsing the history, with Escape, or on a new position', () => {
        finishLine();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
        expect(victory().hidden).toBe(true);

        app?.newPosition();
        vi.advanceTimersByTime(600);
        const { board } = { board: $<SVGSVGElement>('#board') };
        press(board, 'c7');
        press(board, 'c6');
        expect(victory().hidden).toBe(false);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(victory().hidden).toBe(true);

        app?.newPosition();
        expect(victory().hidden).toBe(true);
      });

      it('starts a new exercise from the banner button', () => {
        finishLine();
        $<HTMLButtonElement>('#victory-new').click();
        expect(victory().hidden).toBe(true);
        expect($('#message').textContent).toContain('noirs');
      });
    });

    describe('sounds', () => {
      const played = (sound: ReturnType<typeof stubSound>): string[] =>
        sound.play.mock.calls.map(([name]) => name as string);

      it('plays a move sound for the opponent and for the user, then the victory jingle', () => {
        const sound = stubSound();
        const { board } = startOnBlackToMove(
          '[Event "S: t"]\n[Orientation "black"]\n\n1. e4 c6 *',
          sound,
        );
        press(board, 'c7');
        press(board, 'c6');
        expect(played(sound)).toEqual(['move', 'move', 'victory']);
      });

      it('plays a capture sound when a piece is taken', () => {
        const sound = stubSound();
        const { board } = startOnBlackToMove(
          '[Event "S: t"]\n[Orientation "black"]\n\n1. e4 d5 2. exd5 *',
          sound,
        );
        press(board, 'd7');
        press(board, 'd5');
        vi.advanceTimersByTime(600);
        expect(played(sound)).toEqual(['move', 'move', 'capture', 'victory']);
      });

      it('plays the error sound on a wrong move, and nothing else', () => {
        const sound = stubSound();
        const { board } = startOnBlackToMove(caroKann, sound);
        sound.play.mockClear();
        press(board, 'a7');
        press(board, 'a6');
        expect(played(sound)).toEqual(['error']);
      });
    });

    describe('aids (arrows and circles)', () => {
      const AIDS = 'lichess-study-trainer:aids';
      /** The opponent opens with an annotated move; the user (black) answers ...c6. */
      const OPPONENT_ANNOTATED =
        '[Event "S: t"]\n[Orientation "black"]\n\n1. e4 { [%csl Rd5][%cal Ge2e4] } c6 2. d4 d5 *';
      /** The author also annotates the user's own move. */
      const USER_ANNOTATED =
        '[Event "S: t"]\n[Orientation "black"]\n\n1. e4 c6 { [%csl Rd5][%cal Gc6c5] } 2. d4 d5 *';
      const shapesOnBoard = (): number =>
        document.querySelectorAll('#board .mark, #board .arrow').length;
      const hintMarks = (): number => document.querySelectorAll('#board .mark.shape-Y').length;
      const playC6 = (board: SVGSVGElement): void => {
        press(board, 'c7');
        press(board, 'c6');
      };

      it('shows the author annotations on the user turn by default', () => {
        startOnBlackToMove(OPPONENT_ANNOTATED);
        expect(shapesOnBoard()).toBe(2);
      });

      it('hides them when the aids are off, whichever side is trained', () => {
        startOnBlackToMove(OPPONENT_ANNOTATED, stubSound(), memoryStore({ [AIDS]: 'off' }));
        expect(shapesOnBoard()).toBe(0);
      });

      it('hides and shows them again when the lightbulb is toggled', () => {
        startOnBlackToMove(OPPONENT_ANNOTATED);
        $<HTMLButtonElement>('#aids-toggle').click();
        expect(shapesOnBoard()).toBe(0);
        $<HTMLButtonElement>('#aids-toggle').click();
        expect(shapesOnBoard()).toBe(2);
      });

      it('also controls the annotations of the move the user just played', () => {
        const { board } = startOnBlackToMove(USER_ANNOTATED);
        playC6(board);
        expect(shapesOnBoard()).toBe(2);
        $<HTMLButtonElement>('#aids-toggle').click();
        expect(shapesOnBoard()).toBe(0);
      });

      it('gives the user time to read the annotations only when they are shown', () => {
        const { board } = startOnBlackToMove(USER_ANNOTATED);
        playC6(board);
        vi.advanceTimersByTime(600);
        expect(document.querySelectorAll('#moves .move')).toHaveLength(2); // opponent still waiting
        vi.advanceTimersByTime(1200);
        expect(document.querySelectorAll('#moves .move')).toHaveLength(3);
      });

      it('does not slow the opponent down when the aids are off', () => {
        const { board } = startOnBlackToMove(
          USER_ANNOTATED,
          stubSound(),
          memoryStore({ [AIDS]: 'off' }),
        );
        playC6(board);
        vi.advanceTimersByTime(600);
        expect(document.querySelectorAll('#moves .move')).toHaveLength(3);
      });

      describe('hint button', () => {
        it('only highlights the piece to move, whatever the aids', () => {
          startOnBlackToMove(OPPONENT_ANNOTATED, stubSound(), memoryStore({ [AIDS]: 'off' }));
          $<HTMLButtonElement>('#hint').click();
          expect(shapesOnBoard()).toBe(1);
          expect(hintMarks()).toBe(1);
          expect($('#message').textContent).toBe('Indice : la pièce à jouer est en surbrillance.');
        });

        it('is added to the author annotations when the aids are on', () => {
          startOnBlackToMove(OPPONENT_ANNOTATED);
          $<HTMLButtonElement>('#hint').click();
          expect(shapesOnBoard()).toBe(3);
          expect(hintMarks()).toBe(1);
        });

        it('does not disappear when the aids are toggled', () => {
          startOnBlackToMove(OPPONENT_ANNOTATED);
          $<HTMLButtonElement>('#hint').click();
          $<HTMLButtonElement>('#aids-toggle').click();
          expect(shapesOnBoard()).toBe(1);
          expect(hintMarks()).toBe(1);
        });
      });

      it('keeps the solution button working when the aids are off', () => {
        startOnBlackToMove(OPPONENT_ANNOTATED, stubSound(), memoryStore({ [AIDS]: 'off' }));
        $<HTMLButtonElement>('#solution').click();
        expect(document.querySelectorAll('#board .arrow')).toHaveLength(1);
      });
    });
  });

  describe('sound toggle', () => {
    it('mutes and unmutes, and remembers the choice', () => {
      const sound = stubSound();
      const settings = memoryStore();
      app = new App($('#app'), { settings, sound });
      app.start();
      const toggle = $<HTMLButtonElement>('#sound-toggle');
      expect(toggle.getAttribute('aria-pressed')).toBe('true');

      toggle.click();
      expect(sound.setEnabled).toHaveBeenLastCalledWith(false);
      expect(toggle.getAttribute('aria-pressed')).toBe('false');
      expect(settings.read('sound')).toBe('off');

      toggle.click();
      expect(sound.setEnabled).toHaveBeenLastCalledWith(true);
      expect(sound.unlock).toHaveBeenCalled();
      expect(toggle.getAttribute('aria-pressed')).toBe('true');
      expect(settings.read('sound')).toBe('on');
    });

    it('starts muted when the user muted the sound earlier', () => {
      app = new App($('#app'), { settings: memoryStore({ 'lichess-study-trainer:sound': 'off' }) });
      app.start();
      expect($('#sound-toggle').getAttribute('aria-pressed')).toBe('false');
    });

    it('unlocks audio on the first user gesture only', () => {
      const sound = stubSound();
      app = new App($('#app'), { settings: memoryStore(), sound });
      app.start();
      expect(sound.unlock).not.toHaveBeenCalled();

      document.dispatchEvent(new Event('pointerdown'));
      document.dispatchEvent(new Event('pointerdown'));
      expect(sound.unlock).toHaveBeenCalledOnce();
    });
  });

  describe('aids toggle', () => {
    const toggle = () => $<HTMLButtonElement>('#aids-toggle');

    it('is on by default', () => {
      app = new App($('#app'), { settings: memoryStore() });
      app.start();
      expect(toggle().getAttribute('aria-pressed')).toBe('true');
    });

    it('switches and remembers the choice', () => {
      const settings = memoryStore();
      app = new App($('#app'), { settings });
      app.start();

      toggle().click();
      expect(toggle().getAttribute('aria-pressed')).toBe('false');
      expect(settings.read('aids')).toBe('off');

      toggle().click();
      expect(toggle().getAttribute('aria-pressed')).toBe('true');
      expect(settings.read('aids')).toBe('on');
    });

    it('is restored from the stored settings', () => {
      app = new App($('#app'), { settings: memoryStore({ 'lichess-study-trainer:aids': 'off' }) });
      app.start();
      expect(toggle().getAttribute('aria-pressed')).toBe('false');
    });
  });

  describe('refreshing studies loaded from a username', () => {
    const chapter = (study: string, name: string): string =>
      `[Event "${study}: ${name}"]\n[StudyName "${study}"]\n[ChapterName "${name}"]\n\n1. e4 e5 *`;
    const OLD = chapter('Old', 'o1');
    const key = (name: string): string => `lichess-study-trainer:${name}`;
    const reply = (body: string) =>
      vi.fn((url: string) => Promise.resolve(new Response(body, { headers: { 'x-url': url } })));

    it('remembers where the studies came from', () => {
      const settings = memoryStore();
      app = new App($('#app'), { settings });
      app.start();
      app.importPgn(caroKann, { username: 'Tendoskria' });
      expect(settings.read('source')).toBe('username');
      app.importPgn(caroKann, {});
      expect(settings.read('source')).toBe('other');
    });

    it('downloads the studies again and stores the fresh copy', async () => {
      const fetch = reply(caroKann);
      const settings = memoryStore({
        [key('pgn')]: OLD,
        [key('username')]: 'Tendoskria',
        [key('source')]: 'username',
      });
      app = new App($('#app'), { settings, fetch });
      app.start();
      // The saved copy is usable straight away.
      expect(visibleViews()).toEqual(['view-trainer']);

      await vi.waitFor(() => expect(settings.read('pgn')).toBe(caroKann));
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch.mock.calls[0]?.[0]).toContain('/by/Tendoskria/export.pgn');
      expect(chapterBoxes().length).toBeGreaterThan(0);
    });

    it('shows the study as soon as it arrives when nothing was saved', async () => {
      const settings = memoryStore({
        [key('username')]: 'Tendoskria',
        [key('source')]: 'username',
      });
      app = new App($('#app'), { settings, fetch: reply(caroKann) });
      app.start();
      expect(visibleViews()).toEqual(['view-welcome']);

      await vi.waitFor(() => expect(visibleViews()).toEqual(['view-trainer']));
      expect(settings.read('pgn')).toBe(caroKann);
    });

    it('keeps the saved studies when Lichess cannot be reached', async () => {
      const fetch = vi.fn(async () => Promise.reject(new TypeError('offline')));
      const settings = memoryStore({
        [key('pgn')]: OLD,
        [key('username')]: 'Tendoskria',
        [key('source')]: 'username',
      });
      app = new App($('#app'), { settings, fetch });
      app.start();

      await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
      await Promise.resolve();
      expect(settings.read('pgn')).toBe(OLD);
      expect(visibleViews()).toEqual(['view-trainer']);
    });

    it('also refreshes studies saved before the source was recorded', async () => {
      const fetch = reply(caroKann);
      const settings = memoryStore({ [key('pgn')]: OLD, [key('username')]: 'Tendoskria' });
      app = new App($('#app'), { settings, fetch });
      app.start();
      await vi.waitFor(() => expect(settings.read('pgn')).toBe(caroKann));
    });

    it('does not download anything for a pasted PGN or a study link', () => {
      const fetch = reply(caroKann);
      const settings = memoryStore({
        [key('pgn')]: OLD,
        [key('username')]: 'Tendoskria',
        [key('source')]: 'other',
      });
      app = new App($('#app'), { settings, fetch });
      app.start();
      expect(fetch).not.toHaveBeenCalled();
    });

    it('lets a manual import made in the meantime win', async () => {
      let release: (response: Response) => void = () => {};
      const fetch = vi.fn(() => new Promise<Response>((resolve) => (release = resolve)));
      const settings = memoryStore({
        [key('pgn')]: OLD,
        [key('username')]: 'Tendoskria',
        [key('source')]: 'username',
      });
      app = new App($('#app'), { settings, fetch });
      app.start();

      const pasted = chapter('Pasted', 'p1');
      app.importPgn(pasted, {});
      release(new Response(caroKann));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(settings.read('pgn')).toBe(pasted);
    });
  });
});
