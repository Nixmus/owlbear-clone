export type GridType = 'square' | 'hex' | 'none';

export interface Scene {
  id: string;
  name: string;
  mapUrl: string | null;
  backgroundColor: string;
  gridType: GridType;
  gridSize: number;
  gridColor: string;
  width: number;
  height: number;
}

export interface Token {
  id: string;
  sceneId: string;
  x: number;
  y: number;
  size: number; // in grid cells
  name: string;
  color: string;
  imageUrl: string | null;
  hidden: boolean;
  locked: boolean;
  conditions: string[];
  owner: string | null; // clientId of the controlling player
  userId: string | null; // userId of the owning player (persists across sessions)
  characterId: string | null; // linked character sheet
}

export type DrawingKind = 'pen' | 'line' | 'rect' | 'circle';

export interface Drawing {
  id: string;
  sceneId: string;
  kind: DrawingKind;
  color: string;
  width: number;
  points: number[]; // flattened [x1,y1,x2,y2,...]
  /** Fill for closed shapes (rect/circle); null or undefined means no fill. */
  fill?: string | null;
  /** 0..1. Defaults to fully opaque when absent. */
  opacity?: number;
}

/**
 * A stroke of the eraser. Kept alongside the drawings instead of deleting
 * them, so erasing is non-destructive: the drawings still exist, they are just
 * punched out through an SVG mask. That keeps erasing in sync across players
 * (it travels like any other action) and lets undo simply drop the eraser.
 */
export interface EraseStroke {
  id: string;
  sceneId: string;
  width: number; // diameter of the eraser in world units
  points: number[]; // flattened [x1,y1,x2,y2,...]
}

export interface FogShape {
  id: string;
  sceneId: string;
  mode: 'reveal' | 'hide';
  points: number[]; // flattened polygon
}

export interface ChatMessage {
  id: string;
  author: string;
  color: string;
  text: string;
  ts: number;
  system?: boolean;
}

export interface Player {
  id: string;
  name: string;
  color: string;
  role: 'gm' | 'player';
  joinedAt: number;
}

export interface GameLogEntry {
  id: string;
  ts: number;
  actor: string; // player name
  actorId: string;
  kind:
    | 'join'
    | 'leave'
    | 'token.move'
    | 'token.add'
    | 'token.remove'
    | 'token.condition'
    | 'scene.activate'
    | 'dice'
    | 'note';
  text: string;
}

export interface RoomState {
  id: string;
  tokens: Token[];
  drawings: Drawing[];
  erasers: EraseStroke[];
  fog: FogShape[];
  chat: ChatMessage[];
  log: GameLogEntry[];
  scenes: Scene[];
  activeSceneId: string;
  updatedAt: number;
}

export type Action =
  | { kind: 'scene.add'; scene: Scene }
  | { kind: 'scene.update'; id: string; patch: Partial<Scene> }
  | { kind: 'scene.remove'; id: string }
  | { kind: 'scene.activate'; id: string }
  | { kind: 'token.add'; token: Token }
  | { kind: 'token.update'; id: string; patch: Partial<Token> }
  | { kind: 'token.remove'; id: string }
  | { kind: 'drawing.add'; drawing: Drawing }
  | { kind: 'drawing.update'; id: string; patch: Partial<Drawing> }
  | { kind: 'drawing.remove'; id: string }
  | { kind: 'drawing.clear'; sceneId: string }
  | { kind: 'erase.add'; erase: EraseStroke }
  | { kind: 'erase.remove'; id: string }
  | { kind: 'erase.clear'; sceneId: string }
  | { kind: 'fog.add'; shape: FogShape }
  | { kind: 'fog.clear'; sceneId: string }
  | { kind: 'chat.add'; message: ChatMessage }
  | { kind: 'log.add'; entry: GameLogEntry };

export type Tool =
  | 'select'
  | 'pan'
  | 'ruler'
  | 'fog-reveal'
  | 'fog-hide'
  | 'pen'
  | 'line'
  | 'rect'
  | 'circle'
  | 'eraser'
  | 'ping';

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}
