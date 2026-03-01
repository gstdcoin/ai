'use client';

import { useEffect, useRef, useCallback } from 'react';

interface AmbientMeshProps {
    activeNodes?: number;
    className?: string;
}

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    r: number;
    hue: number;
    sat: number;
    brightness: number;
    phase: number;
}

/**
 * AmbientMesh — Full-screen interactive particle network.
 * - Particle count reflects real active_workers from API
 * - Mouse proximity creates gravitational pull
 * - Colors shift between violet/cyan/emerald palette
 * - Connections form dynamically between nearby particles
 */
export default function AmbientMesh({ activeNodes = 0, className = '' }: AmbientMeshProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const mouseRef = useRef({ x: -1000, y: -1000 });
    const particlesRef = useRef<Particle[]>([]);
    const animRef = useRef<number>(0);
    const prevNodeCount = useRef(0);

    const initParticles = useCallback((w: number, h: number, count: number) => {
        const particles: Particle[] = [];
        for (let i = 0; i < count; i++) {
            const hueBase = [260, 190, 160, 45][i % 4]; // violet, cyan, emerald, gold
            particles.push({
                x: Math.random() * w,
                y: Math.random() * h,
                vx: (Math.random() - 0.5) * 0.4,
                vy: (Math.random() - 0.5) * 0.4,
                r: 1.5 + Math.random() * 2,
                hue: hueBase + Math.random() * 20,
                sat: 70 + Math.random() * 20,
                brightness: 50 + Math.random() * 20,
                phase: Math.random() * Math.PI * 2,
            });
        }
        return particles;
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const resize = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = window.innerWidth * dpr;
            canvas.height = window.innerHeight * dpr;
            canvas.style.width = window.innerWidth + 'px';
            canvas.style.height = window.innerHeight + 'px';
            ctx.scale(dpr, dpr);
        };
        resize();
        window.addEventListener('resize', resize);

        // Dynamic particle count from real network data (clamped 20-120)
        const nodeCount = Math.min(Math.max(activeNodes || 24, 20), 120);

        // Only regenerate particles when node count changes significantly
        if (
            particlesRef.current.length === 0 ||
            Math.abs(particlesRef.current.length - nodeCount) > 5
        ) {
            particlesRef.current = initParticles(
                window.innerWidth,
                window.innerHeight,
                nodeCount
            );
            prevNodeCount.current = nodeCount;
        }

        const particles = particlesRef.current;
        const connectionDist = 150;
        const mouseRadius = 200;

        let time = 0;
        const render = () => {
            time += 0.01;
            const w = window.innerWidth;
            const h = window.innerHeight;
            const mx = mouseRef.current.x;
            const my = mouseRef.current.y;

            // Fade trail
            ctx.fillStyle = 'rgba(3, 0, 20, 0.08)';
            ctx.fillRect(0, 0, w, h);

            // Update & draw particles
            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];

                // Mouse gravity
                const dmx = mx - p.x;
                const dmy = my - p.y;
                const dmDist = Math.sqrt(dmx * dmx + dmy * dmy);
                if (dmDist < mouseRadius && dmDist > 0) {
                    const force = (1 - dmDist / mouseRadius) * 0.02;
                    p.vx += dmx / dmDist * force;
                    p.vy += dmy / dmDist * force;
                }

                // Gentle drift
                p.vx += Math.sin(time + p.phase) * 0.002;
                p.vy += Math.cos(time + p.phase * 1.3) * 0.002;

                // Damping
                p.vx *= 0.995;
                p.vy *= 0.995;

                p.x += p.vx;
                p.y += p.vy;

                // Wrap around edges
                if (p.x < -20) p.x = w + 20;
                if (p.x > w + 20) p.x = -20;
                if (p.y < -20) p.y = h + 20;
                if (p.y > h + 20) p.y = -20;

                // Breathing glow
                const breath = 0.5 + 0.5 * Math.sin(time * 2 + p.phase);
                const alpha = 0.3 + breath * 0.4;

                // Draw particle with glow
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r + breath * 1.5, 0, Math.PI * 2);
                ctx.fillStyle = `hsla(${p.hue}, ${p.sat}%, ${p.brightness}%, ${alpha})`;
                ctx.fill();

                // Soft outer glow
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r * 3 + breath * 3, 0, Math.PI * 2);
                ctx.fillStyle = `hsla(${p.hue}, ${p.sat}%, ${p.brightness}%, ${alpha * 0.08})`;
                ctx.fill();

                // Connections
                for (let j = i + 1; j < particles.length; j++) {
                    const p2 = particles[j];
                    const dx = p.x - p2.x;
                    const dy = p.y - p2.y;
                    const d = Math.sqrt(dx * dx + dy * dy);
                    if (d < connectionDist) {
                        const lineAlpha = (1 - d / connectionDist) * 0.12;
                        ctx.beginPath();
                        ctx.moveTo(p.x, p.y);
                        ctx.lineTo(p2.x, p2.y);
                        ctx.strokeStyle = `hsla(${(p.hue + p2.hue) / 2}, 60%, 50%, ${lineAlpha})`;
                        ctx.lineWidth = 0.6;
                        ctx.stroke();
                    }
                }
            }

            animRef.current = requestAnimationFrame(render);
        };

        render();

        return () => {
            cancelAnimationFrame(animRef.current);
            window.removeEventListener('resize', resize);
        };
    }, [activeNodes, initParticles]);

    // Mouse tracking
    useEffect(() => {
        const handleMouse = (e: MouseEvent) => {
            mouseRef.current = { x: e.clientX, y: e.clientY };
        };
        const handleLeave = () => {
            mouseRef.current = { x: -1000, y: -1000 };
        };
        window.addEventListener('mousemove', handleMouse);
        window.addEventListener('mouseleave', handleLeave);
        return () => {
            window.removeEventListener('mousemove', handleMouse);
            window.removeEventListener('mouseleave', handleLeave);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className={`fixed inset-0 z-0 pointer-events-none ${className}`}
            style={{ opacity: 0.7 }}
        />
    );
}
