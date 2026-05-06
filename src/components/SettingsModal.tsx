import React, { useState } from 'react';
import { X, Volume2, Save, VolumeX, Settings, Smartphone, Moon, Globe, LayoutGrid, Palette } from 'lucide-react';
import { GlobalAudioSettings } from '../lib/audioTypes';
import { cn } from '../lib/utils';
import AudioEngine from '../lib/AudioEngine';

interface SettingsModalProps {
  onClose: () => void;
  language: 'en' | 'ar';
  setLanguage: (lang: 'en' | 'ar') => void;
  isDarkMode: boolean;
  setIsDarkMode: (mode: boolean) => void;
  orientationMode: 'manual' | 'auto';
  setOrientationMode: (mode: 'manual' | 'auto') => void;
  defaultOrientation: 'landscape' | 'portrait';
  setDefaultOrientation: (orient: 'landscape' | 'portrait') => void;
  t: Record<string, string>;
}

export function SettingsModal({ 
  onClose,
  language, setLanguage,
  isDarkMode, setIsDarkMode,
  orientationMode, setOrientationMode,
  defaultOrientation, setDefaultOrientation,
  t
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'audio' | 'orientation'>('general');
  const [audioSettings, setAudioSettings] = useState<GlobalAudioSettings>(AudioEngine.globalSettings);

  const saveSettings = () => {
    AudioEngine.globalSettings = audioSettings;
    if (audioSettings.enabled) {
      AudioEngine.setMasterVolume(audioSettings.masterVolume);
    } else {
      AudioEngine.disableAudio();
    }
    // Orientation settings are saved individually when toggled via localStorage
    onClose();
  };

  const muteAll = () => {
    setAudioSettings({...audioSettings, enabled: false, masterVolume: 0});
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm rtl:dir-rtl ltr:dir-ltr" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <div className="bg-neutral-900 border border-white/10 shadow-2xl rounded-2xl w-full max-w-lg text-white flex flex-col max-h-[90vh]">
          <div className="flex justify-between items-center p-6 border-b border-white/10 shrink-0">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Settings className="text-blue-500 w-6 h-6"/> 
              {t.settings}
            </h2>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex border-b border-white/10">
             <button onClick={() => setActiveTab('general')} className={cn("flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2", activeTab === 'general' ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5")}>
                 <LayoutGrid className="w-4 h-4"/> {t.general}
             </button>
             <button onClick={() => setActiveTab('audio')} className={cn("flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2", activeTab === 'audio' ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5")}>
                 <Volume2 className="w-4 h-4"/> {t.audio}
             </button>
             <button onClick={() => setActiveTab('orientation')} className={cn("flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2", activeTab === 'orientation' ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5")}>
                 <Smartphone className="w-4 h-4"/> {t.orientation}
             </button>
          </div>

          <div className="p-6 space-y-8 overflow-y-auto">
             {activeTab === 'general' && (
                <div className="space-y-6">
                   <div className="space-y-3">
                     <label className="text-xs font-bold text-slate-400 block uppercase tracking-wider">{t.language || "Language"}</label>
                     <div className="flex bg-white/5 border border-white/10 p-1 rounded-xl">
                        <button onClick={() => setLanguage('en')} className={cn("flex-1 py-2 text-sm font-bold rounded-lg transition-all", language === 'en' ? "bg-blue-600 text-white shadow" : "text-zinc-400 hover:text-white")}>
                           English
                        </button>
                        <button onClick={() => setLanguage('ar')} className={cn("flex-1 py-2 text-sm font-bold rounded-lg transition-all", language === 'ar' ? "bg-blue-600 text-white shadow" : "text-zinc-400 hover:text-white")}>
                           العربية
                        </button>
                     </div>
                   </div>
                   
                   <div className="space-y-3">
                     <label className="text-xs font-bold text-slate-400 block uppercase tracking-wider">{t.darkMode}</label>
                     <div className="flex bg-white/5 border border-white/10 p-1 rounded-xl">
                        <button onClick={() => setIsDarkMode(true)} className={cn("flex-1 py-2 text-sm font-bold rounded-lg transition-all", isDarkMode ? "bg-blue-600 text-white shadow" : "text-zinc-400 hover:text-white")}>
                           <Moon className="w-4 h-4 inline-block ltr:mr-1 rtl:ml-1" /> {t.on}
                        </button>
                        <button onClick={() => setIsDarkMode(false)} className={cn("flex-1 py-2 text-sm font-bold rounded-lg transition-all", !isDarkMode ? "bg-blue-600 text-white shadow" : "text-zinc-400 hover:text-white")}>
                           {t.off}
                        </button>
                     </div>
                   </div>
                </div>
             )}

             {activeTab === 'audio' && (
                <>
                   <div className="space-y-4">
                       <div className="flex items-center justify-between">
                           <label className="text-sm font-medium text-white/90">{t.audioEnabled}</label>
                           <div className="flex gap-2 bg-black/40 p-1 rounded-lg">
                              <button onClick={() => setAudioSettings({...audioSettings, enabled: true})} className={cn("px-4 py-1.5 rounded-md text-sm font-medium transition-colors", audioSettings.enabled ? "bg-blue-600 text-white" : "text-white/60 hover:text-white")}>{t.yes}</button>
                              <button onClick={() => setAudioSettings({...audioSettings, enabled: false})} className={cn("px-4 py-1.5 rounded-md text-sm font-medium transition-colors", !audioSettings.enabled ? "bg-white/20 text-white" : "text-white/60 hover:text-white")}>{t.no}</button>
                           </div>
                       </div>

                       <div className="flex flex-col gap-2">
                           <label className="text-sm font-medium text-white/90 flex justify-between">
                              {t.masterVolume} <span>{Math.round(audioSettings.masterVolume * 100)}%</span>
                           </label>
                           <input type="range" min="0" max="1" step="0.05" value={audioSettings.masterVolume} disabled={!audioSettings.enabled} onChange={(e) => setAudioSettings({...audioSettings, masterVolume: parseFloat(e.target.value)})} className="w-full accent-blue-500 opacity-disabled" />
                       </div>
                   </div>

                   <div className="space-y-4">
                       <h3 className="font-bold border-b border-white/10 pb-2">{t.sceneTransition}</h3>
                       
                       <div className="flex flex-col gap-3">
                           <label className="text-sm text-white/70">{t.type}</label>
                           <div className="grid grid-cols-3 gap-2">
                              {(['crossFade', 'hardCut', 'fadeToBlack'] as const).map(type => (
                                 <button 
                                   key={type}
                                   disabled={!audioSettings.enabled}
                                   onClick={() => setAudioSettings({...audioSettings, transitionType: type})} 
                                   className={cn("px-3 py-2 rounded-lg text-xs font-medium border transition-colors", audioSettings.transitionType === type ? "bg-blue-500/20 border-blue-500 text-blue-400" : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10")}
                                 >
                                    {type === 'crossFade' ? 'Cross-Fade' : type === 'hardCut' ? 'Hard Cut' : 'Fade-Black'}
                                 </button>
                              ))}
                           </div>
                       </div>

                       <div className="flex flex-col gap-2">
                           <label className="text-sm font-medium text-white/90 flex justify-between">
                              {t.duration} <span>{audioSettings.transitionDuration.toFixed(1)}s</span>
                           </label>
                           <input type="range" min="0.1" max="5" step="0.1" value={audioSettings.transitionDuration} disabled={!audioSettings.enabled || audioSettings.transitionType === 'hardCut'} onChange={(e) => setAudioSettings({...audioSettings, transitionDuration: parseFloat(e.target.value)})} className="w-full accent-blue-500" />
                       </div>
                   </div>

                   <div className="space-y-4 border-t border-white/10 pt-4">
                       <div className="flex items-center justify-between">
                           <label className="text-sm font-medium text-white/90">{t.autoPlay}</label>
                           <div className="flex gap-2">
                              <button disabled={!audioSettings.enabled} onClick={() => setAudioSettings({...audioSettings, autoPlay: true})} className={cn("px-3 py-1.5 rounded text-xs font-medium", audioSettings.autoPlay ? "bg-white/20 text-white" : "bg-white/5 text-white/60 hover:bg-white/10")}>{t.yes}</button>
                              <button disabled={!audioSettings.enabled} onClick={() => setAudioSettings({...audioSettings, autoPlay: false})} className={cn("px-3 py-1.5 rounded text-xs font-medium", !audioSettings.autoPlay ? "bg-white/20 text-white" : "bg-white/5 text-white/60 hover:bg-white/10")}>{t.no}</button>
                           </div>
                       </div>

                       <div className="flex items-center justify-between">
                           <label className="text-sm font-medium text-white/90">{t.spatialAudio}</label>
                           <div className="flex gap-2">
                              <button disabled={!audioSettings.enabled} onClick={() => setAudioSettings({...audioSettings, spatialAudio: true})} className={cn("px-3 py-1.5 rounded text-xs font-medium", audioSettings.spatialAudio ? "bg-white/20 text-white" : "bg-white/5 text-white/60 hover:bg-white/10")}>{t.on}</button>
                              <button disabled={!audioSettings.enabled} onClick={() => setAudioSettings({...audioSettings, spatialAudio: false})} className={cn("px-3 py-1.5 rounded text-xs font-medium", !audioSettings.spatialAudio ? "bg-white/20 text-white" : "bg-white/5 text-white/60 hover:bg-white/10")}>{t.off}</button>
                           </div>
                       </div>

                       <div className="flex items-center justify-between">
                           <label className="text-sm font-medium text-white/90">{t.quality}</label>
                           <div className="flex gap-2">
                              {(['high', 'medium', 'dataSaver'] as const).map(q => (
                                 <button 
                                   key={q}
                                   disabled={!audioSettings.enabled}
                                   onClick={() => setAudioSettings({...audioSettings, quality: q})} 
                                   className={cn("px-3 py-1.5 rounded text-xs font-medium capitalize", audioSettings.quality === q ? "bg-white/20 text-white" : "bg-white/5 text-white/60 hover:bg-white/10")}
                                 >
                                    {q === 'dataSaver' ? 'Data Saver' : q}
                                 </button>
                              ))}
                           </div>
                       </div>
                   </div>
                </>
             )}

             {activeTab === 'orientation' && (
               <div className="space-y-6">
                 <div className="space-y-3">
                   <label className="text-xs font-bold text-slate-400 block uppercase tracking-wider">{t.mode}</label>
                   <div className="flex bg-white/5 border border-white/10 p-1 rounded-xl">
                      <button onClick={() => { setOrientationMode('manual'); localStorage.setItem('vt_orientation_mode', 'manual'); }} className={cn("flex-1 py-2 text-sm font-bold rounded-lg transition-all", orientationMode === 'manual' ? "bg-blue-600 text-white shadow" : "text-zinc-400 hover:text-white")}>
                         {t.manual}
                      </button>
                      <button onClick={() => { setOrientationMode('auto'); localStorage.setItem('vt_orientation_mode', 'auto'); }} className={cn("flex-1 py-2 text-sm font-bold rounded-lg transition-all", orientationMode === 'auto' ? "bg-blue-600 text-white shadow" : "text-zinc-400 hover:text-white")}>
                         {t.autoRotate}
                      </button>
                   </div>
                 </div>

                 <div className="space-y-3">
                   <label className="text-xs font-bold text-slate-400 block uppercase tracking-wider">{t.defaultOrientation}</label>
                   <div className="flex border border-white/10 rounded-xl overflow-hidden divide-x divide-white/10 ltr:divide-x rtl:divide-x-reverse">
                      <button onClick={() => { setDefaultOrientation('portrait'); localStorage.setItem('vt_default_orientation', 'portrait'); }} className={cn("flex-1 py-3 text-sm font-bold flex flex-col items-center justify-center gap-2 transition-colors", defaultOrientation === 'portrait' ? "bg-blue-500/20 text-blue-400" : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white")}>
                         <Smartphone className="w-5 h-5" /> {t.portrait}
                      </button>
                      <button onClick={() => { setDefaultOrientation('landscape'); localStorage.setItem('vt_default_orientation', 'landscape'); }} className={cn("flex-1 py-3 text-sm font-bold flex flex-col items-center justify-center gap-2 transition-colors", defaultOrientation === 'landscape' ? "bg-blue-500/20 text-blue-400" : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white")}>
                         <Smartphone className="w-5 h-5 -rotate-90" /> {t.landscape}
                      </button>
                   </div>
                   <p className="text-[11px] text-zinc-500 font-medium text-center">{t.appliedOnLaunch}</p>
                 </div>
               </div>
             )}
          </div>

          <div className="p-6 border-t border-white/10 bg-black/40 flex justify-between gap-3 shrink-0 rounded-b-2xl">
              {activeTab === 'audio' ? (
                <button onClick={muteAll} className="px-5 py-2.5 rounded-xl font-medium text-sm text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2">
                    <VolumeX className="w-4 h-4"/> {t.muteAll}
                </button>
              ) : <div/>}

              <div className="flex gap-3">
                  <button onClick={onClose} className="px-5 py-2.5 rounded-xl font-medium text-sm hover:bg-white/10 transition-colors">
                      {t.cancel}
                  </button>
                  <button onClick={saveSettings} className="px-6 py-2.5 rounded-xl bg-white text-black font-bold text-sm hover:bg-neutral-200 transition-colors flex items-center gap-2">
                      <Save className="w-4 h-4" /> {t.save}
                  </button>
              </div>
          </div>
      </div>
    </div>
  );
}
