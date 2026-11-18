import type { Rng } from '../domain/training';
import { requireElement } from './dom';

const CONFETTI_COUNT = 56;
const SPARKLE_COUNT = 14;
const CONFETTI_COLORS = ['#f5c542', '#e5604f', '#4fb3e5', '#7ccd8a', '#c58af0', '#ffffff'];
const SPARKLE_COLORS = ['#ffe58a', '#ffffff', '#f5c542'];
/** The banner and the effects start slightly after the last move, so the board is seen first. */
const START_DELAY_S = 0.35;

export interface VictoryHandlers {
  onNewPosition(): void;
}

/**
 * Celebration shown when a line is completed: a banner that fades in gently, with confetti
 * falling and sparkles twinkling around it. All motion is CSS; this class only builds the
 * particles (with randomised CSS custom properties) and toggles visibility.
 */
export class VictoryOverlay {
  private readonly effects: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    handlers: VictoryHandlers,
    private readonly rng: Rng = Math.random,
  ) {
    this.effects = requireElement(root, '.victory-fx');
    requireElement(root, '#victory-new').addEventListener('click', () => handlers.onNewPosition());
    requireElement(root, '#victory-close').addEventListener('click', () => this.hide());
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  show(): void {
    this.effects.replaceChildren(...this.createConfetti(), ...this.createSparkles());
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
    this.effects.replaceChildren();
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
