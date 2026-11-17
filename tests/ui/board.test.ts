// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { NO_SHAPES } from '../../src/domain/types';
import type { PieceOnSquare, Square } from '../../src/domain/types';
import { BoardView } from '../../src/ui/board';
import type { BoardState } from '../../src/ui/board';
import { SQUARE_SIZE } from '../../src/ui/geometry';

const svgRoot = (): SVGSVGElement => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.getBoundingClientRect = () => new DOMRect(0, 0, 480, 480);
  svg.setPointerCapture = () => undefined;
  svg.hasPointerCapture = () => false;
  return svg;
};

const pieces: PieceOnSquare[] = [
  { square: 'e2', type: 'p', color: 'w' },
  { square: 'e1', type: 'k', color: 'w' },
  { square: 'd3', type: 'p', color: 'b' },
];

const state = (overrides: Partial<BoardState> = {}): BoardState => ({
  orientation: 'white',
  pieces,
  lastMove: null,
  shapes: NO_SHAPES,
  interactive: true,
  ...overrides,
});

/** Centre of a square in client coordinates, for a white-oriented 480px board at (0, 0). */
const centre = (file: number, rank: number): { clientX: number; clientY: number } => ({
  clientX: file * SQUARE_SIZE + SQUARE_SIZE / 2,
  clientY: (7 - rank) * SQUARE_SIZE + SQUARE_SIZE / 2,
});

function press(svg: SVGSVGElement, point: { clientX: number; clientY: number }): void {
  const event = new MouseEvent('pointerdown', { ...point, bubbles: true });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  svg.dispatchEvent(event);
}

describe('BoardView', () => {
  it('draws squares, coordinates, pieces and annotations', () => {
    const svg = svgRoot();
    const view = new BoardView(svg, {
      canSelect: () => false,
      targetsFrom: () => [],
      onMove: vi.fn(),
    });
    view.render(
      state({
        lastMove: { from: 'e2', to: 'e4' },
        shapes: {
          arrows: [{ from: 'e2', to: 'e4', color: 'G' }],
          marks: [{ square: 'd4', color: 'R' }],
        },
      }),
    );

    expect(svg.querySelectorAll('.sq-light, .sq-dark')).toHaveLength(64);
    expect(svg.querySelectorAll('.coord')).toHaveLength(16);
    expect(svg.querySelectorAll('.layer-pieces image')).toHaveLength(3);
    expect(svg.querySelectorAll('.last-move')).toHaveLength(2);
    expect(svg.querySelectorAll('.arrow.shape-G')).toHaveLength(1);
    expect(svg.querySelectorAll('.mark.shape-R')).toHaveLength(1);
  });

  it('redraws the squares when the orientation changes', () => {
    const svg = svgRoot();
    const view = new BoardView(svg, {
      canSelect: () => false,
      targetsFrom: () => [],
      onMove: vi.fn(),
    });
    view.render(state());
    const first = svg.querySelector('.sq-dark')?.getAttribute('x');
    view.render(state({ orientation: 'black' }));
    expect(svg.querySelector('.sq-dark')?.getAttribute('x')).not.toBe(first);
  });

  it('selects a piece, flags targets, then reports the move on the second click', () => {
    const svg = svgRoot();
    const onMove = vi.fn();
    const view = new BoardView(svg, {
      canSelect: (square: Square) => square === 'e2',
      targetsFrom: () => [
        { square: 'e4', capture: false },
        { square: 'd3', capture: true },
      ],
      onMove,
    });
    view.render(state());

    press(svg, centre(4, 1)); // e2
    expect(svg.querySelectorAll('.selected')).toHaveLength(1);
    expect(svg.querySelectorAll('.target-dot')).toHaveLength(1);
    expect(svg.querySelectorAll('.target-ring')).toHaveLength(1);

    press(svg, centre(4, 3)); // e4
    expect(onMove).toHaveBeenCalledWith('e2', 'e4');
  });

  it('ignores input when the board is not interactive', () => {
    const svg = svgRoot();
    const onMove = vi.fn();
    const view = new BoardView(svg, { canSelect: () => true, targetsFrom: () => [], onMove });
    view.render(state({ interactive: false }));
    press(svg, centre(4, 1));
    expect(svg.querySelectorAll('.selected')).toHaveLength(0);
  });
});
