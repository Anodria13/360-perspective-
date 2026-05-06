import React, { useEffect, useRef, useState } from 'react';
import AudioEngine from '../lib/AudioEngine';

export function WaveformMeter() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    let animationFrame: number;
    const analyser = AudioEngine.getAnalyser();
    const canvas = canvasRef.current;
    
    // We check periodically if AudioContext is running
    const checkActiveInterval = setInterval(() => {
       const ctx = AudioEngine.getContext();
       setIsActive(ctx !== null && ctx.state === 'running');
    }, 1000);

    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        let dataArray: Uint8Array;

        const draw = () => {
          animationFrame = requestAnimationFrame(draw);
          const currentAnalyser = AudioEngine.getAnalyser();
          
          if (!currentAnalyser || !isActive) {
             ctx.clearRect(0, 0, canvas.width, canvas.height);
             return;
          }

          if (!dataArray) {
             dataArray = new Uint8Array(currentAnalyser.frequencyBinCount);
          }
          currentAnalyser.getByteFrequencyData(dataArray);

          ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          const barWidth = (canvas.width / dataArray.length) * 2.5;
          let barHeight;
          let x = 0;

          for (let i = 0; i < dataArray.length; i++) {
            barHeight = dataArray[i] / 2;

            ctx.fillStyle = `rgb(${barHeight + 100}, 50, 250)`;
            ctx.fillRect(x, canvas.height - barHeight / 2, barWidth, barHeight / 2);

            x += barWidth + 1;
          }
        };

        draw();
      }
    }

    return () => {
      cancelAnimationFrame(animationFrame);
      clearInterval(checkActiveInterval);
    };
  }, [isActive]);

  return (
    <div className="w-full h-4 bg-black/50 overflow-hidden pointer-events-none">
       <canvas ref={canvasRef} className="w-full h-full" width={1024} height={32} />
    </div>
  );
}
