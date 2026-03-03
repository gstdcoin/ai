'use client';

import { useEffect, useRef, useState } from 'react';

interface SwarmVisualizationProps {
  activeNodes?: number;
  goldReserve?: number;
  className?: string;
}

export default function SwarmVisualization({ activeNodes = 0, goldReserve = 0, className = '' }: SwarmVisualizationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ w: 800, h: 400 });

  useEffect(() => {
    const updateSize = () => {
      const el = canvasRef.current?.parentElement;
      if (el) {
        const w = Math.min(el.clientWidth || 800, 1200);
        const h = Math.min(Math.max(w * 0.4, 300), 500);
        setDimensions({ w, h });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { w, h } = dimensions;
    canvas.width = w;
    canvas.height = h;

    const nodeCount = Math.min(Math.max(activeNodes || 12, 8), 80);
    const particles: Array<{ x: number; y: number; vx: number; vy: number; r: number; hue: number }> = [];

    for (let i = 0; i < nodeCount; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8,
        r: 2 + Math.random() * 2,
        hue: 45 + Math.random() * 30,
      });
    }

    let anim: number;
    const render = () => {
      ctx.fillStyle = 'rgba(3, 0, 20, 0.15)';
      ctx.fillRect(0, 0, w, h);

      particles.forEach((p, i) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 80%, 55%, 0.6)`;
        ctx.fill();

        particles.slice(i + 1).forEach((p2) => {
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 120) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(251, 191, 36, ${0.15 * (1 - d / 120)})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        });
      });

      anim = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(anim);
  }, [dimensions, activeNodes]);

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-amber-500/20 bg-black/40 ${className}`}>
      <canvas
        ref={canvasRef}
        width={dimensions.w}
        height={dimensions.h}
        className="w-full h-auto block"
        style={{ maxHeight: 500 }}
      />
      <div className="absolute bottom-4 left-4 right-4 flex justify-between text-[10px] font-bold uppercase tracking-widest text-amber-400/80">
        <span>Swarm: {activeNodes || '—'} nodes</span>
        <span>Gold: {typeof goldReserve === 'number' ? goldReserve.toFixed(4) : '—'} oz</span>
      </div>
    </div>
  );
}
