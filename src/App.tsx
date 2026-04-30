import React, { useState, useRef, useEffect } from 'react';
import { Upload, X, MapPin, RefreshCw, Plus, Crosshair, ChevronRight, Moon, Sun, Smartphone, CornerUpLeft, Navigation, Save } from 'lucide-react';
import { ThreeViewer, type Hotspot } from './lib/ThreeViewer';
import * as THREE from 'three';
import { cn } from './lib/utils';

// Helper to compress image before saving to local storage
const compressImage = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        // Limit to 2048 to avoid local storage quota errors (approx 300kb per img)
        const MAX_WIDTH = 2048; 
        if (width > MAX_WIDTH) {
          height = Math.round(height * (MAX_WIDTH / width));
          width = MAX_WIDTH;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject('No Canvas Context');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    }
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

interface RoomImage {
  id: string;
  name: string;
  dataUrl: string;
  hotspots: Hotspot[];
}

export default function App() {
  const [images, setImages] = useState<RoomImage[]>(() => {
    try {
      const saved = localStorage.getItem('vt_images');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.warn("Could not load from localStorage", e);
      return [];
    }
  });
  
  const [activeImageId, setActiveImageId] = useState<string | null>(() => {
    try {
      return localStorage.getItem('vt_activeImageId') || null;
    } catch (e) {
      return null;
    }
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isFading, setIsFading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  
  // Viewer state
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ThreeViewer | null>(null);
  const [hotspotScreenPositions, setHotspotScreenPositions] = useState<{ id: string; targetImageId: string; label: string; x: number; y: number; visible: boolean }[]>([]);
  const [compassAngle, setCompassAngle] = useState(0);
  const [isGyroEnabled, setIsGyroEnabled] = useState(false);
  
  // Editor State
  const [isAddingHotspot, setIsAddingHotspot] = useState(false);
  const [hotspotPromptPosition, setHotspotPromptPosition] = useState<{ x: number, y: number, vector: THREE.Vector3 } | null>(null);
  const [newHotspotLabel, setNewHotspotLabel] = useState('');
  const [newHotspotTarget, setNewHotspotTarget] = useState('');

  // Auto-Save
  useEffect(() => {
    const saveState = setTimeout(() => {
      try {
        localStorage.setItem('vt_images', JSON.stringify(images));
        if (activeImageId) localStorage.setItem('vt_activeImageId', activeImageId);
        if (viewerRef.current) {
          const { lon, lat } = viewerRef.current.getCameraRotation();
          localStorage.setItem('vt_lastPos', JSON.stringify({ lon, lat }));
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === 'QuotaExceededError') {
          setErrorMsg('Storage full! Cannot save changes permanently.');
        }
      }
    }, 1000);
    return () => clearTimeout(saveState);
  }, [images, activeImageId, isFading]);

  const activeImage = images.find(img => img.id === activeImageId);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  // Main Viewer Init & Image Loading
  useEffect(() => {
    if (!containerRef.current || !activeImageId) return;

    if (!viewerRef.current) {
      viewerRef.current = new ThreeViewer({
        container: containerRef.current,
      });

      // Restore last camera pos if available
      try {
        const lastPosStr = localStorage.getItem('vt_lastPos');
        if (lastPosStr) {
          const { lon, lat } = JSON.parse(lastPosStr);
          viewerRef.current.setCameraRotation(lon, lat);
        }
      } catch (e) {
        /* ignore */
      }
    }

    const loadScene = async () => {
      if (!activeImage) return;
      setIsFading(true); // Start fade to black
      
      // Wait for fade transition duration before loading
      await new Promise(r => setTimeout(r, 400));
      
      setIsLoading(true);
      setErrorMsg(null);
      try {
        await viewerRef.current?.loadImage(activeImage.dataUrl);
        viewerRef.current?.setHotspots(activeImage.hotspots);
      } catch (err) {
        console.error(err);
        setErrorMsg('Failed to load image texture.');
      } finally {
        setIsLoading(false);
        // Wait a tiny bit for render to settle before fading in
        requestAnimationFrame(() => {
          setIsFading(false);
        });
      }
    };

    loadScene();

    // Hotspot & Compass sync loop (60fps UI update)
    let animationFrame: number;
    const updateUIState = () => {
      if (viewerRef.current) {
        setHotspotScreenPositions(viewerRef.current.getHotspotScreenPositions());
        setCompassAngle(viewerRef.current.getCameraRotation().lon);
      }
      animationFrame = requestAnimationFrame(updateUIState);
    };
    updateUIState();

    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [activeImageId]); // Trigger re-render only when ID changes

  // Keep hotspots in sync if they are edited while looking at the image
  useEffect(() => {
    if (viewerRef.current && activeImage && !isFading) {
      viewerRef.current.setHotspots(activeImage.hotspots);
    }
  }, [images, isFading]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setIsLoading(true);
    const newImages: RoomImage[] = [];
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith('image/')) continue;
        
        try {
          const dataUrl = await compressImage(file);
          newImages.push({
            id: Math.random().toString(36).substr(2, 9),
            name: file.name.split('.')[0],
            dataUrl,
            hotspots: []
          });
        } catch (e) {
          console.error("Failed to compress image", e);
        }
    }

    if (newImages.length > 0) {
      setImages(prev => [...prev, ...newImages]);
      if (!activeImageId) {
        setActiveImageId(newImages[0].id);
      }
    }
    setIsLoading(false);
    e.target.value = '';
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isAddingHotspot && viewerRef.current) {
      const pos = viewerRef.current.getUnprojectedPosition(e.clientX, e.clientY);
      setHotspotPromptPosition({
        x: e.clientX,
        y: e.clientY,
        vector: pos
      });
      setIsAddingHotspot(false);
    }
  };

  const saveHotspot = () => {
    if (!activeImageId || !hotspotPromptPosition || !newHotspotTarget) return;
    
    const newHotspot: Hotspot = {
      id: Math.random().toString(36).substr(2, 9),
      position: hotspotPromptPosition.vector,
      targetImageId: newHotspotTarget,
      label: newHotspotLabel || 'Go to scene'
    };

    setImages(prev => prev.map(img => {
      if (img.id === activeImageId) {
        return { ...img, hotspots: [...img.hotspots, newHotspot] };
      }
      return img;
    }));

    setHotspotPromptPosition(null);
    setNewHotspotLabel('');
    setNewHotspotTarget('');
  };

  const toggleGyroscope = () => {
    if (viewerRef.current) {
      const isEnabled = viewerRef.current.toggleGyro();
      setIsGyroEnabled(isEnabled);
    }
  };

  const handleResetStorage = () => {
    if (window.confirm("Are you sure you want to delete all tours?")) {
      localStorage.clear();
      setImages([]);
      setActiveImageId(null);
    }
  };

  // --- Initial / Empty State UI ---
  if (images.length === 0) {
    return (
      <div className={cn("min-h-screen flex flex-col items-center justify-center p-4 transition-colors", isDarkMode ? "bg-zinc-950 text-white" : "bg-neutral-50 text-slate-900")}>
        <button onClick={() => setIsDarkMode(!isDarkMode)} className="absolute top-4 right-4 p-2 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors">
          {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
        <div className="max-w-2xl w-full text-center space-y-8 relative z-10">
          <div className="space-y-4">
            <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-500">
              Virtual Tour Builder
            </h1>
            <p className="text-lg opacity-80 max-w-lg mx-auto leading-relaxed">
              Upload your equirectangular 360° panoramas to create an immersive, interactive virtual tour in seconds.
            </p>
          </div>
          
          <label className={cn("group cursor-pointer flex flex-col items-center justify-center w-full h-80 rounded-[2rem] border-2 border-dashed transition-all duration-300", isDarkMode ? "border-zinc-800 hover:border-blue-500/50 hover:bg-blue-500/5" : "border-neutral-300 hover:border-blue-500 hover:bg-blue-50/50")}>
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <div className="p-4 rounded-full bg-blue-100 text-blue-600 mb-6 group-hover:scale-110 transition-transform duration-300">
                <Upload className="w-8 h-8" />
              </div>
              <p className="mb-2 text-xl font-semibold">Click to upload 360° scenes</p>
              <p className="text-sm opacity-60 font-medium">JPEG, PNG or WebP</p>
            </div>
            <input type="file" className="hidden" accept="image/*" multiple onChange={handleFileUpload} />
          </label>
        </div>
        
        {/* Abstract Background Design */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-500 blur-[120px]" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500 blur-[120px]" />
        </div>
      </div>
    );
  }

  // --- Viewer UI ---
  return (
    <div className={cn("relative w-full h-screen overflow-hidden flex flex-col font-sans", isDarkMode ? "bg-black text-white" : "bg-neutral-100 text-slate-900")}>
      
      {/* 3D Canvas Container */}
      <div 
        ref={containerRef} 
        className={cn("absolute inset-0 cursor-grab touch-none", isAddingHotspot && "!cursor-crosshair")}
        onMouseDown={() => { if (!isAddingHotspot && containerRef.current) containerRef.current.style.cursor = 'grabbing'; }}
        onMouseUp={() => { if (!isAddingHotspot && containerRef.current) containerRef.current.style.cursor = 'grab'; }}
        onClick={handleCanvasClick}
      />

      {/* Fade Transition Overlay */}
      <div 
        className={cn(
          "absolute inset-0 bg-black pointer-events-none transition-opacity duration-500 ease-in-out z-20",
          isFading ? "opacity-100" : "opacity-0"
        )} 
      />

      {/* Loading Indicator Overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-50 transition-opacity">
          <div className="animate-spin text-white mb-4">
            <RefreshCw className="w-10 h-10" />
          </div>
          <p className="text-white font-medium animate-pulse">Loading Environment...</p>
        </div>
      )}

      {/* Error Message Toast */}
      {errorMsg && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-red-500 text-white px-5 py-3 rounded-full text-sm font-semibold shadow-2xl z-50 flex items-center gap-3 animate-in slide-in-from-top-4">
          {errorMsg}
          <button onClick={() => setErrorMsg(null)} className="ml-1 hover:bg-black/20 rounded-full p-1 transition-colors"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Top Navigation Bar */}
      <div className="absolute top-0 w-full p-4 md:p-6 flex justify-between items-start z-30 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-4">
          <div className="bg-black/30 backdrop-blur-md px-4 py-2 border border-white/10 rounded-2xl shadow-xl">
            <h2 className="text-xl font-bold tracking-tight text-white drop-shadow-md">{activeImage?.name || '360 Viewer'}</h2>
            <p className="text-xs font-medium text-white/70 drop-shadow-md flex items-center gap-1">
              <CornerUpLeft className="w-3 h-3" /> Drag & Scroll
            </p>
          </div>
        </div>
        
        <div className="flex flex-col gap-3 pointer-events-auto items-end">
           <div className="flex gap-2">
             <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-3 bg-black/30 hover:bg-black/50 border border-white/10 backdrop-blur-md text-white rounded-full transition-all shadow-xl">
               {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
             </button>
             <button onClick={toggleGyroscope} className={cn("p-3 border backdrop-blur-md text-white rounded-full transition-all shadow-xl", isGyroEnabled ? "bg-blue-600 border-blue-500" : "bg-black/30 hover:bg-black/50 border-white/10")} title="Toggle Gyroscope">
               <Smartphone className="w-5 h-5" />
             </button>
             <button onClick={() => viewerRef.current?.resetView()} className="p-3 bg-black/30 hover:bg-black/50 border border-white/10 backdrop-blur-md text-white rounded-full transition-all shadow-xl group" title="Reset View">
               <RefreshCw className="w-5 h-5 group-hover:-rotate-90 transition-transform duration-500" />
             </button>
           </div>
           
           {/* Static Map UI (Mini Map Overlay) */}
           <div className="bg-black/30 backdrop-blur-md border border-white/10 rounded-2xl p-4 shadow-2xl flex flex-col items-center min-w-[120px]">
             <div className="text-xs font-bold text-white/50 mb-3 uppercase tracking-wider">Map Overview</div>
             <div className="flex flex-wrap gap-2 justify-center max-w-[160px]">
               {images.map((img, i) => (
                 <button
                   key={img.id}
                   onClick={() => setActiveImageId(img.id)}
                   title={img.name}
                   className={cn(
                     "w-4 h-4 rounded-full transition-all duration-300 shadow-inner",
                     activeImageId === img.id 
                       ? "bg-blue-500 scale-125 ring-4 ring-blue-500/30" 
                       : "bg-white/40 hover:bg-white/80 hover:scale-110"
                   )}
                 />
               ))}
             </div>
             
             {/* Compass Integrated horizontally below map dots */}
             <div className="mt-4 flex flex-col items-center gap-1 border-t border-white/10 pt-3 w-full">
               <div className="w-8 h-8 rounded-full border border-white/20 bg-black/20 flex flex-col items-center justify-center relative">
                 <div className="text-[8px] font-bold absolute top-0.5 text-white/50">N</div>
                 <Navigation 
                    className="w-4 h-4 text-blue-400 absolute" 
                    style={{ transform: `rotate(${Math.round(compassAngle)}deg)`, transition: 'transform 0.1s ease-out' }} 
                 />
               </div>
             </div>
           </div>
           
           <button onClick={handleResetStorage} className="text-xs text-red-400/80 hover:text-red-400 font-medium px-2 py-1 bg-black/20 rounded-md backdrop-blur-md">
             Clear Storage
           </button>
        </div>
      </div>

      {/* Render Subscribed Hotspots */}
      {!isFading && hotspotScreenPositions.map(hs => {
        if (!hs.visible) return null;
        return (
           <div 
            key={hs.id}
            className="absolute transform -translate-x-1/2 -translate-y-1/2 z-20 group cursor-pointer"
            style={{ left: `${hs.x}px`, top: `${hs.y}px` }}
            onClick={() => {
              if (isAddingHotspot) return;
              setActiveImageId(hs.targetImageId);
            }}
          >
            <div className="relative flex items-center justify-center">
              <div className="absolute w-12 h-12 bg-white/20 rounded-full animate-ping" />
              <div className="w-10 h-10 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center text-white shadow-[0_4px_20px_rgba(0,0,0,0.5)] border border-white/30 transition-all duration-300 group-hover:scale-110 group-hover:bg-blue-500 group-hover:border-blue-400">
                <ChevronRight className="w-5 h-5 drop-shadow-md" />
              </div>
            </div>
            
            {/* Tooltip */}
            <div className="absolute top-12 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0 bg-black/80 border border-white/10 text-white text-sm px-4 py-2 rounded-lg whitespace-nowrap pointer-events-none backdrop-blur-md shadow-2xl font-bold tracking-wide">
              {hs.label}
            </div>
          </div>
        );
      })}

      {/* Add Hotspot Prompt Modal */}
      {hotspotPromptPosition && (
        <div 
          className="absolute z-50 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl border border-neutral-200 dark:border-white/10 shadow-2xl rounded-2xl p-5 w-80 animate-in zoom-in-95"
          style={{ 
            left: Math.min(hotspotPromptPosition.x, window.innerWidth - 320), 
            top: Math.min(hotspotPromptPosition.y, window.innerHeight - 300) 
          }}
        >
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
              <Crosshair className="w-5 h-5 text-blue-500" /> Save Portal
            </h3>
            <button onClick={() => setHotspotPromptPosition(null)} className="text-zinc-500 hover:text-zinc-800 dark:hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-500 dark:text-zinc-400 mb-1.5 block uppercase tracking-wider">Label</label>
              <input 
                 autoFocus
                 type="text" 
                 value={newHotspotLabel} 
                 onChange={e => setNewHotspotLabel(e.target.value)}
                 className="w-full px-3 py-2.5 bg-white dark:bg-black/50 border border-neutral-300 dark:border-white/10 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white shadow-inner transition-shadow"
                 placeholder="e.g. Go to Living Room"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 dark:text-zinc-400 mb-1.5 block uppercase tracking-wider">Target Scene</label>
              <select 
                value={newHotspotTarget} 
                onChange={e => setNewHotspotTarget(e.target.value)}
                className="w-full px-3 py-2.5 bg-white dark:bg-black/50 border border-neutral-300 dark:border-white/10 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white shadow-inner"
              >
                <option value="" disabled>Select destination...</option>
                {images.filter(img => img.id !== activeImageId).map(img => (
                  <option key={img.id} value={img.id} className="font-medium text-slate-900">{img.name}</option>
                ))}
              </select>
            </div>
            
            <div className="pt-2">
               <button 
                onClick={saveHotspot}
                disabled={!newHotspotTarget}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/30 disabled:cursor-not-allowed text-white py-3 rounded-xl text-sm font-bold transition-all shadow-lg hover:shadow-blue-500/25 flex justify-center items-center gap-2"
               >
                 <Save className="w-4 h-4" /> Create Portal
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Control Bar */}
      <div className={cn("absolute bottom-0 w-full p-6 z-30 transition-colors bg-gradient-to-t pointer-events-none flex flex-col items-center", isDarkMode ? "from-black via-black/60 to-transparent" : "from-black/40 via-black/10 to-transparent")}>
        
        {/* Editor Main Actions */}
        {images.length > 1 && (
          <div className="pointer-events-auto mb-6">
              <button 
                onClick={() => setIsAddingHotspot(!isAddingHotspot)}
                className={cn(
                  "flex items-center gap-2 px-6 py-3 rounded-full text-white font-bold text-sm transition-all shadow-2xl border border-white/20",
                  isAddingHotspot ? "bg-red-500 hover:bg-red-400 scale-105" : "bg-black/40 hover:bg-black/60 backdrop-blur-md"
                )}
              >
                {isAddingHotspot ? <X className="w-5 h-5" /> : <Crosshair className="w-5 h-5" />}
                {isAddingHotspot ? 'Cancel Portal Placement' : 'Add New Portal'}
              </button>
          </div>
        )}

        <div className="flex items-center gap-4 overflow-x-auto pb-2 w-full max-w-5xl no-scrollbar pointer-events-auto">
          {/* Add more images */}
          <label className={cn("flex-shrink-0 w-24 h-16 rounded-2xl border-2 border-dashed flex items-center justify-center cursor-pointer transition-all backdrop-blur-md shadow-xl", isDarkMode ? "border-white/20 bg-black/40 hover:border-white/50 hover:bg-black/60" : "border-white/50 bg-white/20 hover:bg-white/40")}>
            <Plus className="w-6 h-6 text-white" />
            <input type="file" className="hidden" accept="image/*" multiple onChange={handleFileUpload} />
          </label>
          
          <div className="w-px h-10 bg-white/20 mx-2" />

          {/* Gallery Items */}
          {images.map(img => (
            <button 
              key={img.id} 
              onClick={() => setActiveImageId(img.id)}
              className={cn(
                "relative group flex-shrink-0 w-24 h-16 rounded-2xl overflow-hidden border-2 transition-all shadow-xl",
                activeImageId === img.id ? "border-blue-500 ring-4 ring-blue-500/20 scale-105 z-10" : "border-white/10 hover:border-white/40 opacity-80 hover:opacity-100"
              )}
            >
              <img src={img.dataUrl} alt={img.name} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-2 transition-opacity">
                <span className="text-[10px] font-bold text-white truncate max-w-full drop-shadow-md">{img.name}</span>
              </div>
              {activeImageId === img.id && <MapPin className="absolute top-1 right-1 w-3 h-3 text-blue-400 drop-shadow-md" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

