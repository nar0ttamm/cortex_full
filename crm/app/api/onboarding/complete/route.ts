import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/onboarding/complete
 *
 * Called after client-side signUp succeeds.
 * Creates the tenant row (id = user.id so tenantId works out of the box),
 * user_profile row, and marks onboarding_completed = true.
 *
 * Uses service role key to bypass RLS (if enabled).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      userId,
      fullName,
      companyName,
      phone,
      email,
      position,
      industry,
      address,
      gstin,
      plan,
    } = body;

    if (!userId || !fullName || !companyName || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Use service role key to write directly — bypasses RLS
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const supabase = createClient(supabaseUrl, serviceKey);

    // Generate a slug from company name
    const slug = companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) + '-' + userId.slice(0, 8);

    // 1. Create tenant — use userId as tenant id so tenantId == userId works
    // Note: admin_user_id is NOT set here because auth.users replication may not
    // be visible yet — user_profiles.role='admin' is the source of truth instead.
    const { error: tenantErr } = await supabase
      .from('tenants')
      .upsert({
        id: userId,
        name: companyName,
        slug,
        status: 'active',
        onboarding_completed: true,
        plan: plan || 'starter',
        industry: industry || null,
        address: address || null,
        gstin: gstin || null,
        trial_ends_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        settings: {},
      }, { onConflict: 'id' });

    if (tenantErr) {
      console.error('[onboarding] tenant creation error:', tenantErr);
      return NextResponse.json({ error: tenantErr.message }, { status: 500 });
    }

    // 2. Create user_profile
    const { error: profileErr } = await supabase
      .from('user_profiles')
      .upsert({
        user_id: userId,
        tenant_id: userId,
        full_name: fullName,
        phone: phone || null,
        role: 'admin',
        position: position || null,
        is_active: true,
      }, { onConflict: 'user_id' });

    if (profileErr) {
      console.error('[onboarding] user_profile creation error:', profileErr);
      // Non-fatal — tenant was created, user can still log in
    }

    // 3. Log activity
    try {
      await supabase.from('activity_logs').insert({
        tenant_id: userId,
        user_id: userId,
        action_type: 'user_created',
        entity_type: 'tenant',
        entity_id: userId,
        metadata: {
          company_name: companyName,
          plan,
          industry,
          source: 'self_serve_onboarding',
        },
      });
    } catch {
      // Best-effort
    }

    return NextResponse.json({ success: true, tenantId: userId });
  } catch (err: unknown) {
    console.error('[onboarding] unexpected error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}
