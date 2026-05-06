import * as THREE from 'three';

export interface TransitionConfig {
  type: 'crossfade' | 'fade' | 'zoom' | 'slideLeft' | 'slideRight' | 'slideUp' | 'slideDown' | 'blur' | 'warp';
  duration: number; // in seconds
  easing?: 'linear' | 'easeInOut' | 'easeOut' | 'easeIn';
}

export interface Hotspot {
  id: string;
  position: THREE.Vector3;
  targetImageId: string;
  label: string;
  displayLabel?: string;
  transition?: TransitionConfig;
}

export type ThreeViewerOptions = {
  container: HTMLElement;
  onHotspotClick?: (targetImageId: string) => void;
};

export class ThreeViewer {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private sphereMesh: THREE.Mesh | null = null;
  private oldSphereMesh: THREE.Mesh | null = null;
  private textureLoader: THREE.TextureLoader;
  private animationFrameId: number = 0;
  
  private textureCache: Map<string, THREE.Texture> = new Map();
  private sceneGroup: THREE.Group;

  private transitionState: {
     active: boolean;
     progress: number;
     config: TransitionConfig;
     startTime: number;
     startFov: number;
     startLon: number;
     startLat: number;
  } | null = null;
  
  // Controls state
  private isUserInteracting = false;
  private lon = 0;
  private lat = 0;
  private onPointerDownPointerX = 0;
  private onPointerDownPointerY = 0;
  private onPointerDownLon = 0;
  private onPointerDownLat = 0;
  private fov = 75;
  
  // Touch & Pinch Zoom
  private pinchDistance = 0;

  // Gyroscope
  private gyroEnabled = false;
  private deviceOrientation: DeviceOrientationEvent | null = null;
  private screenOrientation = window.orientation || 0;

  private hotspots: Hotspot[] = [];

  private onDeviceOrientationBound: (event: DeviceOrientationEvent) => void;
  private onPointerDownBound: (event: PointerEvent) => void;
  private onPointerMoveBound: (event: PointerEvent) => void;
  private onPointerUpBound: (event: PointerEvent) => void;
  private onTouchStartBound: (event: TouchEvent) => void;
  private onTouchMoveBound: (event: TouchEvent) => void;
  private onDocumentMouseWheelBound: (event: WheelEvent) => void;
  private onWindowResizeBound: () => void;
  private onOrientationChangeBound: () => void;

  constructor(options: ThreeViewerOptions) {
    this.container = options.container;
    
    this.scene = new THREE.Scene();
    this.sceneGroup = new THREE.Group();
    this.scene.add(this.sceneGroup);
    
    this.camera = new THREE.PerspectiveCamera(this.fov, this.container.clientWidth / this.container.clientHeight, 0.1, 1000);
    this.camera.target = new THREE.Vector3(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.container.appendChild(this.renderer.domElement);

    this.textureLoader = new THREE.TextureLoader();

    // Bind event handlers
    this.onDeviceOrientationBound = this.onDeviceOrientation.bind(this);
    this.onPointerDownBound = this.onPointerDown.bind(this);
    this.onPointerMoveBound = this.onPointerMove.bind(this);
    this.onPointerUpBound = this.onPointerUp.bind(this);
    this.onTouchStartBound = this.onTouchStart.bind(this);
    this.onTouchMoveBound = this.onTouchMove.bind(this);
    this.onDocumentMouseWheelBound = this.onDocumentMouseWheel.bind(this);
    this.onWindowResizeBound = this.onWindowResize.bind(this);
    this.onOrientationChangeBound = () => {
      this.screenOrientation = window.orientation || 0;
    };

    // Event Listeners for controls
    this.container.addEventListener('pointerdown', this.onPointerDownBound);
    this.container.addEventListener('pointermove', this.onPointerMoveBound);
    this.container.addEventListener('pointerup', this.onPointerUpBound);
    this.container.addEventListener('pointercancel', this.onPointerUpBound);
    this.container.addEventListener('wheel', this.onDocumentMouseWheelBound, { passive: false });
    
    // Touch specifically for pinch zoom
    this.container.addEventListener('touchstart', this.onTouchStartBound, { passive: false });
    this.container.addEventListener('touchmove', this.onTouchMoveBound, { passive: false });

    window.addEventListener('resize', this.onWindowResizeBound);
    window.addEventListener('orientationchange', this.onOrientationChangeBound);

    this.animate();
  }

  private videoElement: HTMLVideoElement | null = null;

  public async loadMedia(mediaUrl: string, type: 'image' | 'video' = 'image', transitionConfig?: TransitionConfig) {
    return new Promise<void>(async (resolve, reject) => {
      let texture: THREE.Texture;

      // Handle video or image loading
      if (type === 'video') {
         if (this.videoElement) {
             this.videoElement.pause();
             this.videoElement.removeAttribute('src');
             this.videoElement.load();
         }
         const video = document.createElement('video');
         video.src = mediaUrl;
         video.crossOrigin = 'anonymous';
         video.loop = true;
         video.muted = true;
         video.playsInline = true;
         
         texture = await new Promise((res, rej) => {
             video.onloadeddata = () => {
                 video.play();
                 const tex = new THREE.VideoTexture(video);
                 tex.minFilter = THREE.LinearFilter;
                 tex.magFilter = THREE.LinearFilter;
                 tex.generateMipmaps = false;
                 tex.colorSpace = THREE.SRGBColorSpace;
                 this.videoElement = video;
                 res(tex);
             };
             video.onerror = (e) => rej(e);
         });
      } else {
         if (this.textureCache.has(mediaUrl)) {
             texture = this.textureCache.get(mediaUrl)!;
         } else {
             texture = await new Promise((res, rej) => {
                 this.textureLoader.load(
                   mediaUrl,
                   (tex) => {
                     tex.minFilter = THREE.LinearMipmapLinearFilter;
                     tex.magFilter = THREE.LinearFilter;
                     tex.generateMipmaps = true;
                     tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
                     tex.colorSpace = THREE.SRGBColorSpace;
                     this.textureCache.set(mediaUrl, tex);
                     res(tex);
                   },
                   undefined,
                   (err) => rej(err)
                 );
             });
         }
      }

      // Prepare transition
      if (this.sphereMesh) {
         if (this.oldSphereMesh) {
             // Cleanup if there was an interrupted transition
             this.sceneGroup.remove(this.oldSphereMesh);
             if (this.oldSphereMesh.material instanceof THREE.Material) this.oldSphereMesh.material.dispose();
             this.oldSphereMesh.geometry.dispose();
         }
         this.oldSphereMesh = this.sphereMesh;
         
         // Make old mesh transparent to allow fading
         if (this.oldSphereMesh.material instanceof THREE.MeshBasicMaterial) {
             this.oldSphereMesh.material.transparent = true;
             this.oldSphereMesh.material.depthWrite = false;
         }
         this.oldSphereMesh.renderOrder = 1; // Render on top during crossfade
         this.oldSphereMesh.scale.setScalar(0.999); // Prevent Z-fighting
      }

      const geometry = new THREE.SphereGeometry(500, 60, 40);
      geometry.scale(-1, 1, 1);

      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0, depthWrite: false });
      this.sphereMesh = new THREE.Mesh(geometry, material);
      this.sphereMesh.renderOrder = 0;
      this.sceneGroup.add(this.sphereMesh);

      if (transitionConfig && this.oldSphereMesh) {
          this.transitionState = {
             active: true,
             progress: 0,
             config: transitionConfig,
             startTime: performance.now(),
             startFov: this.camera.fov,
             startLon: this.lon,
             startLat: this.lat
          };
      } else {
          // No transition OR first load
          this.camera.fov = 100;
          this.camera.updateProjectionMatrix();
          if (this.sphereMesh.material instanceof THREE.MeshBasicMaterial) {
              this.sphereMesh.material.opacity = 1;
              this.sphereMesh.material.transparent = false;
              this.sphereMesh.material.depthWrite = true;
          }
          if (this.oldSphereMesh) {
              this.sceneGroup.remove(this.oldSphereMesh);
              if (this.oldSphereMesh.material instanceof THREE.Material) this.oldSphereMesh.material.dispose();
              this.oldSphereMesh.geometry.dispose();
              this.oldSphereMesh = null;
          }
      }

      resolve();
    });
  }

  // Backwards compatibility
  public async loadImage(imageUrl: string) {
      return this.loadMedia(imageUrl, 'image');
  }

  public captureScreenshot(): string {
      this.renderer.render(this.scene, this.camera);
      return this.renderer.domElement.toDataURL('image/png');
  }


  public setHotspots(hotspots: Hotspot[]) {
    this.hotspots = hotspots;
  }
  
  public getHotspotScreenPositions(): { id: string; targetImageId: string; label: string; rawLabel: string; x: number; y: number; visible: boolean }[] {
    const widthHalf = 0.5 * this.container.clientWidth;
    const heightHalf = 0.5 * this.container.clientHeight;

    this.camera.updateMatrixWorld();

    return this.hotspots.map(hotspot => {
      // Ensure we clone the saved vector correctly, handling both serialized and live Vector3 instances
      const vector = hotspot.position instanceof THREE.Vector3 
        ? hotspot.position.clone() 
        : new THREE.Vector3(hotspot.position.x, hotspot.position.y, hotspot.position.z);
        
      vector.project(this.camera);

      const visible = vector.z < 1.0;

      return {
        id: hotspot.id,
        targetImageId: hotspot.targetImageId,
        label: hotspot.displayLabel || hotspot.label,
        rawLabel: hotspot.label,
        x: (vector.x * widthHalf) + widthHalf,
        y: -(vector.y * heightHalf) + heightHalf,
        visible,
      };
    });
  }

  public getUnprojectedPosition(clientX: number, clientY: number): THREE.Vector3 {
    const rect = this.container.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);
    
    if (this.sphereMesh) {
      const intersects = raycaster.intersectObject(this.sphereMesh);
      if (intersects.length > 0) {
        return intersects[0].point;
      }
    }
    
    const vector = new THREE.Vector3(x, y, 0.5);
    vector.unproject(this.camera);
    const dir = vector.sub(this.camera.position).normalize();
    return this.camera.position.clone().add(dir.multiplyScalar(400));
  }

  public getCameraRotation() {
    if (this.gyroEnabled) {
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      const lat = THREE.MathUtils.radToDeg(Math.asin(dir.y));
      const lon = THREE.MathUtils.radToDeg(Math.atan2(dir.z, dir.x));
      return { lon, lat };
    }
    return { lon: this.lon, lat: this.lat };
  }

  public setCameraRotation(lon: number, lat: number) {
    this.lon = lon;
    this.lat = lat;
  }

  public resetView() {
    this.lon = 0;
    this.lat = 0;
    this.camera.fov = 100;
    this.camera.updateProjectionMatrix();
  }

  public toggleGyro() {
    if (this.gyroEnabled) {
      this.gyroEnabled = false;
      window.removeEventListener('deviceorientation', this.onDeviceOrientationBound);
    } else {
      if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        (DeviceOrientationEvent as any).requestPermission()
          .then((permissionState: string) => {
            if (permissionState === 'granted') {
              this.gyroEnabled = true;
              window.addEventListener('deviceorientation', this.onDeviceOrientationBound);
            }
          })
          .catch(console.error);
      } else {
        this.gyroEnabled = true;
        window.addEventListener('deviceorientation', this.onDeviceOrientationBound);
      }
    }
    return this.gyroEnabled;
  }

  private onDeviceOrientation = (event: DeviceOrientationEvent) => {
    this.deviceOrientation = event;
  };

  private onPointerDown(event: PointerEvent) {
    if (event.isPrimary === false || this.gyroEnabled) return;
    this.isUserInteracting = true;
    this.onPointerDownPointerX = event.clientX;
    this.onPointerDownPointerY = event.clientY;
    this.onPointerDownLon = this.lon;
    this.onPointerDownLat = this.lat;
  }

  private onPointerMove(event: PointerEvent) {
    if (this.isUserInteracting === true && !this.gyroEnabled) {
      this.lon = (this.onPointerDownPointerX - event.clientX) * 0.1 + this.onPointerDownLon;
      this.lat = (event.clientY - this.onPointerDownPointerY) * 0.1 + this.onPointerDownLat;
    }
  }

  private onPointerUp() {
    this.isUserInteracting = false;
  }

  private onTouchStart(event: TouchEvent) {
    if (event.touches.length === 2) {
      const dx = event.touches[0].pageX - event.touches[1].pageX;
      const dy = event.touches[0].pageY - event.touches[1].pageY;
      this.pinchDistance = Math.sqrt(dx * dx + dy * dy);
    }
  }

  private onTouchMove(event: TouchEvent) {
    if (event.touches.length === 2) {
      event.preventDefault();
      const dx = event.touches[0].pageX - event.touches[1].pageX;
      const dy = event.touches[0].pageY - event.touches[1].pageY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      const delta = this.pinchDistance - dist;
      let newFov = this.camera.fov + delta * 0.05;
      newFov = Math.max(20, Math.min(100, newFov));
      this.camera.fov = newFov;
      this.camera.updateProjectionMatrix();
      
      this.pinchDistance = dist;
    }
  }

  private onDocumentMouseWheel(event: WheelEvent) {
    event.preventDefault();
    let newFov = this.camera.fov + event.deltaY * 0.05;
    newFov = Math.max(20, Math.min(100, newFov));
    this.camera.fov = newFov;
    this.camera.updateProjectionMatrix();
  }

  private onWindowResize() {
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  }

  private animate() {
    this.animationFrameId = requestAnimationFrame(this.animate.bind(this));
    this.update();
  }

  private ease(t: number, type?: string): number {
    switch(type) {
        case 'easeIn': return t * t;
        case 'easeOut': return t * (2 - t);
        case 'easeInOut': return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        case 'linear':
        default: return t;
    }
  }

  private update() {
    if (this.transitionState && this.transitionState.active && this.oldSphereMesh && this.sphereMesh) {
      const now = performance.now();
      const elapsed = (now - this.transitionState.startTime) / 1000;
      let rawProgress = elapsed / this.transitionState.config.duration;
      if (rawProgress >= 1) {
          rawProgress = 1;
          this.transitionState.active = false;
      }
      
      const p = this.ease(rawProgress, this.transitionState.config.easing);
      this.transitionState.progress = p;

      const oldMat = this.oldSphereMesh.material as THREE.MeshBasicMaterial;
      const newMat = this.sphereMesh.material as THREE.MeshBasicMaterial;

      switch(this.transitionState.config.type) {
         case 'crossfade':
            oldMat.opacity = 1 - p;
            newMat.opacity = p;
            break;
         case 'fade':
            if (p < 0.5) {
               oldMat.opacity = 1 - (p * 2);
               newMat.opacity = 0;
            } else {
               oldMat.opacity = 0;
               newMat.opacity = (p - 0.5) * 2;
            }
            break;
         case 'zoom':
            // Camera push in then pull out
            if (p < 0.5) {
               this.camera.fov = THREE.MathUtils.lerp(this.transitionState.startFov, 30, p * 2);
               oldMat.opacity = 1 - (p * 2);
               newMat.opacity = 0;
            } else {
               this.camera.fov = THREE.MathUtils.lerp(30, 100, (p - 0.5) * 2);
               oldMat.opacity = 0;
               newMat.opacity = (p - 0.5) * 2;
            }
            this.camera.updateProjectionMatrix();
            break;
         case 'slideLeft':
            this.lon = this.transitionState.startLon - p * 90;
            oldMat.opacity = 1 - p;
            newMat.opacity = p;
            break;
         case 'slideRight':
            this.lon = this.transitionState.startLon + p * 90;
            oldMat.opacity = 1 - p;
            newMat.opacity = p;
            break;
         case 'slideUp':
            this.lat = this.transitionState.startLat + p * 90;
            oldMat.opacity = 1 - p;
            newMat.opacity = p;
            break;
         case 'slideDown':
            this.lat = this.transitionState.startLat - p * 90;
            oldMat.opacity = 1 - p;
            newMat.opacity = p;
            break;
         case 'warp':
            // Extreme fisheye lens distortion
            if (p < 0.5) {
               this.camera.fov = THREE.MathUtils.lerp(this.transitionState.startFov, 160, p * 2);
               oldMat.opacity = 1 - (p * 2);
               newMat.opacity = 0;
            } else {
               this.camera.fov = THREE.MathUtils.lerp(160, 100, (p - 0.5) * 2);
               oldMat.opacity = 0;
               newMat.opacity = (p - 0.5) * 2;
            }
            this.camera.updateProjectionMatrix();
            break;
         case 'blur':
            // Proxy blur using extreme scale + fade (without custom shader fallback)
            // It mimics a dissolve/blur effect by moving the sphere and varying opacity rapidly
            oldMat.opacity = 1 - p;
            newMat.opacity = p;
            if (p < 0.5) {
               this.sceneGroup.scale.setScalar(1 + p * 0.1);
            } else {
               this.sceneGroup.scale.setScalar(1 + (1 - p) * 0.1);
            }
            break;
      }

      if (rawProgress >= 1) {
         this.sceneGroup.remove(this.oldSphereMesh);
         if (this.oldSphereMesh.material instanceof THREE.Material) this.oldSphereMesh.material.dispose();
         this.oldSphereMesh.geometry.dispose();
         this.oldSphereMesh = null;
         this.transitionState = null;
         this.sceneGroup.scale.setScalar(1);
         newMat.opacity = 1;
         newMat.depthWrite = true;
         this.camera.fov = 100;
         this.camera.updateProjectionMatrix();
      }
    }

    if (this.gyroEnabled && this.deviceOrientation) {
      // Basic Gyro mapping
      const alpha = this.deviceOrientation.alpha ? THREE.MathUtils.degToRad(this.deviceOrientation.alpha) : 0;
      const beta = this.deviceOrientation.beta ? THREE.MathUtils.degToRad(this.deviceOrientation.beta) : 0;
      const gamma = this.deviceOrientation.gamma ? THREE.MathUtils.degToRad(this.deviceOrientation.gamma) : 0;
      
      const orient = this.screenOrientation ? THREE.MathUtils.degToRad(this.screenOrientation) : 0;
      
      const euler = new THREE.Euler();
      const q0 = new THREE.Quaternion();
      const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
      
      euler.set(beta, alpha, -gamma, 'YXZ');
      this.camera.quaternion.setFromEuler(euler);
      this.camera.quaternion.multiply(q1);
      this.camera.quaternion.multiply(q0.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -orient));
    } else {
      this.lat = Math.max(-85, Math.min(85, this.lat));
      const phi = THREE.MathUtils.degToRad(90 - this.lat);
      const theta = THREE.MathUtils.degToRad(this.lon);

      const target = this.camera.target as THREE.Vector3;
      target.x = 500 * Math.sin(phi) * Math.cos(theta);
      target.y = 500 * Math.cos(phi);
      target.z = 500 * Math.sin(phi) * Math.sin(theta);

      this.camera.lookAt(target);
    }
    
    this.renderer.render(this.scene, this.camera);
  }

  public destroy() {
    cancelAnimationFrame(this.animationFrameId);
    this.container.removeEventListener('pointerdown', this.onPointerDownBound);
    this.container.removeEventListener('pointermove', this.onPointerMoveBound);
    this.container.removeEventListener('pointerup', this.onPointerUpBound);
    this.container.removeEventListener('pointercancel', this.onPointerUpBound);
    this.container.removeEventListener('wheel', this.onDocumentMouseWheelBound);
    this.container.removeEventListener('touchstart', this.onTouchStartBound);
    this.container.removeEventListener('touchmove', this.onTouchMoveBound);
    window.removeEventListener('resize', this.onWindowResizeBound);
    window.removeEventListener('orientationchange', this.onOrientationChangeBound);
    
    if (this.gyroEnabled) {
      window.removeEventListener('deviceorientation', this.onDeviceOrientationBound);
    }
    
    if (this.sphereMesh) {
      if (this.sphereMesh.material instanceof THREE.Material) {
        this.sphereMesh.material.dispose();
      }
      this.sphereMesh.geometry.dispose();
    }
    
    this.renderer.dispose();
    if (this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
