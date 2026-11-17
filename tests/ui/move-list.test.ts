// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { MoveList } from '../../src/ui/move-list';

describe('MoveList', () => {
  it('renders numbered moves and highlights the current one', () => {
    const root = document.createElement('div');
    new MoveList(root, () => undefined).render(['e4', 'c6', 'd4'], 2, true);

    expect([...root.querySelectorAll('.move-number')].map((n) => n.textContent)).toEqual([
      '1',
      '2',
    ]);
    expect([...root.querySelectorAll('.move')].map((m) => m.textContent)).toEqual([
      'e4',
      'c6',
      'd4',
    ]);
    expect(root.querySelector('.current')?.textContent).toBe('c6');
  });

  it('renders nothing when hidden', () => {
    const root = document.createElement('div');
    new MoveList(root, () => undefined).render(['e4'], 1, false);
    expect(root.children).toHaveLength(0);
  });

  it('reports the ply of a clicked move', () => {
    const root = document.createElement('div');
    const onSelect = vi.fn();
    new MoveList(root, onSelect).render(['e4', 'c6'], 2, true);
    root.querySelectorAll<HTMLElement>('.move')[0]?.click();
    expect(onSelect).toHaveBeenCalledWith(1);
  });
});
