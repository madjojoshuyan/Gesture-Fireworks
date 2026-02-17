import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Gesture, HandData } from '../types';
import { audioService } from '../services/audioService';
import { COLOR_PALETTE, ENVELOPE_RED, GOLD_COLOR } from '../constants';

export interface GameStats {
  exploded: number;
  consumed: number;
  coins: number;
}

interface FireworkSceneProps {
  handData: HandData | null;
  onStatsUpdate: (stats: GameStats) => void;
  isGameActive: boolean;
}

const MAX_PARTICLES = 4000;
const SILVER_COLOR = 0xC0C0C0;

// Shaders for particles
const vertexShader = `
  attribute float size;
  varying vec3 vColor;
  void main() {
    vColor = color;
    vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
    gl_PointSize = size * ( 300.0 / -mvPosition.z );
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = `
  uniform sampler2D pointTexture;
  varying vec3 vColor;
  void main() {
    gl_FragColor = vec4( vColor, 1.0 );
    gl_FragColor = gl_FragColor * texture2D( pointTexture, gl_PointCoord );
  }
`;

export const FireworkScene: React.FC<FireworkSceneProps> = ({ handData, onStatsUpdate, isGameActive }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>();
  const sceneRef = useRef<THREE.Scene>();
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  
  // Game State Refs
  const projectiles = useRef<any[]>([]);
  const envelopes = useRef<{ id: number; mesh: THREE.Mesh; isGolden: boolean }[]>([]);
  const coins = useRef<any[]>([]);
  
  // Particle System Refs
  const particleSystem = useRef<THREE.Points>();
  const particlePositions = useRef<Float32Array>(new Float32Array(MAX_PARTICLES * 3));
  const particleColors = useRef<Float32Array>(new Float32Array(MAX_PARTICLES * 3));
  const particleSizes = useRef<Float32Array>(new Float32Array(MAX_PARTICLES));
  const particlesData = useRef<{
    active: boolean;
    life: number;
    velocity: THREE.Vector3;
    decay: number;
    initialSize: number;
  }[]>([]);

  // Spawn Logic Refs
  const nextSpawnTime = useRef<number>(0);
  
  // Stats
  const gameState = useRef<GameStats>({
      exploded: 0,
      consumed: 0,
      coins: 0
  });
  const statsDirty = useRef<boolean>(false);
  
  // Gesture Handling Refs
  const pendingGesture = useRef<Gesture>(Gesture.None);
  const stableGesture = useRef<Gesture>(Gesture.None);
  const gestureFrameCount = useRef<number>(0);
  
  // Textures
  const glowTexture = useRef<THREE.Texture>();

  // Helpers
  const createGlowTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext('2d');
    if (context) {
      const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.2, 'rgba(255,255,255,0.8)');
      gradient.addColorStop(0.5, 'rgba(255,255,255,0.2)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, 32, 32);
    }
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  };

  const createCityTexture = () => {
      const width = 1024;
      const height = 512;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return new THREE.Texture();

      // Clear (transparent)
      ctx.clearRect(0, 0, width, height);

      // Draw Silhouette
      ctx.fillStyle = '#050510'; 
      
      const groundY = height * 0.95; // Lower ground in texture

      // Random Buildings
      const numBuildings = 40;
      for(let i=0; i<numBuildings; i++) {
          const w = 30 + Math.random() * 50;
          const h = 50 + Math.random() * 150;
          const x = Math.random() * width;
          ctx.fillRect(x, groundY - h, w, h + 50);

          // Windows
          ctx.fillStyle = `rgba(255, 255, 200, ${Math.random() * 0.5})`;
          for(let j=0; j<10; j++) {
             if(Math.random() > 0.5) {
                 const wx = x + Math.random() * (w - 4);
                 const wy = groundY - h + Math.random() * (h - 10);
                 ctx.fillRect(wx, wy, 2, 2);
             }
          }
          ctx.fillStyle = '#050510'; 
      }

      // Draw Iconic Shanghai Buildings (Center)
      const centerX = width / 2;

      // Oriental Pearl Tower
      const pearlX = centerX - 100;
      ctx.fillStyle = '#0a0a20'; // Darker
      // Base
      ctx.beginPath();
      ctx.moveTo(pearlX - 20, groundY);
      ctx.lineTo(pearlX, groundY - 150);
      ctx.lineTo(pearlX + 20, groundY);
      ctx.fill();
      // Spheres
      ctx.beginPath();
      ctx.arc(pearlX, groundY - 180, 25, 0, Math.PI*2); 
      ctx.fill();
      ctx.beginPath();
      ctx.arc(pearlX, groundY - 300, 15, 0, Math.PI*2); 
      ctx.fill();
      // Spire
      ctx.fillRect(pearlX - 3, groundY - 400, 6, 400);

      // Shanghai Tower
      const shX = centerX + 50;
      ctx.beginPath();
      ctx.moveTo(shX - 30, groundY);
      ctx.quadraticCurveTo(shX, groundY - 250, shX - 10, groundY - 450); 
      ctx.lineTo(shX + 10, groundY - 450);
      ctx.quadraticCurveTo(shX + 30, groundY - 250, shX + 30, groundY); 
      ctx.fill();

      // Jin Mao
      const jmX = centerX + 120;
      let jmW = 40;
      let jmY = groundY;
      for(let k=0; k<8; k++) {
          const h = 40;
          ctx.fillRect(jmX - jmW/2, jmY - h, jmW, h);
          jmY -= h;
          jmW *= 0.85;
      }
      // Spire
      ctx.fillRect(jmX - 2, jmY - 30, 4, 30);

      // Emissive Windows for iconic
      ctx.fillStyle = 'rgba(100, 100, 255, 0.3)';
      ctx.fillRect(shX - 5, groundY - 400, 10, 350);

      return new THREE.CanvasTexture(canvas);
  };

  useEffect(() => {
    if (!containerRef.current) return;

    // Init Three.js
    const scene = new THREE.Scene();
    
    // Create sky gradient (Deep Night Blue)
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 2;
    skyCanvas.height = 512;
    const skyCtx = skyCanvas.getContext('2d');
    if (skyCtx) {
        const grd = skyCtx.createLinearGradient(0, 0, 0, 512);
        grd.addColorStop(0, '#00000a'); // Deep Black/Blue Top
        grd.addColorStop(0.5, '#050520'); 
        grd.addColorStop(1, '#1a1a4a'); // City Glow Bottom
        skyCtx.fillStyle = grd;
        skyCtx.fillRect(0, 0, 2, 512);
    }
    scene.background = new THREE.CanvasTexture(skyCanvas);
    scene.fog = new THREE.FogExp2(0x1a1a4a, 0.01);

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 25;
    camera.position.y = 8;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ReinhardToneMapping;
    containerRef.current.appendChild(renderer.domElement);

    // Cityscape
    const cityTex = createCityTexture();
    const cityMat = new THREE.MeshBasicMaterial({ 
        map: cityTex, 
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide
    });
    const cityGeo = new THREE.PlaneGeometry(80, 40);
    const cityMesh = new THREE.Mesh(cityGeo, cityMat);
    // Move city up slightly (was -12) to reveal more buildings
    cityMesh.position.set(0, -6, -10); 
    scene.add(cityMesh);

    // Spotlights (Beams) - Inverted Cone
    const spotGeo = new THREE.CylinderGeometry(4, 0.2, 60, 32, 1, true);
    spotGeo.translate(0, 30, 0); 
    
    const spotMat = new THREE.MeshBasicMaterial({
        color: 0x88ccff,
        transparent: true,
        opacity: 0.08,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    const beams: THREE.Mesh[] = [];
    for(let i=0; i<4; i++) {
        const beam = new THREE.Mesh(spotGeo, spotMat);
        beam.position.set((i - 1.5) * 15, -15, -15);
        beam.rotation.x = Math.random() * 0.2;
        beam.rotation.z = (Math.random() - 0.5) * 0.5;
        scene.add(beam);
        beams.push(beam);
    }

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const pointLight = new THREE.PointLight(0xffffff, 1.5);
    pointLight.position.set(0, 10, 10);
    scene.add(pointLight);

    glowTexture.current = createGlowTexture();

    // Init Particle System (Points)
    const pGeometry = new THREE.BufferGeometry();
    pGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions.current, 3));
    pGeometry.setAttribute('color', new THREE.BufferAttribute(particleColors.current, 3));
    pGeometry.setAttribute('size', new THREE.BufferAttribute(particleSizes.current, 1));
    
    const pMaterial = new THREE.ShaderMaterial({
        uniforms: {
            pointTexture: { value: glowTexture.current }
        },
        vertexShader,
        fragmentShader,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        vertexColors: true
    });
    
    particleSystem.current = new THREE.Points(pGeometry, pMaterial);
    // CRITICAL FIX: Disable frustum culling because particles start off-screen
    particleSystem.current.frustumCulled = false;
    scene.add(particleSystem.current);

    // Init Particle Data Pool
    for (let i = 0; i < MAX_PARTICLES; i++) {
        particlesData.current.push({
            active: false,
            life: 0,
            velocity: new THREE.Vector3(),
            decay: 0,
            initialSize: 0
        });
        // Move off screen initially
        particlePositions.current[i * 3] = 0;
        particlePositions.current[i * 3 + 1] = -1000;
        particlePositions.current[i * 3 + 2] = 0;
        particleSizes.current[i] = 0;
    }

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;

    const handleResize = () => {
      if (cameraRef.current && rendererRef.current) {
        cameraRef.current.aspect = window.innerWidth / window.innerHeight;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(window.innerWidth, window.innerHeight);
      }
    };
    window.addEventListener('resize', handleResize);

    let lastTime = 0;
    const loop = (time: number) => {
        lastTime = time;
        const sec = time * 0.001;

        if (!sceneRef.current || !cameraRef.current || !rendererRef.current) return;

        // Animate Beams
        beams.forEach((b, i) => {
            b.rotation.z = Math.sin(sec * 0.5 + i) * 0.3;
            b.rotation.x = Math.cos(sec * 0.3 + i) * 0.1;
        });

        const hand = handDataRef.current;
        const active = isGameActiveRef.current;

        // Report Stats if dirty
        if (statsDirty.current) {
            statsCallbackRef.current({ ...gameState.current });
            statsDirty.current = false;
        }

        // Gesture Debounce
        const rawGesture = hand ? hand.gesture : Gesture.None;
        if (rawGesture === pendingGesture.current) {
            gestureFrameCount.current++;
        } else {
            pendingGesture.current = rawGesture;
            gestureFrameCount.current = 0;
        }

        let activeGesture = stableGesture.current;
        if (gestureFrameCount.current > 5) {
            activeGesture = pendingGesture.current;
        }

        // --- Spawn Logic ---
        // Only spawn if game is active
        if (active && time > nextSpawnTime.current) {
            spawnProjectile();
            
            const baseDelay = Math.random() * (2000 - 666) + 666; // 666ms to 2000ms base
            let finalDelay = baseDelay;
            
            // Hand Velocity Mod: Lerp from default to 2x speed (0.5x delay)
            if (hand && hand.gesture === Gesture.Closed_Fist) {
                 // velocity is roughly 0-5. We'll saturate at 4 for max effect
                 const t = Math.min(Math.max(hand.velocity, 0) / 4.0, 1.0);
                 
                 // Lerp from baseDelay (t=0) to baseDelay/2 (t=1)
                 // value = baseDelay * (1 - 0.5 * t)
                 finalDelay = baseDelay * (1.0 - 0.5 * t);
            }
            
            nextSpawnTime.current = time + finalDelay;
        }

        // --- Gesture Triggers (Only process interactions if active or if specific gestures allow) ---
        // Note: We might want some gestures to work in Menu, but for now we follow game active state for gameplay mechanics
        if (active && activeGesture !== stableGesture.current) {
            const prev = stableGesture.current;
            const curr = activeGesture;

            if (curr === Gesture.Open_Palm && prev !== Gesture.Open_Palm) {
                explodeVisibleProjectiles();
            }
            if (curr === Gesture.Victory && prev !== Gesture.Victory) {
                trySpawnEnvelopes();
            }
            if (prev === Gesture.Victory && curr === Gesture.Open_Palm) {
                explodeEnvelopes();
            }
            stableGesture.current = activeGesture;
        } else if (!active) {
            // Update gesture state even if inactive to prevent sticky gestures on start
            stableGesture.current = activeGesture;
        }

        // --- Updates ---

        // 1. Particles System Update
        let needsUpdate = false;
        for (let i = 0; i < MAX_PARTICLES; i++) {
            const p = particlesData.current[i];
            if (p.active) {
                // Update Physics
                p.velocity.y -= 0.005; // Gravity
                p.velocity.x *= 0.98; // Air resistance
                p.velocity.z *= 0.98;

                particlePositions.current[i*3] += p.velocity.x;
                particlePositions.current[i*3+1] += p.velocity.y;
                particlePositions.current[i*3+2] += p.velocity.z;

                // Update Life
                p.life -= p.decay;
                
                // Blink effect
                const blink = p.life * (0.6 + 0.4 * Math.sin(sec * 15 + i * 0.1));
                particleSizes.current[i] = Math.max(0, blink * p.initialSize);

                // Recycle if dead or offscreen
                if (p.life <= 0 || particlePositions.current[i*3+1] < -20) {
                    p.active = false;
                    particlePositions.current[i*3+1] = -1000; // Hide
                    particleSizes.current[i] = 0;
                }
                needsUpdate = true;
            }
        }
        
        if (needsUpdate && particleSystem.current) {
            particleSystem.current.geometry.attributes.position.needsUpdate = true;
            particleSystem.current.geometry.attributes.size.needsUpdate = true;
            particleSystem.current.geometry.attributes.color.needsUpdate = true;
        }

        // 2. Projectiles
        for (let i = projectiles.current.length - 1; i >= 0; i--) {
            const p = projectiles.current[i];
            p.mesh.position.add(p.velocity);
            p.velocity.y *= 0.998; 
            p.mesh.position.x += Math.sin(sec * 5 + p.id) * 0.02;

            // Spawn Trail using Particle System
            if (Math.random() > 0.4) { 
                 // Bigger trail particles: Previous was (0.8 + rand*0.5) * 2.0. Doubled is 4.0
                 const size = (0.8 + Math.random() * 0.5) * 4.0;
                 spawnParticle(
                     p.mesh.position, 
                     p.color, 
                     new THREE.Vector3((Math.random()-0.5)*0.1, -0.1, (Math.random()-0.5)*0.1),
                     0.8, 
                     0.03, 
                     size
                 );
            }

            if (p.mesh.position.y > 40) {
                sceneRef.current.remove(p.mesh);
                projectiles.current.splice(i, 1);
            }
        }

        // 3. Envelopes
        for (let i = envelopes.current.length - 1; i >= 0; i--) {
            const e = envelopes.current[i];
            const scale = 1 + Math.sin(sec * 3 + e.id) * 0.05;
            e.mesh.scale.set(scale, scale, scale);
            e.mesh.rotation.set(0, 0, 0); 
        }

        // 4. Coins
        for (let i = coins.current.length - 1; i >= 0; i--) {
            const c = coins.current[i];
            c.mesh.position.add(c.velocity);
            c.velocity.y -= 0.04;
            c.mesh.rotation.x += c.rotSpeed.x;
            c.mesh.rotation.y += c.rotSpeed.y;

            if (c.mesh.position.y < -20) {
                sceneRef.current.remove(c.mesh);
                coins.current.splice(i, 1);
            }
        }

        rendererRef.current.render(sceneRef.current, cameraRef.current);
        requestRef.current = requestAnimationFrame(loop);
    };
    
    requestRef.current = requestAnimationFrame(loop);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      window.removeEventListener('resize', handleResize);
      if (containerRef.current && rendererRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
      }
    };
  }, []);

  const handDataRef = useRef(handData);
  const statsCallbackRef = useRef(onStatsUpdate);
  const isGameActiveRef = useRef(isGameActive);
  
  // Sync refs
  useEffect(() => {
    handDataRef.current = handData;
    statsCallbackRef.current = onStatsUpdate;
  }, [handData, onStatsUpdate]);

  useEffect(() => {
    isGameActiveRef.current = isGameActive;
    if (isGameActive) {
        // Reset local state if needed when game starts
        gameState.current = { exploded: 0, consumed: 0, coins: 0 };
    }
  }, [isGameActive]);

  // Actions
  
  const spawnParticle = (pos: THREE.Vector3, colorHex: number, vel: THREE.Vector3, life: number, decay: number, size: number) => {
      // Find inactive particle
      let foundIndex = -1;
      // Simple linear search with offset to avoid clumping
      const start = Math.floor(Math.random() * MAX_PARTICLES);
      for(let i=0; i<MAX_PARTICLES; i++) {
          const idx = (start + i) % MAX_PARTICLES;
          if (!particlesData.current[idx].active) {
              foundIndex = idx;
              break;
          }
      }

      if (foundIndex !== -1) {
          const col = new THREE.Color(colorHex);
          
          particlePositions.current[foundIndex*3] = pos.x;
          particlePositions.current[foundIndex*3+1] = pos.y;
          particlePositions.current[foundIndex*3+2] = pos.z;
          
          particleColors.current[foundIndex*3] = col.r;
          particleColors.current[foundIndex*3+1] = col.g;
          particleColors.current[foundIndex*3+2] = col.b;

          particlesData.current[foundIndex].active = true;
          particlesData.current[foundIndex].life = life;
          particlesData.current[foundIndex].velocity.copy(vel);
          particlesData.current[foundIndex].decay = decay;
          particlesData.current[foundIndex].initialSize = size;
          
          // Initialize size visually
          particleSizes.current[foundIndex] = size; 

          if (particleSystem.current) {
            particleSystem.current.geometry.attributes.position.needsUpdate = true;
            particleSystem.current.geometry.attributes.color.needsUpdate = true;
            particleSystem.current.geometry.attributes.size.needsUpdate = true;
          }
      }
  };

  const spawnProjectile = () => {
    if (!sceneRef.current) return;
    const color = COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
    const geometry = new THREE.SphereGeometry(0.2, 8, 8);
    const material = new THREE.MeshBasicMaterial({ 
        color: color,
        transparent: true,
        opacity: 0.8
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set((Math.random() - 0.5) * 20, -10, 0);
    
    const spriteMat = new THREE.SpriteMaterial({ 
        map: glowTexture.current, 
        color: color, 
        transparent: true, 
        blending: THREE.AdditiveBlending 
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(2.5, 2.5, 2.5);
    mesh.add(sprite);

    sceneRef.current.add(mesh);
    
    projectiles.current.push({
        id: Math.random(),
        mesh: mesh,
        // Reduced speed: (Original logic) * 0.7
        velocity: new THREE.Vector3(0, (0.8 + Math.random() * 0.4) * 0.7, 0),
        color: color
    });
    
    audioService.playLaunch();
  };

  const explodeVisibleProjectiles = () => {
    if (!sceneRef.current || !cameraRef.current) return;
    
    // Only explode projectiles currently visible on screen
    for (let i = projectiles.current.length - 1; i >= 0; i--) {
        const p = projectiles.current[i];
        
        // Project position to Normalized Device Coordinates (NDC)
        // x and y in range [-1, 1], z in range [-1, 1]
        const tempV = p.mesh.position.clone();
        tempV.project(cameraRef.current);

        // Check if inside frustum
        if (Math.abs(tempV.x) <= 1.05 && Math.abs(tempV.y) <= 1.05 && tempV.z >= -1 && tempV.z <= 1) {
             createExplosion(p.mesh.position, p.color);
             sceneRef.current.remove(p.mesh);
             projectiles.current.splice(i, 1);
        }
    }
  };

  const createExplosion = (position: THREE.Vector3, baseColor: number) => {
      audioService.playExplosion();
      gameState.current.exploded += 1;
      statsDirty.current = true;

      const count = 60;
      const baseColObj = new THREE.Color(baseColor);
      const hsl = { h: 0, s: 0, l: 0 };
      baseColObj.getHSL(hsl);

      for(let i=0; i<count; i++) {
        // Slight hue shift for variety
        const hueShift = (Math.random() - 0.5) * 0.15;
        const color = new THREE.Color().setHSL(hsl.h + hueShift, hsl.s, 0.6);
        
        // Spherical explosion
        const u = Math.random();
        const v = Math.random();
        const theta = 2 * Math.PI * u;
        const phi = Math.acos(2 * v - 1);
        const speed = 0.2 + Math.random() * 0.3;
        
        const velX = speed * Math.sin(phi) * Math.cos(theta);
        const velY = speed * Math.sin(phi) * Math.sin(theta);
        const velZ = speed * Math.cos(phi);

        // Variable size - Increased by 1.5x, then doubled (so 3x total relative to original)
        const size = (0.8 + Math.random() * 0.8) * 3.0;

        spawnParticle(
            position, 
            color.getHex(), 
            new THREE.Vector3(velX, velY, velZ), 
            1.0 + Math.random() * 0.5, 
            0.01 + Math.random() * 0.01,
            size
        );
      }
  };

  const trySpawnEnvelopes = () => {
      const available = Math.floor((gameState.current.exploded - gameState.current.consumed) / 5);
      if (available < 1) return;
      gameState.current.consumed += 5;
      statsDirty.current = true;
      spawnEnvelopes3D();
  };

  const spawnEnvelopes3D = () => {
      if (!sceneRef.current) return;
      if (envelopes.current.length > 0) return; 
      
      audioService.playSpawnEnvelopes();

      const count = Math.floor(Math.random() * 4) + 1;
      const spacing = 3.5;
      const totalWidth = (count - 1) * spacing;
      const startX = -totalWidth / 2;

      // 30% chance that ONE of the envelopes in this batch is Golden
      const goldenIndex = Math.random() < 0.3 ? Math.floor(Math.random() * count) : -1;

      for (let i = 0; i < count; i++) {
          const isGolden = (i === goldenIndex);
          const mainColor = isGolden ? GOLD_COLOR : ENVELOPE_RED;
          // If golden envelope, accent is red. If red envelope, accent is gold.
          const accentColor = isGolden ? ENVELOPE_RED : GOLD_COLOR;

          const geometry = new THREE.BoxGeometry(2, 3, 0.2);
          const material = new THREE.MeshStandardMaterial({ 
              color: mainColor,
              roughness: 0.2,
              metalness: isGolden ? 0.8 : 0.1,
              emissive: mainColor,
              emissiveIntensity: 0.8 
          });
          const mesh = new THREE.Mesh(geometry, material);
          
          const goldGeo = new THREE.BoxGeometry(0.5, 1, 0.3);
          const goldMat = new THREE.MeshStandardMaterial({ 
              color: accentColor, 
              metalness: 0.9, 
              roughness: 0.2,
              emissive: accentColor,
              emissiveIntensity: 0.5
          });
          const goldMesh = new THREE.Mesh(goldGeo, goldMat);
          mesh.add(goldMesh);

          const spriteMat = new THREE.SpriteMaterial({ 
            map: glowTexture.current, 
            color: mainColor, 
            transparent: true, 
            blending: THREE.AdditiveBlending,
            opacity: 0.5
          });
          const sprite = new THREE.Sprite(spriteMat);
          sprite.scale.set(6, 6, 1);
          mesh.add(sprite);

          const x = startX + i * spacing;
          const y = 10; // Moved higher (was 5)
          mesh.position.set(x, y, 12);
          
          sceneRef.current.add(mesh);
          envelopes.current.push({ id: Math.random(), mesh: mesh, isGolden });

          // BURST Particles from center of envelope
          const particleColor = isGolden ? GOLD_COLOR : ENVELOPE_RED;
          const particleCount = isGolden ? 40 : 20;

          for (let j = 0; j < particleCount; j++) {
             // Start exactly at envelope
             const pX = x;
             const pY = y;
             const pZ = 12;
             
             // Burst velocity
             const burstSpeed = 0.1 + Math.random() * 0.2;
             const angle = Math.random() * Math.PI * 2;
             const velX = Math.cos(angle) * burstSpeed;
             const velY = Math.sin(angle) * burstSpeed;
             const velZ = (Math.random() - 0.5) * 0.2;

             spawnParticle(
                 new THREE.Vector3(pX, pY, pZ),
                 particleColor,
                 new THREE.Vector3(velX, velY, velZ),
                 1.5, // Life
                 0.03, // Decay
                 isGolden ? 4.5 : 3.0 // Size
             );
          }
      }
  };

  const explodeEnvelopes = () => {
      if (!sceneRef.current) return;
      if (envelopes.current.length === 0) return;

      envelopes.current.forEach(e => {
          spawnCoins(e.mesh.position, e.isGolden);
          sceneRef.current?.remove(e.mesh);
      });
      envelopes.current = [];
  };

  const spawnCoins = (position: THREE.Vector3, isGolden: boolean = false) => {
      if (!sceneRef.current) return;
      audioService.playCoin();

      let count = Math.floor(Math.random() * 8) + 3;
      if (isGolden) count *= 2; 

      const coinValue = isGolden ? 2 : 1;
      const coinColor = isGolden ? GOLD_COLOR : SILVER_COLOR;
      const coinEmissive = isGolden ? 0xffaa00 : 0x666666;

      gameState.current.coins += (count * coinValue); // Add total value
      statsDirty.current = true;

      for (let i=0; i<count; i++) {
          const geometry = new THREE.CylinderGeometry(0.3, 0.3, 0.05, 16);
          geometry.rotateX(Math.PI / 2);
          const material = new THREE.MeshStandardMaterial({ 
              color: coinColor, 
              metalness: 1.0, 
              roughness: 0.1,
              emissive: coinEmissive,
              emissiveIntensity: 0.5
          });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.copy(position);
          mesh.position.x += (Math.random() - 0.5) * 2;
          mesh.position.y += (Math.random() - 0.5) * 2;
          mesh.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
          
          const spriteMat = new THREE.SpriteMaterial({ 
            map: glowTexture.current, 
            color: coinColor, 
            transparent: true, 
            blending: THREE.AdditiveBlending, 
            opacity: 0.6 
          });
          const sprite = new THREE.Sprite(spriteMat);
          sprite.scale.set(1.5, 1.5, 1);
          mesh.add(sprite);

          sceneRef.current.add(mesh);
          coins.current.push({
              mesh: mesh,
              velocity: new THREE.Vector3((Math.random()-0.5)*0.4, Math.random()*0.4, (Math.random()-0.5)*0.4),
              rotSpeed: { x: (Math.random()-0.5)*0.2, y: (Math.random()-0.5)*0.2 }
          });
      }
  };

  return <div ref={containerRef} className="absolute inset-0 z-0" />;
};
