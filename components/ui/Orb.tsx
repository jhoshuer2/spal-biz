"use client";
import { useEffect, useRef } from "react";

export type OrbState = "idle" | "listening" | "thinking" | "speaking";
export type OrbTone = "lime" | "lilac" | "peach" | "indigo";

// Three blob colours + a base, per mood. Drawn in code; no images, no video.
const TONES: Record<OrbTone, { base: string; blobs: [string, string, string, string] }> = {
  lime: { base: "#eefbb8", blobs: ["#c9f23c", "#7fe0a8", "#ffffff", "#b8a8ff"] },
  lilac: { base: "#ece9ff", blobs: ["#a99bff", "#ff9fd8", "#ffffff", "#8fd3ff"] },
  peach: { base: "#fff0e4", blobs: ["#ffb487", "#ff8fb1", "#ffffff", "#ffd36b"] },
  indigo: { base: "#2a2f78", blobs: ["#7a6bff", "#38c8ff", "#ff6fd0", "#c9f23c"] },
};

/**
 * Spal's face. States: idle (slow breathing), listening (follows `level` 0..1),
 * thinking (faster swirl), speaking (soft pulse). Static when reduced motion is on.
 */
export function Orb({ state = "idle", tone = "lilac", size = 220, level = 0 }: { state?: OrbState; tone?: OrbTone; size?: number; level?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ state, level, tone });
  live.current = { state, level, tone };

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let visible = true;
    let t = 0;
    let last = performance.now();
    let energy = 0; // smoothed amplitude

    const draw = (now: number) => {
      const { state: st, level: lv, tone: tn } = live.current;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const speed = st === "thinking" ? 1.9 : st === "listening" ? 1.3 : 0.55;
      t += dt * speed;
      const target = st === "listening" ? lv : st === "speaking" ? 0.35 + 0.25 * Math.sin(now / 180) : 0;
      energy += (target - energy) * Math.min(1, dt * 8);

      const c = size / 2;
      const breathe = 1 + 0.025 * Math.sin(t * 1.4) + energy * 0.07;
      const R = (size / 2) * 0.86 * breathe;
      const pal = TONES[tn];

      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.beginPath();
      ctx.arc(c, c, R, 0, Math.PI * 2);
      ctx.clip();

      ctx.fillStyle = pal.base;
      ctx.fillRect(0, 0, size, size);

      const spread = R * (0.38 + energy * 0.22);
      pal.blobs.forEach((col, i) => {
        const a = t * (0.7 + i * 0.23) + i * 1.9;
        const bx = c + Math.cos(a) * spread * (0.9 + 0.25 * Math.sin(t + i));
        const by = c + Math.sin(a * 1.13) * spread * (0.9 + 0.25 * Math.cos(t * 0.8 + i));
        const br = R * (0.62 + 0.08 * Math.sin(t * 1.3 + i * 2) + energy * 0.12);
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
        g.addColorStop(0, col);
        g.addColorStop(1, col + "00");
        ctx.globalAlpha = i === 2 ? 0.85 : 0.9;
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
      });
      ctx.globalAlpha = 1;

      // soft glass: top-left highlight and a faint edge shade
      const hl = ctx.createRadialGradient(c - R * 0.35, c - R * 0.45, 0, c - R * 0.35, c - R * 0.45, R * 0.7);
      hl.addColorStop(0, "rgba(255,255,255,0.55)");
      hl.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = hl;
      ctx.fillRect(0, 0, size, size);
      const edge = ctx.createRadialGradient(c, c, R * 0.72, c, c, R);
      edge.addColorStop(0, "rgba(255,255,255,0)");
      edge.addColorStop(1, tn === "indigo" ? "rgba(255,255,255,0.18)" : "rgba(80,70,160,0.14)");
      ctx.fillStyle = edge;
      ctx.fillRect(0, 0, size, size);
      ctx.restore();

      if (!reduce && visible) raf = requestAnimationFrame(draw);
    };

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting && !document.hidden;
      if (visible && !reduce) {
        last = performance.now();
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(draw);
      }
    });
    io.observe(canvas);
    const onVis = () => {
      visible = !document.hidden;
      if (visible && !reduce) {
        last = performance.now();
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(draw);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [size, tone]);

  return <canvas ref={ref} width={size} height={size} style={{ width: size, height: size }} role="img" aria-label={`Spal is ${state}`} />;
}
