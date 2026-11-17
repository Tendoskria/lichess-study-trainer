const API_BASE = 'https://lichess.org/api/study';
const STUDY_URL = /lichess\.org\/study\/([A-Za-z0-9]{8})/;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface RequestOptions {
  /** Injectable for tests; defaults to the global `fetch`. */
  readonly fetch?: FetchLike;
  readonly signal?: AbortSignal;
}

export type LichessErrorKind = 'not-found' | 'http' | 'network';

export class LichessError extends Error {
  constructor(
    readonly kind: LichessErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'LichessError';
  }
}

/** Extracts the 8-character study id from a Lichess study (or chapter) URL. */
export function parseStudyId(input: string): string | null {
  return STUDY_URL.exec(input)?.[1] ?? null;
}

async function getText(url: string, options: RequestOptions): Promise<string> {
  const fetchFn: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));

  let response: Response;
  try {
    response = await fetchFn(url, options.signal ? { signal: options.signal } : undefined);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new LichessError('network', 'Unable to reach Lichess');
  }

  if (response.status === 404) throw new LichessError('not-found', 'Not found', 404);
  if (!response.ok) {
    throw new LichessError('http', `Lichess answered ${response.status}`, response.status);
  }
  return response.text();
}

/** PGN of a whole study (all chapters). Public studies only. */
export function fetchStudyPgn(studyId: string, options: RequestOptions = {}): Promise<string> {
  return getText(`${API_BASE}/${encodeURIComponent(studyId)}.pgn`, options);
}

/** PGN of every public study of a user. */
export function fetchUserStudiesPgn(
  username: string,
  options: RequestOptions = {},
): Promise<string> {
  return getText(`${API_BASE}/by/${encodeURIComponent(username)}/export.pgn`, options);
}
