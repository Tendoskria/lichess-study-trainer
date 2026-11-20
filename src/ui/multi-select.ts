import { requireElement } from './dom';

export interface MultiSelectOption {
  readonly value: string;
  readonly label: string;
}

/** A titled block of options; a `null` label means no heading. */
export interface MultiSelectGroup {
  readonly label: string | null;
  readonly options: readonly MultiSelectOption[];
}

export interface MultiSelectConfig {
  /** Accessible name of the list of options. */
  readonly label: string;
  /** Text of the closed control, from the labels of the picked options and the option count. */
  readonly summary: (picked: readonly string[], total: number) => string;
  readonly clearLabel: string;
  readonly doneLabel: string;
  /** Called once the list is closed after the selection changed. */
  readonly onCommit: () => void;
}

/**
 * A drop-down with checkboxes: any number of options can be picked, optionally under group
 * headings. An empty selection is meant as "everything"; the caller decides what that means.
 */
export class MultiSelect {
  private readonly details: HTMLDetailsElement;
  private readonly summaryEl: HTMLElement;
  private readonly list: HTMLElement;
  private readonly picked = new Set<string>();
  private labels = new Map<string, string>();
  private dirty = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly config: MultiSelectConfig,
  ) {
    root.innerHTML = `
      <details>
        <summary></summary>
        <div class="multiselect-panel" role="group">
          <div class="multiselect-list"></div>
          <div class="multiselect-actions">
            <button type="button" data-clear></button>
            <button type="button" class="primary" data-done></button>
          </div>
        </div>
      </details>`;
    this.details = requireElement(root, 'details');
    this.summaryEl = requireElement(root, 'summary');
    this.list = requireElement(root, '.multiselect-list');
    requireElement(root, '.multiselect-panel').setAttribute('aria-label', config.label);

    const clear = requireElement<HTMLButtonElement>(root, '[data-clear]');
    clear.textContent = config.clearLabel;
    clear.addEventListener('click', () => this.clear(true));
    const done = requireElement<HTMLButtonElement>(root, '[data-done]');
    done.textContent = config.doneLabel;
    done.addEventListener('click', () => this.close(true));

    this.details.addEventListener('toggle', () => {
      if (!this.details.open) this.commit();
    });
    this.details.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.details.open) {
        event.stopPropagation();
        this.close(true);
      }
    });
    document.addEventListener('pointerdown', this.onOutsidePointer);
    this.refresh();
  }

  get hidden(): boolean {
    return Boolean(this.root.hidden);
  }

  set hidden(value: boolean) {
    this.root.hidden = value;
  }

  /** The values currently picked (a copy). */
  get selected(): ReadonlySet<string> {
    return new Set(this.picked);
  }

  /** Replaces the options. Picked values that no longer exist are dropped. */
  setGroups(groups: readonly MultiSelectGroup[]): void {
    this.labels = new Map(
      groups.flatMap((group) => group.options.map((o): [string, string] => [o.value, o.label])),
    );
    for (const value of [...this.picked]) if (!this.labels.has(value)) this.picked.delete(value);

    this.list.replaceChildren(...groups.map((group) => this.renderGroup(group)));
    this.refresh();
  }

  /** Unpicks everything. With `notify`, the change is reported once the list is closed. */
  clear(notify = false): void {
    if (this.picked.size === 0) return;
    this.picked.clear();
    for (const box of this.list.querySelectorAll<HTMLInputElement>('input')) box.checked = false;
    if (notify) this.dirty = true;
    this.refresh();
  }

  destroy(): void {
    document.removeEventListener('pointerdown', this.onOutsidePointer);
  }

  private renderGroup(group: MultiSelectGroup): HTMLElement {
    const section = document.createElement('fieldset');
    section.className = 'multiselect-group';
    if (group.label !== null) {
      const legend = document.createElement('legend');
      legend.textContent = group.label;
      section.append(legend);
    }
    for (const option of group.options) section.append(this.renderOption(option));
    return section;
  }

  private renderOption({ value, label }: MultiSelectOption): HTMLElement {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = this.picked.has(value);
    box.addEventListener('change', () => {
      if (box.checked) this.picked.add(value);
      else this.picked.delete(value);
      this.dirty = true;
      this.refresh();
    });
    const text = document.createElement('span');
    text.textContent = label;
    const item = document.createElement('label');
    item.append(box, text);
    return item;
  }

  private refresh(): void {
    const labels = [...this.picked].map((value) => this.labels.get(value) ?? value);
    this.summaryEl.textContent = this.config.summary(labels, this.labels.size);
  }

  private close(refocus: boolean): void {
    this.details.open = false;
    // The `toggle` event is asynchronous; commit now so callers see the result immediately.
    this.commit();
    if (refocus) this.summaryEl.focus();
  }

  private commit(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.config.onCommit();
  }

  private readonly onOutsidePointer = (event: PointerEvent): void => {
    if (this.details.open && event.target instanceof Node && !this.root.contains(event.target)) {
      this.close(false);
    }
  };
}
