// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveView, Router } from '../../src/ui/router';
import type { View } from '../../src/ui/router';

describe('resolveView', () => {
  it('shows the settings page whenever it is requested', () => {
    expect(resolveView('#/settings', false)).toBe('settings');
    expect(resolveView('#settings', true)).toBe('settings');
  });

  it('falls back to the welcome page until a study is loaded', () => {
    expect(resolveView('', false)).toBe('welcome');
    expect(resolveView('#/', false)).toBe('welcome');
    expect(resolveView('#/unknown', false)).toBe('welcome');
  });

  it('shows the trainer once a study is loaded', () => {
    expect(resolveView('', true)).toBe('trainer');
    expect(resolveView('#/', true)).toBe('trainer');
  });
});

describe('Router', () => {
  let hasStudies = false;
  let router: Router;
  const views = {} as Record<View, HTMLElement>;

  beforeEach(() => {
    hasStudies = false;
    window.location.hash = '';
    for (const name of ['trainer', 'settings', 'welcome'] as const) {
      const section = document.createElement('section');
      section.innerHTML = '<h1 data-view-heading tabindex="-1">Title</h1>';
      views[name] = section;
      document.body.append(section);
    }
    router = new Router(views, () => hasStudies);
  });

  afterEach(() => {
    router.stop();
    document.body.replaceChildren();
  });

  const visible = (): View[] =>
    (Object.keys(views) as View[]).filter((name) => !views[name].hidden);

  it('shows exactly one page', () => {
    router.start();
    expect(visible()).toEqual(['welcome']);
    expect(router.current).toBe('welcome');
  });

  it('navigates programmatically and moves focus to the new page heading', () => {
    router.start();
    router.navigate('settings');
    expect(visible()).toEqual(['settings']);
    expect(window.location.hash).toBe('#/settings');
    expect(document.activeElement).toBe(views.settings.querySelector('h1'));

    hasStudies = true;
    router.navigate('trainer');
    expect(visible()).toEqual(['trainer']);
  });

  it('follows hash changes (links and the browser back button)', () => {
    router.start();
    window.location.hash = '#/settings';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(visible()).toEqual(['settings']);
  });
});
