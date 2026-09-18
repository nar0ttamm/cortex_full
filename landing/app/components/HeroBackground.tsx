"use client";

import { useEffect, useRef, useState } from "react";

export function HeroBackground() {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 70, y: 30 });

  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      if (x >= 0 && x <= 100 && y >= 0 && y <= 100) setPos({ x, y });
    };
    document.addEventListener("mousemove", onMove, { passive: true });
    return () => document.removeEventListener("mousemove", onMove);
  }, []);

  return (
    <div ref={ref} className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="hero-blob absolute h-[28rem] w-[28rem] rounded-full blur-3xl"
        style={{
          left: `${pos.x}%`,
          top: `${pos.y}%`,
          transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle, rgba(226,75,27,0.16), transparent 68%)",
        }}
      />
      <div
        className="absolute -left-24 top-10 h-80 w-80 rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(26,107,99,0.14), transparent 70%)" }}
      />
      <div
        className="absolute right-0 top-24 h-72 w-72 rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(196,132,29,0.12), transparent 70%)" }}
      />
    </div>
  );
}
