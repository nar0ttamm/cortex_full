'use client';

import { useState, useRef, useEffect } from 'react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://cortex-backend-api.vercel.app';

type FormState = 'idle' | 'loading' | 'success' | 'error';

const FEATURES = [
  {
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 014.99 12c-.98-2.46-1.63-5.01-1.93-8a2 2 0 011.99-2.18h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L9.91 9.91a16 16 0 006.18 6.18l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
    ),
    title: 'AI Calls Every Lead in <2 min',
    desc: 'Your AI agent dials the moment a lead arrives — 24/7, no delays.',
  },
  {
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    ),
    title: 'Project-Centric CRM',
    desc: 'Organise leads by project, assign teams, track every interaction.',
  },
  {
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 10V3L4 14h7v7l9-11h-7z" />
    ),
    title: 'WhatsApp + Email, Automated',
    desc: 'Instant notifications to leads and your team across 4 channels.',
  },
  {
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    ),
    title: 'Live Pipeline & Analytics',
    desc: 'Kanban board, conversion funnel, and call outcomes — all real-time.',
  },
];

export function BookDemoButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [state, setState] = useState<FormState>('idle');
  const [error, setError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => nameRef.current?.focus(), 150);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose();
    }
    if (open) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !whatsapp.trim()) { setError('Please fill in all fields.'); return; }
    const cleaned = whatsapp.replace(/\s/g, '');
    if (!/^\+?[0-9]{10,15}$/.test(cleaned)) {
      setError('Enter a valid WhatsApp number with country code, e.g. +919876543210.');
      return;
    }
    setState('loading');
    setError('');
    try {
      const res = await fetch(`${BACKEND_URL}/v1/demo/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), whatsapp_number: cleaned }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
      setState('success');
    } catch (err: unknown) {
      setState('error');
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  function handleClose() {
    setOpen(false);
    setTimeout(() => { setState('idle'); setError(''); setName(''); setWhatsapp(''); }, 350);
  }

  return (
    <>
      {/* CTA Button */}
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full border border-[var(--accent)] px-7 py-3.5 text-sm font-semibold text-[var(--accent)] transition hover:bg-[var(--accent)] hover:text-[var(--bg)] hover:shadow-[0_0_24px_var(--glow)] sm:text-base"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        Book a Demo
      </button>

      {/* Full-screen overlay */}
      {open && (
        <div className="fixed inset-0 z-[999] flex overflow-hidden">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={handleClose} />

          {/* Panel — slides up on mobile, centered on desktop */}
          <div className="relative m-auto flex w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/10 shadow-2xl md:flex-row"
               style={{ maxHeight: '92vh' }}>

            {/* ── LEFT: features ── */}
            <div className="hidden md:flex flex-col justify-between bg-gradient-to-br from-[#0b1929] to-[#061420] p-10 md:w-[46%] shrink-0">
              {/* Logo + headline */}
              <div>
                <div className="mb-8 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)]/20 text-[var(--accent)]">
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <span className="text-lg font-extrabold tracking-tight text-white">CortexFlow</span>
                </div>

                <h2 className="text-3xl font-extrabold leading-tight text-white">
                  See Your AI Sales<br />
                  <span className="text-[var(--accent)]">OS in Action</span>
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-white/50">
                  Drop your number — our AI agent calls you in under 2 minutes with a live demo of the full product.
                </p>

                {/* Features */}
                <ul className="mt-8 space-y-5">
                  {FEATURES.map((f, i) => (
                    <li key={i} className="flex items-start gap-4">
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          {f.icon}
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">{f.title}</p>
                        <p className="text-xs leading-relaxed text-white/45 mt-0.5">{f.desc}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Social proof */}
              <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex gap-1 mb-2">
                  {[1,2,3,4,5].map(s => (
                    <svg key={s} className="h-4 w-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                    </svg>
                  ))}
                </div>
                <p className="text-xs italic text-white/60 leading-relaxed">
                  &ldquo;CortexFlow cut our lead response time from hours to seconds. Our conversion rate went up 3x in the first month.&rdquo;
                </p>
                <p className="mt-2 text-[11px] font-semibold text-white/40">— Real Estate Sales Director, Mumbai</p>
              </div>
            </div>

            {/* ── RIGHT: form ── */}
            <div className="flex flex-col bg-[#0d1f33] p-8 md:p-10 flex-1 overflow-y-auto">
              {/* Close */}
              <button
                onClick={handleClose}
                className="absolute right-5 top-5 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/60 hover:bg-white/20 hover:text-white transition"
                aria-label="Close"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {state === 'success' ? (
                <div className="flex flex-col items-center justify-center flex-1 text-center py-10">
                  <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[var(--accent)]/15 ring-8 ring-[var(--accent)]/10">
                    <svg className="h-10 w-10 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-extrabold text-white">You&apos;re booked!</h3>
                  <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/55">
                    Our AI agent is dialling your number right now. Pick up — it&apos;s your live demo call.
                  </p>
                  <p className="mt-2 text-xs text-white/35">
                    You&apos;ll also get a WhatsApp message. Reply &ldquo;RETRY&rdquo; anytime to get called again.
                  </p>
                  <button
                    onClick={handleClose}
                    className="mt-8 rounded-xl bg-[var(--accent)] px-8 py-3.5 text-sm font-bold text-[var(--bg)] transition hover:opacity-90"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <>
                  {/* Mobile headline */}
                  <div className="mb-8 md:hidden text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent)]/15">
                      <svg className="h-6 w-6 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <h2 className="text-xl font-extrabold text-white">Book a Live Demo</h2>
                    <p className="mt-1 text-sm text-white/50">Our AI calls you in under 2 minutes</p>
                  </div>

                  <div className="hidden md:block mb-8">
                    <h2 className="text-2xl font-extrabold text-white">Get your live demo call</h2>
                    <p className="mt-1.5 text-sm text-white/50">
                      Enter your details — the AI rings you within 2 minutes.
                    </p>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-5 flex-1">
                    <div>
                      <label className="block text-sm font-semibold text-white/70 mb-2">Your Name</label>
                      <input
                        ref={nameRef}
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Rahul Sharma"
                        disabled={state === 'loading'}
                        className="w-full rounded-xl border border-white/10 bg-white/5 px-5 py-4 text-base text-white placeholder-white/25 outline-none transition focus:border-[var(--accent)]/60 focus:bg-white/8 focus:ring-2 focus:ring-[var(--accent)]/20 disabled:opacity-50"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-white/70 mb-2">WhatsApp Number</label>
                      <input
                        type="tel"
                        value={whatsapp}
                        onChange={e => setWhatsapp(e.target.value)}
                        placeholder="+91 98765 43210"
                        disabled={state === 'loading'}
                        className="w-full rounded-xl border border-white/10 bg-white/5 px-5 py-4 text-base text-white placeholder-white/25 outline-none transition focus:border-[var(--accent)]/60 focus:bg-white/8 focus:ring-2 focus:ring-[var(--accent)]/20 disabled:opacity-50"
                      />
                      <p className="mt-1.5 text-xs text-white/30">Include country code — e.g. +91 for India</p>
                    </div>

                    {error && (
                      <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3">
                        <p className="text-sm text-red-400">{error}</p>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={state === 'loading'}
                      className="w-full rounded-xl bg-[var(--accent)] py-4 text-base font-bold text-[var(--bg)] shadow-lg transition hover:opacity-90 hover:shadow-[0_0_32px_var(--glow)] disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                    >
                      {state === 'loading' ? (
                        <span className="flex items-center justify-center gap-2.5">
                          <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Connecting your demo…
                        </span>
                      ) : (
                        'Book Demo — AI Calls You Now'
                      )}
                    </button>

                    {/* Trust badges */}
                    <div className="flex items-center justify-center gap-5 pt-1">
                      <div className="flex items-center gap-1.5 text-xs text-white/30">
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        No spam
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-white/30">
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Under 2 min
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-white/30">
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Free trial
                      </div>
                    </div>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
