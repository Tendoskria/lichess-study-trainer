// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FetchLike } from '../../src/services/lichess';
import { ImportPanel } from '../../src/ui/import-panel';

const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');

function setup(fetchFn: FetchLike, accepted = true) {
  const root = document.body;
  const handlers = { importPgn: vi.fn(() => accepted), setStatus: vi.fn() };
  const panel = new ImportPanel(root, handlers, fetchFn);
  const input = root.querySelector<HTMLInputElement>('#source');
  if (!input) throw new Error('#source');
  const submit = (value: string): void => {
    input.value = value;
    root.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
  };
  return { handlers, panel, submit };
}

describe('ImportPanel', () => {
  beforeEach(() => {
    document.body.innerHTML = /<body>([\s\S]*)<\/body>/.exec(html)?.[1] ?? '';
  });

  it('loads every public study of a username', async () => {
    const fetchFn = vi.fn<FetchLike>(async () => new Response('PGN'));
    const { handlers, submit } = setup(fetchFn);
    submit('  Tendoskria ');

    await vi.waitFor(() => expect(handlers.importPgn).toHaveBeenCalled());
    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      'https://lichess.org/api/study/by/Tendoskria/export.pgn',
    );
    expect(handlers.importPgn).toHaveBeenCalledWith('PGN', { username: 'Tendoskria' });
  });

  it('loads a single study from its link, without remembering a username', async () => {
    const fetchFn = vi.fn<FetchLike>(async () => new Response('PGN'));
    const { handlers, submit } = setup(fetchFn);
    submit('https://lichess.org/study/F6sn8qZD/YDrw0HPD');

    await vi.waitFor(() => expect(handlers.importPgn).toHaveBeenCalled());
    expect(fetchFn.mock.calls[0]?.[0]).toBe('https://lichess.org/api/study/F6sn8qZD.pgn');
    expect(handlers.importPgn).toHaveBeenCalledWith('PGN', {});
  });

  it('reports Lichess errors to the user', async () => {
    const { handlers, submit } = setup(async () => new Response('', { status: 404 }));
    submit('nobody');
    await vi.waitFor(() =>
      expect(handlers.setStatus).toHaveBeenLastCalledWith(
        expect.stringContaining('introuvable'),
        'error',
      ),
    );
    expect(handlers.importPgn).not.toHaveBeenCalled();
  });

  it('warns when the downloaded PGN has nothing playable', async () => {
    const { handlers, submit } = setup(async () => new Response('junk'), false);
    submit('someone');
    await vi.waitFor(() =>
      expect(handlers.setStatus).toHaveBeenLastCalledWith(
        expect.stringContaining('Aucune ligne'),
        'error',
      ),
    );
  });

  it('does nothing for an empty field and loads pasted PGN text', () => {
    const fetchFn = vi.fn<FetchLike>();
    const { handlers, submit } = setup(fetchFn);
    submit('   ');
    expect(fetchFn).not.toHaveBeenCalled();

    const textarea = document.querySelector<HTMLTextAreaElement>('#pgn-text');
    if (textarea) textarea.value = '[Event "x"] 1. e4 *';
    document.querySelector<HTMLButtonElement>('#load-pgn')?.click();
    expect(handlers.importPgn).toHaveBeenCalledWith('[Event "x"] 1. e4 *', {});
  });
});
