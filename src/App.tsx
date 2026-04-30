import React, { useState, useRef, useEffect } from 'react';
import { Upload, X, MapPin, RefreshCw, Plus, Crosshair, ChevronRight, Moon, Sun, Smartphone, CornerUpLeft, Navigation, Save, Eye, EyeOff, Home, Star, Trash2, Aperture, LayoutGrid, Download, FileJson, Camera, Package } from 'lucide-react';
import { ThreeViewer, type Hotspot } from './lib/ThreeViewer';
import * as THREE from 'three';
import { cn } from './lib/utils';
import { get, set, clear } from 'idb-keyval';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

// Helper to compress image before saving to local storage
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

export type MediaType = 'image' | 'video';

interface RoomImage {
  id: string;
  name: string;
  dataUrl?: string; // backwards compatibility
  blob?: Blob;      // new way
  type?: MediaType;
  thumbnail?: string; // object URL or base64
  hotspots: Hotspot[];
}


interface Project {
  id: string;
  name: string;
  images: RoomImage[];
  isFavorite: boolean;
  createdAt: number;
}

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
  const [resetConfirm, setResetConfirm] = useState(false);

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
        
        const actProjId = localStorage.getItem('vt_activeProjectId');
        if (actProjId) setActiveProjectId(actProjId);
        
        const actImgId = localStorage.getItem('vt_activeImageId');
        if (actImgId) setActiveImageId(actImgId);
        
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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isCleanMode, setIsCleanMode] = useState(false);
  
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
      setIsFading(true); // Start fade to black
      
      // Wait for fade transition duration before loading
      await new Promise(r => setTimeout(r, 100));
      
      setIsLoading(true);
      setErrorMsg(null);
      try {
        let mediaUrl = activeImage.dataUrl || '';
        if (activeImage.blob) {
            mediaUrl = URL.createObjectURL(activeImage.blob);
            currentMediaUrl = mediaUrl;
        }

        await viewerRef.current?.loadMedia(mediaUrl, activeImage.type || 'image');
        viewerRef.current?.setHotspots(activeImage.hotspots);
      } catch (err) {
        console.error(err);
        setErrorMsg('Failed to load media.');
      } finally {
        setIsLoading(false);
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
      if (currentMediaUrl) {
          URL.revokeObjectURL(currentMediaUrl);
      }
    };
  }, [activeImageId, viewerKey]); // Trigger re-render only when ID or key changes

  // Keep hotspots in sync if they are edited while looking at the image
  useEffect(() => {
    if (viewerRef.current && activeImage && !isFading) {
      viewerRef.current.setHotspots(activeImage.hotspots);
    }
  }, [projects, activeProjectId, activeImageId, isFading]);

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
    if (!activeProjectId || !activeImageId || !hotspotPromptPosition || !newHotspotTarget) return;
    
    const newHotspot: Hotspot = {
      id: Math.random().toString(36).substr(2, 9),
      position: hotspotPromptPosition.vector,
      targetImageId: newHotspotTarget,
      label: newHotspotLabel || 'Go to scene'
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
              images: await Promise.all(activeProject.images.map(async (img) => ({
                 id: img.id,
                 name: img.name,
                 type: img.type || 'image',
                 hotspots: img.hotspots,
                 data: img.blob ? await blobToBase64(img.blob) : img.dataUrl
              })))
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
          const scenesData = activeProject.images.map(img => {
              const extension = img.type === 'video' ? 'mp4' : 'jpg'; // simplified
              const filename = `assets/${img.id}.${extension}`;
              if (img.blob) {
                  zip.file(filename, img.blob);
              } else if (img.dataUrl) {
                  const base64Data = img.dataUrl.split(',')[1];
                  zip.file(filename, base64Data, {base64: true});
              }
              return {
                  id: img.id,
                  name: img.name,
                  file: filename,
                  type: img.type || 'image',
                  hotspots: img.hotspots
              };
          });

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
                    {project.images.length} scenes • {new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(project.createdAt))}
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
        <p className="font-medium opacity-70">Loading projects...</p>
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
              Virtual Tours
            </h1>
            <div className="flex gap-4 items-center">
                 <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 border border-black/10 dark:border-white/10 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors shadow-sm">
                  {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                 </button>
                 {projects.length > 0 && (
                     resetConfirm ? (
                         <button onClick={handleResetStorage} onMouseLeave={() => setResetConfirm(false)} className="text-xs font-bold text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-full shadow-lg">Confirm Clear</button>
                     ) : (
                         <button onClick={() => setResetConfirm(true)} className="text-xs font-bold text-red-500 hover:text-red-400 px-3 py-1.5 border border-red-500/20 rounded-full">Clear All</button>
                     )
                 )}
            </div>
        </header>

        <main className="max-w-6xl mx-auto space-y-8">
            
            <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between bg-blue-50 dark:bg-blue-900/10 p-6 md:p-8 rounded-[2rem] border border-blue-100 dark:border-blue-900/30">
               <div>
                  <h2 className="text-xl md:text-2xl font-bold mb-2">Create a New Tour</h2>
                  <p className="text-sm opacity-70">Upload 360° panoramic images or videos to start building.</p>
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
                  <span className="flex items-center gap-2"><LayoutGrid className="w-4 h-4" /> All Projects</span>
                </button>
                <button 
                  onClick={() => setCurrentTab('favorites')}
                  className={cn("pb-2 font-bold transition-all border-b-2 px-1", currentTab === 'favorites' ? "text-yellow-500 border-yellow-500" : "text-neutral-500 border-transparent hover:text-neutral-700 dark:hover:text-neutral-300")}
                >
                  <span className="flex items-center gap-2"><Star className="w-4 h-4" /> Favorites</span>
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
                        <p className="font-medium">No projects yet. Create your first tour above!</p>
                    </div>
                )}
                {currentTab === 'favorites' && favoriteProjects.length === 0 && (
                    <div className="text-center py-24 opacity-50 flex flex-col items-center">
                        <Star className="w-16 h-16 mb-4 opacity-20" />
                        <p className="font-medium">No favorites yet. Mark a project as favorite to see it here!</p>
                    </div>
                )}
            </section>
        </main>
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
      <div className={cn("absolute top-0 w-full p-4 flex justify-between items-start z-30 pointer-events-none transition-all duration-500", isCleanMode ? "-translate-y-full opacity-0" : "translate-y-0 opacity-100")}>
        <div className="pointer-events-auto flex items-center gap-2">
          <button onClick={() => { setActiveProjectId(null); viewerRef.current?.destroy(); viewerRef.current = null; }} className="bg-black/30 hover:bg-black/50 backdrop-blur-md px-3 py-1.5 border border-white/10 rounded-xl shadow-xl flex items-center gap-1.5 text-white transition-colors text-[10px] font-bold">
             <Home className="w-3.5 h-3.5" /> Dashboard
          </button>
          <div className="bg-black/30 backdrop-blur-md px-3 py-1.5 border border-white/10 rounded-xl shadow-xl hidden sm:block">
            <h2 className="text-base font-bold tracking-tight text-white drop-shadow-md">{activeImage?.name || '360 Viewer'}</h2>
            <p className="text-[10px] font-medium text-white/70 drop-shadow-md flex items-center gap-1">
              <CornerUpLeft className="w-2.5 h-2.5" /> Drag & Scroll
            </p>
          </div>
        </div>
        
        <div className="flex flex-col gap-2 pointer-events-auto items-end">
           <div className="flex gap-1.5 flex-wrap justify-end">
             <button onClick={exportWebPackage} className="p-2 bg-black/30 hover:bg-black/50 border border-white/10 backdrop-blur-md text-white rounded-full transition-all shadow-xl" title="Export Web Package (ZIP)">
               <Package className="w-4 h-4" />
             </button>
             <button onClick={exportJSON} className="p-2 bg-black/30 hover:bg-black/50 border border-white/10 backdrop-blur-md text-white rounded-full transition-all shadow-xl" title="Export Project (JSON)">
               <FileJson className="w-4 h-4" />
             </button>
             <button onClick={captureScreenshot} className="p-2 bg-black/30 hover:bg-black/50 border border-white/10 backdrop-blur-md text-white rounded-full transition-all shadow-xl" title="Capture Screenshot">
               <Camera className="w-4 h-4" />
             </button>
             <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 bg-black/30 hover:bg-black/50 border border-white/10 backdrop-blur-md text-white rounded-full transition-all shadow-xl" title="Toggle Dark/Light Mode">
               {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
             </button>
             <button onClick={toggleGyroscope} className={cn("p-2 border backdrop-blur-md text-white rounded-full transition-all shadow-xl", isGyroEnabled ? "bg-blue-600 border-blue-500" : "bg-black/30 hover:bg-black/50 border-white/10")} title="Toggle Gyroscope">
               <Smartphone className="w-4 h-4" />
             </button>
             <button onClick={forceReloadProject} className="p-2 bg-blue-500 hover:bg-blue-600 border border-white/10 backdrop-blur-md text-white rounded-full transition-all shadow-xl group" title="Reload Viewer (Fixes Lag)">
               <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
             </button>
             <button onClick={() => viewerRef.current?.resetView()} className="p-2 bg-black/30 hover:bg-black/50 border border-white/10 backdrop-blur-md text-white rounded-full transition-all shadow-xl group" title="Reset Camera View">
               <Crosshair className="w-4 h-4 transition-transform duration-500" />
             </button>
           </div>
           
           {/* Static Map UI (Mini Map Overlay) */}
           <div className="bg-black/30 backdrop-blur-md border border-white/10 rounded-xl p-3 shadow-2xl flex flex-col items-center min-w-[100px]">
             <div className="text-[10px] font-bold text-white/50 mb-2 uppercase tracking-wider">Map</div>
             <div className="flex flex-wrap gap-1.5 justify-center max-w-[140px]">
               {currentImages.map((img, i) => (
                 <button
                   key={img.id}
                   onClick={() => setActiveImageId(img.id)}
                   title={img.name}
                   className={cn(
                     "w-3 h-3 rounded-full transition-all duration-300 shadow-inner",
                     activeImageId === img.id 
                       ? "bg-blue-500 scale-125 ring-2 ring-blue-500/30" 
                       : "bg-white/40 hover:bg-white/80 hover:scale-110"
                   )}
                 />
               ))}
             </div>
             
             {/* Compass Integrated horizontally below map dots */}
             <div className="mt-3 flex flex-col items-center gap-1 border-t border-white/10 pt-2 w-full">
               <div className="w-6 h-6 rounded-full border border-white/20 bg-black/20 flex flex-col items-center justify-center relative">
                 <div className="text-[6px] font-bold absolute top-0.5 text-white/50">N</div>
                 <Navigation 
                    className="w-3 h-3 text-blue-400 absolute" 
                    style={{ transform: `rotate(${Math.round(compassAngle)}deg)`, transition: 'transform 0.1s ease-out' }} 
                 />
               </div>
             </div>
           </div>
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
              <div className="absolute w-8 h-8 bg-white/20 rounded-full animate-ping" />
              <div className="w-8 h-8 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center text-white shadow-[0_4px_20px_rgba(0,0,0,0.5)] border border-white/30 transition-all duration-300 group-hover:scale-110 group-hover:bg-blue-500 group-hover:border-blue-400">
                <ChevronRight className="w-4 h-4 drop-shadow-md" />
              </div>
            </div>
            
            {/* Tooltip */}
            <div className="absolute top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-1 group-hover:translate-y-0 bg-black/80 border border-white/10 text-white text-xs px-3 py-1.5 rounded-lg whitespace-nowrap pointer-events-none backdrop-blur-md shadow-2xl font-bold tracking-wide">
              {hs.label}
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

        <div className="flex items-center gap-3 overflow-x-auto pb-2 w-full max-w-4xl no-scrollbar pointer-events-auto">
          {/* Add more images */}
          <label className={cn("flex-shrink-0 w-16 h-12 rounded-xl border-2 border-dashed flex items-center justify-center cursor-pointer transition-all backdrop-blur-md shadow-xl", isDarkMode ? "border-white/20 bg-black/40 hover:border-white/50 hover:bg-black/60" : "border-white/50 bg-white/20 hover:bg-white/40")}>
            <Plus className="w-4 h-4 text-white" />
            <input type="file" className="hidden" accept="image/*,video/mp4,video/webm" multiple onChange={(e) => handleFileUpload(e, false)} />
          </label>
          
          <div className="w-px h-6 bg-white/20 mx-1" />

          {/* Gallery Items */}
          {currentImages.map(img => (
            <button 
              key={img.id} 
              onClick={() => setActiveImageId(img.id)}
              className={cn(
                "relative group flex-shrink-0 w-20 h-14 rounded-xl overflow-hidden border-2 transition-all shadow-xl",
                activeImageId === img.id ? "border-blue-500 ring-2 ring-blue-500/20 scale-105 z-10" : "border-white/10 hover:border-white/40 opacity-80 hover:opacity-100"
              )}
            >
              <img src={img.thumbnail || img.dataUrl} alt={img.name} className="w-full h-full object-cover bg-black/50" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-1.5 transition-opacity">
                <span className="text-[9px] font-bold text-white truncate max-w-full drop-shadow-md">{img.name}</span>
              </div>
              {activeImageId === img.id && <MapPin className="absolute top-1 right-1 w-2.5 h-2.5 text-blue-400 drop-shadow-md" />}
            </button>
          ))}
        </div>
      </div>
      
      {/* Clean Mode Toggle */}
      <div className="absolute bottom-4 left-4 z-40 pointer-events-auto">
        <button
          onClick={() => setIsCleanMode(!isCleanMode)}
          className={cn("p-2 border backdrop-blur-md text-white rounded-full transition-all shadow-xl group", isCleanMode ? "bg-white/10 hover:bg-white/20 border-white/20" : "bg-black/30 hover:bg-black/50 border-white/10")}
          title={isCleanMode ? "Show UI" : "Hide UI"}
        >
          {isCleanMode ? <Eye className="w-4 h-4 opacity-50 group-hover:opacity-100" /> : <EyeOff className="w-4 h-4 opacity-70 group-hover:opacity-100" />}
        </button>
      </div>
    </div>
  );
}

