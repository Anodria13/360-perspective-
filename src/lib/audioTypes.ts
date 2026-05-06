export interface SceneAudio {
  file: string;
  fileBlob: Blob | null;
  format: string;
  duration: number;
  loop: boolean;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  spatial: boolean;
  autoPlay: boolean;
  trimStart: number;
  trimEnd: number | null;
}

export type TransitionType = 'crossFade' | 'hardCut' | 'fadeToBlack' | 'duckAndRise' | 'keepPlaying';

export interface GlobalAudioSettings {
  enabled: boolean;
  masterVolume: number;
  transitionType: TransitionType;
  transitionDuration: number;
  autoPlay: boolean;
  spatialAudio: boolean;
  quality: 'high' | 'medium' | 'dataSaver';
}

export const DEFAULT_GLOBAL_AUDIO_SETTINGS: GlobalAudioSettings = {
  enabled: true,
  masterVolume: 0.8,
  transitionType: 'crossFade',
  transitionDuration: 1.5,
  autoPlay: true,
  spatialAudio: true,
  quality: 'high'
};
