export enum Gesture {
  None = "None",
  Closed_Fist = "Closed_Fist",
  Open_Palm = "Open_Palm",
  Victory = "Victory",
  Pointing_Up = "Pointing_Up",
  Thumb_Up = "Thumb_Up",
  Thumb_Down = "Thumb_Down",
  Shaka = "Shaka"
}

export interface HandData {
  gesture: Gesture;
  velocity: number; // 0 to 1 scale roughly
  position: { x: number; y: number; z: number };
}

export interface VisionState {
  loading: boolean;
  error: string | null;
  ready: boolean;
}
