// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

describe('App', () => {
  let app: App | null = null;
  const $ = <T extends Element>(selector: string): T => {
    const element = document.querySelector<T>(selector);
    if (!element) throw new Error(selector);
    return element;
  };

  beforeEach(() => {
    document.body.innerHTML = /<body>([\s\S]*)<\/body>/.exec(html)?.[1] ?? '';
  });

  afterEach(() => {
    app?.dispose();
    app = null;
  });

  it('shows an empty board and the import panel when nothing is stored', () => {
    app = new App($('#app'), { settings: memoryStore() });
    app.start();

    expect(document.querySelectorAll('#board .layer-pieces image')).toHaveLength(32);
    expect($('#message').textContent).toContain('pseudo Lichess');
    expect($<HTMLDetailsElement>('#import').open).toBe(true);
  });

  it('loads a PGN, starts an exercise and fills the selectors', () => {
    const settings = memoryStore();
    app = new App($('#app'), { settings, rng: () => 0 });
    app.start();
    $<HTMLSelectElement>('#mode').value = 'beginning';

    expect(app.importPgn(caroKann, { username: 'Tendoskria' })).toBe(true);

    expect($<HTMLSelectElement>('#chapter').options).toHaveLength(3);
    expect($('#chapter-name').textContent).toBe('Chapitre : ?');
    expect($('#message').textContent).toContain('noirs');
    expect(settings.read('username')).toBe('Tendoskria');
    expect(settings.read('pgn')).toBe(caroKann);
  });

  it('restores the stored study on start', () => {
    app = new App($('#app'), { settings: memoryStore({ 'lichess-study-trainer:pgn': caroKann }) });
    app.start();
    expect($<HTMLSelectElement>('#chapter').options.length).toBeGreaterThan(1);
    expect($<HTMLDetailsElement>('#import').open).toBe(false);
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
});
