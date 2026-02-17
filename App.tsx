import React, { useEffect, useRef, useState } from 'react';
import { FireworkScene, GameStats } from './components/FireworkScene';
import { visionService } from './services/visionService';
import { HandData, Gesture } from './types';
import { BarChart, Bar, ResponsiveContainer } from 'recharts';

type GameState = 'MENU' | 'PLAYING' | 'RESULT';

const App: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [handData, setHandData] = useState<HandData | null>(null);
  const [debugData, setDebugData] = useState<{name: string, value: number}[]>([]);
  const [stats, setStats] = useState<GameStats>({ exploded: 0, consumed: 0, coins: 0 });
  
  // Game Logic
  const [gameState, setGameState] = useState<GameState>('MENU');
  const [timeLeft, setTimeLeft] = useState(30);
  const [restartCooldown, setRestartCooldown] = useState(0);

  useEffect(() => {
    let animationFrameId: number;

    const startVision = async () => {
      try {
        await visionService.initialize();
        
        // Setup Camera
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: 640,
                height: 480,
                frameRate: { ideal: 30 }
            } 
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.addEventListener('loadeddata', () => {
            setLoading(false);
            predictLoop();
          });
        }
      } catch (err: any) {
        setError("Camera permission denied or model failed to load.");
        console.error(err);
        setLoading(false);
      }
    };

    const predictLoop = () => {
      if (videoRef.current && videoRef.current.readyState >= 2) {
        const result = visionService.detect(videoRef.current, performance.now());
        setHandData(result);
        
        if (result) {
            // Update debug graph
            setDebugData(prev => {
                const newData = [...prev, { name: '', value: result.velocity }];
                if (newData.length > 20) newData.shift();
                return newData;
            });
        }
      }
      animationFrameId = requestAnimationFrame(predictLoop);
    };

    startVision();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  // Timer Effect
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (gameState === 'PLAYING') {
        interval = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    setGameState('RESULT');
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }
    return () => clearInterval(interval);
  }, [gameState]);

  // Restart Cooldown Effect
  useEffect(() => {
    if (gameState === 'RESULT') {
        setRestartCooldown(3);
        const interval = setInterval(() => {
            setRestartCooldown((prev) => {
                if (prev <= 1) {
                    clearInterval(interval);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }
  }, [gameState]);

  // Gesture Controls for Menu/Result
  useEffect(() => {
    if (!handData) return;
    
    // Victory triggers Start or Replay
    if (handData.gesture === Gesture.Victory) {
        if (gameState === 'MENU') {
            startGame();
        } else if (gameState === 'RESULT' && restartCooldown === 0) {
            startGame();
        }
    }
  }, [handData?.gesture, gameState, restartCooldown]);

  const startGame = () => {
      setStats({ exploded: 0, consumed: 0, coins: 0 });
      setTimeLeft(30);
      setGameState('PLAYING');
  };

  const getGestureInstructions = (gesture: Gesture) => {
    switch(gesture) {
        case Gesture.Closed_Fist: return "Swing fist to speed up spawn!";
        case Gesture.Open_Palm: return "Palm opens -> Explosion!";
        case Gesture.Victory: return "Victory -> Spawns Envelopes!";
        default: return "";
    }
  };

  const handleStatsUpdate = (newStats: GameStats) => {
    setStats(newStats);
  };

  const charges = Math.floor((stats.exploded - stats.consumed) / 5);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden font-sans text-white">
      {/* Background 3D Scene - pass isGameActive */}
      <FireworkScene 
        handData={handData} 
        onStatsUpdate={handleStatsUpdate} 
        isGameActive={gameState === 'PLAYING'}
      />

      {/* Start Screen Overlay */}
      {gameState === 'MENU' && !loading && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
              <div className="text-center p-8 bg-gray-900/80 border border-white/20 rounded-2xl shadow-2xl max-w-lg">
                  <h1 className="text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-pink-500 to-yellow-500">
                      Gesture Fireworks
                  </h1>
                  <p className="text-xl text-gray-300 mb-8">
                      You have 30 seconds to create the ultimate show!
                  </p>
                  <button 
                    onClick={startGame}
                    className="px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full text-xl font-bold hover:scale-105 transition-transform"
                  >
                      START GAME
                  </button>
                  <p className="mt-4 text-sm text-gray-500 animate-pulse">
                      Or show ✌ VICTORY gesture to start
                  </p>
              </div>
          </div>
      )}

      {/* Result Screen Overlay */}
      {gameState === 'RESULT' && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
              <div className="text-center p-8 bg-gray-900/80 border border-white/20 rounded-2xl shadow-2xl max-w-md w-full">
                  <h2 className="text-4xl font-bold mb-6 text-white">Time's Up!</h2>
                  
                  <div className="space-y-4 mb-8">
                      <div className="flex justify-between items-center border-b border-white/10 pb-2">
                          <span className="text-gray-400">Fireworks Exploded</span>
                          <span className="text-2xl font-mono text-cyan-400">{stats.exploded}</span>
                      </div>
                      <div className="flex justify-between items-center border-b border-white/10 pb-2">
                          <span className="text-gray-400">Coins Collected</span>
                          <span className="text-2xl font-mono text-yellow-400">￥{stats.coins}</span>
                      </div>
                  </div>

                  <button 
                    onClick={() => { if (restartCooldown === 0) startGame(); }}
                    disabled={restartCooldown > 0}
                    className={`w-full px-8 py-3 rounded-full text-xl font-bold transition-all
                        ${restartCooldown > 0 
                            ? 'bg-gray-600 cursor-not-allowed opacity-50' 
                            : 'bg-gradient-to-r from-green-600 to-teal-600 hover:scale-105 cursor-pointer'}`}
                  >
                      {restartCooldown > 0 ? `WAIT ${restartCooldown}s...` : 'PLAY AGAIN'}
                  </button>
                  <p className={`mt-4 text-sm transition-opacity duration-300 ${restartCooldown > 0 ? 'opacity-0' : 'opacity-100 animate-pulse'} text-gray-500`}>
                      Or show ✌ VICTORY gesture to replay
                  </p>
              </div>
          </div>
      )}

      {/* Main UI Overlay (HUD) */}
      <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6 z-10">
        
        {/* Header */}
        <div className="flex justify-between items-start">
            <div>
                <h1 className="text-xl font-bold text-white/50">
                    Gesture Fireworks
                </h1>
                
                {/* Stats Panel - Only show fully active stats when playing or result */}
                <div className={`mt-4 flex gap-6 bg-black/50 backdrop-blur-md p-3 rounded-xl border border-white/10 w-fit pointer-events-auto transition-opacity duration-300 ${gameState === 'MENU' ? 'opacity-0' : 'opacity-100'}`}>
                    <div>
                        <div className="text-xs text-gray-400">TIME LEFT</div>
                        <div className={`text-3xl font-mono ${timeLeft < 10 ? 'text-red-500 animate-ping' : 'text-white'}`}>
                            {timeLeft}s
                        </div>
                    </div>
                    <div className="w-px bg-white/20 mx-2"></div>
                    <div>
                        <div className="text-xs text-gray-400">EXPLODED</div>
                        <div className="text-2xl font-mono text-cyan-400">{stats.exploded}</div>
                    </div>
                    <div>
                        <div className="text-xs text-gray-400">CHARGES</div>
                        <div className={`text-2xl font-mono ${charges > 0 ? 'text-green-400' : 'text-gray-500'}`}>
                            {charges}
                        </div>
                    </div>
                    <div>
                        <div className="text-xs text-gray-400">COINS</div>
                        <div className="text-2xl font-mono text-yellow-400">
                             ￥{stats.coins}
                        </div>
                    </div>
                </div>
            </div>
            
            {/* Hand Monitor (Top Right) */}
            <div className={`bg-black/40 backdrop-blur-md p-3 rounded-xl border border-white/10 w-48 transition-opacity ${gameState === 'PLAYING' ? 'opacity-100' : 'opacity-50'}`}>
                <div className="text-xs text-gray-400 mb-2">HAND VELOCITY</div>
                <div className="h-16 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={debugData}>
                            <Bar dataKey="value" fill="#ec4899" isAnimationActive={false} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>

        {/* Center Loading/Error */}
        {loading && (
             <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-50">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-t-pink-500 border-r-transparent border-b-purple-500 border-l-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-lg">Initializing Vision Model...</p>
                </div>
             </div>
        )}
        {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-50">
                <div className="text-red-500 bg-red-900/20 p-6 rounded-xl border border-red-500/50">
                    <h2 className="text-xl font-bold mb-2">Error</h2>
                    <p>{error}</p>
                </div>
            </div>
        )}

        {/* Footer / Instructions */}
        <div className="flex items-end justify-between">
            {/* Camera Feed Preview */}
            <div className="relative w-[32rem] h-96 rounded-lg overflow-hidden border border-white/20 shadow-lg bg-black pointer-events-auto opacity-70 hover:opacity-100 transition-opacity">
                <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    className="w-full h-full object-cover scale-x-[-1]" 
                />
                <div className="absolute bottom-1 right-1 text-[10px] bg-red-600 px-1 rounded text-white font-bold">CAM</div>
            </div>

            {/* Current State Indicator */}
            {gameState === 'PLAYING' && (
                <div className="flex flex-col items-end">
                    <div className={`text-4xl font-bold mb-2 transition-all duration-300 ${handData?.gesture !== Gesture.None ? 'text-white scale-110' : 'text-gray-600'}`}>
                        {handData?.gesture.replace('_', ' ') || "NO HAND"}
                    </div>
                    <div className="text-xl text-yellow-400 font-medium text-right drop-shadow-md">
                        {charges > 0 && handData?.gesture !== Gesture.Victory 
                            ? "Victory Gesture available!" 
                            : handData ? getGestureInstructions(handData.gesture) : "Show hand to start"}
                    </div>
                    
                    <div className="mt-4 flex gap-4 text-xs text-gray-400">
                        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Fist: Speed</div>
                        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span> Palm: Explode</div>
                        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span> Victory: Envelopes ({charges})</div>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default App;