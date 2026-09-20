'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '../components/AppShell';
import { getBackendAuthHeaders } from '@/lib/backendAuth';

type TeamRef = { id: string; name: string };

type UserProfile = {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  phone?: string;
  role: 'admin' | 'manager' | 'executive';
  position?: string;
  is_active: boolean;
  teams?: TeamRef[];
  team_name?: string;
  created_at: string;
};

type Team = {
  id: string;
  name: string;
  manager_name?: string;
  manager_id?: string;
  member_count: number;
  project_count?: number;
  description?: string;
  created_at: string;
};

type TeamDetail = {
  team: Team;
  members: Array<{
    user_profile_id: string;
    full_name: string;
    email: string;
    role: string;
    workspace_role?: string;
    position?: string;
    is_active: boolean;
  }>;
  projects: Array<{ id: string; name: string; status: string }>;
};

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20',
  manager: 'bg-[var(--teal-soft)] text-[var(--teal)] border-[var(--border)]',
  executive: 'bg-[var(--bg-warm)] text-[var(--fg-muted)] border-[var(--border)]',
};

const ROLE_HELP: Record<string, string> = {
  admin: 'Full workspace access',
  manager: 'Can run a team and create projects',
  executive: 'Works assigned leads and calls',
};

function Modal({
  open, title, subtitle, onClose, children,
}: {
  open: boolean; title: string; subtitle?: string; onClose: () => void; children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md cf-card p-6 shadow-[var(--shadow-lg)]">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-serif text-2xl text-[var(--fg)]">{title}</h3>
            {subtitle && <p className="mt-1 text-xs text-[var(--fg-muted)]">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-[var(--fg-muted)] hover:bg-[var(--bg-warm)]">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function TeamPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [tenantId, setTenantId] = useState('');
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [activeTab, setActiveTab] = useState<'people' | 'teams'>('teams');
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TeamDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');

  const API = process.env.NEXT_PUBLIC_API_URL || '';

  const fetchData = useCallback(async () => {
    try {
      const meRes = await fetch('/api/me');
      if (!meRes.ok) return;
      const me = await meRes.json();
      const tid = me.tenantId;
      setTenantId(tid);

      const headers = await getBackendAuthHeaders();
      const [usersRes, teamsRes] = await Promise.all([
        fetch(`${API}/v1/users?tenantId=${tid}`, { headers }),
        fetch(`${API}/v1/teams?tenantId=${tid}`, { headers }),
      ]);

      if (usersRes.ok) setUsers((await usersRes.json()).users || []);
      if (teamsRes.ok) setTeams((await teamsRes.json()).teams || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [API]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const loadDetail = useCallback(async (teamId: string) => {
    if (!tenantId) return;
    setDetailLoading(true);
    try {
      const res = await fetch(`${API}/v1/teams/${teamId}?tenantId=${tenantId}`, {
        headers: await getBackendAuthHeaders(),
      });
      if (!res.ok) throw new Error('Could not load team');
      setDetail(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load team');
    } finally {
      setDetailLoading(false);
    }
  }, [API, tenantId]);

  useEffect(() => {
    if (selectedTeamId) loadDetail(selectedTeamId);
    else setDetail(null);
  }, [selectedTeamId, loadDetail]);

  const unassignedPeople = useMemo(() => {
    if (!detail) return users;
    const onTeam = new Set(detail.members.map((m) => m.user_profile_id));
    return users.filter((u) => !onTeam.has(u.id));
  }, [users, detail]);

  const actions = (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setShowCreateTeam(true)}
        className="hidden sm:flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-semibold text-[var(--fg)] hover:border-[var(--accent)]/40"
      >
        New team
      </button>
      <button
        onClick={() => setShowCreateUser(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--accent-soft)] text-[var(--accent)] rounded-lg text-xs font-semibold border border-[var(--accent)]/20 hover:bg-[var(--accent)] hover:text-white transition-colors"
      >
        Add person
      </button>
    </div>
  );

  return (
    <AppShell title="Team" actions={actions}>
      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
        <div className="cf-card p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--fg-muted)]">How this works</p>
          <h2 className="mt-1 font-serif text-xl text-[var(--fg)]">Workspace → team → people → project</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--fg-muted)]">
            A <span className="font-semibold text-[var(--fg)]">team</span> is the sales group that owns campaigns.
            Add people to a team, then assign that team when you create a project. Workspace roles (admin / manager / executive) control permissions; team membership controls who works which campaigns.
          </p>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5">
              <p className="font-semibold text-[var(--fg)]">1. Create a team</p>
              <p className="mt-0.5 text-[var(--fg-muted)]">e.g. Mumbai sales</p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5">
              <p className="font-semibold text-[var(--fg)]">2. Add people</p>
              <p className="mt-0.5 text-[var(--fg-muted)]">They get a login for this workspace</p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5">
              <p className="font-semibold text-[var(--fg)]">3. Assign a project</p>
              <p className="mt-0.5 text-[var(--fg-muted)]">
                From <Link href="/projects" className="text-[var(--accent)] font-semibold">Projects</Link>
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl w-fit">
          {([
            { id: 'teams', label: `Teams (${teams.length})` },
            { id: 'people', label: `People (${users.length})` },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setSelectedTeamId(null); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : activeTab === 'teams' ? (
          teams.length === 0 ? (
            <div className="cf-card px-6 py-14 text-center">
              <p className="font-serif text-2xl text-[var(--fg)]">No teams yet</p>
              <p className="mt-2 text-sm text-[var(--fg-muted)] max-w-md mx-auto">
                Create a team first. Projects can attach to it later — you no longer need a project just to have a team.
              </p>
              <button onClick={() => setShowCreateTeam(true)} className="cf-btn-primary mt-5 inline-flex">
                Create a team
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              <div className="lg:col-span-2 space-y-2">
                {teams.map((team) => (
                  <button
                    key={team.id}
                    onClick={() => setSelectedTeamId(team.id)}
                    className={`w-full text-left p-4 rounded-xl border transition-all ${
                      selectedTeamId === team.id
                        ? 'border-[var(--accent)]/50 bg-[var(--accent-soft)]'
                        : 'border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--accent)]/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-[var(--fg)] truncate">{team.name}</p>
                        <p className="text-xs text-[var(--fg-muted)] mt-0.5">
                          {team.manager_name ? `Lead: ${team.manager_name}` : 'No lead assigned'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-bold text-[var(--accent)]">{team.member_count}</p>
                        <p className="text-[10px] text-[var(--fg-muted)]">people</p>
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] text-[var(--fg-muted)]">
                      {Number(team.project_count || 0)} project{Number(team.project_count || 0) === 1 ? '' : 's'}
                    </p>
                  </button>
                ))}
                <button
                  onClick={() => setShowCreateTeam(true)}
                  className="w-full rounded-xl border-2 border-dashed border-[var(--border)] p-3 text-sm text-[var(--fg-muted)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
                >
                  + New team
                </button>
              </div>

              <div className="lg:col-span-3 cf-card p-5 min-h-[280px]">
                {!selectedTeamId ? (
                  <p className="text-sm text-[var(--fg-muted)] py-12 text-center">Select a team to see people and projects.</p>
                ) : detailLoading || !detail ? (
                  <div className="flex justify-center py-16">
                    <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <TeamDetailPanel
                    detail={detail}
                    unassignedPeople={unassignedPeople}
                    tenantId={tenantId}
                    api={API}
                    onChanged={() => { fetchData(); loadDetail(detail.team.id); }}
                    onError={setError}
                  />
                )}
              </div>
            </div>
          )
        ) : (
          <div className="space-y-2">
            {users.map((user) => (
              <div key={user.id} className="flex items-center gap-4 p-4 cf-card">
                <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center shrink-0">
                  <span className="text-[var(--accent)] font-bold text-sm">{user.full_name?.charAt(0)?.toUpperCase() || '?'}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-[var(--fg)] text-sm">{user.full_name}</p>
                    {!user.is_active && <span className="text-[10px] px-1.5 py-0.5 rounded border border-red-500/20 text-red-500">Inactive</span>}
                  </div>
                  <p className="text-xs text-[var(--fg-muted)]">{user.email}</p>
                  {user.position && <p className="text-xs text-[var(--fg-muted)] mt-0.5">{user.position}</p>}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0 max-w-[50%]">
                  {(user.teams || []).map((t) => (
                    <span key={t.id} className="text-[11px] bg-[var(--bg)] border border-[var(--border)] px-2 py-0.5 rounded-lg text-[var(--fg-muted)]">
                      {t.name}
                    </span>
                  ))}
                  <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border ${ROLE_COLORS[user.role] || ROLE_COLORS.executive}`}>
                    {user.role}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <CreateTeamModal
        open={showCreateTeam}
        onClose={() => setShowCreateTeam(false)}
        tenantId={tenantId}
        users={users}
        api={API}
        onCreated={(id) => {
          setShowCreateTeam(false);
          fetchData();
          setActiveTab('teams');
          setSelectedTeamId(id);
        }}
      />
      <CreateUserModal
        open={showCreateUser}
        onClose={() => setShowCreateUser(false)}
        onCreated={() => { fetchData(); if (selectedTeamId) loadDetail(selectedTeamId); }}
        tenantId={tenantId}
        teams={teams}
        api={API}
      />
    </AppShell>
  );
}

function TeamDetailPanel({
  detail, unassignedPeople, tenantId, api, onChanged, onError,
}: {
  detail: TeamDetail;
  unassignedPeople: UserProfile[];
  tenantId: string;
  api: string;
  onChanged: () => void;
  onError: (msg: string) => void;
}) {
  const [adding, setAdding] = useState('');
  const [busy, setBusy] = useState(false);

  async function addExisting() {
    if (!adding) return;
    setBusy(true);
    try {
      const res = await fetch(`${api}/v1/teams/${detail.team.id}/members`, {
        method: 'POST',
        headers: await getBackendAuthHeaders(),
        body: JSON.stringify({ tenantId, userProfileId: adding, role: 'executive' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not add person');
      setAdding('');
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not add person');
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(userProfileId: string) {
    setBusy(true);
    try {
      const res = await fetch(`${api}/v1/teams/${detail.team.id}/members/${userProfileId}?tenantId=${tenantId}`, {
        method: 'DELETE',
        headers: await getBackendAuthHeaders(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not remove person');
      }
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not remove person');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-serif text-2xl text-[var(--fg)]">{detail.team.name}</h3>
        {detail.team.description && (
          <p className="mt-1 text-sm text-[var(--fg-muted)]">{detail.team.description}</p>
        )}
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)] mb-2">People</p>
        <div className="space-y-2">
          {detail.members.length === 0 && (
            <p className="text-xs text-[var(--fg-muted)]">Nobody on this team yet.</p>
          )}
          {detail.members.map((m) => (
            <div key={m.user_profile_id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--fg)] truncate">{m.full_name}</p>
                <p className="text-[11px] text-[var(--fg-muted)] truncate">{m.email}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] uppercase tracking-wide text-[var(--fg-muted)]">{m.role}</span>
                <button
                  disabled={busy}
                  onClick={() => removeMember(m.user_profile_id)}
                  className="text-[11px] text-[var(--fg-muted)] hover:text-red-500"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
        {unassignedPeople.length > 0 && (
          <div className="mt-3 flex gap-2">
            <select
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              className="cf-input !py-2 !text-sm flex-1"
            >
              <option value="">Add someone already in the workspace…</option>
              {unassignedPeople.map((u) => (
                <option key={u.id} value={u.id}>{u.full_name} · {u.email}</option>
              ))}
            </select>
            <button disabled={!adding || busy} onClick={addExisting} className="cf-btn-secondary !px-3 !py-2 text-xs">
              Add
            </button>
          </div>
        )}
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)] mb-2">Projects</p>
        {detail.projects.length === 0 ? (
          <p className="text-xs text-[var(--fg-muted)]">
            None yet.{' '}
            <Link href="/projects" className="font-semibold text-[var(--accent)]">Create a project</Link>
            {' '}and assign this team.
          </p>
        ) : (
          <ul className="space-y-1">
            {detail.projects.map((p) => (
              <li key={p.id} className="flex items-center justify-between text-sm">
                <span className="text-[var(--fg)]">{p.name}</span>
                <span className="text-[11px] capitalize text-[var(--fg-muted)]">{p.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CreateTeamModal({
  open, onClose, tenantId, users, api, onCreated,
}: {
  open: boolean; onClose: () => void; tenantId: string;
  users: UserProfile[]; api: string; onCreated: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [managerId, setManagerId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setName('');
      setDescription('');
      setManagerId('');
      setError('');
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Give the team a name');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${api}/v1/teams`, {
        method: 'POST',
        headers: await getBackendAuthHeaders(),
        body: JSON.stringify({
          tenantId,
          name,
          description,
          managerId: managerId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create team');
      onCreated(data.team.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New team" subtitle="You will be added automatically. Invite people next.">
      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">Team name *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mumbai sales" className="cf-input !rounded-lg !px-3 !py-2.5" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">What does this team cover?</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" className="cf-input !rounded-lg !px-3 !py-2.5" />
        </div>
        {users.length > 0 && (
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">Team lead</label>
            <select value={managerId} onChange={(e) => setManagerId(e.target.value)} className="cf-input !rounded-lg !px-3 !py-2.5">
              <option value="">You (default)</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.full_name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="cf-btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={loading} className="cf-btn-primary flex-[2]">{loading ? 'Creating…' : 'Create team'}</button>
        </div>
      </form>
    </Modal>
  );
}

function CreateUserModal({
  open, onClose, onCreated, tenantId, teams, api,
}: {
  open: boolean; onClose: () => void; onCreated: () => void;
  tenantId: string; teams: Team[]; api: string;
}) {
  const [form, setForm] = useState({
    fullName: '', email: '', password: '', phone: '',
    role: 'executive', position: '', teamId: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setForm({
        fullName: '', email: '', password: '', phone: '',
        role: 'executive', position: '', teamId: teams[0]?.id || '',
      });
      setError('');
    }
  }, [open, teams]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.fullName || !form.email || !form.password) {
      setError('Name, email and password are required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${api}/v1/users/create`, {
        method: 'POST',
        headers: await getBackendAuthHeaders(),
        body: JSON.stringify({ tenantId, ...form }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create user');
      onCreated();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add a person" subtitle="They can sign in to this workspace immediately.">
      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-3">
        {[
          { label: 'Full name *', field: 'fullName', type: 'text', placeholder: 'Priya Shah' },
          { label: 'Email *', field: 'email', type: 'email', placeholder: 'priya@company.com' },
          { label: 'Temporary password *', field: 'password', type: 'password', placeholder: '••••••••' },
          { label: 'Phone', field: 'phone', type: 'tel', placeholder: '+91 98765 43210' },
          { label: 'Job title', field: 'position', type: 'text', placeholder: 'Sales executive' },
        ].map(({ label, field, type, placeholder }) => (
          <div key={field}>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">{label}</label>
            <input
              type={type}
              value={(form as Record<string, string>)[field]}
              onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
              placeholder={placeholder}
              className="cf-input !rounded-lg !px-3 !py-2.5"
            />
          </div>
        ))}
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">Workspace role *</label>
          <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className="cf-input !rounded-lg !px-3 !py-2.5">
            <option value="executive">Executive — {ROLE_HELP.executive}</option>
            <option value="manager">Manager — {ROLE_HELP.manager}</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">Put them on a team</label>
          <select value={form.teamId} onChange={(e) => setForm((f) => ({ ...f, teamId: e.target.value }))} className="cf-input !rounded-lg !px-3 !py-2.5">
            <option value="">Assign later</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {teams.length === 0 && (
            <p className="mt-1 text-[11px] text-[var(--fg-muted)]">Create a team first if you want them grouped under a campaign owner.</p>
          )}
        </div>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="cf-btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={loading} className="cf-btn-primary flex-[2]">{loading ? 'Adding…' : 'Add person'}</button>
        </div>
      </form>
    </Modal>
  );
}
