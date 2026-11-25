// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VictoryOverlay } from '../../src/ui/victory';

const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');

describe('VictoryOverlay', () => {
  const $ = <T extends Element>(selector: string): T => {
    const element = document.querySelector<T>(selector);
    if (!element) throw new Error(selector);
    return element;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = /<body>([\s\S]*)<\/body>/.exec(html)?.[1] ?? '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is hidden until shown, then reveals the banner with confetti and sparkles', () => {
    const overlay = new VictoryOverlay($('#victory'), { onNewPosition: vi.fn() }, () => 0.5);
    expect(overlay.visible).toBe(false);

    overlay.show();
    expect(overlay.visible).toBe(true);
    expect(document.querySelectorAll('.victory-fx .confetti')).toHaveLength(56);
    expect(document.querySelectorAll('.victory-fx .sparkle')).toHaveLength(14);
  });

  it('randomises each particle through CSS custom properties', () => {
    const values = [0.1, 0.9];
    let call = 0;
    const overlay = new VictoryOverlay(
      $('#victory'),
      { onNewPosition: vi.fn() },
      () => values[call++ % values.length] ?? 0,
    );
    overlay.show();

    const first = document.querySelector<HTMLElement>('.confetti');
    expect(first?.style.getPropertyValue('--color')).not.toBe('');
    expect(first?.style.getPropertyValue('--delay')).toMatch(/^\d+\.\d+s$/);
  });

  it('does not stack particles when shown twice', () => {
    const overlay = new VictoryOverlay($('#victory'), { onNewPosition: vi.fn() });
    overlay.show();
    overlay.show();
    expect(document.querySelectorAll('.confetti')).toHaveLength(56);
  });

  it('removes a confetti piece once its animation ends', () => {
    new VictoryOverlay($('#victory'), { onNewPosition: vi.fn() }).show();
    document.querySelector('.confetti')?.dispatchEvent(new Event('animationend'));
    expect(document.querySelectorAll('.confetti')).toHaveLength(55);
  });

  it('closes with "Voir la ligne" and clears the particles', () => {
    const overlay = new VictoryOverlay($('#victory'), { onNewPosition: vi.fn() });
    overlay.show();
    vi.advanceTimersByTime(1000);
    $<HTMLButtonElement>('#victory-close').click();

    expect(overlay.visible).toBe(false);
    expect(document.querySelectorAll('.confetti, .sparkle')).toHaveLength(0);
  });

  it('asks for a new position from the banner', () => {
    const onNewPosition = vi.fn();
    new VictoryOverlay($('#victory'), { onNewPosition }).show();
    vi.advanceTimersByTime(1000);
    $<HTMLButtonElement>('#victory-new').click();
    expect(onNewPosition).toHaveBeenCalledOnce();
  });

  describe('button lock', () => {
    it('ignores clicks on both buttons during the first second', () => {
      const onNewPosition = vi.fn();
      const overlay = new VictoryOverlay($('#victory'), { onNewPosition });
      overlay.show();

      vi.advanceTimersByTime(999);
      expect($<HTMLButtonElement>('#victory-new').disabled).toBe(true);
      expect($<HTMLButtonElement>('#victory-close').disabled).toBe(true);
      $<HTMLButtonElement>('#victory-new').click();
      $<HTMLButtonElement>('#victory-close').click();

      expect(onNewPosition).not.toHaveBeenCalled();
      expect(overlay.visible).toBe(true);
    });

    it('enables the buttons after one second', () => {
      new VictoryOverlay($('#victory'), { onNewPosition: vi.fn() }).show();
      vi.advanceTimersByTime(1000);
      expect($<HTMLButtonElement>('#victory-new').disabled).toBe(false);
      expect($<HTMLButtonElement>('#victory-close').disabled).toBe(false);
    });

    it('locks again from zero each time the banner is shown', () => {
      const overlay = new VictoryOverlay($('#victory'), { onNewPosition: vi.fn() });
      overlay.show();
      vi.advanceTimersByTime(1000);
      overlay.hide();

      overlay.show();
      vi.advanceTimersByTime(500);
      expect($<HTMLButtonElement>('#victory-new').disabled).toBe(true);
      vi.advanceTimersByTime(500);
      expect($<HTMLButtonElement>('#victory-new').disabled).toBe(false);
    });

    it('does not leave the buttons disabled once the banner is hidden early', () => {
      const overlay = new VictoryOverlay($('#victory'), { onNewPosition: vi.fn() });
      overlay.show();
      overlay.hide();
      expect($<HTMLButtonElement>('#victory-new').disabled).toBe(false);
    });

    it('accepts a custom lock duration', () => {
      new VictoryOverlay($('#victory'), { onNewPosition: vi.fn() }, Math.random, {
        lockMs: 250,
      }).show();
      vi.advanceTimersByTime(250);
      expect($<HTMLButtonElement>('#victory-new').disabled).toBe(false);
    });
  });
});
