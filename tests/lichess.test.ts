import { describe, expect, it, vi } from 'vitest';
import {
  fetchStudyPgn,
  fetchUserStudiesPgn,
  LichessError,
  parseStudyId,
  type FetchLike,
} from '../src/services/lichess';

const respond = (body: string, status = 200): FetchLike =>
  vi.fn(async () => new Response(body, { status }));

describe('parseStudyId', () => {
  it('extracts the id from study and chapter URLs', () => {
    expect(parseStudyId('https://lichess.org/study/F6sn8qZD')).toBe('F6sn8qZD');
    expect(parseStudyId('https://lichess.org/study/F6sn8qZD/YDrw0HPD')).toBe('F6sn8qZD');
  });

  it('returns null for anything else', () => {
    expect(parseStudyId('Tendoskria')).toBeNull();
    expect(parseStudyId('https://lichess.org/@/Tendoskria')).toBeNull();
  });
});

describe('Lichess API client', () => {
  it('fetches a study PGN', async () => {
    const fetch = respond('PGN');
    await expect(fetchStudyPgn('F6sn8qZD', { fetch })).resolves.toBe('PGN');
    expect(fetch).toHaveBeenCalledWith('https://lichess.org/api/study/F6sn8qZD.pgn', undefined);
  });

  it('fetches every public study of a user, encoding the username', async () => {
    const fetch = respond('PGN');
    await fetchUserStudiesPgn('a b', { fetch });
    expect(fetch).toHaveBeenCalledWith(
      'https://lichess.org/api/study/by/a%20b/export.pgn',
      undefined,
    );
  });

  it('maps 404 to a not-found error', async () => {
    await expect(fetchStudyPgn('x', { fetch: respond('', 404) })).rejects.toMatchObject({
      kind: 'not-found',
    });
  });

  it('maps other HTTP failures', async () => {
    await expect(fetchStudyPgn('x', { fetch: respond('', 500) })).rejects.toMatchObject({
      kind: 'http',
      status: 500,
    });
  });

  it('maps network failures', async () => {
    const fetch: FetchLike = () => Promise.reject(new TypeError('offline'));
    const error = await fetchStudyPgn('x', { fetch }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LichessError);
    expect(error).toMatchObject({ kind: 'network' });
  });

  it('lets aborts through untouched', async () => {
    const fetch: FetchLike = () => Promise.reject(new DOMException('aborted', 'AbortError'));
    await expect(fetchStudyPgn('x', { fetch })).rejects.toMatchObject({ name: 'AbortError' });
  });
});
