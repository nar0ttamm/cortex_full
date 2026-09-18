'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { BrandMark } from '../components/BrandMark';
import { ThemeToggle } from '../components/ThemeToggle';

function LoginForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const err = searchParams.get('error');
    if (err === 'auth') setError('Authentication failed. Please try again.');
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }
      const next = searchParams.get('next') || '/';
      router.push(next);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--bg)] px-4 py-10">
      <div className="pointer-events-none absolute -left-[10%] top-[-18%] h-[520px] w-[520px] rounded-full bg-[var(--accent-soft)] blur-[120px]" />
      <div className="pointer-events-none absolute -right-[8%] bottom-[-16%] h-[420px] w-[420px] rounded-full bg-[var(--teal-soft)] blur-[100px]" />

      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle />
      </div>
      <div className="relative z-10 mx-auto w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-5 flex justify-center">
            <BrandMark href="/" />
          </div>
          <p className="eyebrow mx-auto">Workspace</p>
          <h1 className="mt-3 font-serif text-4xl leading-tight">Welcome back.</h1>
          <p className="mt-2 text-sm text-[var(--fg-muted)]">Sign in to your CortexFlow AI desk</p>
        </div>

        <div className="cf-card p-7 shadow-[var(--shadow-md)] sm:p-8">
          {error && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/60 dark:bg-red-950/40">
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="cf-input"
                placeholder="you@company.com"
                required
                autoComplete="email"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="cf-input"
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>
            <button type="submit" disabled={loading} className="cf-btn-primary mt-2 w-full">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in...
                </span>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-[var(--fg-muted)]">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)]">
              Get started
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
