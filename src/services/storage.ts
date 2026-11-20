const PREFIX = 'lichess-study-trainer:';

export type SettingKey = 'pgn' | 'username' | 'sound';

export type StorageBackend = Pick<Storage, 'getItem' | 'setItem'>;

function defaultBackend(): StorageBackend | null {
  try {
    return globalThis.localStorage;
  } catch {
    // Accessing localStorage can throw (blocked cookies, sandboxed iframes...).
    return null;
  }
}

/** Tiny persistence layer that never throws: storage is a convenience, not a requirement. */
export class SettingsStore {
  constructor(private readonly backend: StorageBackend | null = defaultBackend()) {}

  read(key: SettingKey): string | null {
    try {
      return this.backend?.getItem(PREFIX + key) ?? null;
    } catch {
      return null;
    }
  }

  write(key: SettingKey, value: string): void {
    try {
      this.backend?.setItem(PREFIX + key, value);
    } catch {
      // Quota exceeded or storage disabled: keep working without persistence.
    }
  }
}
