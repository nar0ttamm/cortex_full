"use client";

import { useEffect, useState } from "react";

export function PageLoader() {
  const [mounted, setMounted] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const hide = () => {
      setFadeOut(true);
      const id = setTimeout(() => setMounted(false), 400);
      return () => clearTimeout(id);
    };

    if (typeof document === "undefined") return;

    if (document.readyState === "complete") {
      const id = setTimeout(hide, 800);
      return () => clearTimeout(id);
    }

    const onLoad = () => setTimeout(hide, 600);
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  if (!mounted) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-[var(--bg)] transition-opacity duration-500 ease-out ${fadeOut ? "pointer-events-none" : ""}`}
      style={{ opacity: fadeOut ? 0 : 1 }}
      aria-hidden
    >
      <div className="flex flex-col items-center gap-6">
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
        <span className="text-sm font-medium text-[var(--fg-muted)]">
          CortexFlow
        </span>
      </div>
    </div>
  );
}
