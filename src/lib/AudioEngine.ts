import { SceneAudio, GlobalAudioSettings } from './audioTypes';

class AudioEngine {
  private static instance: AudioEngine;
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private panner: PannerNode | null = null;
  
  private currentSource: AudioBufferSourceNode | HTMLAudioElement | null = null;
  private currentGain: GainNode | null = null;
  private nextSource: AudioBufferSourceNode | HTMLAudioElement | null = null;
  private nextGain: GainNode | null = null;

  public globalSettings: GlobalAudioSettings;
  private initialized = false;

  private constructor() {
    // Cannot initialize AudioContext here due to autoplay policies
    // Must be initialized on first user interaction
    this.globalSettings = {
      enabled: true,
      masterVolume: 0.8,
      transitionType: 'crossFade',
      transitionDuration: 1.5,
      autoPlay: true,
      spatialAudio: true,
      quality: 'high'
    };
  }

  public static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  public init() {
    if (this.initialized) return;
    
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      this.masterGain = this.ctx.createGain();
      this.compressor = this.ctx.createDynamicsCompressor();
      this.analyser = this.ctx.createAnalyser();
      this.panner = this.ctx.createPanner();

      // Configure panner
      this.panner.panningModel = 'HRTF';
      this.panner.distanceModel = 'inverse';
      this.panner.refDistance = 1;
      this.panner.maxDistance = 10000;
      this.panner.rolloffFactor = 0.8;
      this.panner.coneInnerAngle = 360;

      // Configure analyser
      this.analyser.fftSize = 256;

      // Build main processing chain
      // Source -> Gain -> Panner -> Compressor -> Analyser -> Destination
      // panner and gain will be setup per scene
      this.compressor.connect(this.analyser);
      this.analyser.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
      
      this.setMasterVolume(this.globalSettings.masterVolume);
      this.initialized = true;
    } catch (e) {
      console.error('AudioContext creation failed', e);
    }
  }

  public getContext() {
    return this.ctx;
  }
  
  public getAnalyser() {
    return this.analyser;
  }

  public setMasterVolume(volume: number) {
    this.globalSettings.masterVolume = volume;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.1);
    }
  }
  
  public disableAudio() {
    if (this.masterGain && this.ctx) {
       this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    }
  }
  
  public enableAudio() {
    if (this.masterGain && this.ctx) {
       this.masterGain.gain.setTargetAtTime(this.globalSettings.masterVolume, this.ctx.currentTime, 0.1);
    }
  }

  public async playSceneAudio(audioConfig: SceneAudio) {
    if (!this.initialized) this.init();
    if (!this.ctx || !this.globalSettings.enabled) return;

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    try {
      let buffer: AudioBuffer | null = null;
      let targetFile = audioConfig.file;

      // Auto-migrate known broken external URLs from previous versions to synthetic ambient sounds
      if (targetFile) {
         if (targetFile.includes('33bd79c9c0.mp3') || targetFile.includes('Forest_Audio.ogg') || targetFile.includes('forest_morning')) {
             targetFile = 'synth:forest';
         } else if (targetFile.includes('1f237acfc2.mp3') || targetFile.includes('Traffic_sounds') || targetFile.includes('city_street_day')) {
             targetFile = 'synth:city';
         } else if (targetFile.includes('e08f5d023b.mp3') || targetFile.includes('Ocean_waves.ogg') || targetFile.includes('waves_crashing')) {
             targetFile = 'synth:ocean';
         } else if (targetFile.includes('8eebc95cc9.mp3') || targetFile.includes('Rain_on_tent.ogg') || targetFile.includes('rain_on_roof')) {
             targetFile = 'synth:rain';
         }
      }

      if (audioConfig.fileBlob) {
        const arrayBuffer = await audioConfig.fileBlob.arrayBuffer();
        buffer = await this.ctx.decodeAudioData(arrayBuffer);
      } else if (targetFile && targetFile.startsWith('synth:')) {
        const type = targetFile.split(':')[1];
        buffer = await this.createSyntheticAmbient(type, 10);
      } else if (targetFile) {
        // Fetch from URL, it might be a blob: URL or an external URL
        const response = await fetch(targetFile);
        if (!response.ok) {
           throw new Error(`Failed to fetch audio from URL: ${response.status} ${response.statusText}`);
        }
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('text/html')) {
           throw new Error(`Invalid audio URL (returned HTML instead of media file)`);
        }
        const arrayBuffer = await response.arrayBuffer();
        buffer = await this.ctx.decodeAudioData(arrayBuffer);
      }

      if (!buffer) return;

      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = audioConfig.loop;
      
      const gainNode = this.ctx.createGain();
      
      // Handle spatial
      if (audioConfig.spatial && this.globalSettings.spatialAudio && this.panner) {
        source.connect(gainNode);
        gainNode.connect(this.panner);
        this.panner.connect(this.compressor!);
      } else {
        source.connect(gainNode);
        gainNode.connect(this.compressor!);
      }

      // Handle transitions
      if (this.currentSource && this.currentGain) {
          const fadeOutTime = this.globalSettings.transitionType === 'crossFade' 
             ? this.globalSettings.transitionDuration 
             : 0.1;
             
          this.currentGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + fadeOutTime);
          
          const oldSource = this.currentSource;
          setTimeout(() => {
              try {
                  if ('stop' in oldSource) {
                      oldSource.stop();
                  } else {
                      oldSource.pause();
                      oldSource.currentTime = 0;
                  }
              } catch(e){}
          }, fadeOutTime * 1000);
      }

      // Start new source with fade in
      gainNode.gain.setValueAtTime(0, this.ctx.currentTime);
      source.start(0, audioConfig.trimStart || 0, audioConfig.trimEnd ? audioConfig.trimEnd - (audioConfig.trimStart || 0) : undefined);
      
      const targetVol = typeof audioConfig.volume === 'number' ? audioConfig.volume : 1;
      gainNode.gain.linearRampToValueAtTime(targetVol, this.ctx.currentTime + (audioConfig.fadeIn || 0.1));

      this.currentSource = source;
      this.currentGain = gainNode;

    } catch (e: any) {
      console.error('Playback failed', e);
    }
  }

  public stopSceneAudio() {
    if (!this.ctx || !this.currentSource || !this.currentGain) return;
    
    // Cross-fade out logic
    const fadeOutTime = this.globalSettings.transitionType === 'crossFade' 
       ? this.globalSettings.transitionDuration 
       : 0.1;
       
    // Cancel scheduled values
    this.currentGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.currentGain.gain.setValueAtTime(this.currentGain.gain.value, this.ctx.currentTime);
    this.currentGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + fadeOutTime);
    
    const oldSource = this.currentSource;
    setTimeout(() => {
        try {
            if ('stop' in oldSource) {
                oldSource.stop();
            } else {
                oldSource.pause();
                oldSource.currentTime = 0;
            }
        } catch(e){}
    }, fadeOutTime * 1000);
    
    this.currentSource = null;
    this.currentGain = null;
  }

  private async createSyntheticAmbient(type: string, duration: number): Promise<AudioBuffer | null> {
    const sampleRate = 44100;
    const octx = new OfflineAudioContext(2, sampleRate * duration, sampleRate);
    const bufferSize = sampleRate * duration;
    
    // white noise
    const noiseBuffer = octx.createBuffer(2, bufferSize, sampleRate);
    for (let c = 0; c < 2; c++) {
       const channel = noiseBuffer.getChannelData(c);
       for (let i = 0; i < bufferSize; i++) {
           channel[i] = Math.random() * 2 - 1;
       }
    }
    const noiseSource = octx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    if (type === 'ocean') {
        const biquad = octx.createBiquadFilter();
        biquad.type = 'lowpass';
        biquad.frequency.value = 400;

        const gainObj = octx.createGain();
        
        const lfoRawBuffer = octx.createBuffer(1, bufferSize, sampleRate);
        const lfoData = lfoRawBuffer.getChannelData(0);
        for(let i=0; i<bufferSize; i++) {
           const t = i / sampleRate;
           lfoData[i] = Math.pow((Math.sin(t * 1.5) + 1) / 2, 2) * 0.5 + 0.1; 
        }
        const lfoNode = octx.createBufferSource();
        lfoNode.buffer = lfoRawBuffer;
        
        noiseSource.connect(biquad).connect(gainObj).connect(octx.destination);
        lfoNode.connect(gainObj.gain);
        
        noiseSource.start();
        lfoNode.start();
    } else if (type === 'rain') {
        const lp = octx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 800;
        
        const hp = octx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 200;

        const vol = octx.createGain();
        vol.gain.value = 0.3;

        noiseSource.connect(lp).connect(hp).connect(vol).connect(octx.destination);
        noiseSource.start();
    } else if (type === 'forest') {
        const lp = octx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 500;
        const wind = octx.createGain();
        wind.gain.value = 0.05;
        
        noiseSource.connect(lp).connect(wind).connect(octx.destination);
        noiseSource.start();
        
        for(let i=0; i<6; i++) {
            const time = 1 + Math.random() * (duration - 2);
            const osc = octx.createOscillator();
            const gain = octx.createGain();
            osc.frequency.setValueAtTime(2000 + Math.random()*1000, time);
            osc.frequency.exponentialRampToValueAtTime(3000 + Math.random()*1000, time + 0.2);
            gain.gain.setValueAtTime(0, time);
            gain.gain.linearRampToValueAtTime(0.05, time + 0.1);
            gain.gain.linearRampToValueAtTime(0, time + 0.2);
            
            osc.connect(gain).connect(octx.destination);
            osc.start(time);
            osc.stop(time + 0.3);
        }
    } else { // city / default
        const bp = octx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 200;
        const rumble = octx.createGain();
        rumble.gain.value = 0.4;
        noiseSource.connect(bp).connect(rumble).connect(octx.destination);
        noiseSource.start();
    }

    return await octx.startRendering();
  }

  public updateCameraPosition(yaw: number, pitch: number) {
     if (!this.panner || !this.ctx) return;
     // simple translation for spatial audio
     const distance = 2; // radius
     this.panner.positionX.setTargetAtTime(Math.sin(yaw) * distance, this.ctx.currentTime, 0.1);
     this.panner.positionZ.setTargetAtTime(Math.cos(yaw) * distance, this.ctx.currentTime, 0.1);
     this.panner.positionY.setTargetAtTime(Math.sin(pitch) * distance, this.ctx.currentTime, 0.1);
  }
}

export default AudioEngine.getInstance();
