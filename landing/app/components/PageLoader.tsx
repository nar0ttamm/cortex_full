"use client";

import { useEffect, useState } from "react";

const KEY = "cf-loader-seen";

export function PageLoader() {
  const [mounted, setMounted] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(KEY)) return;
      sessionStorage.setItem(KEY, "1");
    } catch {
      return;
    }
    setMounted(true);
    const start = window.setTimeout(() => setFadeOut(true), 480);
    const hide = window.setTimeout(() => setMounted(false), 820);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(hide);
    };
  }, []);

  if (!mounted) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--bg)] transition-opacity duration-400"
      style={{ opacity: fadeOut ? 0 : 1, pointerEvents: fadeOut ? "none" : "auto" }}
      aria-hidden
    >
      <div className="flex flex-col items-center gap-4">
        <span className="font-serif text-3xl">CortexFlow AI</span>
        <span
          className="h-1 w-24 origin-center rounded-full bg-[var(--accent)]"
          style={{ animation: "loader-bar 1s ease-in-out infinite" }}
        />
      </div>
    </div>
  );
}
