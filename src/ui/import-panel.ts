import {
  fetchStudyPgn,
  fetchUserStudiesPgn,
  parseStudyId,
  type FetchLike,
} from '../services/lichess';
import { requireElement } from './dom';
import { messages } from './messages';

export type StatusKind = 'info' | 'ok' | 'error';

export interface ImportHandlers {
  /** Loads the PGN; returns false when it contains nothing playable. */
  importPgn(text: string, source: { username?: string }): boolean;
  setStatus(text: string, kind: StatusKind): void;
}

/** "Load a study" form: Lichess username or study link, or a pasted/uploaded PGN. */
export class ImportPanel {
  private readonly source: HTMLInputElement;
  private readonly pgnText: HTMLTextAreaElement;
  private readonly pgnFile: HTMLInputElement;

  constructor(
    root: HTMLElement,
    private readonly handlers: ImportHandlers,
    private readonly fetchFn?: FetchLike,
  ) {
    this.source = requireElement<HTMLInputElement>(root, '#source');
    this.pgnText = requireElement<HTMLTextAreaElement>(root, '#pgn-text');
    this.pgnFile = requireElement<HTMLInputElement>(root, '#pgn-file');

    requireElement<HTMLFormElement>(root, '#lichess-form').addEventListener('submit', (event) => {
      event.preventDefault();
      void this.loadFromLichess();
    });
    requireElement<HTMLButtonElement>(root, '#load-pgn').addEventListener('click', () => {
      this.loadPgnText(this.pgnText.value);
    });
    this.pgnFile.addEventListener('change', () => {
      void this.readFile();
    });
  }

  setUsername(username: string): void {
    this.source.value = username;
  }

  private async loadFromLichess(): Promise<void> {
    const input = this.source.value.trim();
    if (!input) return;

    this.handlers.setStatus(messages.loading, 'info');
    const options = this.fetchFn ? { fetch: this.fetchFn } : {};
    try {
      const studyId = parseStudyId(input);
      const pgn = studyId
        ? await fetchStudyPgn(studyId, options)
        : await fetchUserStudiesPgn(input, options);
      const accepted = this.handlers.importPgn(pgn, studyId ? {} : { username: input });
      if (!accepted) this.handlers.setStatus(messages.noChapters, 'error');
    } catch (error) {
      this.handlers.setStatus(messages.lichessError(error), 'error');
    }
  }

  private loadPgnText(text: string): void {
    if (!this.handlers.importPgn(text, {})) {
      this.handlers.setStatus(messages.noChapters, 'error');
    }
  }

  private async readFile(): Promise<void> {
    const file = this.pgnFile.files?.[0];
    if (file) this.pgnText.value = await file.text();
  }
}
