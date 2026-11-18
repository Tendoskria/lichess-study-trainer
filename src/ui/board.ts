import type { Target } from '../domain/training';
import type { LastMove, Orientation, PieceOnSquare, Shapes, Square } from '../domain/types';
import { svgElement } from './dom';
import {
  arrowGeometry,
  BOARD_SIZE,
  captureRingPath,
  pointToSquare,
  SQUARE_SIZE,
  squareOrigin,
} from './geometry';
import { pieceImage } from './pieces';

const FILES = 'abcdefgh';
const DRAG_THRESHOLD_PX = 6;
/** Must outlast the CSS animations of the "hit" effect. */
const HIT_DURATION_MS = 700;

export interface BoardState {
  readonly orientation: Orientation;
  readonly pieces: readonly PieceOnSquare[];
  readonly lastMove: LastMove | null;
  readonly shapes: Shapes;
  /** When false the board is display-only. */
  readonly interactive: boolean;
}

/** Chess knowledge the board needs but must not own. */
export interface BoardHandlers {
  canSelect(square: Square): boolean;
  targetsFrom(square: Square): readonly Target[];
  onMove(from: Square, to: Square): void;
}

interface DragState {
  readonly from: Square;
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  moved: boolean;
  ghost: SVGImageElement | null;
}

/** Renders a position as SVG and turns pointer input (click or drag) into move requests. */
export class BoardView {
  private state: BoardState | null = null;
  private selected: Square | null = null;
  private drag: DragState | null = null;
  private drawnOrientation: Orientation | null = null;
  private feedbackTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly pieceNodes = new Map<Square, SVGImageElement>();
  private readonly layers = {
    squares: svgElement('g', { class: 'layer-squares' }),
    highlights: svgElement('g', { class: 'layer-highlights' }),
    targets: svgElement('g', { class: 'layer-targets' }),
    pieces: svgElement('g', { class: 'layer-pieces' }),
    shapes: svgElement('g', { class: 'layer-shapes' }),
    feedback: svgElement('g', { class: 'layer-feedback' }),
    drag: svgElement('g', { class: 'layer-drag' }),
  };

  constructor(
    private readonly root: SVGSVGElement,
    private readonly handlers: BoardHandlers,
  ) {
    root.replaceChildren(this.createDefs(), ...Object.values(this.layers));
    root.addEventListener('pointerdown', this.onPointerDown);
    root.addEventListener('pointermove', this.onPointerMove);
    root.addEventListener('pointerup', this.onPointerUp);
    root.addEventListener('pointercancel', this.onPointerCancel);
  }

  destroy(): void {
    clearTimeout(this.feedbackTimer);
    this.root.removeEventListener('pointerdown', this.onPointerDown);
    this.root.removeEventListener('pointermove', this.onPointerMove);
    this.root.removeEventListener('pointerup', this.onPointerUp);
    this.root.removeEventListener('pointercancel', this.onPointerCancel);
  }

  render(state: BoardState): void {
    this.state = state;
    if (!state.interactive || (this.selected && !this.handlers.canSelect(this.selected))) {
      this.selected = null;
    }
    if (this.drawnOrientation !== state.orientation) this.drawSquares(state.orientation);
    this.drawHighlights(state);
    this.drawTargets(state.orientation);
    this.drawPieces(state);
    this.drawShapes(state);
  }

  /**
   * Video-game style "hit" feedback for a wrong answer: the board shakes, a red vignette
   * flashes and the square the user tried to play lights up. (CSS honours reduced motion.)
   */
  flashError(square: Square): void {
    const { x, y } = squareOrigin(square, this.state?.orientation ?? 'white');
    this.layers.feedback.replaceChildren(
      svgElement('rect', { x, y, width: SQUARE_SIZE, height: SQUARE_SIZE, class: 'hit-square' }),
      svgElement('rect', { width: BOARD_SIZE, height: BOARD_SIZE, class: 'hit-flash' }),
    );

    this.root.classList.remove('hit');
    void this.root.getBoundingClientRect(); // force a reflow so the animation restarts
    this.root.classList.add('hit');

    clearTimeout(this.feedbackTimer);
    this.feedbackTimer = setTimeout(() => {
      this.layers.feedback.replaceChildren();
      this.root.classList.remove('hit');
    }, HIT_DURATION_MS);
  }

  private createDefs(): SVGDefsElement {
    const gradient = svgElement('radialGradient', {
      id: 'hit-vignette',
      cx: '50%',
      cy: '50%',
      r: '75%',
    });
    gradient.append(
      svgElement('stop', { offset: '45%', class: 'hit-stop', 'stop-opacity': 0 }),
      svgElement('stop', { offset: '100%', class: 'hit-stop', 'stop-opacity': 0.85 }),
    );
    const defs = svgElement('defs');
    defs.append(gradient);
    return defs;
  }

  private drawSquares(orientation: Orientation): void {
    this.drawnOrientation = orientation;
    const nodes: SVGElement[] = [];
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const square = `${FILES.charAt(file)}${rank + 1}` as Square;
        const { x, y } = squareOrigin(square, orientation);
        const light = (file + rank) % 2 === 1;
        nodes.push(
          svgElement('rect', {
            x,
            y,
            width: SQUARE_SIZE,
            height: SQUARE_SIZE,
            class: light ? 'sq-light' : 'sq-dark',
          }),
        );

        const onBottomRow = rank === (orientation === 'white' ? 0 : 7);
        const onLeftColumn = file === (orientation === 'white' ? 0 : 7);
        const cls = light ? 'coord on-light' : 'coord on-dark';
        if (onBottomRow) {
          const label = svgElement('text', {
            x: x + SQUARE_SIZE - 4,
            y: y + SQUARE_SIZE - 4,
            'text-anchor': 'end',
            class: cls,
          });
          label.textContent = FILES.charAt(file);
          nodes.push(label);
        }
        if (onLeftColumn) {
          const label = svgElement('text', { x: x + 3, y: y + 12, class: cls });
          label.textContent = String(rank + 1);
          nodes.push(label);
        }
      }
    }
    this.layers.squares.replaceChildren(...nodes);
  }

  private drawHighlights(state: BoardState): void {
    const squares: [Square, string][] = [];
    if (state.lastMove) {
      squares.push([state.lastMove.from, 'last-move'], [state.lastMove.to, 'last-move']);
    }
    if (this.selected) squares.push([this.selected, 'selected']);
    this.layers.highlights.replaceChildren(
      ...squares.map(([square, cls]) => {
        const { x, y } = squareOrigin(square, state.orientation);
        return svgElement('rect', { x, y, width: SQUARE_SIZE, height: SQUARE_SIZE, class: cls });
      }),
    );
  }

  private drawTargets(orientation: Orientation): void {
    const targets = this.selected ? this.handlers.targetsFrom(this.selected) : [];
    this.layers.targets.replaceChildren(
      ...targets.map((target) => {
        const origin = squareOrigin(target.square, orientation);
        return target.capture
          ? svgElement('path', {
              d: captureRingPath(origin),
              'fill-rule': 'evenodd',
              class: 'target-ring',
            })
          : svgElement('circle', {
              cx: origin.x + SQUARE_SIZE / 2,
              cy: origin.y + SQUARE_SIZE / 2,
              r: SQUARE_SIZE * 0.15,
              class: 'target-dot',
            });
      }),
    );
  }

  private drawPieces(state: BoardState): void {
    this.pieceNodes.clear();
    const nodes = state.pieces.map((piece) => {
      const { x, y } = squareOrigin(piece.square, state.orientation);
      const node = svgElement('image', {
        href: pieceImage(piece.color, piece.type),
        x,
        y,
        width: SQUARE_SIZE,
        height: SQUARE_SIZE,
      });
      this.pieceNodes.set(piece.square, node);
      return node;
    });
    this.layers.pieces.replaceChildren(...nodes);
  }

  private drawShapes(state: BoardState): void {
    const { arrows, marks } = state.shapes;
    const markNodes = marks.map(({ square, color }) => {
      const { x, y } = squareOrigin(square, state.orientation);
      return svgElement('rect', {
        x: x + 3,
        y: y + 3,
        width: SQUARE_SIZE - 6,
        height: SQUARE_SIZE - 6,
        class: `mark shape-${color}`,
      });
    });
    const arrowNodes = arrows.map(({ from, to, color }) => {
      const { shaftStart, shaftEnd, head } = arrowGeometry(from, to, state.orientation);
      const group = svgElement('g', { class: `arrow shape-${color}` });
      group.append(
        svgElement('line', {
          x1: shaftStart.x,
          y1: shaftStart.y,
          x2: shaftEnd.x,
          y2: shaftEnd.y,
        }),
        svgElement('polygon', { points: head }),
      );
      return group;
    });
    this.layers.shapes.replaceChildren(...markNodes, ...arrowNodes);
  }

  private boardPoint(event: PointerEvent): { x: number; y: number } | null {
    const rect = this.root.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * BOARD_SIZE,
      y: ((event.clientY - rect.top) / rect.height) * BOARD_SIZE,
    };
  }

  private squareAt(event: PointerEvent): Square | null {
    const point = this.boardPoint(event);
    if (!point || !this.state) return null;
    return pointToSquare(point.x, point.y, this.state.orientation);
  }

  private isTarget(from: Square, to: Square): boolean {
    return this.handlers.targetsFrom(from).some((target) => target.square === to);
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    const state = this.state;
    if (!state?.interactive) return;
    const square = this.squareAt(event);
    if (!square) return;

    if (this.selected && this.selected !== square && this.isTarget(this.selected, square)) {
      const from = this.selected;
      this.selected = null;
      this.handlers.onMove(from, square);
      return;
    }

    if (this.handlers.canSelect(square)) {
      this.selected = square;
      this.drag = {
        from: square,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        ghost: null,
      };
      this.root.setPointerCapture(event.pointerId);
    } else {
      this.selected = null;
    }
    this.render(state);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.moved) {
      const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (distance < DRAG_THRESHOLD_PX) return;
      drag.moved = true;
      this.startGhost(drag);
    }
    const point = this.boardPoint(event);
    if (point && drag.ghost) {
      drag.ghost.setAttribute('x', String(point.x - SQUARE_SIZE * 0.55));
      drag.ghost.setAttribute('y', String(point.y - SQUARE_SIZE * 0.55));
    }
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dropSquare = drag.moved ? this.squareAt(event) : null;
    this.endDrag(drag);

    if (drag.moved) {
      this.selected = null;
      if (dropSquare && dropSquare !== drag.from && this.isTarget(drag.from, dropSquare)) {
        this.handlers.onMove(drag.from, dropSquare);
        return;
      }
    }
    if (this.state) this.render(this.state);
  };

  private readonly onPointerCancel = (): void => {
    if (!this.drag) return;
    this.endDrag(this.drag);
    this.selected = null;
    if (this.state) this.render(this.state);
  };

  private startGhost(drag: DragState): void {
    const piece = this.state?.pieces.find((p) => p.square === drag.from);
    if (!piece) return;
    drag.ghost = svgElement('image', {
      href: pieceImage(piece.color, piece.type),
      width: SQUARE_SIZE * 1.1,
      height: SQUARE_SIZE * 1.1,
    });
    this.layers.drag.replaceChildren(drag.ghost);
    this.pieceNodes.get(drag.from)?.setAttribute('visibility', 'hidden');
  }

  private endDrag(drag: DragState): void {
    this.drag = null;
    this.layers.drag.replaceChildren();
    if (this.root.hasPointerCapture(drag.pointerId)) {
      this.root.releasePointerCapture(drag.pointerId);
    }
  }
}
