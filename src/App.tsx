import React, { useState, useRef, useEffect } from 'react';
import { Upload, X, MapPin, RefreshCw, Plus, Crosshair, ChevronRight, Moon, Sun, Smartphone, CornerUpLeft, Navigation, Save, Eye, EyeOff, Home, Star, Trash2, Aperture, LayoutGrid, Download, FileJson, Camera, Package, RotateCcw, Monitor, Edit2, GripVertical, Settings, Volume2, VolumeX, Play, Pause, Square, SkipForward, SkipBack, Music, Globe, Mic } from 'lucide-react';
import { Reorder, useDragControls } from 'motion/react';
import { ThreeViewer, type Hotspot } from './lib/ThreeViewer';
import { Capture360Modal } from './components/Capture360Modal';
import { SceneAudioPanel } from './components/SceneAudioPanel';
import { SettingsModal } from './components/SettingsModal';
import { WaveformMeter } from './components/WaveformMeter';
import AudioEngine from './lib/AudioEngine';
import * as THREE from 'three';
import { cn } from './lib/utils';
import { get, set, clear } from 'idb-keyval';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

const DraggableToolItem = ({ id, content, onClick, className, toolTitle, toolOrder, isExpanded }: any) => {
  const controls = useDragControls();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isPressing, setIsPressing] = useState(false);
  const startPosRef = useRef<{x: number, y: number} | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsPressing(true);
    startPosRef.current = { x: e.clientX, y: e.clientY };
    timeoutRef.current = setTimeout(() => {
      controls.start(e);
      setIsPressing(false);
      // Give haptic feedback if possible
      if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
         window.navigator.vibrate(50);
      }
    }, 1000);
  };

  const handlePointerUp = () => {
    setIsPressing(false);
    startPosRef.current = null;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isPressing && startPosRef.current) {
       const dx = Math.abs(e.clientX - startPosRef.current.x);
       const dy = Math.abs(e.clientY - startPosRef.current.y);
       if (dx > 10 || dy > 10) {
           handlePointerUp(); // Cancel long press if moved
       }
    }
  };

  return (
    <Reorder.Item
      value={id}
      dragListener={false}
      dragControls={controls}
      onDragEnd={() => localStorage.setItem('vt_tool_order', JSON.stringify(toolOrder))}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerMove={handlePointerMove}
      onContextMenu={(e) => { e.preventDefault(); }}
      className={cn("relative shrink-0", isExpanded ? "w-full" : "w-12 h-12", isPressing && "scale-95 opacity-80 transition-transform")}
    >
      <button
          onClick={onClick}
          className={cn(className, isExpanded ? "w-full flex justify-start px-4 gap-3 rounded-2xl" : "rounded-full")}
          title={toolTitle}
      >
          {content}
          {isExpanded && <span className="text-sm font-medium pr-2 text-white/90 truncate">{toolTitle}</span>}
      </button>
    </Reorder.Item>
  );
};

const compressImage = async (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        // Limit to 4096 (better quality) since we use IDB
        const MAX_WIDTH = 4096; 
        if (width > MAX_WIDTH) {
          height = Math.round(height * (MAX_WIDTH / width));
          width = MAX_WIDTH;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject('No Canvas Context');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
           if (blob) resolve(blob);
           else reject('Context failed');
        }, 'image/jpeg', 0.8);
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    }
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const base64ToBlob = async (base64: string): Promise<Blob> => {
  const res = await fetch(base64);
  return await res.blob();
};

export type Lang = 'ar' | 'en';
export const TRANSLATIONS = {
  en: {
    loading: "Loading projects...",
    virtualTours: "Virtual Tours",
    confirmClear: "Confirm Clear",
    clearAll: "Clear All",
    createTour: "Create a New Tour",
    uploadDesc: "Upload 360° panoramic images or videos to start building.",
    importJSON: "Import JSON",
    newProject: "New Project",
    allProjects: "All Projects",
    favorites: "Favorites",
    noProjects: "No projects yet. Create your first tour above!",
    noFavorites: "No favorites yet. Mark a project as favorite to see it here!",
    tapToPlace: "Tap anywhere to place arrow",
    dashboard: "Dashboard",
    dragScroll: "Drag & Scroll",
    scene: "Scene",
    manageArrows: "Manage Navigation Arrows",
    toggleTheme: "Toggle Dark/Light Mode",
    globalAudio: "Global Audio",
    sceneAudio: "Scene Audio",
    cleanView: "Clean View",
    goToScene: "Go",
    moveHotspot: "Move Hotspot",
    deleteHotspot: "Delete Hotspot",
    label: "Label",
    targetScene: "Target Scene",
    cancel: "Cancel",
    save: "Save",
    portrait: "Portrait",
    landscape: "Landscape",
    manageNavArrows: "Manage Arrows",
    noArrows: "No arrows in this scene.",
    destination: "Destination: ",
    deleteArrowTooltip: "Delete Arrow",
    addScene: "Add Scene",
    exportProject: "Export Project",
    deleteProject: "Delete Project",
    exportJson: "Export JSON",
    deleteSceneConfirm: "Are you sure you want to delete this scene?",
    deleteArrowConfirm: "Delete this arrow?",
    scenesCount: "scenes",
    language: "العربية",
    toggleLangTooltip: "Switch Language",
    settings: "Settings",
    general: "General",
    audio: "Audio",
    orientation: "Orientation",
    darkMode: "Dark Mode",
    on: "On",
    off: "Off",
    mode: "Mode",
    manual: "Manual",
    autoRotate: "Auto-Rotate",
    defaultOrientation: "Default Orientation",
    appliedOnLaunch: "Applied on app launch or when switching to manual",
    audioEnabled: "Audio Enabled",
    yes: "Yes",
    no: "No",
    masterVolume: "Master Volume",
    sceneTransition: "Scene Transition",
    type: "Type",
    duration: "Duration",
    autoPlay: "Auto-Play",
    spatialAudio: "3D Spatial Audio",
    quality: "Quality",
    muteAll: "Mute All"
  },
  ar: {
    loading: "جاري تحميل المشاريع...",
    virtualTours: "الجولات الافتراضية",
    confirmClear: "تأكيد الحذف",
    clearAll: "حذف الكل",
    createTour: "إنشاء جولة جديدة",
    uploadDesc: "ارفع صور بانوراما 360 درجة للبدء.",
    importJSON: "استيراد JSON",
    newProject: "مشروع جديد",
    allProjects: "كل المشاريع",
    favorites: "المفضلة",
    noProjects: "لا توجد مشاريع بعد. قم بإنشاء جولتك الأولى!",
    noFavorites: "لا توجد مفضلة بعد.",
    tapToPlace: "اضغط في أي مكان لوضع السهم",
    dashboard: "لوحة التحكم",
    dragScroll: "اسحب وتصفح",
    scene: "مشهد",
    manageArrows: "إدارة أسهم التنقل",
    toggleTheme: "الوضع الداكن/الفاتح",
    globalAudio: "الصوت العام",
    sceneAudio: "صوت المشهد",
    cleanView: "نظافة العرض",
    goToScene: "ذهاب",
    moveHotspot: "نقل السهم",
    deleteHotspot: "حذف السهم",
    label: "المسمى",
    targetScene: "المشهد المستهدف",
    cancel: "إلغاء",
    save: "حفظ",
    portrait: "رأسي",
    landscape: "أفقي",
    manageNavArrows: "إدارة الأسهم",
    noArrows: "لا توجد أسهم في هذا المشهد.",
    destination: "الوجهة: ",
    deleteArrowTooltip: "حذف السهم",
    addScene: "إضافة مشهد",
    exportProject: "تصدير المشروع",
    deleteProject: "حذف المشروع",
    exportJson: "تصدير JSON",
    deleteSceneConfirm: "هل أنت متأكد من حذف هذا المشهد؟",
    deleteArrowConfirm: "هل تريد حذف هذا السهم؟",
    scenesCount: "مشاهد",
    language: "English",
    toggleLangTooltip: "تغيير اللغة",
    settings: "الإعدادات",
    general: "عام",
    audio: "الصوت",
    orientation: "الاتجاه",
    darkMode: "الوضع الداكن",
    on: "مشغل",
    off: "مطفأ",
    mode: "الوضع",
    manual: "يدوي",
    autoRotate: "دوران تلقائي",
    defaultOrientation: "الاتجاه الافتراضي",
    appliedOnLaunch: "يتم تطبيقه عند بدء التطبيق أو عند التبديل إلى الوضع اليدوي",
    audioEnabled: "تفعيل الصوت",
    yes: "نعم",
    no: "لا",
    masterVolume: "مستوى الصوت",
    sceneTransition: "انتقال المشاهد",
    type: "النوع",
    duration: "المدة",
    autoPlay: "تشغيل تلقائي",
    spatialAudio: "صوت ثلاثي الأبعاد",
    quality: "الجودة",
    muteAll: "كتم الجميع"
  }
};

export type MediaType = 'image' | 'video';

import { SceneAudio } from './lib/audioTypes';

interface RoomImage {
  id: string;
  name: string;
  dataUrl?: string; // backwards compatibility
  blob?: Blob;      // new way
  type?: MediaType;
  thumbnail?: string; // object URL or base64
  hotspots: Hotspot[];
  audio?: SceneAudio;
  nextTransition?: any;
}


interface Project {
  id: string;
  name: string;
  images: RoomImage[];
  isFavorite: boolean;
  createdAt: number;
}

const SceneThumbnail = ({ image, className }: { image: RoomImage; className?: string }) => {
  const [thumbUrl, setThumbUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    let url: string | undefined;
    if (image) {
      if (image.thumbnail && !image.thumbnail.startsWith('blob:')) {
         url = image.thumbnail;
      } else if (image.dataUrl) {
         url = image.dataUrl;
      } else if (image.blob) {
         url = URL.createObjectURL(image.blob);
      }
    }
    setThumbUrl(url);

    return () => {
      if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    };
  }, [image]);

  if (!thumbUrl) {
    return (
      <div className={cn("absolute inset-0 flex items-center justify-center opacity-20", className)}>
          <Aperture className="w-6 h-6" />
      </div>
    );
  }

  return (
    <img 
       src={thumbUrl} 
       alt={image.name || 'Scene'} 
       loading="lazy"
       className={cn("w-full h-full object-cover", className)}
    />
  );
};

const ProjectThumbnail = ({ project }: { project: Project }) => {
  const defaultImg = project.images[0];
  const [thumbUrl, setThumbUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    let url: string | undefined;
    if (defaultImg) {
      if (defaultImg.thumbnail && !defaultImg.thumbnail.startsWith('blob:')) {
         url = defaultImg.thumbnail;
      } else if (defaultImg.dataUrl) {
         url = defaultImg.dataUrl;
      } else if (defaultImg.blob) {
         url = URL.createObjectURL(defaultImg.blob);
      }
    }
    setThumbUrl(url);

    return () => {
      if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    };
  }, [defaultImg]);

  if (!thumbUrl) {
    return (
      <div className="absolute inset-0 flex items-center justify-center opacity-20">
          <Aperture className="w-10 h-10" />
      </div>
    );
  }

  return (
    <img 
       src={thumbUrl} 
       alt={project.name} 
       loading="lazy"
       className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
    />
  );
};

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [isProjectsLoaded, setIsProjectsLoaded] = useState(false);
  const [currentTab, setCurrentTab] = useState<'all' | 'favorites'>('all');
  const [viewerKey, setViewerKey] = useState(0);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteConfirmSceneId, setDeleteConfirmSceneId] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [isCaptureModeOpen, setIsCaptureModeOpen] = useState(false);
  const [transitionEditorHotspotId, setTransitionEditorHotspotId] = useState<string | null>(null);
  const [galleryTransitionEditorId, setGalleryTransitionEditorId] = useState<string | null>(null);

  const handleAddSceneFromCapture = async (dataUrl: string) => {
      setIsLoading(true);
      try {
          const res = await fetch(dataUrl);
          const blob = await res.blob();
          
          const newImage: RoomImage = {
            id: Math.random().toString(36).substr(2, 9),
            name: `360_Capture_${new Date().getHours()}${new Date().getMinutes()}`,
            blob: blob,
            type: 'image',
            thumbnail: URL.createObjectURL(blob), // keep memory usage in mind
            hotspots: []
          };
          
          if (!activeProjectId) {
             const newProjectId = Math.random().toString(36).substr(2, 9);
             const newProject: Project = {
                 id: newProjectId,
                 name: `360 Capture Project`,
                 images: [newImage],
                 isFavorite: false,
                 createdAt: Date.now()
             };
             setProjects(prev => {
                const next = [...prev, newProject];
                set('vt_projects', next).catch(console.error);
                return next;
             });
             setActiveProjectId(newProjectId);
             setActiveImageId(newImage.id);
          } else {
             setProjects(prev => {
                const next = prev.map(p => {
                    if (p.id === activeProjectId) {
                        return { ...p, images: [...p.images, newImage] };
                    }
                    return p;
                });
                set('vt_projects', next).catch(console.error);
                return next;
             });
             setActiveImageId(newImage.id);
          }
      } catch (err) {
        console.error("Capture add failure", err);
      }
      setIsLoading(false);
      setIsCaptureModeOpen(false);
  };

  const executeDeleteScene = (e: React.MouseEvent, sceneId: string) => {
    e.stopPropagation();
    e.preventDefault();
    const activeProject = projects.find(p => p.id === activeProjectId);
    if (!activeProject) return;

    const updatedImages = activeProject.images.filter(img => img.id !== sceneId);

    setProjects(prev => {
      const next = prev.map(p => p.id === activeProjectId ? { ...p, images: updatedImages } : p);
      set('vt_projects', next).catch(console.error);
      return next;
    });

    setDeleteConfirmSceneId(null);
    if (activeImageId === sceneId) {
      setActiveImageId(updatedImages.length > 0 ? updatedImages[0].id : null);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        let savedProjects = await get('vt_projects');
        if (!savedProjects) {
          const lsProjects = localStorage.getItem('vt_projects');
          if (lsProjects) {
            savedProjects = JSON.parse(lsProjects);
            localStorage.removeItem('vt_projects');
            await set('vt_projects', savedProjects);
          } else {
            const lsImages = localStorage.getItem('vt_images');
            if (lsImages) {
              const parsed = JSON.parse(lsImages);
              if (parsed && parsed.length > 0) {
                savedProjects = [{
                  id: 'legacy-project',
                  name: 'Imported Tour',
                  images: parsed,
                  isFavorite: false,
                  createdAt: Date.now()
                }];
                await set('vt_projects', savedProjects);
              }
            }
          }
        }
        
        if (savedProjects) {
            setProjects(savedProjects);
        }
        
      } catch (e) {
         console.error("Failed to load projects", e);
      } finally {
         setIsProjectsLoaded(true);
      }
    };
    loadData();
  }, []);

  const [isLoading, setIsLoading] = useState(false);
  const [isFading, setIsFading] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isCleanMode, setIsCleanMode] = useState(false);
  const [language, setLanguage] = useState<Lang>(() => (localStorage.getItem('vt_language') as Lang) || 'ar');
  const t = TRANSLATIONS[language];

  useEffect(() => {
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
    localStorage.setItem('vt_language', language);
  }, [language]);

  const [orientationMode, setOrientationMode] = useState<'manual' | 'auto'>(() => (localStorage.getItem('vt_orientation_mode') as 'manual' | 'auto') || 'manual');
  const [defaultOrientation, setDefaultOrientation] = useState<'landscape' | 'portrait'>(() => (localStorage.getItem('vt_default_orientation') as 'landscape' | 'portrait') || 'landscape');
  const [currentOrientation, setCurrentOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
     let mounted = true;
     const applyOrientation = async (mode: 'manual' | 'auto', target: 'landscape' | 'portrait') => {
        if (mode === 'manual') {
           try {
               if (screen.orientation && 'lock' in screen.orientation) {
                   await (screen.orientation as any).lock(target);
               }
           } catch (e) {
               console.warn("Screen orientation lock failed", e);
           }
           try {
               const lockOrientation = (screen as any).lockOrientation || (screen as any).mozLockOrientation || (screen as any).msLockOrientation;
               if (lockOrientation) lockOrientation.call(screen, target);
           } catch (e) {
               console.warn("Vendor lock failed", e);
           }
           try {
               (window as any).AndroidBridge?.setOrientation?.(target);
               (window as any).webkit?.messageHandlers?.setOrientation?.postMessage(target);
           } catch(e) {
               console.warn("Native bridge failed", e);
           }
           if (mounted) setCurrentOrientation(target);
        } else {
           try {
               if (screen.orientation && 'unlock' in screen.orientation) {
                   screen.orientation.unlock();
               }
           } catch (e) {
               console.warn("Screen orientation unlock failed", e);
           }
           try {
               const unlockOrientation = (screen as any).unlockOrientation || (screen as any).mozUnlockOrientation || (screen as any).msUnlockOrientation;
               if (unlockOrientation) unlockOrientation.call(screen);
           } catch (e) {
               console.warn("Vendor unlock failed", e);
           }
           try {
               (window as any).AndroidBridge?.setOrientation?.('auto');
               (window as any).webkit?.messageHandlers?.setOrientation?.postMessage('auto');
           } catch(e) {
               console.warn("Native bridge unlock failed", e);
           }
           if (mounted) {
              const isLand = window.innerWidth > window.innerHeight;
              setCurrentOrientation(isLand ? 'landscape' : 'portrait');
           }
        }
     };

     applyOrientation(orientationMode, defaultOrientation);

     const handleResize = () => {
         const isLand = window.innerWidth > window.innerHeight;
         if (mounted) setCurrentOrientation(isLand ? 'landscape' : 'portrait');
     };

     window.addEventListener('resize', handleResize);
     return () => {
         mounted = false;
         window.removeEventListener('resize', handleResize);
     };
  }, [orientationMode, defaultOrientation]);

  const toggleScreenOrientation = async () => {
      if (orientationMode === 'auto') return;
      const nextTarget = currentOrientation === 'landscape' ? 'portrait' : 'landscape';
      try {
          if (screen.orientation && 'lock' in screen.orientation) {
              await (screen.orientation as any).lock(nextTarget);
          }
      } catch (e) {
          console.warn("Screen orientation lock failed", e);
      }
      try {
          const lockOrientation = (screen as any).lockOrientation || (screen as any).mozLockOrientation || (screen as any).msLockOrientation;
          if (lockOrientation) lockOrientation.call(screen, nextTarget);
      } catch (e) {
          console.warn("Vendor lock failed", e);
      }
      try {
          (window as any).AndroidBridge?.setOrientation?.(nextTarget);
          (window as any).webkit?.messageHandlers?.setOrientation?.postMessage(nextTarget);
      } catch(e) {
          console.warn("Native bridge failed", e);
      }
      setCurrentOrientation(nextTarget);
      setDefaultOrientation(nextTarget);
      localStorage.setItem('vt_default_orientation', nextTarget);
      setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
  };
  
  // Viewer state
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ThreeViewer | null>(null);
  const pendingTransitionRef = useRef<any>(null); // To pass transition info to loadScene
  const [isGyroEnabled, setIsGyroEnabled] = useState(false);
  
  // Editor State
  const [isAddingHotspot, setIsAddingHotspot] = useState(false);
  const [movingHotspotId, setMovingHotspotId] = useState<string | null>(null);
  const [isArrowPanelOpen, setIsArrowPanelOpen] = useState(false);
  const [focusedHotspotId, setFocusedHotspotId] = useState<string | null>(null);
  const [hotspotPromptPosition, setHotspotPromptPosition] = useState<{ x: number, y: number, vector: THREE.Vector3 } | null>(null);
  const [newHotspotLabel, setNewHotspotLabel] = useState('');
  const [newHotspotTarget, setNewHotspotTarget] = useState('');
  
  // Audio state
  const [activeAudioSceneId, setActiveAudioSceneId] = useState<string | null>(null);

  // Auto-Save
  useEffect(() => {
    if (!isProjectsLoaded) return;
    const saveState = setTimeout(async () => {
      try {
        await set('vt_projects', projects);
        if (activeProjectId) localStorage.setItem('vt_activeProjectId', activeProjectId);
        else localStorage.removeItem('vt_activeProjectId');
        
        if (activeImageId) localStorage.setItem('vt_activeImageId', activeImageId);
        else localStorage.removeItem('vt_activeImageId');

        if (viewerRef.current) {
          const { lon, lat } = viewerRef.current.getCameraRotation();
          localStorage.setItem('vt_lastPos', JSON.stringify({ lon, lat }));
        }
      } catch (e) {
          setErrorMsg('Storage error! Cannot save changes permanently.');
      }
    }, 1000);
    return () => clearTimeout(saveState);
  }, [projects, activeProjectId, activeImageId, isFading, isProjectsLoaded]);

  const activeProject = projects.find(p => p.id === activeProjectId);
  const activeImage = activeProject?.images.find(img => img.id === activeImageId);
  const currentImages = activeProject?.images || [];

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);
  
  // Audio Autoplay Policy Handler
  useEffect(() => {
    const handleFirstInteraction = () => {
       const ctx = AudioEngine.getContext();
       if (!ctx || ctx.state === 'suspended') {
           AudioEngine.init();
           if (activeImage?.audio) {
               AudioEngine.playSceneAudio(activeImage.audio);
           }
       }
       window.removeEventListener('pointerdown', handleFirstInteraction);
       window.removeEventListener('keydown', handleFirstInteraction);
    };
    window.addEventListener('pointerdown', handleFirstInteraction);
    window.addEventListener('keydown', handleFirstInteraction);
    return () => {
       window.removeEventListener('pointerdown', handleFirstInteraction);
       window.removeEventListener('keydown', handleFirstInteraction);
    };
  }, [activeImage?.audio]);

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

    let currentMediaUrl = '';

    const loadScene = async () => {
      if (!activeImage) return;

      const transition = pendingTransitionRef.current;
      pendingTransitionRef.current = null;
      
      const requiresFallbackFade = !transition || transition.type === 'fade';

      setIsTransitioning(true);
      if (requiresFallbackFade) {
         setIsFading(true); 
         await new Promise(r => setTimeout(r, 100)); // wait for black overlay
      }
      
      setIsLoading(true);
      setErrorMsg(null);
      try {
        let mediaUrl = activeImage.dataUrl || '';
        if (activeImage.blob) {
            mediaUrl = URL.createObjectURL(activeImage.blob);
            currentMediaUrl = mediaUrl;
        }

        await viewerRef.current?.loadMedia(mediaUrl, activeImage.type || 'image', transition ? transition : undefined);
        
        let waitTime = 100;
        if (transition && transition.type !== 'fade') {
             waitTime = transition.duration * 1000;
        }

        setTimeout(() => {
            const mappedHotspots = activeImage.hotspots.map((hp) => {
              const targetIdx = currentImages.findIndex(i => i.id === hp.targetImageId);
              return {
                 ...hp,
                 displayLabel: hp.label || (targetIdx !== -1 ? `مشهد ${targetIdx + 1}` : 'مشهد')
              };
            });
            viewerRef.current?.setHotspots(mappedHotspots);
            setIsTransitioning(false);
        }, waitTime);
        
        // Handle audio for this scene
        if (activeImage.audio) {
            AudioEngine.playSceneAudio(activeImage.audio);
        } else {
            AudioEngine.stopSceneAudio();
        }

      } catch (err) {
        console.error(err);
        setErrorMsg('Failed to load media.');
        setIsTransitioning(false);
      } finally {
        setIsLoading(false);
        requestAnimationFrame(() => {
          if (requiresFallbackFade) {
             setIsFading(false);
          }
        });
      }
    };

    loadScene();

    // Hotspot & Compass sync loop (60fps UI update) - Optimized with direct DOM updates to avoid React re-renders
    let animationFrame: number;
    const updateUIState = () => {
      if (viewerRef.current) {
        const positions = viewerRef.current.getHotspotScreenPositions();
        for (const pos of positions) {
          const el = document.getElementById(`hotspot-${pos.id}`);
          if (el) {
            if (pos.visible) {
              el.style.left = `${pos.x}px`;
              el.style.top = `${pos.y}px`;
              el.style.display = 'block';
            } else {
              el.style.display = 'none';
            }
          }
        }

        const { lon, lat } = viewerRef.current.getCameraRotation();
        const compassEl = document.getElementById('compass-icon');
        if (compassEl) {
           compassEl.style.transform = `rotate(${Math.round(lon)}deg)`;
        }
        
        // Update audio spatial position based on camera orientation
        const yaw = THREE.MathUtils.degToRad(lon);
        const pitch = THREE.MathUtils.degToRad(lat);
        AudioEngine.updateCameraPosition(yaw, pitch);
      }
      animationFrame = requestAnimationFrame(updateUIState);
    };
    updateUIState();

    return () => {
      cancelAnimationFrame(animationFrame);
      if (currentMediaUrl) {
          URL.revokeObjectURL(currentMediaUrl);
      }
    };
  }, [activeImageId, viewerKey]); // Trigger re-render only when ID or key changes

  // Keep hotspots in sync if they are edited while looking at the image
  useEffect(() => {
    if (viewerRef.current && activeImage && !isFading) {
      const mappedHotspots = activeImage.hotspots.map((hp) => {
        const targetIdx = currentImages.findIndex(i => i.id === hp.targetImageId);
        return {
           ...hp,
           displayLabel: hp.label || (targetIdx !== -1 ? `مشهد ${targetIdx + 1}` : 'مشهد')
        };
      });
      viewerRef.current.setHotspots(mappedHotspots);
    }
  }, [projects, activeProjectId, activeImageId, isFading]);

  const updateHotspotLabel = (hotspotId: string, newLabel: string) => {
    setProjects(prev => {
      const next = prev.map(p => {
        if (p.id === activeProjectId) {
          return {
            ...p,
            images: p.images.map(img => {
              if (img.id === activeImageId) {
                return {
                  ...img,
                  hotspots: img.hotspots.map(hp => hp.id === hotspotId ? { ...hp, label: newLabel } : hp)
                };
              }
              return img;
            })
          };
        }
        return p;
      });
      set('vt_projects', next).catch(console.error);
      return next;
    });
  };

  const updateGalleryTransition = (sceneId: string, newTransition: any) => {
    setProjects(prev => {
      const next = prev.map(p => {
        if (p.id === activeProjectId) {
          return {
            ...p,
            images: p.images.map(img => {
              if (img.id === sceneId) {
                return { ...img, nextTransition: newTransition };
              }
              return img;
            })
          };
        }
        return p;
      });
      set('vt_projects', next).catch(console.error);
      return next;
    });
  };

  const updateHotspotTransition = (hotspotId: string, newTransition: any) => {
    setProjects(prev => {
      const next = prev.map(p => {
        if (p.id === activeProjectId) {
          return {
            ...p,
            images: p.images.map(img => {
              if (img.id === activeImageId) {
                return {
                  ...img,
                  hotspots: img.hotspots.map(hp => hp.id === hotspotId ? { ...hp, transition: newTransition } : hp)
                };
              }
              return img;
            })
          };
        }
        return p;
      });
      set('vt_projects', next).catch(console.error);
      return next;
    });
  };

  const deleteHotspot = (hotspotId: string) => {
    if (!window.confirm(t.deleteArrowConfirm)) return;
    setProjects(prev => {
      const next = prev.map(p => {
        if (p.id === activeProjectId) {
          return {
            ...p,
            images: p.images.map(img => {
              if (img.id === activeImageId) {
                return {
                  ...img,
                  hotspots: img.hotspots.filter(hp => hp.id !== hotspotId)
                };
              }
              return img;
            })
          };
        }
        return p;
      });
      set('vt_projects', next).catch(console.error);
      return next;
    });
  };

  const [draggedHotspotId, setDraggedHotspotId] = useState<string | null>(null);

  const handleArrowDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.effectAllowed = "move";
    setTimeout(() => setDraggedHotspotId(id), 0);
  };
  const handleArrowDragEnter = (e: React.DragEvent, id: string) => {
     if (draggedHotspotId && draggedHotspotId !== id) {
       setProjects(prev => {
          const next = prev.map(p => {
            if (p.id === activeProjectId) {
               return {
                 ...p,
                 images: p.images.map(img => {
                    if (img.id === activeImageId) {
                       const newHotspots = [...img.hotspots];
                       const draggedIdx = newHotspots.findIndex(h => h.id === draggedHotspotId);
                       const targetIdx = newHotspots.findIndex(h => h.id === id);
                       if (draggedIdx > -1 && targetIdx > -1) {
                         const [draggedItem] = newHotspots.splice(draggedIdx, 1);
                         newHotspots.splice(targetIdx, 0, draggedItem);
                       }
                       return { ...img, hotspots: newHotspots };
                    }
                    return img;
                 })
               };
            }
            return p;
          });
          set('vt_projects', next).catch(console.error);
          return next;
       });
     }
  };
  const handleArrowDragEnd = () => {
    setDraggedHotspotId(null);
  };

  const [isToolbarOpen, setIsToolbarOpen] = useState(false);
  const [isToolbarExpanded, setIsToolbarExpanded] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [toolOrder, setToolOrder] = useState<string[]>(() => {
      try {
          const parsed = JSON.parse(localStorage.getItem('vt_tool_order') || 'null');
          if (parsed) {
             if (!parsed.includes('transition')) parsed.push('transition');
             if (!parsed.includes('audio')) parsed.push('audio');
          }
          return parsed || ['audio', 'capture', 'arrows', 'transition', 'exportZip', 'exportJson', 'screenshot', 'orientation', 'gyroscope', 'reload', 'resetView', 'settings'];
      } catch {
          return ['audio', 'capture', 'arrows', 'transition', 'exportZip', 'exportJson', 'screenshot', 'orientation', 'gyroscope', 'reload', 'resetView', 'settings'];
      }
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, isNewProject: boolean = false) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setIsLoading(true);
    const newImages: RoomImage[] = [];
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');
        if (!isImage && !isVideo) continue;
        
        try {
          let blob: Blob;
          let thumbnail = '';
          
          if (isImage) {
             const compressedBlob = await compressImage(file);
             blob = compressedBlob;
             // create a tiny thumbnail
             thumbnail = URL.createObjectURL(compressedBlob); // We will manage this lifecycle or just use small compressed image
          } else {
             blob = file;
             thumbnail = ''; // We can add video thumbnail later or leave blank
          }

          newImages.push({
            id: Math.random().toString(36).substr(2, 9),
            name: file.name.split('.')[0],
            blob: blob,
            type: isImage ? 'image' : 'video',
            thumbnail: thumbnail,
            hotspots: []
          });
        } catch (e) {
          console.error("Failed to process file", e);
        }
    }

    if (newImages.length > 0) {
      if (isNewProject || !activeProjectId) {
         const newProjectId = Math.random().toString(36).substr(2, 9);
         const newProject: Project = {
             id: newProjectId,
             name: `Tour ${projects.length + 1}`,
             images: newImages,
             isFavorite: false,
             createdAt: Date.now()
         };
         setProjects(prev => [...prev, newProject]);
         setActiveProjectId(newProjectId);
         setActiveImageId(newImages[0].id);
      } else {
         setProjects(prev => prev.map(p => {
             if (p.id === activeProjectId) {
                 return { ...p, images: [...p.images, ...newImages] };
             }
             return p;
         }));
         if (!activeImageId) {
             setActiveImageId(newImages[0].id);
         }
      }
    }
    setIsLoading(false);
    e.target.value = '';
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (viewerRef.current) {
      if (movingHotspotId) {
        const pos = viewerRef.current.getUnprojectedPosition(e.clientX, e.clientY);
        setProjects(prev => {
          const next = prev.map(p => {
             if (p.id === activeProjectId) {
                return {
                   ...p,
                   images: p.images.map(img => {
                      if (img.id === activeImageId) {
                         return {
                            ...img,
                            hotspots: img.hotspots.map(hp => hp.id === movingHotspotId ? { ...hp, position: pos } : hp)
                         };
                      }
                      return img;
                   })
                };
             }
             return p;
          });
          set('vt_projects', next).catch(console.error);
          return next;
        });
        setMovingHotspotId(null);
        return;
      }
      
      if (isAddingHotspot) {
        const pos = viewerRef.current.getUnprojectedPosition(e.clientX, e.clientY);
        setHotspotPromptPosition({
          x: e.clientX,
          y: e.clientY,
          vector: pos
        });
        setIsAddingHotspot(false);
      }
    }
  };

  const saveHotspot = () => {
    if (!activeProjectId || !activeImageId || !hotspotPromptPosition || !newHotspotTarget) return;
    
    const newHotspot: Hotspot = {
      id: Math.random().toString(36).substr(2, 9),
      position: hotspotPromptPosition.vector,
      targetImageId: newHotspotTarget,
      label: newHotspotLabel
    };

    setProjects(prev => prev.map(p => {
      if (p.id === activeProjectId) {
         return {
           ...p,
           images: p.images.map(img => {
             if (img.id === activeImageId) {
               return { ...img, hotspots: [...img.hotspots, newHotspot] };
             }
             return img;
           })
         };
      }
      return p;
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

  const forceReloadProject = () => {
    if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
    }
    setViewerKey(prev => prev + 1);
  };

  const captureScreenshot = () => {
      if (viewerRef.current) {
          const dataUrl = viewerRef.current.captureScreenshot();
          saveAs(dataUrl, `screenshot-${Date.now()}.png`);
      }
  };

  const exportJSON = async () => {
      if (!activeProject) return;
      setIsLoading(true);
      try {
          const exportData = {
              id: activeProject.id,
              name: activeProject.name,
              createdAt: activeProject.createdAt,
              images: await Promise.all(activeProject.images.map(async (img) => {
                 let audioData = img.audio ? { ...img.audio } : undefined;
                 if (audioData && audioData.fileBlob) {
                     // @ts-ignore
                     audioData.fileData = await blobToBase64(audioData.fileBlob);
                     audioData.fileBlob = null;
                 }
                 
                 return {
                 id: img.id,
                 name: img.name,
                 type: img.type || 'image',
                 hotspots: img.hotspots,
                 audio: audioData,
                 data: img.blob ? await blobToBase64(img.blob) : img.dataUrl
              }}))
          };
          const blob = new Blob([JSON.stringify(exportData)], { type: 'application/json' });
          saveAs(blob, `${activeProject.name.replace(/\s+/g, '_')}_project.json`);
      } catch (e) {
          console.error(e);
          setErrorMsg('Failed to export JSON');
      } finally {
          setIsLoading(false);
      }
  };

  const exportWebPackage = async () => {
      if (!activeProject) return;
      setIsLoading(true);
      try {
          const zip = new JSZip();
          
          // Index HTML
          zip.file("index.html", `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${activeProject.name} - Virtual Tour</title>
  <style>
     body { margin: 0; overflow: hidden; background: #000; color: white; font-family: sans-serif; }
     canvas { display: block; }
     #ui { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); display:flex; gap: 10px;}
     #hotspots { position: absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; }
     .hotspot { position: absolute; background: rgba(255,255,255,0.2); backdrop-filter: blur(4px); padding: 5px 10px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.4); transform: translate(-50%, -50%); cursor: pointer; pointer-events: auto; white-space: nowrap; font-size: 12px; transition: 0.2s;}
     .hotspot:hover { background: rgba(255,255,255,0.4); scale: 1.1; }
     button { padding: 10px 20px; border-radius: 8px; border: none; background: rgba(255,255,255,0.2); color: white; cursor: pointer; backdrop-filter: blur(10px); }
     button:hover { background: rgba(255,255,255,0.4); }
  </style>
  <script type="importmap">
    {
      "imports": {
        "three": "https://unpkg.com/three@0.160.0/build/three.module.js"
      }
    }
  </script>
</head>
<body>
  <div id="ui"></div>
  <div id="hotspots"></div>
  <script type="module" src="app.js"></script>
</body>
</html>`);

          // Prepare data
          const scenesData = await Promise.all(activeProject.images.map(async img => {
              const extension = img.type === 'video' ? 'mp4' : 'jpg'; // simplified
              const filename = `assets/${img.id}.${extension}`;
              if (img.blob) {
                  zip.file(filename, img.blob);
              } else if (img.dataUrl) {
                  const base64Data = img.dataUrl.split(',')[1];
                  zip.file(filename, base64Data, {base64: true});
              }
              
              let audioConfig = undefined;
              if (img.audio) {
                 audioConfig = { ...img.audio };
                 if (audioConfig.fileBlob) {
                     const audioExt = audioConfig.file.split('.').pop() || 'mp3';
                     const audioFilename = `assets/audio_${img.id}.${audioExt}`;
                     zip.file(audioFilename, audioConfig.fileBlob);
                     audioConfig.file = audioFilename;
                     audioConfig.fileBlob = null;
                 }
              }

              return {
                  id: img.id,
                  name: img.name,
                  file: filename,
                  type: img.type || 'image',
                  hotspots: img.hotspots,
                  audio: audioConfig
              };
          }));

          zip.file("scenes.json", JSON.stringify(scenesData, null, 2));

          // App JS
          zip.file("app.js", `import * as THREE from 'three';
let scenes = [];
let currentSceneIndex = 0;
let scene, camera, renderer, sphere, videoEl;
const hotspotsContainer = document.getElementById('hotspots');

async function init() {
    const res = await fetch('scenes.json');
    scenes = await res.json();
    
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.insertBefore(renderer.domElement, document.body.firstChild);

    const ui = document.getElementById('ui');
    scenes.forEach((s, idx) => {
        const btn = document.createElement('button');
        btn.innerText = s.name;
        btn.onclick = () => loadScene(idx);
        ui.appendChild(btn);
    });

    loadScene(0);
    animate();
}

function loadScene(idx) {
    const s = scenes[idx];
    currentSceneIndex = idx;
    if (sphere) scene.remove(sphere);
    if (videoEl) { videoEl.pause(); videoEl = null; }

    const geometry = new THREE.SphereGeometry(500, 60, 40);
    geometry.scale(-1, 1, 1);

    if (s.type === 'video') {
       videoEl = document.createElement('video');
       videoEl.src = s.file;
       videoEl.loop = true; videoEl.muted = true; videoEl.playsInline = true;
       videoEl.play();
       const texture = new THREE.VideoTexture(videoEl);
       const material = new THREE.MeshBasicMaterial({ map: texture });
       sphere = new THREE.Mesh(geometry, material);
       scene.add(sphere);
    } else {
       new THREE.TextureLoader().load(s.file, (tex) => {
           tex.colorSpace = THREE.SRGBColorSpace;
           const material = new THREE.MeshBasicMaterial({ map: tex });
           sphere = new THREE.Mesh(geometry, material);
           scene.add(sphere);
       });
    }
}

// Basic controls
let isDragging = false;
let lon = 0, lat = 0;
let startX = 0, startY = 0;

window.onpointerdown = (e) => { 
  if(e.target.tagName === 'BUTTON' || e.target.className === 'hotspot') return;
  isDragging = true; startX = e.clientX; startY = e.clientY; 
};
window.onpointermove = (e) => {
   if (!isDragging) return;
   lon += (startX - e.clientX) * 0.1;
   lat += (e.clientY - startY) * 0.1;
   startX = e.clientX; startY = e.clientY;
};
window.onpointerup = () => { isDragging = false; };
window.onresize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
};

function animate() {
    requestAnimationFrame(animate);
    lat = Math.max(-85, Math.min(85, lat));
    const phi = THREE.MathUtils.degToRad(90 - lat);
    const theta = THREE.MathUtils.degToRad(lon);
    
    camera.target = new THREE.Vector3(
        500 * Math.sin(phi) * Math.cos(theta),
        500 * Math.cos(phi),
        500 * Math.sin(phi) * Math.sin(theta)
    );
    camera.lookAt(camera.target);
    renderer.render(scene, camera);

    updateHotspots();
}

function updateHotspots() {
    hotspotsContainer.innerHTML = '';
    const s = scenes[currentSceneIndex];
    if(!s || !s.hotspots) return;

    camera.updateMatrixWorld();
    const widthHalf = 0.5 * window.innerWidth;
    const heightHalf = 0.5 * window.innerHeight;

    s.hotspots.forEach(hp => {
        const vector = new THREE.Vector3(hp.position.x, hp.position.y, hp.position.z);
        vector.project(camera);
        if (vector.z < 1.0) {
            const x = (vector.x * widthHalf) + widthHalf;
            const y = -(vector.y * heightHalf) + heightHalf;
            
            const div = document.createElement('div');
            div.className = 'hotspot';
            div.style.left = x + 'px';
            div.style.top = y + 'px';
            div.innerText = hp.label || 'Go';
            div.onclick = () => {
                const targetIdx = scenes.findIndex(sc => sc.id === hp.targetImageId);
                if(targetIdx !== -1) loadScene(targetIdx);
            };
            hotspotsContainer.appendChild(div);
        }
    });
}

init();`);

          const content = await zip.generateAsync({type: "blob"});
          saveAs(content, `${activeProject.name.replace(/\s+/g, '_')}_package.zip`);
      } catch (e) {
          console.error(e);
          setErrorMsg('Failed to create web package');
      } finally {
          setIsLoading(false);
      }
  };

  const handleImportJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    try {
        const text = await file.text();
        const json = JSON.parse(text);
        if (!json.images) throw new Error("Invalid project file");
        
        const newImages = await Promise.all(json.images.map(async (img: any) => {
            let blob: Blob | undefined = undefined;
            let thumbnail = '';
            if (img.data && img.data.startsWith('data:')) {
                blob = await base64ToBlob(img.data);
                if (img.type !== 'video') {
                    thumbnail = URL.createObjectURL(blob);
                }
            }
            return {
                id: img.id,
                name: img.name,
                type: img.type || 'image',
                blob: blob,
                thumbnail: thumbnail,
                dataUrl: !blob ? img.data : undefined,
                hotspots: img.hotspots || []
            }
        }));

        const newProject: Project = {
            id: '_' + Math.random().toString(36).substr(2, 9),
            name: json.name + ' (Imported)',
            createdAt: Date.now(),
            isFavorite: false,
            images: newImages as RoomImage[]
        };
        setProjects(prev => [...prev, newProject]);
    } catch (err) {
        console.error(err);
        setErrorMsg("Failed to import JSON");
    } finally {
        setIsLoading(false);
    }
  };

  const handleResetStorage = async () => {
    localStorage.clear();
    await clear();
    setProjects([]);
    setActiveProjectId(null);
    setActiveImageId(null);
    setResetConfirm(false);
    AudioEngine.stopSceneAudio();
  };

  const executeDeleteProject = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    setProjects(prev => {
        const next = prev.filter(p => p.id !== id);
        set('vt_projects', next).catch(console.error);
        return next;
    });
    setDeleteConfirmId(null);
    if (activeProjectId === id) {
      setActiveProjectId(null);
      setActiveImageId(null);
      localStorage.removeItem('vt_activeProjectId');
      localStorage.removeItem('vt_activeImageId');
      AudioEngine.stopSceneAudio();
    }
  };

  const handleToggleFavorite = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    const nextProjects = projects.map(p => {
      if (p.id === id) {
        return { ...p, isFavorite: !p.isFavorite };
      }
      return p;
    });
    setProjects(nextProjects);
    await set('vt_projects', nextProjects);
  };

  const updateProjectName = (id: string, name: string) => {
    setProjects(prev => prev.map(p => {
      if (p.id === id) {
        return { ...p, name };
      }
      return p;
    }));
  };

  const openProject = (project: Project) => {
    setActiveProjectId(project.id);
    if (!project.images.find(i => i.id === activeImageId)) {
       setActiveImageId(project.images[0]?.id || null);
    }
  };

  // --- Dashboard / Project List UI ---
  const renderProjectCard = (project: Project) => {
    return (
        <div key={project.id} className={cn("group flex flex-col relative rounded-2xl border overflow-hidden transition-all hover:shadow-xl", isDarkMode ? "bg-zinc-900 border-white/10" : "bg-white border-neutral-200")}>
            <div className="aspect-video bg-neutral-200 dark:bg-zinc-800 relative cursor-pointer flex-shrink-0" onClick={() => openProject(project)}>
                <ProjectThumbnail project={project} />
                <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors" />
                
                <div className="absolute top-3 right-3 flex gap-2 z-10" onMouseLeave={() => setDeleteConfirmId(null)}>
                    <button onClick={(e) => handleToggleFavorite(e, project.id)} className="p-2 backdrop-blur-md bg-black/30 rounded-full hover:bg-black/50 transition-colors">
                        <Star className={cn("w-4 h-4", project.isFavorite ? "text-yellow-500 fill-yellow-500" : "text-white")} />
                    </button>
                    {deleteConfirmId === project.id ? (
                        <button onClick={(e) => executeDeleteProject(e, project.id)} className="px-3 py-1.5 backdrop-blur-md bg-red-600 rounded-full hover:bg-red-700 transition-colors text-white text-xs font-bold shadow-lg">
                            Confirm
                        </button>
                    ) : (
                        <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); setDeleteConfirmId(project.id); }} className="p-2 backdrop-blur-md bg-black/30 rounded-full hover:bg-red-500 transition-colors text-white">
                            <Trash2 className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>
            <div className="p-4 flex flex-col flex-grow">
                <input 
                    value={project.name}
                    onChange={(e) => updateProjectName(project.id, e.target.value)}
                    className="font-bold text-lg bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-1 -ml-1 text-slate-900 dark:text-white"
                    onClick={(e) => e.stopPropagation()}
                />
                <p className="text-xs opacity-60 font-medium mt-1 text-slate-600 dark:text-zinc-400" dir="ltr">
                    {project.images.length} {t.scenesCount} • {new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(project.createdAt))}
                </p>
            </div>
        </div>
    );
  };

  if (!isProjectsLoaded) {
    return (
      <div className={cn("min-h-screen flex flex-col items-center justify-center p-4 transition-colors", isDarkMode ? "bg-zinc-950 text-white" : "bg-neutral-50 text-slate-900")}>
        <div className="animate-spin text-blue-500 mb-4">
          <RefreshCw className="w-8 h-8" />
        </div>
        <p className="font-medium opacity-70">{t.loading}</p>
      </div>
    );
  }

  if (!activeProjectId) {
    const favoriteProjects = projects.filter(p => p.isFavorite);
    const sortedProjects = [...projects].sort((a, b) => b.createdAt - a.createdAt);

    return (
      <div className={cn("min-h-screen p-4 md:p-8 transition-colors", isDarkMode ? "bg-zinc-950 text-white" : "bg-neutral-50 text-slate-900")}>
        <header className="flex justify-between items-center mb-12 max-w-6xl mx-auto">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-500">
              {t.virtualTours}
            </h1>
            <div className="flex gap-4 items-center">
                 <button onClick={() => setIsSettingsOpen(true)} className="p-2 border border-black/10 dark:border-white/10 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors shadow-sm">
                  <Settings className="w-5 h-5" />
                 </button>
                 {projects.length > 0 && (
                     resetConfirm ? (
                         <button onClick={handleResetStorage} onMouseLeave={() => setResetConfirm(false)} className="text-xs font-bold text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-full shadow-lg">{t.confirmClear}</button>
                     ) : (
                         <button onClick={() => setResetConfirm(true)} className="text-xs font-bold text-red-500 hover:text-red-400 px-3 py-1.5 border border-red-500/20 rounded-full">{t.clearAll}</button>
                     )
                 )}
            </div>
        </header>

        <main className="max-w-6xl mx-auto space-y-8">
            
            <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between bg-blue-50 dark:bg-blue-900/10 p-6 md:p-8 rounded-[2rem] border border-blue-100 dark:border-blue-900/30">
               <div>
                  <h2 className="text-xl md:text-2xl font-bold mb-2">{t.createTour}</h2>
                  <p className="text-sm opacity-70">{t.uploadDesc}</p>
               </div>
               <div className="flex flex-wrap gap-3">
                 <label className="flex-shrink-0 cursor-pointer bg-white dark:bg-zinc-800 hover:bg-neutral-50 dark:hover:bg-zinc-700 border border-neutral-200 dark:border-zinc-700 px-6 py-3.5 rounded-2xl font-bold flex items-center gap-2 transition-all shadow-sm">
                   <Upload className="w-5 h-5" /> Import JSON
                   <input type="file" className="hidden" accept="application/json,.json" onChange={handleImportJSON} />
                 </label>
                 <label className="flex-shrink-0 cursor-pointer bg-blue-600 hover:bg-blue-500 text-white px-6 py-3.5 rounded-2xl font-bold flex items-center gap-2 transition-all shadow-lg hover:shadow-blue-500/25">
                   <Plus className="w-5 h-5" /> New Project
                   <input type="file" className="hidden" accept="image/*,video/mp4,video/webm" multiple onChange={(e) => handleFileUpload(e, true)} />
                 </label>
               </div>
            </div>

            <div className="flex gap-4 border-b border-neutral-200 dark:border-zinc-800 pb-px">
                <button 
                  onClick={() => setCurrentTab('all')}
                  className={cn("pb-2 font-bold transition-all border-b-2 px-1", currentTab === 'all' ? "text-blue-500 border-blue-500" : "text-neutral-500 border-transparent hover:text-neutral-700 dark:hover:text-neutral-300")}
                >
                  <span className="flex items-center gap-2"><LayoutGrid className="w-4 h-4" /> {t.allProjects}</span>
                </button>
                <button 
                  onClick={() => setCurrentTab('favorites')}
                  className={cn("pb-2 font-bold transition-all border-b-2 px-1", currentTab === 'favorites' ? "text-yellow-500 border-yellow-500" : "text-neutral-500 border-transparent hover:text-neutral-700 dark:hover:text-neutral-300")}
                >
                  <span className="flex items-center gap-2"><Star className="w-4 h-4" /> {t.favorites}</span>
                </button>
            </div>

            <section>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {currentTab === 'all' && sortedProjects.map(renderProjectCard)}
                    {currentTab === 'favorites' && favoriteProjects.map(renderProjectCard)}
                </div>
                
                {currentTab === 'all' && projects.length === 0 && (
                    <div className="text-center py-24 opacity-50 flex flex-col items-center">
                        <Aperture className="w-16 h-16 mb-4 opacity-20" />
                        <p className="font-medium">{t.noProjects}</p>
                    </div>
                )}
                {currentTab === 'favorites' && favoriteProjects.length === 0 && (
                    <div className="text-center py-24 opacity-50 flex flex-col items-center">
                        <Star className="w-16 h-16 mb-4 opacity-20" />
                        <p className="font-medium">{t.noFavorites}</p>
                    </div>
                )}
            </section>
        </main>
        
        {isSettingsOpen && (
           <SettingsModal 
             onClose={() => setIsSettingsOpen(false)} 
             language={language}
             setLanguage={setLanguage}
             isDarkMode={isDarkMode}
             setIsDarkMode={setIsDarkMode}
             orientationMode={orientationMode}
             setOrientationMode={setOrientationMode}
             defaultOrientation={defaultOrientation}
             setDefaultOrientation={setDefaultOrientation}
             t={t}
           />
        )}
      </div>
    );
  }

  // --- Viewer UI ---
  return (
    <div className={cn("relative w-full h-screen overflow-hidden flex flex-col font-sans", isDarkMode ? "bg-black text-white" : "bg-neutral-100 text-slate-900")}>
      
      {/* 3D Canvas Container */}
      <div 
        ref={containerRef} 
        className={cn("absolute inset-0 touch-none", (isAddingHotspot || movingHotspotId) ? "!cursor-crosshair" : "cursor-grab")}
        onMouseDown={() => { if (!isAddingHotspot && !movingHotspotId && containerRef.current) containerRef.current.style.cursor = 'grabbing'; }}
        onMouseUp={() => { if (!isAddingHotspot && !movingHotspotId && containerRef.current) containerRef.current.style.cursor = 'grab'; }}
        onClick={handleCanvasClick}
      />

      {/* Empty State Overlay */}
      {currentImages.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none bg-black/40 backdrop-blur-sm">
             <Aperture className="w-16 h-16 text-white/20 mb-4 animate-pulse" />
             <h2 className="text-xl font-bold text-white/70">No scenes in this project</h2>
             <p className="text-sm text-white/50 mt-2 text-center max-w-sm">Use the <Plus className="inline w-4 h-4" /> button below to upload your first 360° image or video.</p>
          </div>
      )}

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

      {/* Static Map UI (Mini Map Overlay) - Top Right */}
      {!isCleanMode && (
         <div className="absolute top-4 right-4 z-40 pointer-events-auto pr-0 rtl:pl-0">
           <div className="bg-black/30 backdrop-blur-xl border border-white/10 rounded-2xl p-3 shadow-2xl flex flex-col items-center min-w-[110px] transform hover:scale-105 transition-transform duration-300">
             <div className="text-[10px] font-black text-white/70 mb-3 uppercase tracking-[0.2em]">{t.map || 'Map'}</div>
             <div className="flex flex-wrap gap-2 justify-center max-w-[160px]">
               {currentImages.map((img, i) => (
                 <button
                   key={img.id}
                   onClick={() => setActiveImageId(img.id)}
                   title={img.name}
                   className={cn(
                     "w-3 h-3 rounded-full transition-all duration-300 shadow-inner block",
                     activeImageId === img.id 
                       ? "bg-blue-500 scale-125 ring-2 ring-blue-500/30" 
                       : "bg-white/40 hover:bg-white/80 hover:scale-110"
                   )}
                 />
               ))}
             </div>
             
             {/* Compass Integrated horizontally below map dots */}
             <div className="mt-4 flex flex-col items-center gap-1 border-t border-white/10 pt-3 w-full">
               <div className="w-8 h-8 rounded-full border border-white/20 bg-black/40 shadow-inner flex flex-col items-center justify-center relative">
                 <div className="text-[7px] font-black absolute top-1 text-white/50">N</div>
                 <Navigation 
                    id="compass-icon"
                    className="w-4 h-4 text-blue-400 absolute transition-transform" 
                    style={{ transitionDuration: '100ms' }} 
                 />
               </div>
             </div>
             <button onClick={() => setIsSettingsOpen(true)} className="absolute -right-2 -top-2 w-6 h-6 bg-blue-600 hover:bg-blue-500 text-white rounded-full flex items-center justify-center shadow-lg transform hover:scale-110 transition-transform cursor-pointer" title="Orientation Settings">
                <Settings className="w-3.5 h-3.5" />
             </button>
           </div>
         </div>
      )}

      {/* Floating Side Toolbar */}
      <div className={cn("absolute top-1/2 -translate-y-1/2 left-4 z-40 flex items-center transition-all duration-500 pointer-events-auto", isCleanMode ? "-translate-x-full opacity-0" : "translate-x-0 opacity-100")}>
         {/* Toggle Button */}
         <button 
           onClick={() => setIsToolbarOpen(!isToolbarOpen)}
           className="w-10 h-10 rounded-full bg-blue-600 border-[1.5px] border-white/20 shadow-[-5px_0_20px_rgba(37,99,235,0.4)] flex items-center justify-center relative z-10 text-white hover:bg-blue-500 hover:scale-105 active:scale-95 transition-all outline-none"
           title="Tools Toolbar"
         >
           <LayoutGrid className={cn("w-5 h-5 transition-transform duration-500", isToolbarOpen ? "rotate-90 scale-90 opacity-80" : "rotate-0 scale-100 opacity-100")} />
         </button>

         {/* Toolbar Panel */}
         <div className={cn(
             "absolute top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 bg-black/60 backdrop-blur-2xl border border-white/10 p-2 rounded-2xl shadow-2xl transition-all duration-500",
             isToolbarOpen ? "left-14 opacity-100 scale-100" : "left-4 opacity-0 scale-95 pointer-events-none"
         )}>
           <div className="w-1.5 h-6 bg-white/20 rounded-full mb-1" /> {/* Handle indicator */}
           
           <Reorder.Group 
             axis="y" 
             values={toolOrder} 
             onReorder={setToolOrder} 
             className={cn("flex flex-col gap-2 max-h-[60vh] overflow-y-auto no-scrollbar pb-2 px-1", isToolbarExpanded && "w-64")}
           >
             {isToolbarExpanded && (
                <button onClick={() => setIsToolbarExpanded(false)} className="self-end p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors mb-2">
                   <ChevronRight className="w-5 h-5 rotate-180" />
                </button>
             )}
             {!isToolbarExpanded && (
                <button onClick={() => setIsToolbarExpanded(true)} className="self-center p-2 text-white/50 hover:text-white/80 rounded-full transition-colors mb-2">
                   <ChevronRight className="w-5 h-5" />
                </button>
             )}
             
             {toolOrder.map(id => {
                const baseBtn = "p-3 transition-all flex items-center justify-center relative backdrop-blur-md cursor-grab active:cursor-grabbing border text-white";
                const activeStyle = "bg-blue-600 border-blue-400 text-white shadow-[0_0_15px_rgba(59,130,246,0.8)]";
                const inactiveStyle = "bg-white/10 hover:bg-white/20 border-white/10 text-white/90";
                
                let content;
                let onClick;
                let className;
                let toolTitle;

                if (id === 'capture') {
                    content = <><Camera className="w-5 h-5 shrink-0" /><RefreshCw className="w-2.5 h-2.5 absolute bottom-2.5 ltr:right-2.5 rtl:left-2.5" /></>;
                    onClick = () => setIsCaptureModeOpen(true);
                    className = cn(baseBtn, isCaptureModeOpen ? activeStyle : inactiveStyle);
                    toolTitle = "Capture 360°";
                } else if(id === 'arrows') {
                    content = <Edit2 className="w-5 h-5 shrink-0" />;
                    onClick = () => setIsArrowPanelOpen(!isArrowPanelOpen);
                    className = cn(baseBtn, isArrowPanelOpen ? activeStyle : inactiveStyle);
                    toolTitle = t.manageArrows;
                } else if(id === 'transition') {
                    content = <Aperture className="w-5 h-5 shrink-0" />;
                    onClick = () => {
                       // Only toggle if we have an active image
                       if (activeImageId) {
                         setGalleryTransitionEditorId(galleryTransitionEditorId === activeImageId ? null : activeImageId);
                       }
                    };
                    className = cn(baseBtn, galleryTransitionEditorId === activeImageId ? activeStyle : inactiveStyle);
                    toolTitle = "Transition Settings";
                } else if(id === 'exportZip') {
                    content = <Package className="w-5 h-5 shrink-0" />;
                    onClick = exportWebPackage;
                    className = cn(baseBtn, inactiveStyle);
                    toolTitle = "Export Web Package (ZIP)";
                } else if(id === 'exportJson') {
                    content = <FileJson className="w-5 h-5 shrink-0" />;
                    onClick = exportJSON;
                    className = cn(baseBtn, inactiveStyle);
                    toolTitle = "Export Project (JSON)";
                } else if(id === 'screenshot') {
                    content = <Camera className="w-5 h-5 shrink-0" />;
                    onClick = captureScreenshot;
                    className = cn(baseBtn, inactiveStyle);
                    toolTitle = "Capture Screenshot";
                } else if(id === 'settings') {
                    content = <Settings className="w-5 h-5 shrink-0" />;
                    onClick = () => setIsSettingsOpen(true);
                    className = cn(baseBtn, isSettingsOpen ? activeStyle : inactiveStyle);
                    toolTitle = t.settings;
                } else if(id === 'orientation') {
                    content = <Smartphone className={cn("w-5 h-5 shrink-0 transition-transform duration-300", currentOrientation === 'landscape' ? "-rotate-90" : "rotate-0")} />;
                    onClick = () => orientationMode === 'auto' ? null : toggleScreenOrientation();
                    className = cn(baseBtn, orientationMode === 'auto' ? "opacity-30 cursor-not-allowed bg-black/50" : (orientationMode === 'manual' ? activeStyle : inactiveStyle));
                    toolTitle = orientationMode === 'auto' ? "Auto-rotate is enabled — change it from settings" : "Toggle Screen Orientation";
                } else if(id === 'gyroscope') {
                    content = <Smartphone className="w-5 h-5 shrink-0" />;
                    onClick = toggleGyroscope;
                    className = cn(baseBtn, isGyroEnabled ? activeStyle : inactiveStyle);
                    toolTitle = "Toggle Gyroscope";
                } else if(id === 'reload') {
                    content = <RefreshCw className="w-5 h-5 shrink-0 transition-transform duration-500 hover:rotate-180" />;
                    onClick = forceReloadProject;
                    className = cn(baseBtn, inactiveStyle);
                    toolTitle = "Reload Viewer (Fixes Lag)";
                } else if(id === 'resetView') {
                    content = <Crosshair className="w-5 h-5 shrink-0 transition-transform duration-500 hover:scale-110" />;
                    onClick = () => viewerRef.current?.resetView();
                    className = cn(baseBtn, inactiveStyle);
                    toolTitle = "Reset Camera View";
                } else if(id === 'audio') {
                    content = <Music className="w-5 h-5 shrink-0" />;
                    onClick = () => setActiveAudioSceneId(activeImageId);
                    className = cn(baseBtn, activeAudioSceneId === activeImageId ? activeStyle : inactiveStyle);
                    toolTitle = "Audio Settings";
                } else {
                    return null;
                }

                return (
                    <DraggableToolItem
                        key={id}
                        id={id}
                        content={content}
                        onClick={onClick}
                        className={className}
                        toolTitle={toolTitle}
                        toolOrder={toolOrder}
                        isExpanded={isToolbarExpanded}
                    />
                );
             })}
           </Reorder.Group>
         </div>
      </div>

      {/* Top Navigation Bar */}
      <div className={cn("absolute top-0 w-full p-4 flex flex-col gap-4 z-30 pointer-events-none transition-all duration-500", isCleanMode ? "-translate-y-full opacity-0" : "translate-y-0 opacity-100")}>
        
        {movingHotspotId && (
          <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg font-bold text-sm pointer-events-auto flex items-center gap-2 z-50 animate-pulse">
            <Crosshair className="w-4 h-4" /> {t.tapToPlace}
            <button onClick={() => setMovingHotspotId(null)} className="ml-2 hover:bg-black/20 rounded-full p-1"><X className="w-4 h-4" /></button>
          </div>
        )}
        
        <div className="pointer-events-auto flex items-center gap-2 self-start">
          <button onClick={() => { setActiveProjectId(null); viewerRef.current?.destroy(); viewerRef.current = null; AudioEngine.stopSceneAudio(); }} className="bg-black/30 hover:bg-black/50 backdrop-blur-md px-3 py-1.5 border border-white/10 rounded-xl shadow-xl flex items-center gap-1.5 text-white transition-colors text-[10px] font-bold">
             <Home className="w-3.5 h-3.5" /> {t.dashboard}
          </button>
          <div className="bg-black/30 backdrop-blur-md px-3 py-1.5 border border-white/10 rounded-xl shadow-xl hidden sm:block">
            <h2 className="text-base font-bold tracking-tight text-white drop-shadow-md">{activeImage?.name || '360 Viewer'}</h2>
            <p className="text-[10px] font-medium text-white/70 drop-shadow-md flex items-center gap-1">
              <CornerUpLeft className="w-2.5 h-2.5" /> {t.dragScroll}
            </p>
          </div>
        </div>
      </div>

      {/* Render Subscribed Hotspots */}
      {!isFading && !isTransitioning && activeImage?.hotspots.map(rawHs => {
        const targetIdx = currentImages.findIndex(i => i.id === rawHs.targetImageId);
        const displayLabel = rawHs.label || (targetIdx !== -1 ? `مشهد ${targetIdx + 1}` : 'مشهد');
        const isFocused = focusedHotspotId === rawHs.id;
        
        return (
           <div 
            key={rawHs.id}
            id={`hotspot-${rawHs.id}`}
            className={cn("absolute transform -translate-x-1/2 -translate-y-1/2 z-20 cursor-pointer transition-all", isFocused ? "z-30" : "group")}
            style={{ display: 'none' }} // positioning handled by updateUIState
            onClick={(e) => {
              e.stopPropagation();
              if (isAddingHotspot) return;
              if (isFocused) {
                 setFocusedHotspotId(null);
              } else {
                 setFocusedHotspotId(rawHs.id);
              }
            }}
          >
            <div className="relative flex items-center justify-center">
              <div className="absolute w-8 h-8 bg-white/20 rounded-full animate-ping pointer-events-none" />
              <div className={cn("w-8 h-8 flex items-center justify-center text-white rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.5)] border border-white/30 transition-all duration-300", isFocused ? "bg-blue-600 scale-125 border-white shadow-blue-500/50" : "bg-white/10 backdrop-blur-md group-hover:scale-110 group-hover:bg-blue-500 group-hover:border-blue-400")}>
                <ChevronRight className="w-4 h-4 drop-shadow-md pointer-events-none" />
              </div>
            </div>
            
            {/* Tooltip / Context Menu */}
            <div 
               className={cn("absolute top-10 left-1/2 -translate-x-1/2 transition-all duration-300 bg-black/80 border border-white/10 text-white rounded-xl backdrop-blur-md shadow-2xl",
                 isFocused ? "opacity-100 translate-y-0 pointer-events-auto p-3 flex flex-col gap-2 min-w-[160px]" : "opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 px-3 py-1.5 whitespace-nowrap pointer-events-none font-bold tracking-wide"
               )}
               onClick={e => e.stopPropagation()}
            >
              {isFocused ? (
                <>
                  <input 
                    value={rawHs.label}
                    autoFocus
                    placeholder={displayLabel}
                    onChange={(e) => updateHotspotLabel(rawHs.id, e.target.value)}
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-400"
                  />
                  <div className="flex items-center gap-1 mt-1">
                    <button onClick={(e) => { 
                       e.stopPropagation(); 
                       pendingTransitionRef.current = rawHs.transition || { type: 'crossfade', duration: 1.0, easing: 'easeInOut' };
                       setActiveImageId(rawHs.targetImageId); 
                       setFocusedHotspotId(null); 
                    }} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs py-1.5 rounded-lg transition-colors flex justify-center items-center gap-1 font-bold">
                       <Navigation className="w-3 h-3" /> {t.goToScene}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setTransitionEditorHotspotId(transitionEditorHotspotId === rawHs.id ? null : rawHs.id); }} className={cn("p-1.5 rounded-lg transition-colors", transitionEditorHotspotId === rawHs.id ? "bg-white/30 text-white" : "bg-black/40 hover:bg-black/60 text-white")} title="Transition settings">
                       <Settings className="w-3 h-3" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setMovingHotspotId(rawHs.id); setFocusedHotspotId(null); setTransitionEditorHotspotId(null); }} className="p-1.5 bg-black/40 hover:bg-black/60 text-white rounded-lg transition-colors" title={t.moveHotspot}>
                       <Crosshair className="w-3 h-3" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); deleteHotspot(rawHs.id); setFocusedHotspotId(null); setTransitionEditorHotspotId(null); }} className="p-1.5 bg-red-600/80 hover:bg-red-500 text-white rounded-lg transition-colors" title={t.deleteHotspot}>
                       <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  {/* Transferred to global modal */}
                </>
              ) : (
                displayLabel
              )}
            </div>
          </div>
        );
      })}

      {/* Add Hotspot Prompt Modal */}
      {hotspotPromptPosition && (
        <div 
          className="absolute z-50 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl border border-neutral-200 dark:border-white/10 shadow-2xl rounded-2xl p-4 w-64 animate-in zoom-in-95"
          style={{ 
            left: Math.min(hotspotPromptPosition.x, window.innerWidth - 260), 
            top: Math.min(hotspotPromptPosition.y, window.innerHeight - 250) 
          }}
        >
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
              <Crosshair className="w-4 h-4 text-blue-500" /> Save Portal
            </h3>
            <button onClick={() => setHotspotPromptPosition(null)} className="text-zinc-500 hover:text-zinc-800 dark:hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-500 dark:text-zinc-400 mb-1.5 block uppercase tracking-wider">{t.label}</label>
              <input 
                 autoFocus
                 type="text" 
                 value={newHotspotLabel} 
                 onChange={e => setNewHotspotLabel(e.target.value)}
                 className="w-full px-3 py-2.5 bg-white dark:bg-black/50 border border-neutral-300 dark:border-white/10 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white shadow-inner transition-shadow"
                 placeholder="Auto (مشهد 1, مشهد 2...)"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 dark:text-zinc-400 mb-1.5 block uppercase tracking-wider">{t.targetScene}</label>
              <select 
                value={newHotspotTarget} 
                onChange={e => setNewHotspotTarget(e.target.value)}
                className="w-full px-3 py-2.5 bg-white dark:bg-black/50 border border-neutral-300 dark:border-white/10 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white shadow-inner"
              >
                <option value="" disabled>Select destination...</option>
                {currentImages.filter(img => img.id !== activeImageId).map(img => (
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

      {/* Navigation Arrows Management Panel */}
      {isArrowPanelOpen && activeImage && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg bg-black/80 backdrop-blur-xl border border-white/20 rounded-2xl p-6 shadow-2xl flex flex-col pointer-events-auto">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
               <Navigation className="w-5 h-5 text-blue-500" /> {t.manageNavArrows}
            </h3>
            <button onClick={() => setIsArrowPanelOpen(false)} className="text-zinc-400 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="space-y-3 max-h-[50vh] overflow-y-auto no-scrollbar">
            {activeImage.hotspots.length === 0 ? (
              <p className="text-zinc-400 text-sm text-center py-4">{t.noArrows}</p>
            ) : (
              activeImage.hotspots.map((hp) => {
                 const targetIdx = currentImages.findIndex(img => img.id === hp.targetImageId);
                 const targetName = targetIdx !== -1 ? currentImages[targetIdx].name : 'Unknown';
                 const defaultName = targetIdx !== -1 ? `مشهد ${targetIdx + 1}` : 'مشهد';
                 return (
                    <div 
                      key={hp.id} 
                      className="flex items-center gap-3 bg-white/5 border border-white/10 p-3 rounded-xl hover:bg-white/10 transition-colors"
                      draggable
                      onDragStart={(e) => handleArrowDragStart(e, hp.id)}
                      onDragEnter={(e) => handleArrowDragEnter(e, hp.id)}
                      onDragEnd={handleArrowDragEnd}
                      onDragOver={(e) => e.preventDefault()}
                    >
                       <div className="cursor-grab active:cursor-grabbing p-1 group">
                         <GripVertical className="w-5 h-5 text-zinc-500 group-hover:text-zinc-300" />
                       </div>
                       <div className="flex-grow flex flex-col">
                          <input 
                            value={hp.label || ''}
                            placeholder={defaultName}
                            onChange={(e) => updateHotspotLabel(hp.id, e.target.value)}
                            className="bg-transparent border-b border-transparent focus:border-white/20 focus:outline-none focus:ring-0 text-white font-bold text-sm w-full py-1"
                          />
                          <span className="text-xs text-zinc-400 font-medium">{t.destination} {targetName}</span>
                       </div>
                       <button onClick={() => deleteHotspot(hp.id)} className="p-2 bg-red-500/10 hover:bg-red-500/30 text-red-400 hover:text-red-300 rounded-lg transition-colors ml-2" title={t.deleteArrowTooltip}>
                          <Trash2 className="w-4 h-4" />
                       </button>
                    </div>
                 );
              })
            )}
          </div>
        </div>
      )}

      {/* Bottom Control Bar */}
      <div className={cn("absolute bottom-0 w-full p-4 z-30 transition-all duration-500 bg-gradient-to-t pointer-events-none flex flex-col items-center", isDarkMode ? "from-black via-black/60 to-transparent" : "from-black/40 via-black/10 to-transparent", isCleanMode ? "translate-y-full opacity-0" : "translate-y-0 opacity-100")}>
        
        {/* Editor Main Actions */}
        {currentImages.length > 1 && (
          <div className="pointer-events-auto mb-4">
              <button 
                onClick={() => setIsAddingHotspot(!isAddingHotspot)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full text-white font-bold text-xs transition-all shadow-xl border border-white/20",
                  isAddingHotspot ? "bg-red-500 hover:bg-red-400 scale-105" : "bg-black/40 hover:bg-black/60 backdrop-blur-md"
                )}
              >
                {isAddingHotspot ? <X className="w-3.5 h-3.5" /> : <Crosshair className="w-3.5 h-3.5" />}
                {isAddingHotspot ? 'Cancel Portal' : 'Add New Portal'}
              </button>
          </div>
        )}

        {/* Global Audio Waveform Meter */}
        <div className="w-full max-w-4xl mb-4 pointer-events-none opacity-80 mix-blend-screen px-4">
          <WaveformMeter />
        </div>

        <div className="flex items-center gap-3 overflow-x-auto pb-2 w-full max-w-4xl no-scrollbar pointer-events-auto">
          {/* Add more images */}
          <label className={cn("flex-shrink-0 w-16 h-12 rounded-xl border-2 border-dashed flex items-center justify-center cursor-pointer transition-all backdrop-blur-md shadow-xl", isDarkMode ? "border-white/20 bg-black/40 hover:border-white/50 hover:bg-black/60" : "border-white/50 bg-white/20 hover:bg-white/40")}>
            <Plus className="w-4 h-4 text-white" />
            <input type="file" className="hidden" accept="image/*,video/mp4,video/webm" multiple onChange={(e) => handleFileUpload(e, false)} />
          </label>
          
          <div className="w-px h-6 bg-white/20 mx-1" />

          {/* Gallery Items */}
          {currentImages.map((img, index) => (
            <React.Fragment key={img.id}>
              <div className="relative group flex-shrink-0" onMouseLeave={() => setDeleteConfirmSceneId(null)}>
                <button 
                  onClick={() => {
                     // Check if clicking exactly next scene, apply transition
                     const currentIndex = currentImages.findIndex(i => i.id === activeImageId);
                     if (currentIndex !== -1 && index === currentIndex + 1) {
                        const tr = currentImages[currentIndex].nextTransition;
                        if (tr) pendingTransitionRef.current = tr;
                     }
                     setActiveImageId(img.id);
                  }}
                  className={cn(
                    "relative block w-20 h-14 rounded-xl overflow-hidden border-2 transition-all shadow-xl",
                    activeImageId === img.id ? "border-blue-500 ring-2 ring-blue-500/20 scale-105 z-10" : "border-white/10 hover:border-white/40 opacity-80 hover:opacity-100"
                  )}
                >
                  <SceneThumbnail image={img} className="bg-black/50" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-1.5 transition-opacity">
                    <span className="text-[9px] font-bold text-white truncate max-w-full drop-shadow-md pr-3">{img.name}</span>
                  </div>
                  {activeImageId === img.id && <MapPin className="absolute top-1 left-1 w-2.5 h-2.5 text-blue-400 drop-shadow-md" />}
                </button>

                {deleteConfirmSceneId === img.id ? (
                  <button
                    onClick={(e) => executeDeleteScene(e, img.id)}
                    className="absolute -top-2 -right-2 z-20 px-2 flex items-center justify-center rounded-full bg-red-600/90 text-white transition-all hover:bg-red-700 shadow-md border-[1.5px] border-white text-[10px] h-6 font-bold"
                  >
                    Confirm
                  </button>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); setDeleteConfirmSceneId(img.id); }}
                    className="absolute -top-2 -right-2 z-20 w-6 h-6 flex items-center justify-center rounded-full bg-red-600/90 text-white transition-all hover:bg-red-700 hover:scale-110 active:scale-95 shadow-md border-[1.5px] border-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={(e) => { 
                     e.stopPropagation(); 
                     if (img.audio && img.id === activeImageId) {
                        if (isAudioMuted) {
                           AudioEngine.enableAudio();
                           setIsAudioMuted(false);
                        } else {
                           AudioEngine.disableAudio();
                           setIsAudioMuted(true);
                        }
                     } else {
                        // fallback if no audio configured or clicking another scene's button
                        setActiveAudioSceneId(img.id);
                     }
                  }}
                  className={cn(
                     "absolute -top-2 left-2 z-20 w-6 h-6 flex items-center justify-center rounded-full transition-all shadow-md border-[1.5px] border-white active:scale-95",
                     img.audio ? (activeImageId === img.id && !isAudioMuted ? "bg-blue-500/90 text-white animate-pulse" : "bg-blue-600/90 text-white hover:bg-blue-700") : "bg-neutral-800/90 text-white/50 hover:bg-neutral-700 hover:text-white"
                  )}
                >
                  {img.audio ? (activeImageId === img.id && isAudioMuted ? <VolumeX className="w-3 h-3 text-white/50" /> : <Volume2 className="w-3 h-3" />) : <Plus className="w-3 h-3" />}
                </button>
              </div>

              {index < currentImages.length - 1 && (
                <div className="relative flex-shrink-0 flex items-center justify-center -mx-1 z-30">
                  <button 
                     onClick={() => setGalleryTransitionEditorId(galleryTransitionEditorId === img.id ? null : img.id)}
                     className={cn("w-6 h-6 rounded-full flex items-center justify-center transition-all border border-white/20 shadow-md", galleryTransitionEditorId === img.id ? "bg-white/40" : (img.nextTransition ? "bg-blue-500/80 hover:bg-blue-500" : "bg-black/50 hover:bg-white/20"))}
                     title="Add Transition between scenes"
                  >
                     {img.nextTransition ? <Settings className="w-3.5 h-3.5 text-white" /> : <Plus className="w-3.5 h-3.5 text-white" />}
                  </button>
                  
                  {/* Transferred to global modal */}
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
      
      {/* Clean Mode Toggle */}
      <div className="absolute top-20 ltr:left-4 rtl:right-4 ltr:right-auto rtl:left-auto z-40 pointer-events-auto">
        <button
          onClick={() => setIsCleanMode(!isCleanMode)}
          className={cn("p-2 border backdrop-blur-md text-white rounded-full transition-all shadow-xl group", isCleanMode ? "bg-white/10 hover:bg-white/20 border-white/20" : "bg-black/30 hover:bg-black/50 border-white/10")}
          title={isCleanMode ? "Show UI" : "Hide UI"}
        >
          {isCleanMode ? <Eye className="w-4 h-4 opacity-50 group-hover:opacity-100" /> : <EyeOff className="w-4 h-4 opacity-70 group-hover:opacity-100" />}
        </button>
      </div>

      {isCaptureModeOpen && (
        <Capture360Modal 
          onClose={() => setIsCaptureModeOpen(false)} 
          onAddScene={handleAddSceneFromCapture} 
        />
      )}

      {activeAudioSceneId && (
        <SceneAudioPanel
          sceneId={activeAudioSceneId}
          sceneName={activeProject?.images.find(img => img.id === activeAudioSceneId)?.name || 'Scene'}
          initialAudio={activeProject?.images.find(img => img.id === activeAudioSceneId)?.audio}
          onClose={() => setActiveAudioSceneId(null)}
          onSave={(audioConfig) => {
            setProjects(prev => prev.map(p => {
              if (p.id === activeProjectId) {
                return {
                  ...p,
                  images: p.images.map(img => {
                    if (img.id === activeAudioSceneId) {
                      return { ...img, audio: audioConfig };
                    }
                    return img;
                  })
                };
              }
              return p;
            }));
            
            // Immediately apply if we are on this scene
            if (activeAudioSceneId === activeImageId && audioConfig) {
               AudioEngine.playSceneAudio(audioConfig);
            } else if (activeAudioSceneId === activeImageId && !audioConfig) {
               AudioEngine.stopSceneAudio();
            }
          }}
        />
      )}

      {galleryTransitionEditorId && (
         <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm rtl:dir-rtl ltr:dir-ltr" onClick={() => setGalleryTransitionEditorId(null)}>
            <div className="bg-neutral-900 border border-white/10 shadow-2xl rounded-2xl w-full max-w-sm text-white flex flex-col pointer-events-auto" onClick={e => e.stopPropagation()}>
               <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5 rounded-t-2xl">
                  <h3 className="font-bold text-sm">Transition Settings</h3>
                  <button onClick={() => setGalleryTransitionEditorId(null)} className="p-1 hover:bg-white/10 rounded-full transition-colors"><X className="w-4 h-4" /></button>
               </div>
               
               {(() => {
                 const editingImg = currentImages.find(i => i.id === galleryTransitionEditorId);
                 if (!editingImg) return null;
                 return (
                   <div className="p-5 space-y-5">
                      <div className="flex flex-col gap-2">
                         <label className="text-xs font-bold text-white/50 uppercase">Transition Type</label>
                         <select 
                             value={editingImg.nextTransition?.type || 'crossfade'} 
                             onChange={(e) => {
                                const newTrans = { ...(editingImg.nextTransition || { duration: 1.0, easing: 'easeInOut' }), type: e.target.value as any };
                                updateGalleryTransition(galleryTransitionEditorId, newTrans);
                             }}
                             className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500 cursor-pointer"
                          >
                             <option value="crossfade">Crossfade (Blend)</option>
                             <option value="fade">Fade in/out</option>
                             <option value="zoom">Zoom</option>
                             <option value="slideLeft">Slide Left</option>
                             <option value="slideRight">Slide Right</option>
                             <option value="slideUp">Slide Up</option>
                             <option value="slideDown">Slide Down</option>
                             <option value="blur">Blur Transition</option>
                             <option value="warp">Radial Warp / Lens</option>
                          </select>
                      </div>

                      <div className="flex flex-col gap-2">
                         <label className="text-xs font-bold text-white/50 uppercase flex justify-between items-center">
                            Duration
                            <span className="text-white/90 font-medium">{editingImg.nextTransition?.duration ?? 1.0}s</span>
                         </label>
                         <input 
                             type="range" step="0.1" min="0.1" max="5.0"
                             value={editingImg.nextTransition?.duration ?? 1.0}
                             onChange={(e) => {
                                const newTrans = { ...(editingImg.nextTransition || { type: 'crossfade', easing: 'easeInOut' }), duration: parseFloat(e.target.value) || 1.0 };
                                updateGalleryTransition(galleryTransitionEditorId, newTrans);
                             }}
                             className="w-full accent-blue-500"
                          />
                      </div>
                   </div>
                 );
               })()}
            </div>
         </div>
      )}

      {transitionEditorHotspotId && (
         <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm rtl:dir-rtl ltr:dir-ltr" onClick={() => setTransitionEditorHotspotId(null)}>
            <div className="bg-neutral-900 border border-white/10 shadow-2xl rounded-2xl w-full max-w-sm text-white flex flex-col pointer-events-auto" onClick={e => e.stopPropagation()}>
               <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5 rounded-t-2xl">
                  <h3 className="font-bold text-sm">Portal Transition</h3>
                  <button onClick={() => setTransitionEditorHotspotId(null)} className="p-1 hover:bg-white/10 rounded-full transition-colors"><X className="w-4 h-4" /></button>
               </div>
               
               {(() => {
                 const editingHs = activeImage?.hotspots.find(h => h.id === transitionEditorHotspotId);
                 if (!editingHs) return null;
                 return (
                   <div className="p-5 space-y-5">
                      <div className="flex flex-col gap-2">
                         <label className="text-xs font-bold text-white/50 uppercase">Transition Type</label>
                         <select 
                             value={editingHs.transition?.type || 'crossfade'} 
                             onChange={(e) => {
                                const newTrans = { ...(editingHs.transition || { duration: 1.0, easing: 'easeInOut' }), type: e.target.value as any };
                                updateHotspotTransition(transitionEditorHotspotId, newTrans);
                             }}
                             className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500 cursor-pointer"
                          >
                             <option value="crossfade">Crossfade (Blend)</option>
                             <option value="fade">Fade in/out</option>
                             <option value="zoom">Zoom</option>
                             <option value="slideLeft">Slide Left</option>
                             <option value="slideRight">Slide Right</option>
                             <option value="slideUp">Slide Up</option>
                             <option value="slideDown">Slide Down</option>
                             <option value="blur">Blur Transition</option>
                             <option value="warp">Radial Warp / Lens</option>
                          </select>
                      </div>

                      <div className="flex flex-col gap-2">
                         <label className="text-xs font-bold text-white/50 uppercase flex justify-between items-center">
                            Duration
                            <span className="text-white/90 font-medium">{editingHs.transition?.duration ?? 1.0}s</span>
                         </label>
                         <input 
                             type="range" step="0.1" min="0.1" max="5.0"
                             value={editingHs.transition?.duration ?? 1.0}
                             onChange={(e) => {
                                const newTrans = { ...(editingHs.transition || { type: 'crossfade', easing: 'easeInOut' }), duration: parseFloat(e.target.value) || 1.0 };
                                updateHotspotTransition(transitionEditorHotspotId, newTrans);
                             }}
                             className="w-full accent-blue-500"
                          />
                      </div>
                   </div>
                 );
               })()}
            </div>
         </div>
      )}

      {isSettingsOpen && (
         <SettingsModal 
           onClose={() => setIsSettingsOpen(false)} 
           language={language}
           setLanguage={setLanguage}
           isDarkMode={isDarkMode}
           setIsDarkMode={setIsDarkMode}
           orientationMode={orientationMode}
           setOrientationMode={setOrientationMode}
           defaultOrientation={defaultOrientation}
           setDefaultOrientation={setDefaultOrientation}
           t={t}
         />
      )}
    </div>
  );
}

