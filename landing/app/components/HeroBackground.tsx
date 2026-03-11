"use client";

import { useEffect, useRef, useState } from "react";

const ORB_COUNT = 4;
const SIZES = [320, 400, 480, 360];
const COLORS = [
  "rgba(34, 211, 238, 0.22)",
  "rgba(167, 139, 250, 0.18)",
  "rgba(34, 211, 238, 0.14)",
  "rgba(167, 139, 250, 0.1)",
];
const SMOOTHING = [0.06, 0.08, 0.1, 0.12];
const CENTER_SMOOTHING = [0.015, 0.02, 0.025, 0.03];

export function HeroBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState({ x: 0.5, y: 0.5 });
  const [orbs, setOrbs] = useState(() =>
    [...Array(ORB_COUNT)].map(() => ({ x: 0.5, y: 0.5 }))
  );
  const targetRef = useRef(target);
  targetRef.current = target;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const section = container.parentElement;
    if (!section) return;

    const onMove = (e: MouseEvent) => {
      const rect = section.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      const inside = x >= 0 && x <= 1 && y >= 0 && y <= 1;
      if (inside) {
        setTarget({ x, y });
      } else {
        setTarget({ x: 0.5, y: 0.5 });
      }
    };

    document.addEventListener("mousemove", onMove, { passive: true });
    return () => document.removeEventListener("mousemove", onMove);
  }, []);

  useEffect(() => {
    let raf: number;
    const step = () => {
      const t = targetRef.current;
      const atCenter = Math.abs(t.x - 0.5) < 0.01 && Math.abs(t.y - 0.5) < 0.01;
      const smooth = atCenter ? CENTER_SMOOTHING : SMOOTHING;
      setOrbs((prev) =>
        prev.map((p, i) => ({
          x: p.x + (t.x - p.x) * smooth[i],
          y: p.y + (t.y - p.y) * smooth[i],
        }))
      );
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none">
      {/* Static gradient */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, var(--glow), transparent 50%)",
        }}
      />
      {/* Slow drift — animated */}
      <div
        className="pointer-events-none absolute inset-0 opacity-25 hero-gradient-drift"
        style={{
          background: `
            radial-gradient(ellipse 50% 40% at 30% 40%, rgba(34, 211, 238, 0.2), transparent 50%),
            radial-gradient(ellipse 45% 45% at 70% 50%, rgba(167, 139, 250, 0.15), transparent 50%)
          `,
        }}
      />
      {/* Cursor-following orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {orbs.map((pos, i) => (
          <div
            key={i}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full blur-[80px]"
            style={{
              left: `${pos.x * 100}%`,
              top: `${pos.y * 100}%`,
              width: SIZES[i],
              height: SIZES[i],
              background: COLORS[i],
            }}
          />
        ))}
      </div>
    </div>
  );
}
