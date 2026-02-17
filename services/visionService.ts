import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { MODEL_ASSET_PATH, WASM_PATH } from "../constants";
import { Gesture, HandData } from "../types";

export class VisionService {
  private handLandmarker: HandLandmarker | undefined;
  private lastWristPos: { x: number; y: number; time: number } | null = null;
  
  public async initialize(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
    this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_ASSET_PATH,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 1,
    });
  }

  public detect(video: HTMLVideoElement, timestamp: number): HandData | null {
    if (!this.handLandmarker) return null;

    const result = this.handLandmarker.detectForVideo(video, timestamp);

    if (result.landmarks && result.landmarks.length > 0) {
      const landmarks = result.landmarks[0]; // Get first hand
      const worldLandmarks = result.worldLandmarks[0];

      // Gesture Recognition Logic (Simple heuristics)
      // Landmarks: 0=Wrist, 4=ThumbTip, 8=IndexTip, 12=MiddleTip, 16=RingTip, 20=PinkyTip
      
      const thumbTip = landmarks[4];
      const indexTip = landmarks[8];
      const middleTip = landmarks[12];
      const ringTip = landmarks[16];
      const pinkyTip = landmarks[20];
      
      const wrist = landmarks[0];
      const indexBase = landmarks[5];
      const pinkyBase = landmarks[17];

      // Calculate openness of fingers (distance from wrist)
      // Normalize by hand size (wrist to middle finger base)
      const handSize = Math.sqrt(
        Math.pow(landmarks[9].x - wrist.x, 2) + 
        Math.pow(landmarks[9].y - wrist.y, 2)
      );

      const isFingerOpen = (tip: any, base: any) => {
        const distTip = Math.sqrt(Math.pow(tip.x - wrist.x, 2) + Math.pow(tip.y - wrist.y, 2));
        const distBase = Math.sqrt(Math.pow(base.x - wrist.x, 2) + Math.pow(base.y - wrist.y, 2));
        return distTip > distBase + (handSize * 0.5); // Heuristic
      };

      const isIndexOpen = isFingerOpen(indexTip, indexBase);
      const isMiddleOpen = isFingerOpen(middleTip, landmarks[9]);
      const isRingOpen = isFingerOpen(ringTip, landmarks[13]);
      const isPinkyOpen = isFingerOpen(pinkyTip, pinkyBase);

      // Simple velocity calc based on wrist 2D movement
      let velocity = 0;
      const now = performance.now();
      if (this.lastWristPos) {
        const dx = wrist.x - this.lastWristPos.x;
        const dy = wrist.y - this.lastWristPos.y;
        const dt = now - this.lastWristPos.time;
        if (dt > 0) {
            // Speed in normalized screen units per ms, multiplied for usability
            velocity = (Math.sqrt(dx*dx + dy*dy) / dt) * 1000; 
        }
      }
      this.lastWristPos = { x: wrist.x, y: wrist.y, time: now };

      let gesture = Gesture.None;

      // Classify
      if (!isIndexOpen && !isMiddleOpen && !isRingOpen && !isPinkyOpen) {
        gesture = Gesture.Closed_Fist;
      } else if (isIndexOpen && isMiddleOpen && !isRingOpen && !isPinkyOpen) {
        gesture = Gesture.Victory;
      } else if (isIndexOpen && isMiddleOpen && isRingOpen && isPinkyOpen) {
        gesture = Gesture.Open_Palm;
      }

      return {
        gesture,
        velocity: Math.min(velocity, 5.0), // Cap velocity
        position: { x: wrist.x, y: wrist.y, z: worldLandmarks ? worldLandmarks[0].z : 0 }
      };
    } else {
        // Reset velocity tracking if hand lost
        this.lastWristPos = null;
    }

    return null;
  }
}

export const visionService = new VisionService();
