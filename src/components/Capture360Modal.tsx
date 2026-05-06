import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Camera, RefreshCw, Check, Settings, Download, PlusCircle, Share2, Trash2, Aperture, Undo, Zap, ZapOff, Info } from 'lucide-react';
import { cn } from '../lib/utils';
import * as THREE from 'three';

interface Capture360ModalProps {
  onClose: () => void;
  onAddScene: (imageUrl: string) => void;
}

// 36-frame target grid
const TARGET_GRID = [
  ...Array.from({ length: 12 }).map((_, i) => ({ pitch: 0, yaw: i * 30, row: 'middle' })),
  ...Array.from({ length: 8 }).map((_, i) => ({ pitch: 45, yaw: i * 45, row: 'top' })),
  ...Array.from({ length: 8 }).map((_, i) => ({ pitch: -45, yaw: i * 45, row: 'bottom' })),
  ...Array.from({ length: 4 }).map((_, i) => ({ pitch: 90, yaw: i * 90, row: 'ceiling' })),
  ...Array.from({ length: 4 }).map((_, i) => ({ pitch: -90, yaw: i * 90, row: 'floor' }))
];

export function Capture360Modal({ onClose, onAddScene }: Capture360ModalProps) {
  const [step, setStep] = useState<'intro' | 'capture' | 'processing' | 'preview'>('intro');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  // Settings
  const [resolution, setResolution] = useState<'2K' | '4K' | '8K'>('4K');
  const [compression, setCompression] = useState<number>(80);
  const [timer, setTimer] = useState<'Off' | '3s' | '5s'>('5s');
  const [stabilization, setStabilization] = useState<'Auto' | 'Manual'>('Auto');
  const [format, setFormat] = useState<'JPEG' | 'WebP' | 'PNG'>('JPEG');
  
  // Capture UI State
  const [isCapturing, setIsCapturing] = useState(false);
  const [frames, setFrames] = useState<{ image: string; pitch: number; yaw: number }[]>([]);
  const [orientation, setOrientation] = useState({ pitch: 0, yaw: 0, stable: false });
  const [currentTargetIndex, setCurrentTargetIndex] = useState(0);
  const [autoCaptureMode, setAutoCaptureMode] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [instruction, setInstruction] = useState("Position device vertically to begin");

  // Base yaw offset to consider the start position as "0" yaw
  const [baseYaw, setBaseYaw] = useState<number | null>(null);

  // Processing
  const [progress, setProgress] = useState(0);
  const [finalImage, setFinalImage] = useState<string | null>(null);
  const stitchCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  // Worker ref
  const workerRef = useRef<Worker | null>(null);
  const lastGyroTime = useRef(0);
  const stableDuration = useRef(0);

  // Sound ref
  const audioCtx = useRef<AudioContext | null>(null);

  const playShutterSound = useCallback(() => {
    try {
      if (!audioCtx.current) audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.current.createOscillator();
      const gain = audioCtx.current.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(800, audioCtx.current.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, audioCtx.current.currentTime + 0.1);
      gain.gain.setValueAtTime(0.5, audioCtx.current.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.current.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(audioCtx.current.destination);
      osc.start();
      osc.stop(audioCtx.current.currentTime + 0.1);
    } catch(e) {}
  }, []);

  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } 
      });
      setStream(s);
      setStep('capture');
      setIsCapturing(true);
      setCurrentTargetIndex(0);
      setFrames([]);
      setBaseYaw(null);
      setCountdown(null);
    } catch (e) {
      console.error("Camera access failed", e);
      alert("Could not access the camera. Please ensure permissions are granted.");
    }
  };

  useEffect(() => {
    if (step === 'capture' && videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(console.error);
    }
  }, [step, stream]);

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      setStream(null);
    }
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
  };

  useEffect(() => { return () => stopCamera(); }, [stream]);

  // Handle device orientation mapping using requestAnimationFrame / Worker architecture concept
  useEffect(() => {
    if (step !== 'capture') return;

    // Simulate Worker setup for gyro processing constraint
    const workerCode = `
      self.onmessage = function(e) {
        if(e.data.type === 'gyro') {
           const { alpha, beta, gamma, dt, targetPitch, targetYaw, baseYaw } = e.data;
           
           // Normalization logic
           let yaw = alpha;
           if (baseYaw !== null) {
              yaw = yaw - baseYaw;
              if (yaw < 0) yaw += 360;
           }
           
           // Simplified pitch mapping (beta usually -180 to 180, we want 0 to be landscape upright)
           // Device straight up -> beta 90. Laying flat -> beta 0.
           let pitch = beta - 90; // Adjust depending on device holding (assuming portrait)
           
           // Check constraints
           let pDiff = Math.abs(pitch - targetPitch);
           
           let yDiff = Math.abs(yaw - targetYaw);
           if (yDiff > 180) yDiff = Math.abs(360 - yDiff);

           const maxDiff = 5;
           const isAligned = pDiff < maxDiff && yDiff < maxDiff;

           self.postMessage({ yaw, pitch, pDiff, yDiff, isAligned });
        }
      };
    `;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob));
    workerRef.current = worker;

    const handleOrientation = (e: DeviceOrientationEvent) => {
      let alpha = e.alpha || 0;
      let beta = e.beta || 0;

      // Base yaw calibration on first sample
      setBaseYaw(prevBase => {
          if (prevBase === null) return alpha;
          return prevBase;
      });

      const now = performance.now();
      const dt = (now - lastGyroTime.current);
      lastGyroTime.current = now;

      // The target we are looking for
      const target = TARGET_GRID[currentTargetIndex];

      if (target) {
        worker.postMessage({
            type: 'gyro', alpha, beta, dt,
            targetPitch: target.pitch, targetYaw: target.yaw, 
            baseYaw: baseYaw !== null ? baseYaw : alpha
        });
      }
    };

    worker.onmessage = (e) => {
        const { yaw, pitch, pDiff, yDiff, isAligned } = e.data;
        
        // Check stability
        if (isAligned) {
            stableDuration.current += 16; // approx ms per frame
        } else {
            stableDuration.current = 0;
        }

        const stable = stableDuration.current > 300; // 300ms stable
        setOrientation({ pitch, yaw, stable });

        // Update instruction
        if (pDiff > 10) {
            setInstruction(pitch < TARGET_GRID[currentTargetIndex]?.pitch ? "Tilt camera UP" : "Tilt camera DOWN");
        } else if (yDiff > 10) {
            setInstruction("Rotate left/right to align");
        } else if (isAligned && !stable) {
            setInstruction("Hold steady...");
        } else if (stable) {
            setInstruction("Perfect! Capturing...");
        }
    };

    const requestPermissions = async () => {
      if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        try {
          const perm = await (DeviceOrientationEvent as any).requestPermission();
          if (perm === 'granted') window.addEventListener('deviceorientation', handleOrientation);
        } catch (err) { console.error(err); }
      } else {
        window.addEventListener('deviceorientation', handleOrientation);
      }
    };
    
    requestPermissions();

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
      worker.terminate();
    };
  }, [step, currentTargetIndex, baseYaw]);

  const triggerCapture = useCallback(() => {
    if (!videoRef.current) return;
    
    setFlash(true);
    playShutterSound();
    setTimeout(() => setFlash(false), 150);

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

    const f = { image: dataUrl, pitch: orientation.pitch, yaw: orientation.yaw };
    setFrames(prev => [...prev, f]);
    
    // Move to next target
    const nextIdx = currentTargetIndex + 1;
    if (nextIdx >= TARGET_GRID.length) {
        setIsCapturing(false);
        setTimeout(() => finishCapture(frames.length + 1), 500); // Complete
    } else {
        setCurrentTargetIndex(nextIdx);
        setCountdown(null);
        stableDuration.current = 0; // reset stability
    }
  }, [currentTargetIndex, frames.length, orientation.pitch, orientation.yaw, playShutterSound]);

  // Auto capture logic
  useEffect(() => {
    if (step !== 'capture' || !isCapturing || !autoCaptureMode) return;
    
    if (orientation.stable && countdown === null) {
        // Start countdown
        setCountdown(3);
        let c = 3;
        const iv = setInterval(() => {
            c -= 1;
            if (c > 0) {
                setCountdown(c);
            } else {
                clearInterval(iv);
                triggerCapture();
            }
        }, 300); // 300ms per step
        return () => clearInterval(iv);
    } else if (!orientation.stable && countdown !== null) {
        // Break countdown
        setCountdown(null);
    }
  }, [orientation.stable, isCapturing, autoCaptureMode, countdown, triggerCapture, step]);


  const finishCapture = (totalFrames: number) => {
    setIsCapturing(false);
    stopCamera();
    setStep('processing');
    processImages();
  };

  const undoLastFrame = () => {
    if (frames.length > 0 && currentTargetIndex > 0) {
        setFrames(prev => prev.slice(0, -1));
        setCurrentTargetIndex(prev => prev - 1);
        setCountdown(null);
    }
  };

  const processImages = async () => {
    setProgress(0);
    const outputWidth = resolution === '8K' ? 8192 : (resolution === '4K' ? 4096 : 2048);
    const outputHeight = outputWidth / 2;

    if (!stitchCanvasRef.current) return;
    const canvas = stitchCanvasRef.current;
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, outputWidth, outputHeight);

    const len = frames.length;
    for (let i = 0; i < len; i++) {
        const frame = frames[i];
        await new Promise(r => setTimeout(r, 50)); 
        
        const img = new Image();
        img.src = frame.image;
        await new Promise((resolve) => { img.onload = resolve; });
        
        const sliceWidth = outputWidth / 12; // Middle row has 12
        // Just spread them linearly for the demo mock stitch
        const dx = (frame.yaw / 360) * outputWidth;
        // Pitch maps to Y (approximate)
        const pitchMap = (frame.pitch / 180) + 0.5; // -90 to 90 -> 0 to 1
        const dy = (1 - pitchMap) * outputHeight - (img.height * (sliceWidth / img.width)) / 2;
        const dh = img.height * (sliceWidth / img.width);
        
        ctx.globalAlpha = 0.8; // Blend
        ctx.drawImage(img, dx, dy, sliceWidth + 20, dh * 1.2);
        
        setProgress(Math.floor(((i + 1) / len) * 100));
    }

    const canvasFormat = format === 'JPEG' ? 'image/jpeg' : format === 'WebP' ? 'image/webp' : 'image/png';
    canvas.toBlob(
      (blob) => {
        if (blob) {
           const resultUrl = URL.createObjectURL(blob);
           setFinalImage(resultUrl);
           setStep('preview');
        }
      },
      canvasFormat,
      canvasFormat === 'image/jpeg' || canvasFormat === 'image/webp' ? (compression / 100) : undefined
    );
  };

  // Preview 3D
  useEffect(() => {
    if (step === 'preview' && finalImage && previewContainerRef.current) {
       const w = previewContainerRef.current.clientWidth;
       const h = previewContainerRef.current.clientHeight;

       const scene = new THREE.Scene();
       const camera = new THREE.PerspectiveCamera(75, w/h, 0.1, 1000);
       const renderer = new THREE.WebGLRenderer({ antialias: true });
       renderer.setSize(w, h);
       previewContainerRef.current.innerHTML = '';
       previewContainerRef.current.appendChild(renderer.domElement);

       const texLoader = new THREE.TextureLoader();
       texLoader.load(finalImage, (texture) => {
         texture.mapping = THREE.EquirectangularReflectionMapping;
         const geo = new THREE.SphereGeometry(500, 60, 40);
         geo.scale(-1, 1, 1);
         const mat = new THREE.MeshBasicMaterial({ map: texture });
         scene.add(new THREE.Mesh(geo, mat));
       });

       camera.position.set(0,0,0.1);

       let isDragging = false, prevMouse = { x: 0, y: 0 }, lon = 0, lat = 0;
       const onDown = (e: any) => {
         isDragging = true;
         prevMouse = { x: e.touches ? e.touches[0].clientX : e.clientX, y: e.touches ? e.touches[0].clientY : e.clientY };
       };
       const onMove = (e: any) => {
         if (!isDragging) return;
         const clientX = e.touches ? e.touches[0].clientX : e.clientX;
         const clientY = e.touches ? e.touches[0].clientY : e.clientY;
         lon -= (clientX - prevMouse.x) * 0.1;
         lat = Math.max(-85, Math.min(85, lat + (clientY - prevMouse.y) * 0.1));
         prevMouse = { x: clientX, y: clientY };
       };
       const onUp = () => isDragging = false;

       const dom = renderer.domElement;
       dom.addEventListener('mousedown', onDown);
       dom.addEventListener('mousemove', onMove);
       window.addEventListener('mouseup', onUp);
       dom.addEventListener('touchstart', onDown);
       dom.addEventListener('touchmove', onMove);
       window.addEventListener('touchend', onUp);

       let animationId: number;
       const animate = () => {
         animationId = requestAnimationFrame(animate);
         const phi = THREE.MathUtils.degToRad(90 - lat), theta = THREE.MathUtils.degToRad(lon);
         camera.lookAt(new THREE.Vector3(500 * Math.sin(phi) * Math.cos(theta), 500 * Math.cos(phi), 500 * Math.sin(phi) * Math.sin(theta)));
         renderer.render(scene, camera);
       };
       animate();

       return () => {
         cancelAnimationFrame(animationId);
         renderer.dispose();
         dom.removeEventListener('mousedown', onDown);
         dom.removeEventListener('mousemove', onMove);
         window.removeEventListener('mouseup', onUp);
         dom.removeEventListener('touchstart', onDown);
         dom.removeEventListener('touchmove', onMove);
         window.removeEventListener('touchend', onUp);
       };
    }
  }, [step, finalImage]);

  const target = TARGET_GRID[currentTargetIndex];

  // Calculate UI target ball position
  let ballX = 50;
  let ballY = 50;
  let targetColorClass = "bg-orange-500 shadow-orange-500/50";
  let targetBorderClass = "border-white/40 border-[3px]";

  if (step === 'capture' && target) {
      let pDiff = target.pitch - orientation.pitch;
      let yDiff = target.yaw - orientation.yaw;
      // Normalize yaw diff
      if (yDiff > 180) yDiff -= 360;
      if (yDiff < -180) yDiff += 360;

      // Map differences to -50% to +50% range. Let's say 45deg is out of bounding box.
      ballX = 50 + (yDiff / 45) * 50;
      ballY = 50 - (pDiff / 45) * 50;

      // Bound it visually to the edge of the screen
      ballX = Math.max(5, Math.min(95, ballX));
      ballY = Math.max(5, Math.min(95, ballY));

      const isAligned = Math.abs(pDiff) < 5 && Math.abs(yDiff) < 5;
      
      if (isAligned) {
          targetColorClass = "bg-green-500 shadow-green-500/80 scale-110";
          targetBorderClass = "border-green-500 border-[4px] shadow-[0_0_20px_rgba(34,197,94,0.4)]";
      } else if (Math.abs(pDiff) > 20 || Math.abs(yDiff) > 20) {
          targetColorClass = "bg-red-500 shadow-red-500/50";
      }
  }

  const downloadImage = () => {
      if (finalImage) {
         const a = document.createElement('a');
         a.href = finalImage;
         a.download = `360_panorama_${Date.now()}.png`;
         a.click();
      }
  };
  
  const shareImage = async () => {
      if (finalImage && navigator.share) {
          try {
             const res = await fetch(finalImage);
             const blob = await res.blob();
             const file = new File([blob], 'panorama.png', { type: 'image/png' });
             await navigator.share({
                 title: 'My 360° Panorama',
                 files: [file]
             });
          } catch (e) {
             console.error("Error sharing", e);
          }
      }
  };

  const cancelCapture = () => {
      if (frames.length > 0) {
          if (confirm(`Cancel capture? ${frames.length} frames will be discarded.`)) {
              setStep('intro');
              stopCamera();
          }
      } else {
          setStep('intro');
          stopCamera();
      }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black text-white flex flex-col font-sans">
      
      {/* Top Bar for specific screens */}
      {step !== 'capture' && (
          <div className="flex justify-between items-center p-4 bg-black/50 backdrop-blur-md absolute top-0 w-full z-10 border-b border-white/10">
             <h2 className="text-lg font-bold flex items-center gap-2">
                <Aperture className="text-blue-500 w-5 h-5"/> Live 360° Capture
             </h2>
             <div className="flex items-center gap-3">
                 {step === 'intro' && (
                     <button onClick={() => setSettingsOpen(!settingsOpen)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                         <Settings className="w-5 h-5" />
                     </button>
                 )}
                 <button onClick={onClose} className="p-2 bg-red-600/80 hover:bg-red-600 rounded-full transition-colors shadow-lg">
                     <X className="w-5 h-5" />
                 </button>
             </div>
          </div>
      )}

      <canvas ref={stitchCanvasRef} className="hidden" />

      <div className="flex-1 relative overflow-hidden flex flex-col items-center justify-center">
         
         {step === 'intro' && (
            <div className="text-center p-6 max-w-sm animate-in fade-in zoom-in duration-500">
               <div className="w-24 h-24 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_50px_rgba(59,130,246,0.3)] border border-blue-500/30">
                  <Camera className="w-10 h-10 text-blue-400" />
               </div>
               <h3 className="text-2xl font-bold mb-4">Professional 360° Capture</h3>
               <p className="text-slate-400 mb-8 text-sm leading-relaxed">
                 Create stunning panoramic environments. Stand in one spot and sweep your camera around to capture the entire room seamlessly.
               </p>
               <button onClick={startCamera} className="w-full py-4 rounded-xl bg-white text-black font-bold text-lg hover:bg-neutral-200 transition-all active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.2)]">
                  Launch Camera
               </button>
            </div>
         )}

         {step === 'capture' && (
            <div className="absolute inset-0 block w-full h-full bg-black overflow-hidden">
               {/* Fullscreen Video */}
               <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover scale-105" autoPlay playsInline muted />
               
               {/* Vignette */}
               <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_150px_rgba(0,0,0,0.8)] z-10" />

               {/* Flash Overlay */}
               <div className={cn("absolute inset-0 bg-white z-50 pointer-events-none transition-opacity duration-100", flash ? "opacity-100" : "opacity-0")} />

               {/* Target Reticle (Screen Bounds) */}
               <div className="absolute top-[15%] bottom-[25%] left-[15%] right-[15%] z-20 pointer-events-none flex items-center justify-center">
                  <div className={cn("w-full h-full max-w-sm aspect-[3/4] relative transition-colors duration-300 rounded-3xl", targetBorderClass)}>
                      {/* Rule of Thirds Grid */}
                      <div className="absolute left-1/3 top-0 bottom-0 w-[1px] bg-white/20" />
                      <div className="absolute left-2/3 top-0 bottom-0 w-[1px] bg-white/20" />
                      <div className="absolute top-1/3 left-0 right-0 h-[1px] bg-white/20" />
                      <div className="absolute top-2/3 left-0 right-0 h-[1px] bg-white/20" />

                      {/* Center Crosshair Tick */}
                      <div className="absolute top-1/2 left-1/2 -mt-px -ml-3 w-6 h-[2px] bg-white/80" />
                      <div className="absolute top-1/2 left-1/2 -mt-3 -ml-px w-[2px] h-6 bg-white/80" />

                      {/* Moving Target Ball */}
                      <div 
                         className={cn("absolute w-12 h-12 rounded-full -ml-6 -mt-6 shadow-lg transition-all duration-300 ease-out", targetColorClass)}
                         style={{ top: `${ballY}%`, left: `${ballX}%` }} 
                      >
                          {countdown !== null && (
                              <div className="absolute inset-0 flex items-center justify-center text-white font-bold text-xl animate-ping">
                                  {countdown}
                              </div>
                          )}
                      </div>
                  </div>
               </div>

               {/* Instruction Text Layer */}
               <div className="absolute top-16 w-full text-center z-30 pointer-events-none px-4">
                  <div className="inline-block bg-black/60 backdrop-blur-md px-6 py-3 rounded-full text-white font-medium tracking-wide shadow-lg border border-white/10 uppercase text-sm">
                      {instruction}
                  </div>
               </div>

               {/* 360 Mini Map (Top Right) */}
               <div className="absolute top-12 right-4 w-20 h-20 rounded-full bg-black/50 backdrop-blur-md border border-white/20 z-30 pointer-events-none overflow-hidden hidden md:block">
                   <div className="relative w-full h-full">
                       {/* Center dot */}
                       <div className="absolute top-1/2 left-1/2 w-1 h-1 bg-white rounded-full -mt-[2px] -ml-[2px]" />
                       
                       {/* Radar sweep indicator based on yaw */}
                       <div className="absolute top-1/2 left-1/2 w-10 h-1 origin-left bg-gradient-to-r from-blue-500 to-transparent" style={{ transform: `rotate(${orientation.yaw - 90}deg)` }} />

                       {/* Target spots projection */}
                       {TARGET_GRID.map((t, idx) => {
                           const isCaptured = idx < currentTargetIndex;
                           const isNext = idx === currentTargetIndex;
                           // Map pitch and yaw to mini-map coordinates (simplification)
                           const r = t.pitch === 0 ? 8 : (Math.abs(t.pitch) === 45 ? 5 : 2); // Radius from center
                           const th = (t.yaw - 90) * (Math.PI / 180);
                           const x = 40 + r * Math.cos(th) * 4;
                           const y = 40 + r * Math.sin(th) * 4;
                           
                           let spotClass = "bg-white/30";
                           if (isCaptured) spotClass = "bg-green-500 scale-125 shadow-[0_0_5px_rgba(34,197,94,0.8)]";
                           if (isNext) spotClass = "bg-orange-500 animate-pulse scale-150 shadow-[0_0_8px_rgba(249,115,22,0.8)] z-10";

                           return (
                               <div key={idx} className={cn("absolute w-1.5 h-1.5 rounded-full -ml-[3px] -mt-[3px] transition-all", spotClass)} style={{ left: x, top: y }} />
                           );
                       })}
                   </div>
               </div>

               {/* Direction Arrows Overlay based on ball position */}
               {step === 'capture' && target && (
                   <div className="absolute inset-0 pointer-events-none z-20 opacity-50 flex items-center justify-center">
                       {ballX < 10 && <div className="absolute left-4 text-orange-500 animate-pulse text-6xl shadow-orange-500 drop-shadow-2xl">←</div>}
                       {ballX > 90 && <div className="absolute right-4 text-orange-500 animate-pulse text-6xl shadow-orange-500 drop-shadow-2xl">→</div>}
                       {ballY < 10 && <div className="absolute top-32 text-orange-500 animate-pulse text-6xl shadow-orange-500 drop-shadow-2xl">↑</div>}
                       {ballY > 90 && <div className="absolute bottom-48 text-orange-500 animate-pulse text-6xl shadow-orange-500 drop-shadow-2xl">↓</div>}
                   </div>
               )}

               {/* Bottom Controls Panel */}
               <div className="absolute bottom-0 w-full z-40">
                   {/* Horizontal Progress */}
                   <div className="w-full bg-neutral-900/80 backdrop-blur-md px-6 py-4 border-t border-white/10 flex flex-col gap-4">
                       
                       {/* Progress Grid representation */}
                       <div className="w-full flex items-center justify-between gap-4">
                           <div className="flex-1">
                               <div className="flex justify-between text-xs font-bold text-white/60 mb-2 uppercase tracking-wider">
                                   <span>Progress</span>
                                   <span>{frames.length} / {TARGET_GRID.length}</span>
                               </div>
                               <div className="w-full h-2 bg-black/50 rounded-full overflow-hidden flex">
                                   <div className="h-full bg-green-500 transition-all duration-300 ease-out" style={{ width: `${(frames.length / TARGET_GRID.length) * 100}%` }} />
                               </div>
                           </div>
                           <div className="shrink-0 flex items-center gap-1">
                                <button onClick={() => setAutoCaptureMode(!autoCaptureMode)} className={cn("p-3 rounded-full transition-colors flex items-center justify-center shadow-lg border", autoCaptureMode ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/50" : "bg-neutral-800 text-white/50 border-white/10")}>
                                    {autoCaptureMode ? <Zap className="w-5 h-5" /> : <ZapOff className="w-5 h-5" />}
                                </button>
                           </div>
                       </div>

                       {/* Action Buttons */}
                       <div className="flex justify-between items-center pb-safe pt-2">
                           {/* Cancel */}
                           <button onClick={cancelCapture} className="w-14 h-14 bg-neutral-800 hover:bg-red-900/50 rounded-full flex items-center justify-center border border-white/10 transition-colors text-white shadow-xl">
                               <X className="w-6 h-6" />
                           </button>

                           {/* Main Shutter */}
                           <div className="relative">
                               {autoCaptureMode && (
                                   <div className="absolute -inset-2 rounded-full border-2 border-dashed border-green-500/40 animate-[spin_10s_linear_infinite] pointer-events-none" />
                               )}
                               <button 
                                  onClick={!autoCaptureMode ? triggerCapture : undefined}
                                  disabled={autoCaptureMode || (targetColorClass !== "bg-green-500 shadow-green-500/80 scale-110")}
                                  className={cn(
                                    "w-20 h-20 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(0,0,0,0.5)] border-4 transition-all",
                                    autoCaptureMode ? "bg-black/50 border-white/20 cursor-default" : 
                                    (targetColorClass === "bg-green-500 shadow-green-500/80 scale-110" ? "bg-white border-green-500 hover:scale-105" : "bg-white/30 border-white/10 cursor-not-allowed")
                                  )}
                               >
                                  {autoCaptureMode ? (
                                      <div className="text-center">
                                          <div className="text-[10px] font-bold text-green-400 uppercase tracking-widest">Auto</div>
                                          <div className="text-[10px] font-bold text-white/50">ON</div>
                                      </div>
                                  ) : (
                                      <div className={cn("w-16 h-16 rounded-full border-2", targetColorClass === "bg-green-500 shadow-green-500/80 scale-110" ? "border-green-600 bg-green-500" : "border-black/20 bg-white/50")} />
                                  )}
                               </button>
                           </div>

                           {/* Undo */}
                           <button onClick={undoLastFrame} disabled={frames.length === 0} className={cn("w-14 h-14 rounded-full flex items-center justify-center border transition-all shadow-xl relative", frames.length > 0 ? "bg-neutral-800 hover:bg-neutral-700 border-white/10 text-white" : "bg-neutral-900 border-white/5 text-white/30")}>
                               <Undo className="w-6 h-6" />
                               {frames.length > 0 && (
                                   <div className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 rounded-full text-[10px] font-bold flex items-center justify-center text-white border-2 border-neutral-900">
                                       {frames.length}
                                   </div>
                               )}
                           </button>
                       </div>
                   </div>
               </div>
            </div>
         )}

         {step === 'processing' && (
            <div className="w-full max-w-sm p-8 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
                <RefreshCw className="w-12 h-12 text-blue-500 mx-auto mb-6 animate-spin" />
                <h3 className="text-xl font-bold mb-2">Stitching Panorama...</h3>
                <p className="text-slate-400 mb-6 text-sm">Aligning {frames.length} frames into equirectangular space.</p>
                
                <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden shadow-inner relative">
                    <div className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 transition-all duration-300 ease-out shadow-[0_0_10px_rgba(59,130,246,0.6)]" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-xs font-bold text-white/50 mt-3 font-mono">{progress}% COMPLETED</p>
            </div>
         )}

         {step === 'preview' && (
            <div className="absolute inset-0 flex flex-col pointer-events-auto">
               <div className="p-4 bg-black/80 backdrop-blur-md absolute top-0 w-full z-10 border-b border-white/10">
                   <h2 className="text-lg font-bold flex items-center justify-center gap-2">
                      <Check className="text-green-500 w-5 h-5"/> 360° Panorama Ready
                   </h2>
               </div>
               
               {/* 3D Sphere Viewer */}
               <div ref={previewContainerRef} className="flex-1 w-full bg-neutral-900 cursor-grab active:cursor-grabbing" />
               
               {/* Export Bar */}
               <div className="bg-zinc-900 border-t border-white/10 p-4 shrink-0 pb-safe">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-4xl mx-auto">
                      <button onClick={downloadImage} className="flex flex-col items-center justify-center py-4 bg-white/5 hover:bg-white/10 rounded-xl transition-colors gap-2 border border-white/5 hover:border-white/20 text-sm font-bold text-slate-300 hover:text-white">
                         <Download className="w-5 h-5" /> Save to Device
                      </button>
                      <button onClick={() => finalImage && onAddScene(finalImage)} className="flex flex-col items-center justify-center py-4 bg-blue-600/20 hover:bg-blue-600/40 rounded-xl transition-colors gap-2 border border-blue-500/30 text-sm font-bold text-blue-400 hover:text-blue-300 shadow-[0_0_15px_rgba(59,130,246,0.1)]">
                         <PlusCircle className="w-5 h-5" /> Add as Scene
                      </button>
                      <button onClick={shareImage} className="flex flex-col items-center justify-center py-4 bg-white/5 hover:bg-white/10 rounded-xl transition-colors gap-2 border border-white/5 hover:border-white/20 text-sm font-bold text-slate-300 hover:text-white">
                         <Share2 className="w-5 h-5" /> Share
                      </button>
                      <button onClick={() => { setFinalImage(null); setStep('intro'); }} className="flex flex-col items-center justify-center py-4 bg-red-500/10 hover:bg-red-500/20 rounded-xl transition-colors gap-2 border border-red-500/20 text-sm font-bold text-red-400 hover:text-red-300">
                         <Trash2 className="w-5 h-5" /> Discard
                      </button>
                  </div>
               </div>
            </div>
         )}
      </div>

      {settingsOpen && step === 'intro' && (
         <div className="absolute inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
             <div className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl p-6">
                 {/* Simplified settings display for brevity */}
                 <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold flex items-center gap-2"><Settings className="w-5 h-5" /> Output Settings</h3>
                    <button onClick={() => setSettingsOpen(false)} className="text-white/50 hover:text-white"><X className="w-5 h-5" /></button>
                 </div>
                 <div className="space-y-4">
                    <p className="text-sm text-white/60"><Info className="w-4 h-4 inline mr-1" /> Grid capture is locked to 36-frames for professional stitching geometry.</p>
                    <button onClick={() => setSettingsOpen(false)} className="w-full bg-white text-black font-bold py-3 text-sm rounded-xl hover:bg-neutral-200 mt-2">
                       Done
                    </button>
                 </div>
             </div>
         </div>
      )}
    </div>
  );
}
