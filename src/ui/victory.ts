import type { Rng } from '../domain/training';
import { requireElement } from './dom';

const CONFETTI_COUNT = 56;
const SPARKLE_COUNT = 14;
const CONFETTI_COLORS = ['#f5c542', '#e5604f', '#4fb3e5', '#7ccd8a', '#c58af0', '#ffffff'];
const SPARKLE_COLORS = ['#ffe58a', '#ffffff', '#f5c542'];
/** The banner and the effects start slightly after the last move, so the board is seen first. */
const START_DELAY_S = 0.35;
/** The banner's buttons stay disabled this long, so a click meant for the board can't dismiss it. */
const BUTTONS_LOCK_MS = 1000;

export interface VictoryHandlers {
  onNewPosition(): void;
}

export interface VictoryOptions {
  /** How long the buttons stay disabled after the banner appears, in ms. */
  readonly lockMs?: number;
}

/**
 * Celebration shown when a line is completed: a banner that fades in gently, with confetti
 * falling and sparkles twinkling around it. All motion is CSS; this class only builds the
 * particles (with randomised CSS custom properties) and toggles visibility.
 */
export class VictoryOverlay {
  private readonly effects: HTMLElement;
  private readonly buttons: HTMLButtonElement[];
  private readonly lockMs: number;
  private unlockTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly root: HTMLElement,
    handlers: VictoryHandlers,
    private readonly rng: Rng = Math.random,
    options: VictoryOptions = {},
  ) {
    this.lockMs = options.lockMs ?? BUTTONS_LOCK_MS;
    this.effects = requireElement(root, '.victory-fx');
    const newPosition = requireElement<HTMLButtonElement>(root, '#victory-new');
    const close = requireElement<HTMLButtonElement>(root, '#victory-close');
    this.buttons = [newPosition, close];
    newPosition.addEventListener('click', () => handlers.onNewPosition());
    close.addEventListener('click', () => this.hide());
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  show(): void {
    this.effects.replaceChildren(...this.createConfetti(), ...this.createSparkles());
    this.lockButtons();
    this.root.hidden = false;
  }

  hide(): void {
    clearTimeout(this.unlockTimer);
    this.unlockTimer = undefined;
    this.setButtonsDisabled(false);
    this.root.hidden = true;
    this.effects.replaceChildren();
  }

  /** Disables the buttons for a moment: the player was probably still clicking on the board. */
  private lockButtons(): void {
    clearTimeout(this.unlockTimer);
    this.setButtonsDisabled(true);
    this.unlockTimer = setTimeout(() => {
      this.unlockTimer = undefined;
      this.setButtonsDisabled(false);
    }, this.lockMs);
  }

  private setButtonsDisabled(disabled: boolean): void {
    for (const button of this.buttons) button.disabled = disabled;
  }

  private between(min: number, max: number): number {
    return min + this.rng() * (max - min);
  }

  private pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.rng() * items.length)] ?? (items[0] as T);
  }

  private particle(className: string, properties: Record<string, string>): HTMLElement {
    const element = document.createElement('i');
    element.className = className;
    for (const [name, value] of Object.entries(properties)) element.style.setProperty(name, value);
    return element;
  }

  private createConfetti(): HTMLElement[] {
    const fall = (this.root.clientHeight || 480) + 40;
    return Array.from({ length: CONFETTI_COUNT }, () => {
      const piece = this.particle(this.rng() < 0.33 ? 'confetti round' : 'confetti', {
        '--x': `${this.between(0, 100).toFixed(1)}%`,
        '--drift': `${this.between(-90, 90).toFixed(0)}px`,
        '--fall': `${fall}px`,
        '--spin': `${this.between(-720, 720).toFixed(0)}deg`,
        '--delay': `${(START_DELAY_S + this.between(0, 0.9)).toFixed(2)}s`,
        '--dur': `${this.between(2.6, 4.4).toFixed(2)}s`,
        '--color': this.pick(CONFETTI_COLORS),
      });
      piece.addEventListener('animationend', () => piece.remove());
      return piece;
    });
  }

  private createSparkles(): HTMLElement[] {
    return Array.from({ length: SPARKLE_COUNT }, () =>
      this.particle('sparkle', {
        '--x': `${this.between(8, 92).toFixed(1)}%`,
        '--y': `${this.between(12, 80).toFixed(1)}%`,
        '--size': `${this.between(10, 26).toFixed(0)}px`,
        '--delay': `${(START_DELAY_S + this.between(0, 1.6)).toFixed(2)}s`,
        '--dur': `${this.between(1.4, 2.6).toFixed(2)}s`,
        '--color': this.pick(SPARKLE_COLORS),
      }),
    );
  }
}
