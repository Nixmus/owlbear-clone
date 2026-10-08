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
  owner: string | null;
}

export type DrawingKind = 'pen' | 'line' | 'rect' | 'circle';

export interface Drawing {
  id: string;
  sceneId: string;
  kind: DrawingKind;
  color: string;
  width: number;
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

export interface RoomState {
  id: string;
  tokens: Token[];
  drawings: Drawing[];
  fog: FogShape[];
  chat: ChatMessage[];
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
  | { kind: 'fog.add'; shape: FogShape }
  | { kind: 'fog.clear'; sceneId: string }
  | { kind: 'chat.add'; message: ChatMessage };

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
  | 'eraser';

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}
