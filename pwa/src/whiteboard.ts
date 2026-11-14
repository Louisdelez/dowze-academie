export interface Point { x: number; y: number; pressure: number }
export interface Stroke { id: string; color: string; width: number; points: Point[] }
export interface PointerSample { id: number; pointerType: string; x: number; y: number; pressure: number; width: number; height: number; isPrimary: boolean }
export interface BoardState { strokes: Stroke[]; undone: Stroke[]; active: Stroke | null; penActive: boolean; zoom: number; offsetX: number; offsetY: number }

export const createBoard = (): BoardState => ({ strokes: [], undone: [], active: null, penActive: false, zoom: 1, offsetX: 0, offsetY: 0 });

export function addPoint(board: BoardState, sample: PointerSample): BoardState {
  const probablePalm = sample.pointerType === 'touch' && (board.penActive || !sample.isPrimary || sample.width > 32 || sample.height > 32);
  if (probablePalm) return board;
  const point = { x: sample.x, y: sample.y, pressure: sample.pressure || 0.5 };
  if (!board.active) return { ...board, active: { id: crypto.randomUUID(), color: '#14213d', width: 3, points: [point] }, penActive: sample.pointerType === 'pen', undone: [] };
  return { ...board, active: { ...board.active, points: [...board.active.points, point] } };
}

export function finishStroke(board: BoardState): BoardState {
  if (!board.active) return { ...board, penActive: false };
  return { ...board, strokes: [...board.strokes, board.active], active: null, penActive: false };
}
export function undo(board: BoardState): BoardState { const stroke = board.strokes.at(-1); return stroke ? { ...board, strokes: board.strokes.slice(0, -1), undone: [...board.undone, stroke] } : board; }
export function redo(board: BoardState): BoardState { const stroke = board.undone.at(-1); return stroke ? { ...board, strokes: [...board.strokes, stroke], undone: board.undone.slice(0, -1) } : board; }
