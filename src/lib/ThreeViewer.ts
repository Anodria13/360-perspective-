import * as THREE from 'three';

export interface Hotspot {
  id: string;
  position: THREE.Vector3;
  targetImageId: string;
  label: string;
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
  private textureLoader: THREE.TextureLoader;
  private animationFrameId: number = 0;
  
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

  constructor(options: ThreeViewerOptions) {
    this.container = options.container;
    
    this.scene = new THREE.Scene();
    
    this.camera = new THREE.PerspectiveCamera(this.fov, this.container.clientWidth / this.container.clientHeight, 0.1, 1000);
    this.camera.target = new THREE.Vector3(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.container.appendChild(this.renderer.domElement);

    this.textureLoader = new THREE.TextureLoader();

    // Event Listeners for controls
    this.container.addEventListener('pointerdown', this.onPointerDown.bind(this));
    this.container.addEventListener('pointermove', this.onPointerMove.bind(this));
    this.container.addEventListener('pointerup', this.onPointerUp.bind(this));
    this.container.addEventListener('pointercancel', this.onPointerUp.bind(this));
    this.container.addEventListener('wheel', this.onDocumentMouseWheel.bind(this), { passive: false });
    
    // Touch specifically for pinch zoom (pointer events don't easily give 2-finger distance in some setups without array tracking)
    this.container.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
    this.container.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });

    window.addEventListener('resize', this.onWindowResize.bind(this));
    window.addEventListener('orientationchange', () => {
      this.screenOrientation = window.orientation || 0;
    });

    this.animate();
  }

  public async loadImage(imageUrl: string) {
    return new Promise<void>((resolve, reject) => {
      this.textureLoader.load(
        imageUrl,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.minFilter = THREE.LinearMap;
          texture.generateMipmaps = true;

          if (this.sphereMesh) {
            this.scene.remove(this.sphereMesh);
            const material = this.sphereMesh.material as THREE.MeshBasicMaterial;
            if (material.map) material.map.dispose();
            material.dispose();
            this.sphereMesh.geometry.dispose();
          }

          const geometry = new THREE.SphereGeometry(500, 60, 40);
          geometry.scale(-1, 1, 1);

          const material = new THREE.MeshBasicMaterial({ map: texture });
          this.sphereMesh = new THREE.Mesh(geometry, material);
          this.scene.add(this.sphereMesh);
          
          resolve();
        },
        undefined,
        (err) => reject(err)
      );
    });
  }

  public setHotspots(hotspots: Hotspot[]) {
    this.hotspots = hotspots;
  }
  
  public getHotspotScreenPositions(): { id: string; targetImageId: string; label: string; x: number; y: number; visible: boolean }[] {
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
        label: hotspot.label,
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
    return { lon: this.lon, lat: this.lat };
  }

  public setCameraRotation(lon: number, lat: number) {
    this.lon = lon;
    this.lat = lat;
  }

  public resetView() {
    this.lon = 0;
    this.lat = 0;
    this.camera.fov = 75;
    this.camera.updateProjectionMatrix();
  }

  public toggleGyro() {
    if (this.gyroEnabled) {
      this.gyroEnabled = false;
      window.removeEventListener('deviceorientation', this.onDeviceOrientation);
    } else {
      if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        (DeviceOrientationEvent as any).requestPermission()
          .then((permissionState: string) => {
            if (permissionState === 'granted') {
              this.gyroEnabled = true;
              window.addEventListener('deviceorientation', this.onDeviceOrientation.bind(this));
            }
          })
          .catch(console.error);
      } else {
        this.gyroEnabled = true;
        window.addEventListener('deviceorientation', this.onDeviceOrientation.bind(this));
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

  private update() {
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
    this.container.removeEventListener('pointerdown', this.onPointerDown.bind(this));
    this.container.removeEventListener('pointermove', this.onPointerMove.bind(this));
    this.container.removeEventListener('pointerup', this.onPointerUp.bind(this));
    this.container.removeEventListener('pointercancel', this.onPointerUp.bind(this));
    this.container.removeEventListener('wheel', this.onDocumentMouseWheel.bind(this));
    this.container.removeEventListener('touchstart', this.onTouchStart.bind(this));
    this.container.removeEventListener('touchmove', this.onTouchMove.bind(this));
    window.removeEventListener('resize', this.onWindowResize.bind(this));
    
    if (this.gyroEnabled) {
      window.removeEventListener('deviceorientation', this.onDeviceOrientation.bind(this));
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
