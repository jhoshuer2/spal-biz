"use client";
import { useEffect, useRef } from "react";

export type AuraState = "idle" | "listening" | "thinking";
type Tone = "lilac" | "indigo";

// Soft colour fields, drawn in code. Lilac for the day, indigo once it is evening.
const TONES: Record<Tone, { light: string[]; dark: string[] }> = {
  lilac: { light: ["#9a88ff", "#ff8fcf", "#7cc8ff", "#c9f23c"], dark: ["#6a55ff", "#c04aa0", "#2f8fd8", "#3a6fe0"] },
  indigo: { light: ["#7a6bff", "#38c8ff", "#ff6fd0", "#c9f23c"], dark: ["#5a49e0", "#1f9fd0", "#b0409a", "#2f78d8"] },
};

/**
 * Spal's voice as a field of colour that sits in the background of the top of the screen and fades into it.
 * Still when she is not talking. While she speaks the colours swell and drift with her voice (`level` 0..1);
 * while Spal reads her note they drift slowly. Reduced motion keeps it still.
 */
export function Aura({ state = "idle", tone = "lilac", level = 0 }: { state?: AuraState; tone?: Tone; level?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ state, level, tone });
  live.current = { state, level, tone };
  const kick = useRef<() => void>(() => {});

  useEffect(() => { kick.current(); }, [state, tone]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W = 0, H = 0, raf = 0, running = false, t = 4, energy = 0, last = performance.now();
    const SCALE = 0.5; // drawn at half size and stretched by CSS: the softness is free

    const isDark = () => {
      const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(getComputedStyle(document.documentElement).getPropertyValue("--bg").trim());
      return m ? (parseInt(m[1], 16) * 299 + parseInt(m[2], 16) * 587 + parseInt(m[3], 16) * 114) / 1000 < 128 : false;
    };

    const paint = (now: number) => {
      const { state: st, level: lv, tone: tn } = live.current;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const speed = st === "listening" ? 1.5 : st === "thinking" ? 0.7 : 0;
      t += dt * speed;
      const target = st === "listening" ? Math.min(1, lv * 1.4) : st === "thinking" ? 0.18 : 0;
      energy += (target - energy) * Math.min(1, dt * 7);

      const dark = isDark();
      const cols = TONES[tn][dark ? "dark" : "light"];
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = dark ? "lighter" : "source-over";
      const baseY = H * 0.6;
      cols.forEach((col, i) => {
        const a = t * (0.8 + i * 0.27) + i * 1.7;
        const x = W * (0.12 + 0.25 * i) + Math.cos(a) * W * (0.06 + energy * 0.14);
        const y = baseY + Math.sin(a * 1.2) * H * (0.05 + energy * 0.16) - energy * H * 0.18;
        const r = Math.max(W, H) * (0.42 + 0.05 * Math.sin(t * 1.3 + i) + energy * 0.2);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, col + (dark ? "cc" : "ff"));
        g.addColorStop(1, col + "00");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      });
      ctx.globalCompositeOperation = "source-over";
    };

    const loop = (now: number) => {
      paint(now);
      const { state: st } = live.current;
      if (st === "idle" && energy < 0.01) { running = false; return; } // settled: stop drawing, stay still
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (reduce) { last = performance.now(); paint(last); return; }
      if (running) return;
      running = true; last = performance.now();
      raf = requestAnimationFrame(loop);
    };
    kick.current = start;

    const size = () => {
      const r = canvas.getBoundingClientRect();
      W = canvas.width = Math.max(2, Math.round(r.width * SCALE));
      H = canvas.height = Math.max(2, Math.round(r.height * SCALE));
      paint(performance.now());
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(canvas);
    const onVis = () => { if (document.hidden) { cancelAnimationFrame(raf); running = false; } else start(); };
    document.addEventListener("visibilitychange", onVis);
    // the theme can change while the page is open: repaint the still field
    const mo = new MutationObserver(() => paint(performance.now()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    start();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); mo.disconnect(); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  return <canvas ref={ref} aria-hidden="true" className="aura" />;
}
