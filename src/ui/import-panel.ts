import { fetchStudyPgn, fetchUserStudiesPgn, parseStudyId } from '../services/lichess';
import type { FetchLike } from '../services/lichess';
import { requireElement } from './dom';
import { messages } from './messages';

type SourceKind = 'username' | 'pgn';
type StatusKind = 'info' | 'ok' | 'error';

export interface ImportHandlers {
  /** Loads the PGN; returns false when it contains nothing playable. */
  importPgn(text: string, source: { username?: string }): boolean;
}

/**
 * The "load a study" form. A radio group picks the source (Lichess username/link or PGN);
 * only the matching fields are shown and a single button submits.
 */
export class ImportPanel {
  private readonly radios: HTMLInputElement[];
  private readonly panels: Record<SourceKind, HTMLElement>;
  private readonly username: HTMLInputElement;
  private readonly pgnText: HTMLTextAreaElement;
  private readonly pgnFile: HTMLInputElement;
  private readonly pgnFileName: HTMLElement;
  private readonly status: HTMLElement;
  private readonly submit: HTMLButtonElement;

  constructor(
    root: HTMLElement,
    private readonly handlers: ImportHandlers,
    private readonly fetchFn?: FetchLike,
  ) {
    this.radios = [...root.querySelectorAll<HTMLInputElement>('input[name="source-kind"]')];
    this.panels = {
      username: requireElement(root, '#source-username'),
      pgn: requireElement(root, '#source-pgn'),
    };
    this.username = requireElement(root, '#username');
    this.pgnText = requireElement(root, '#pgn-text');
    this.pgnFile = requireElement(root, '#pgn-file');
    this.pgnFileName = requireElement(root, '#pgn-file-name');
    this.status = requireElement(root, '#import-status');
    this.submit = requireElement(root, '#import-submit');

    for (const radio of this.radios) radio.addEventListener('change', () => this.showSource());
    requireElement<HTMLFormElement>(root, '#import-form').addEventListener('submit', (event) => {
      event.preventDefault();
      void this.load();
    });
    this.pgnFile.addEventListener('change', () => {
      void this.readFile();
    });
    this.showSource();
  }

  setUsername(username: string): void {
    this.username.value = username;
  }

  private get kind(): SourceKind {
    return this.radios.find((radio) => radio.checked)?.value === 'pgn' ? 'pgn' : 'username';
  }

  private showSource(): void {
    for (const [kind, panel] of Object.entries(this.panels)) panel.hidden = kind !== this.kind;
    this.setStatus('', 'info');
  }

  private async load(): Promise<void> {
    this.submit.disabled = true;
    try {
      if (this.kind === 'pgn') this.loadPgnText();
      else await this.loadFromLichess();
    } finally {
      this.submit.disabled = false;
    }
  }

  private async loadFromLichess(): Promise<void> {
    const input = this.username.value.trim();
    if (!input) return;

    this.setStatus(messages.loading, 'info');
    const options = this.fetchFn ? { fetch: this.fetchFn } : {};
    try {
      const studyId = parseStudyId(input);
      const pgn = studyId
        ? await fetchStudyPgn(studyId, options)
        : await fetchUserStudiesPgn(input, options);
      this.accept(pgn, studyId ? {} : { username: input });
    } catch (error) {
      this.setStatus(messages.lichessError(error), 'error');
    }
  }

  private loadPgnText(): void {
    const text = this.pgnText.value.trim();
    if (text) this.accept(text, {});
  }

  private accept(pgn: string, source: { username?: string }): void {
    if (this.handlers.importPgn(pgn, source)) this.setStatus('', 'info');
    else this.setStatus(messages.noChapters, 'error');
  }

  private async readFile(): Promise<void> {
    const file = this.pgnFile.files?.[0];
    this.pgnFileName.textContent = file?.name ?? messages.noFileChosen;
    if (file) this.pgnText.value = await file.text();
  }

  private setStatus(text: string, kind: StatusKind): void {
    this.status.textContent = text;
    this.status.className = `message ${kind}`;
  }
}
