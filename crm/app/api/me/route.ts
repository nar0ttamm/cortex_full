import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getSession } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ user: null, tenantId: null, role: null }, { status: 401 });
    }
    let role = 'admin';
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && serviceKey) {
      const admin = createAdminClient(url, serviceKey);
      const { data } = await admin
        .from('user_profiles')
        .select('role')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (typeof data?.role === 'string' && data.role) role = data.role;
    }
    return NextResponse.json({
      user: { email: session.user.email, id: session.user.id },
      tenantId: session.tenantId,
      role,
    });
  } catch {
    return NextResponse.json({ user: null, tenantId: null, role: null }, { status: 401 });
  }
}
