'use client';

import { useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { BrandMark } from '../components/BrandMark';
import { ThemeToggle } from '../components/ThemeToggle';

const INDUSTRIES = [
  'Real Estate',
  'Education',
  'Healthcare',
  'Finance & Insurance',
  'Retail & E-commerce',
  'Technology',
  'Manufacturing',
  'Travel & Hospitality',
  'Automotive',
  'Other',
];

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'Perfect for small teams',
    features: ['Up to 500 leads/month', '100 AI calls/month', 'WhatsApp + Email', '1 team', 'Email support'],
    badge: null,
  },
  {
    id: 'growth',
    name: 'Growth',
    tagline: 'For scaling sales teams',
    features: ['Up to 5,000 leads/month', '1,000 AI calls/month', 'WhatsApp + Email', 'Unlimited teams', 'Google Calendar sync', 'Priority support'],
    badge: 'Most Popular',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'For large organisations',
    features: ['Unlimited leads', 'Unlimited AI calls', 'Custom integrations', 'Dedicated account manager', 'SLA support', 'Custom AI training'],
    badge: null,
  },
];

type OnboardingData = {
  fullName: string;
  companyName: string;
  phone: string;
  email: string;
  password: string;
  position: string;
  industry: string;
  address: string;
  gstin: string;
  plan: string;
};

const INITIAL: OnboardingData = {
  fullName: '',
  companyName: '',
  phone: '',
  email: '',
  password: '',
  position: '',
  industry: '',
  address: '',
  gstin: '',
  plan: 'growth',
};

function StepIndicator({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {[1, 2, 3].map((s) => (
        <div key={s} className="flex items-center gap-2">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              s < step
                ? 'bg-[var(--accent)] text-white'
                : s === step
                ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/40'
                : 'bg-[var(--bg)] text-[var(--fg-muted)] border border-[var(--border)]'
            }`}
          >
            {s < step ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              s
            )}
          </div>
          {s < 3 && (
            <div className={`w-12 h-px ${s < step ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'}`} />
          )}
        </div>
      ))}
      <div className="ml-3 text-xs text-[var(--fg-muted)]">
        {step === 1 && 'Your details'}
        {step === 2 && 'Company info'}
        {step === 3 && 'Choose plan'}
      </div>
    </div>
  );
}

function InputField({
  label, type = 'text', value, onChange, placeholder, required = false, hint,
}: {
  label: string; type?: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; hint?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
        {label} {required && <span className="text-[var(--accent)]">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="cf-input"
      />
      {hint && <p className="mt-1 text-[11px] text-[var(--fg-muted)]">{hint}</p>}
    </div>
  );
}

function OnboardingForm() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<OnboardingData>(INITIAL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (field: keyof OnboardingData) => (v: string) =>
    setData((d) => ({ ...d, [field]: v }));

  function validateStep1() {
    if (!data.fullName.trim()) return 'Full name is required';
    if (!data.companyName.trim()) return 'Company name is required';
    if (!data.phone.trim()) return 'Phone number is required';
    if (!data.email.trim() || !data.email.includes('@')) return 'Valid email is required';
    if (!data.password.trim() || data.password.length < 6) return 'Password must be at least 6 characters';
    return null;
  }

  function validateStep2() {
    if (!data.position.trim()) return 'Your position/role is required';
    if (!data.industry) return 'Please select your industry';
    return null;
  }

  function nextStep() {
    setError('');
    if (step === 1) {
      const err = validateStep1();
      if (err) { setError(err); return; }
    }
    if (step === 2) {
      const err = validateStep2();
      if (err) { setError(err); return; }
    }
    setStep((s) => s + 1);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const supabase = createClient();

      // 1. Create Supabase auth user
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            full_name: data.fullName,
            company_name: data.companyName,
          },
        },
      });

      if (signUpError) throw new Error(signUpError.message);
      if (!authData.user) throw new Error('User creation failed');

      // 2. Provision tenant + user_profile via API route
      const provisionRes = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: authData.user.id,
          fullName: data.fullName,
          companyName: data.companyName,
          phone: data.phone,
          email: data.email,
          position: data.position,
          industry: data.industry,
          address: data.address,
          gstin: data.gstin || null,
          plan: data.plan,
        }),
      });

      const provisionData = await provisionRes.json();
      if (!provisionRes.ok) throw new Error(provisionData.error || 'Onboarding failed');

      // 3. Sign in (in case email confirmation is disabled, user is already signed in)
      // Refresh session
      await supabase.auth.getSession();

      // 4. Redirect to dashboard
      router.push('/?onboarding=complete');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--bg)] px-4 py-12">
      <div className="pointer-events-none absolute -left-[10%] top-[-18%] h-[520px] w-[520px] rounded-full bg-[var(--accent-soft)] blur-[120px]" />
      <div className="pointer-events-none absolute -right-[8%] bottom-[-16%] h-[420px] w-[420px] rounded-full bg-[var(--teal-soft)] blur-[100px]" />

      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle />
      </div>
      <div className="relative z-10 mx-auto w-full max-w-lg">
        <div className="mb-8 text-center">
          <div className="mb-5 flex justify-center">
            <BrandMark href="/" />
          </div>
          <p className="eyebrow mx-auto">Onboarding</p>
          <h1 className="mt-3 font-serif text-4xl leading-tight">Get started.</h1>
          <p className="mt-2 text-sm text-[var(--fg-muted)]">Set up your AI-powered CRM in under a minute</p>
        </div>

        <div className="cf-card p-8 shadow-[var(--shadow-md)]">
          <StepIndicator step={step} />

          {error && (
            <div className="mb-5 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <h2 className="mb-4 font-serif text-2xl text-[var(--fg)]">Tell us about you</h2>
              <InputField label="Full Name" value={data.fullName} onChange={set('fullName')} placeholder="Your name" required />
              <InputField label="Company Name" value={data.companyName} onChange={set('companyName')} placeholder="Acme Real Estate" required />
              <InputField label="Phone Number" type="tel" value={data.phone} onChange={set('phone')} placeholder="+91 98765 43210" required hint="Include country code" />
              <InputField label="Email" type="email" value={data.email} onChange={set('email')} placeholder="you@company.com" required />
              <InputField label="Password" type="password" value={data.password} onChange={set('password')} placeholder="••••••••" required hint="At least 6 characters" />
              <button onClick={nextStep} className="cf-btn-primary mt-2 w-full">
                Continue →
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="mb-4 font-serif text-2xl text-[var(--fg)]">About your company</h2>
              <InputField label="Your Position / Role" value={data.position} onChange={set('position')} placeholder="Sales Manager, CEO, etc." required />
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
                  Industry <span className="text-[var(--accent)]">*</span>
                </label>
                <select
                  value={data.industry}
                  onChange={(e) => set('industry')(e.target.value)}
                  className="cf-input"
                >
                  <option value="">Select industry…</option>
                  {INDUSTRIES.map((ind) => (
                    <option key={ind} value={ind}>{ind}</option>
                  ))}
                </select>
              </div>
              <InputField label="Address" value={data.address} onChange={set('address')} placeholder="Mumbai, Maharashtra" hint="City, State or full address" />
              <InputField label="GSTIN" value={data.gstin} onChange={set('gstin')} placeholder="Optional" hint="Optional — for GST invoicing" />
              <div className="flex gap-3 pt-2">
                <button onClick={() => setStep(1)} className="cf-btn-secondary flex-1">
                  ← Back
                </button>
                <button onClick={nextStep} className="cf-btn-primary flex-[2]">
                  Continue →
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <form onSubmit={handleSubmit}>
              <h2 className="mb-1 font-serif text-2xl text-[var(--fg)]">Choose your plan</h2>
              <p className="mb-5 text-xs text-[var(--fg-muted)]">All plans start with a <span className="font-semibold text-[var(--accent)]">3-day free trial</span>. No credit card required.</p>
              <div className="space-y-3 mb-6">
                {PLANS.map((plan) => (
                  <label
                    key={plan.id}
                    className={`relative flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all ${
                      data.plan === plan.id
                        ? 'border-[var(--accent)]/50 bg-[var(--accent-soft)]'
                        : 'border-[var(--border)] bg-[var(--bg)] hover:border-[var(--accent)]/30'
                    }`}
                  >
                    <input
                      type="radio"
                      name="plan"
                      value={plan.id}
                      checked={data.plan === plan.id}
                      onChange={() => set('plan')(plan.id)}
                      className="sr-only"
                    />
                    <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                      data.plan === plan.id ? 'border-[var(--accent)] bg-[var(--accent)]' : 'border-[var(--border)]'
                    }`}>
                      {data.plan === plan.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[var(--fg)]">{plan.name}</span>
                        {plan.badge && (
                          <span className="px-2 py-0.5 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] text-[10px] font-bold uppercase tracking-wide">
                            {plan.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--fg-muted)] mt-0.5">{plan.tagline}</p>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                        {plan.features.slice(0, 3).map((f) => (
                          <span key={f} className="text-[11px] text-[var(--fg-muted)] flex items-center gap-1">
                            <svg className="w-3 h-3 text-[var(--accent)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-[var(--fg-muted)] line-through">—</div>
                      <div className="text-sm font-bold text-[var(--accent)]">Free Trial</div>
                    </div>
                  </label>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="cf-btn-secondary flex-1"
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="cf-btn-primary flex-[2] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Setting up your workspace…
                    </span>
                  ) : (
                    'Start Free Trial →'
                  )}
                </button>
              </div>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-[var(--fg-muted)]">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)]">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
      </div>
    }>
      <OnboardingForm />
    </Suspense>
  );
}
