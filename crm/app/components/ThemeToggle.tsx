'use client';

import { useEffect, useState } from 'react';

function isDark() {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(isDark());
  }, []);

  const toggle = () => {
    const next = !isDark();
    localStorage.setItem('dark-mode', String(next));
    document.documentElement.classList.toggle('dark', next);
    setDark(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={`inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-semibold text-[var(--fg)] transition-colors hover:border-[var(--accent)]/40 ${className}`}
      title={dark ? 'Switch to light mode' : 'Switch to night mode'}
      aria-label={dark ? 'Switch to light mode' : 'Switch to night mode'}
    >
      {dark ? (
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="5" />
          <path strokeLinecap="round" d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      ) : (
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
        </svg>
      )}
      <span className="hidden sm:inline">{dark ? 'Day' : 'Night'}</span>
    </button>
  );
}
