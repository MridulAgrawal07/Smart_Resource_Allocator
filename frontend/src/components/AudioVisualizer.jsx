import { useEffect, useRef } from 'react';

const SLAB_COUNT = 6;

export default function AudioVisualizer({ stream }) {
  const slabRefs = useRef([]);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!stream) return;

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.75;

    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteFrequencyData(data);
      for (let i = 0; i < SLAB_COUNT; i++) {
        const bin = Math.floor(((i + 0.5) / SLAB_COUNT) * data.length);
        const scale = Math.max(0.08, data[bin] / 255);
        const el = slabRefs.current[i];
        if (el) el.style.transform = `scaleY(${scale})`;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      source.disconnect();
      ctx.close();
    };
  }, [stream]);

  return (
    <div className="audio-visualizer">
      {Array.from({ length: SLAB_COUNT }, (_, i) => (
        <div
          key={i}
          className="audio-slab"
          ref={(el) => { slabRefs.current[i] = el; }}
        />
      ))}
    </div>
  );
}
