// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FetchLike } from '../../src/services/lichess';
import { ImportPanel } from '../../src/ui/import-panel';

const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');

const $ = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(selector);
  return element;
};

function setup(fetchFn: FetchLike, accepted = true) {
  const handlers = { importPgn: vi.fn(() => accepted) };
  new ImportPanel(document.body, handlers, fetchFn);
  const choose = (kind: 'username' | 'pgn'): void => {
    const radio = $<HTMLInputElement>(`input[name="source-kind"][value="${kind}"]`);
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
  };
  const submit = (): void => {
    $('#import-form').dispatchEvent(new Event('submit', { cancelable: true }));
  };
  const type = (selector: string, value: string): void => {
    $<HTMLInputElement | HTMLTextAreaElement>(selector).value = value;
  };
  return { handlers, choose, submit, type };
}

describe('ImportPanel', () => {
  beforeEach(() => {
    document.body.innerHTML = /<body>([\s\S]*)<\/body>/.exec(html)?.[1] ?? '';
  });

  it('shows only the fields of the selected source', () => {
    const { choose } = setup(vi.fn());
    expect($('#source-username').hasAttribute('hidden')).toBe(false);
    expect($('#source-pgn').hasAttribute('hidden')).toBe(true);

    choose('pgn');
    expect($('#source-username').hasAttribute('hidden')).toBe(true);
    expect($('#source-pgn').hasAttribute('hidden')).toBe(false);

    choose('username');
    expect($('#source-pgn').hasAttribute('hidden')).toBe(true);
  });

  it('loads every public study of a username', async () => {
    const fetchFn = vi.fn<FetchLike>(async () => new Response('PGN'));
    const { handlers, submit, type } = setup(fetchFn);
    type('#username', '  Tendoskria ');
    submit();

    await vi.waitFor(() => expect(handlers.importPgn).toHaveBeenCalled());
    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      'https://lichess.org/api/study/by/Tendoskria/export.pgn',
    );
    expect(handlers.importPgn).toHaveBeenCalledWith('PGN', { username: 'Tendoskria' });
  });

  it('loads a single study from its link, without remembering a username', async () => {
    const fetchFn = vi.fn<FetchLike>(async () => new Response('PGN'));
    const { handlers, submit, type } = setup(fetchFn);
    type('#username', 'https://lichess.org/study/F6sn8qZD/YDrw0HPD');
    submit();

    await vi.waitFor(() => expect(handlers.importPgn).toHaveBeenCalled());
    expect(fetchFn.mock.calls[0]?.[0]).toBe('https://lichess.org/api/study/F6sn8qZD.pgn');
    expect(handlers.importPgn).toHaveBeenCalledWith('PGN', {});
  });

  it('reports Lichess errors on the page', async () => {
    const { handlers, submit, type } = setup(async () => new Response('', { status: 404 }));
    type('#username', 'nobody');
    submit();

    await vi.waitFor(() => expect($('#import-status').textContent).toContain('introuvable'));
    expect($('#import-status').classList.contains('error')).toBe(true);
    expect(handlers.importPgn).not.toHaveBeenCalled();
    expect($<HTMLButtonElement>('#import-submit').disabled).toBe(false);
  });

  it('warns when the downloaded PGN has nothing playable', async () => {
    const { submit, type } = setup(async () => new Response('junk'), false);
    type('#username', 'someone');
    submit();
    await vi.waitFor(() => expect($('#import-status').textContent).toContain('Aucune ligne'));
  });

  it('does nothing for an empty username', () => {
    const fetchFn = vi.fn<FetchLike>();
    const { submit } = setup(fetchFn);
    submit();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('loads a pasted PGN without any network call', () => {
    const fetchFn = vi.fn<FetchLike>();
    const { handlers, choose, submit, type } = setup(fetchFn);
    choose('pgn');
    type('#pgn-text', '[Event "x"] 1. e4 *');
    submit();

    expect(fetchFn).not.toHaveBeenCalled();
    expect(handlers.importPgn).toHaveBeenCalledWith('[Event "x"] 1. e4 *', {});
  });
});
