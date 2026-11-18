export type View = 'trainer' | 'settings' | 'welcome';

/**
 * Decides which page to show. The settings page is addressed by the URL hash (`#/settings`),
 * so links, the browser's back button and bookmarks all work without a router library.
 * Without any loaded study, everything else falls back to the welcome page.
 */
export function resolveView(hash: string, hasStudies: boolean): View {
  if (hash.replace(/^#\/?/, '') === 'settings') return 'settings';
  return hasStudies ? 'trainer' : 'welcome';
}

export class Router {
  private shown: View | null = null;

  constructor(
    private readonly views: Record<View, HTMLElement>,
    private readonly hasStudies: () => boolean,
  ) {}

  get current(): View | null {
    return this.shown;
  }

  start(): void {
    window.addEventListener('hashchange', this.render);
    this.render();
  }

  stop(): void {
    window.removeEventListener('hashchange', this.render);
  }

  navigate(view: 'trainer' | 'settings'): void {
    const hash = view === 'settings' ? '#/settings' : '#/';
    if (window.location.hash !== hash) window.location.hash = hash;
    this.render();
  }

  /** Shows the right page; does nothing when it is already displayed. */
  readonly render = (): void => {
    const next = resolveView(window.location.hash, this.hasStudies());
    if (next === this.shown) return;

    const isFirstRender = this.shown === null;
    this.shown = next;
    for (const [name, element] of Object.entries(this.views)) element.hidden = name !== next;
    // Keep keyboard and screen-reader users oriented after a page change.
    if (!isFirstRender) this.views[next].querySelector<HTMLElement>('[data-view-heading]')?.focus();
  };
}
