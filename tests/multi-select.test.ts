// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MultiSelect } from '../src/ui/multi-select';

function setup() {
  const root = document.createElement('div');
  document.body.append(root);
  const onCommit = vi.fn();
  const select = new MultiSelect(root, {
    label: 'Chapitres',
    summary: (picked, total) =>
      picked.length === 0
        ? `Tous (${total})`
        : picked.length === 1
          ? (picked[0] ?? '')
          : `${picked.length} choisis`,
    clearLabel: 'Effacer',
    doneLabel: 'OK',
    onCommit,
  });
  select.setGroups([
    { label: 'A', options: [{ value: '0', label: 'a1' }, { value: '1', label: 'a2' }] },
    { label: 'B', options: [{ value: '2', label: 'b1' }] },
  ]);
  const boxes = (): HTMLInputElement[] => [...root.querySelectorAll('input')];
  const click = (box: HTMLInputElement | undefined): void => box?.click();
  const summary = (): string => root.querySelector('summary')?.textContent ?? '';
  const details = root.querySelector('details') as HTMLDetailsElement;
  return { root, select, onCommit, boxes, click, summary, details };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('MultiSelect', () => {
  it('renders one checkbox per option under its group heading', () => {
    const { root, boxes, summary } = setup();
    expect(boxes()).toHaveLength(3);
    expect([...root.querySelectorAll('legend')].map((l) => l.textContent)).toEqual(['A', 'B']);
    expect(summary()).toBe('Tous (3)');
  });

  it('keeps several picked values and summarises them', () => {
    const { select, boxes, click, summary } = setup();
    click(boxes()[0]);
    expect(summary()).toBe('a1');
    click(boxes()[2]);
    expect([...select.selected].sort()).toEqual(['0', '2']);
    expect(summary()).toBe('2 choisis');
  });

  it('reports a change once, when the list is closed', () => {
    const { root, boxes, click, onCommit, details } = setup();
    details.open = true;
    click(boxes()[0]);
    click(boxes()[1]);
    expect(onCommit).not.toHaveBeenCalled();
    root.querySelector<HTMLButtonElement>('[data-done]')?.click();
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(details.open).toBe(false);
    root.querySelector<HTMLButtonElement>('[data-done]')?.click();
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('does not report anything when nothing changed', () => {
    const { root, onCommit, details } = setup();
    details.open = true;
    root.querySelector<HTMLButtonElement>('[data-done]')?.click();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('clears the selection', () => {
    const { root, select, boxes, click, summary } = setup();
    click(boxes()[1]);
    root.querySelector<HTMLButtonElement>('[data-clear]')?.click();
    expect(select.selected.size).toBe(0);
    expect(boxes().every((box) => !box.checked)).toBe(true);
    expect(summary()).toBe('Tous (3)');
  });

  it('drops picked values that disappear and keeps the others checked', () => {
    const { select, boxes, click } = setup();
    click(boxes()[0]);
    click(boxes()[2]);
    select.setGroups([{ label: null, options: [{ value: '2', label: 'b1' }] }]);
    expect([...select.selected]).toEqual(['2']);
    expect(boxes().map((box) => box.checked)).toEqual([true]);
  });

  it('closes when clicking outside', () => {
    const { details } = setup();
    details.open = true;
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(details.open).toBe(false);
  });
});
