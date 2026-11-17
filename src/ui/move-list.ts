/** Two-column move list; each move is a button that jumps to the position after it. */
export class MoveList {
  constructor(
    private readonly root: HTMLElement,
    private readonly onSelect: (ply: number) => void,
  ) {
    root.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const ply = target.dataset['ply'];
      if (ply !== undefined) this.onSelect(Number(ply));
    });
  }

  render(moves: readonly string[], currentPly: number, visible: boolean): void {
    if (!visible) {
      this.root.replaceChildren();
      return;
    }

    const fragment = document.createDocumentFragment();
    moves.forEach((san, index) => {
      if (index % 2 === 0) {
        const number = document.createElement('span');
        number.className = 'move-number';
        number.textContent = String(index / 2 + 1);
        fragment.append(number);
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'move';
      button.dataset['ply'] = String(index + 1);
      button.textContent = san;
      if (index + 1 === currentPly) {
        button.classList.add('current');
        button.setAttribute('aria-current', 'true');
      }
      fragment.append(button);
    });
    this.root.replaceChildren(fragment);

    if (currentPly === moves.length) {
      this.root.scrollTop = this.root.scrollHeight;
    } else {
      // scrollIntoView is missing in some non-browser DOMs (e.g. jsdom).
      this.root.querySelector<HTMLElement>('.move.current')?.scrollIntoView?.({ block: 'nearest' });
    }
  }
}
