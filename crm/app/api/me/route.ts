import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ user: null }, { status: 401 });
    }
    return NextResponse.json({ user: { email: session.user.email } });
  } catch {
    return NextResponse.json({ user: null }, { status: 401 });
  }
}
