import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, Globe, Mic, Music, Trash2, Play, Pause, Square, SkipForward, SkipBack, Volume2, Save } from 'lucide-react';
import { SceneAudio } from '../lib/audioTypes';
import { cn } from '../lib/utils';
import AudioEngine from '../lib/AudioEngine';

interface SceneAudioPanelProps {
  sceneId: string;
  sceneName: string;
  initialAudio?: SceneAudio;
  onSave: (audio: SceneAudio | undefined) => void;
  onClose: () => void;
}

const BUILT_IN_SOUNDS = [
  { name: 'Forest Ambience', url: 'synth:forest' },
  { name: 'City Traffic', url: 'synth:city' },
  { name: 'Ocean Waves', url: 'synth:ocean' },
  { name: 'Rainy Night', url: 'synth:rain' },
];

export function SceneAudioPanel({ sceneId, sceneName, initialAudio, onSave, onClose }: SceneAudioPanelProps) {
  const [audioConfig, setAudioConfig] = useState<SceneAudio>(initialAudio || {
    file: '',
    fileBlob: null,
    format: 'mp3',
    duration: 0,
    loop: true,
    volume: 0.75,
    fadeIn: 1.5,
    fadeOut: 1.5,
    spatial: false,
    autoPlay: true,
    trimStart: 0,
    trimEnd: null
  });

  const [activeTab, setActiveTab] = useState<'upload' | 'record' | 'url' | 'library'>('library');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [externalUrl, setExternalUrl] = useState('');
  
  // Recording states
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // If we had a preview audio playing, stop it when unmounting
    return () => {
       if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
           mediaRecorderRef.current.stop();
       }
    };
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAudioConfig({
        ...audioConfig,
        file: file.name,
        fileBlob: file,
        format: file.type.split('/')[1] || 'mp3'
      });
    }
  };

  const saveConfig = () => {
    if (!audioConfig.file && !audioConfig.fileBlob) {
      onSave(undefined);
    } else {
      onSave(audioConfig);
    }
    onClose();
  };

  const handleLibrarySelect = (url: string, name: string) => {
    setAudioConfig({
      ...audioConfig,
      file: url,
      fileBlob: null,
      format: 'url'
    });
  };

  const handleUrlSubmit = () => {
    if (externalUrl) {
      handleLibrarySelect(externalUrl, 'External Audio');
    }
  };

  const startRecording = async () => {
    try {
       const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
       const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type)) || '';
       const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
       
       mediaRecorderRef.current = mediaRecorder;
       audioChunksRef.current = [];

       mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
       };

       mediaRecorder.onstop = () => {
          const blob = new Blob(audioChunksRef.current, { type: mimeType || 'audio/webm' });
          const url = URL.createObjectURL(blob);
          setAudioConfig({
             ...audioConfig,
             file: url,
             fileBlob: blob,
             format: mimeType ? mimeType.split(';')[0].split('/')[1] : '録音'
          });
          stream.getTracks().forEach(t => t.stop());
       };

       mediaRecorder.start();
       setIsRecording(true);
    } catch (e) {
       console.error("Mic access denied", e);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
       mediaRecorderRef.current.stop();
       setIsRecording(false);
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 top-20 md:top-auto z-50 bg-neutral-900 border-t border-white/10 shadow-2xl flex flex-col md:rounded-t-2xl max-h-[85vh] text-white">
      <div className="flex justify-between items-center p-4 border-b border-white/10 shrink-0">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Volume2 className="text-blue-500 w-5 h-5"/> 
          Scene Audio — "{sceneName}"
        </h2>
        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 relative">
          <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-8">
             
             {/* Source Selection */}
             <div className="space-y-4">
                 <div className="flex gap-2 p-1 bg-black/40 rounded-xl overflow-x-auto hide-scrollbar shrink-0">
                    <button onClick={() => setActiveTab('library')} className={cn("px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-2", activeTab === 'library' ? "bg-white/10" : "text-white/60 hover:text-white")}>
                       <Music className="w-4 h-4"/> Sound Library
                    </button>
                    <button onClick={() => setActiveTab('upload')} className={cn("px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-2", activeTab === 'upload' ? "bg-white/10" : "text-white/60 hover:text-white")}>
                       <Upload className="w-4 h-4"/> Upload Audio
                    </button>
                    <button onClick={() => setActiveTab('record')} className={cn("px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-2", activeTab === 'record' ? "bg-white/10" : "text-white/60 hover:text-white")}>
                       <Mic className="w-4 h-4"/> Record Live
                    </button>
                    <button onClick={() => setActiveTab('url')} className={cn("px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-2", activeTab === 'url' ? "bg-white/10" : "text-white/60 hover:text-white")}>
                       <Globe className="w-4 h-4"/> External URL
                    </button>
                 </div>

                 <div className="p-4 bg-white/5 rounded-xl border border-white/5 min-h-[140px] flex items-center gap-4">
                     {activeTab === 'library' && (
                         <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 w-full">
                            {BUILT_IN_SOUNDS.map(s => (
                               <button 
                                  key={s.name} 
                                  onClick={() => handleLibrarySelect(s.url, s.name)}
                                  className={cn(
                                    "p-3 rounded-lg border text-left text-sm transition-all flex items-center justify-between group",
                                    audioConfig.file === s.url ? "border-blue-500 bg-blue-500/10 text-blue-400" : "border-white/10 hover:border-white/30 text-white/80"
                                  )}
                               >
                                  <span>{s.name}</span>
                                  {audioConfig.file === s.url && <div className="w-2 h-2 rounded-full bg-blue-500"/>}
                               </button>
                            ))}
                         </div>
                     )}

                     {activeTab === 'upload' && (
                         <div className="w-full text-center">
                             <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="audio/*" className="hidden" />
                             <button onClick={() => fileInputRef.current?.click()} className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium inline-flex items-center gap-2 transition-colors">
                                <Upload className="w-5 h-5"/> Select File
                             </button>
                             <p className="text-white/40 text-xs mt-3">MP3, WAV, OGG, FLAC (Max 5MB recommended)</p>
                         </div>
                     )}

                     {activeTab === 'url' && (
                         <div className="w-full flex gap-2 max-w-sm mx-auto">
                             <input 
                                value={externalUrl}
                                onChange={e => setExternalUrl(e.target.value)}
                                placeholder="https://..."
                                className="flex-1 bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500"
                             />
                             <button onClick={handleUrlSubmit} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors">
                               Set
                             </button>
                         </div>
                     )}

                     {activeTab === 'record' && (
                         <div className="w-full text-center flex flex-col items-center justify-center py-4">
                             {!isRecording ? (
                                <button onClick={startRecording} className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded-full font-medium inline-flex items-center gap-2 transition-colors">
                                   <div className="w-3 h-3 rounded-full bg-white animate-pulse" />
                                   Start Recording
                                </button>
                             ) : (
                                <div className="space-y-4">
                                    <div className="flex justify-center items-center gap-2 h-8">
                                       <div className="w-2 h-8 bg-red-500 rounded-full animate-bounce" style={{animationDelay: '0ms'}}/>
                                       <div className="w-2 h-10 bg-red-500 rounded-full animate-bounce" style={{animationDelay: '100ms'}}/>
                                       <div className="w-2 h-6 bg-red-500 rounded-full animate-bounce" style={{animationDelay: '200ms'}}/>
                                       <div className="w-2 h-12 bg-red-500 rounded-full animate-bounce" style={{animationDelay: '300ms'}}/>
                                       <div className="w-2 h-8 bg-red-500 rounded-full animate-bounce" style={{animationDelay: '400ms'}}/>
                                    </div>
                                    <button onClick={stopRecording} className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-full font-medium inline-flex items-center gap-2 transition-colors border border-white/20">
                                       <Square className="w-4 h-4 text-red-500 fill-current" />
                                       Stop Recording
                                    </button>
                                </div>
                             )}
                         </div>
                     )}
                 </div>
             </div>

             {/* Selected File */}
             {audioConfig.file && (
                 <div className="flex items-center justify-between p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                    <div className="flex items-center gap-3">
                       <div className="w-10 h-10 rounded bg-blue-500/20 flex items-center justify-center text-blue-400">
                          <Music className="w-5 h-5" />
                       </div>
                       <div className="overflow-hidden">
                          <p className="font-medium text-sm truncate max-w-[200px] md:max-w-[400px]">
                             {audioConfig.fileBlob ? audioConfig.fileBlob.name : audioConfig.file}
                          </p>
                          <p className="text-xs text-blue-400/80 uppercase">{audioConfig.format || 'AUDIO'}</p>
                       </div>
                    </div>
                    <button onClick={() => setAudioConfig({...audioConfig, file: '', fileBlob: null})} className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors">
                       <Trash2 className="w-4 h-4"/>
                    </button>
                 </div>
             )}

             {/* Preferences */}
             <div className="space-y-6">
                 <h3 className="font-bold text-lg border-b border-white/10 pb-2">Playback Settings</h3>
                 
                 <div className="grid md:grid-cols-2 gap-8">
                     <div className="space-y-6">
                        <div className="flex flex-col gap-2">
                           <label className="text-sm font-medium text-white/80 flex justify-between">
                              Volume <span>{Math.round(audioConfig.volume * 100)}%</span>
                           </label>
                           <input type="range" min="0" max="1" step="0.05" value={audioConfig.volume} onChange={(e) => setAudioConfig({...audioConfig, volume: parseFloat(e.target.value)})} className="w-full accent-blue-500" />
                        </div>
                        
                        <div className="flex items-center justify-between">
                           <label className="text-sm font-medium text-white/80">Auto-Play</label>
                           <div className="flex gap-2">
                              <button onClick={() => setAudioConfig({...audioConfig, autoPlay: true})} className={cn("px-3 py-1.5 rounded text-xs font-medium", audioConfig.autoPlay ? "bg-blue-600 text-white" : "bg-white/10 text-white/60")}>Yes</button>
                              <button onClick={() => setAudioConfig({...audioConfig, autoPlay: false})} className={cn("px-3 py-1.5 rounded text-xs font-medium", !audioConfig.autoPlay ? "bg-white/20 text-white" : "bg-white/5 text-white/60")}>No</button>
                           </div>
                        </div>

                        <div className="flex items-center justify-between">
                           <label className="text-sm font-medium text-white/80">Loop</label>
                           <div className="flex gap-2">
                              <button onClick={() => setAudioConfig({...audioConfig, loop: true})} className={cn("px-3 py-1.5 rounded text-xs font-medium", audioConfig.loop ? "bg-blue-600 text-white" : "bg-white/10 text-white/60")}>Always</button>
                              <button onClick={() => setAudioConfig({...audioConfig, loop: false})} className={cn("px-3 py-1.5 rounded text-xs font-medium", !audioConfig.loop ? "bg-white/20 text-white" : "bg-white/5 text-white/60")}>Once</button>
                           </div>
                        </div>
                     </div>

                     <div className="space-y-6">
                        <div className="flex flex-col gap-2">
                           <label className="text-sm font-medium text-white/80 flex justify-between">
                              Fade In <span>{audioConfig.fadeIn.toFixed(1)}s</span>
                           </label>
                           <input type="range" min="0" max="5" step="0.5" value={audioConfig.fadeIn} onChange={(e) => setAudioConfig({...audioConfig, fadeIn: parseFloat(e.target.value)})} className="w-full accent-blue-500" />
                        </div>

                        <div className="flex flex-col gap-2">
                           <label className="text-sm font-medium text-white/80 flex justify-between">
                              Fade Out <span>{audioConfig.fadeOut.toFixed(1)}s</span>
                           </label>
                           <input type="range" min="0" max="5" step="0.5" value={audioConfig.fadeOut} onChange={(e) => setAudioConfig({...audioConfig, fadeOut: parseFloat(e.target.value)})} className="w-full accent-blue-500" />
                        </div>

                        <div className="flex items-center justify-between pt-2">
                           <label className="text-sm font-medium text-white/80 flex flex-col">
                              3D Spatial Audio
                              <span className="text-[10px] text-white/40 font-normal">Audio pans relative to your viewing angle</span>
                           </label>
                           <div className="flex gap-2">
                              <button onClick={() => setAudioConfig({...audioConfig, spatial: true})} className={cn("px-3 py-1.5 rounded text-xs font-medium transition-colors", audioConfig.spatial ? "bg-green-600 text-white" : "bg-white/10 text-white/60 hover:bg-white/20")}>Enabled</button>
                              <button onClick={() => setAudioConfig({...audioConfig, spatial: false})} className={cn("px-3 py-1.5 rounded text-xs font-medium transition-colors", !audioConfig.spatial ? "bg-white/20 text-white" : "bg-white/5 text-white/60 hover:bg-white/10")}>Disabled</button>
                           </div>
                        </div>
                     </div>
                 </div>
             </div>
          </div>
      </div>

      <div className="p-4 border-t border-white/10 bg-black/40 flex justify-end gap-3 shrink-0 pb-safe">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl font-medium text-sm hover:bg-white/10 transition-colors">
              Cancel
          </button>
          <button onClick={saveConfig} className="px-6 py-2.5 rounded-xl bg-white text-black font-bold text-sm hover:bg-neutral-200 transition-colors flex items-center gap-2">
              <Save className="w-4 h-4" /> Save
          </button>
      </div>
    </div>
  );
}
