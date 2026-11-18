// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VictoryOverlay } from '../../src/ui/victory';

const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');

describe('VictoryOverlay', () => {
  const $ = <T extends Element>(selector: string): T => {
    const element = document.querySelector<T>(selector);
    if (!element) throw new Error(selector);
    return element;
  };

  beforeEach(() => {
    document.body.innerHTML = /<body>([\s\S]*)<\/body>/.exec(html)?.[1] ?? '';
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
    $<HTMLButtonElement>('#victory-close').click();

    expect(overlay.visible).toBe(false);
    expect(document.querySelectorAll('.confetti, .sparkle')).toHaveLength(0);
  });

  it('asks for a new position from the banner', () => {
    const onNewPosition = vi.fn();
    new VictoryOverlay($('#victory'), { onNewPosition }).show();
    $<HTMLButtonElement>('#victory-new').click();
    expect(onNewPosition).toHaveBeenCalledOnce();
  });
});
