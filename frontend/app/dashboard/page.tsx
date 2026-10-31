"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { apiFetch } from "../../lib/api";
import { generateTeamKey } from "../../lib/crypto";
import { supabase } from "../../lib/supabase";
import { useTeamKeyStore } from "../../store/teamKeyStore";

type CurrentUser = {
  id: string;
  email: string;
  name: string;
  avatar_url?: string | null;
};

type Team = {
  id: string;
  name: string;
  owner_id: string;
  created_at?: string;
};

type TeamJoinRequest = {
  id: string;
  team_id: string;
  user_id: string;
  status: "pending" | "accepted" | "declined";
  message: string | null;
  created_at: string;
  updated_at: string | null;
  user_name: string | null;
  email: string | null;
};

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamName, setTeamName] = useState("");
  const [pendingRequests, setPendingRequests] = useState<
    { id: string; teamId: string; teamName: string; userName: string | null; email: string | null; createdAt: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [teamKeyNotice, setTeamKeyNotice] = useState<{ teamId: string; key: string } | null>(null);
  const teamKeyStore = useTeamKeyStore();
  const done = useRef(false);

  const go = useCallback((to: string) => {
    if (done.current) return;
    if (typeof window !== "undefined" && window.location.pathname === to) return;
    done.current = true;
    router.replace(to);
  }, [router]);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));

      const { data: sessionData } = await supabase.auth.getSession();
      if (!mounted) return;
      if (!sessionData.session) {
        go("/login");
        return;
      }

      try {
        const [profile, teamList] = await Promise.all([
          apiFetch<CurrentUser>("/auth/me"),
          apiFetch<Team[]>("/teams"),
        ]);
        const ownedTeams = teamList.filter((team) => team.owner_id === profile.id);
        const requestCollections = await Promise.all(
          ownedTeams.map(async (team) => {
            try {
              const requests = await apiFetch<TeamJoinRequest[]>(`/teams/${team.id}/join-requests`);
              return requests
                .filter((request) => request.status === "pending")
                .map((request) => ({
                  id: request.id,
                  teamId: team.id,
                  teamName: team.name,
                  userName: request.user_name,
                  email: request.email,
                  createdAt: request.created_at,
                }));
            } catch {
              return [];
            }
          }),
        );
        if (!mounted) return;
        setUser(profile);
        setTeams(teamList);
        setPendingRequests(requestCollections.flat());
        setLoading(false);
      } catch (e) {
        console.error("Dashboard error:", e);
        if (!mounted) return;

        setLoading(false);

        try {
          const { data: retry } = await supabase.auth.getSession();
          if (retry.session) {
            const [profile, teamList] = await Promise.all([
              apiFetch<CurrentUser>("/auth/me"),
              apiFetch<Team[]>("/teams"),
            ]);
            if (!mounted) return;
            setUser(profile);
            setTeams(teamList);
            return;
          }
        } catch (e2) {
          console.error("Retry failed:", e2);
        }

        go("/login");
      }
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (_event === "SIGNED_OUT" && !session) {
        go("/login");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [go]);

  const handleCreateTeam = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmed = teamName.trim();
    if (!trimmed) return;

    setSaving(true);
    try {
      const nextTeam = await apiFetch<Team>("/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });

      const generatedKey = await generateTeamKey();
      teamKeyStore.setKey(nextTeam.id, generatedKey);
      setTeamKeyNotice({ teamId: nextTeam.id, key: generatedKey });
      setTeams((current) => [nextTeam, ...current]);
      setTeamName("");
    } catch (error) {
      console.error(error);
      alert("Team creation failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    go("/login");
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-700">
        Loading dashboard…
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">EnvShare</p>
            <h1 className="mt-2 text-3xl font-semibold">Dashboard</h1>
          </div>
          <div className="flex items-center gap-3">
            {user && <span className="text-sm text-slate-600">{user.name}</span>}
            <Link
              href="/settings/cli"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              CLI tokens
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </header>

        {teamKeyNotice && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em]">Team key created</p>
                <p className="mt-2 text-sm">Copy this team key and keep it safe. It cannot be recovered later.</p>
              </div>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(teamKeyNotice.key)}
                className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-500"
              >
                Copy key
              </button>
            </div>
            <code className="mt-4 block break-all rounded-xl bg-white/80 p-3 text-xs font-mono">
              {teamKeyNotice.key}
            </code>
          </section>
        )}

        {pendingRequests.length > 0 && (
          <section className="rounded-2xl border border-violet-200 bg-violet-50 p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-700">Notifications</p>
                <h2 className="mt-1 text-xl font-semibold text-violet-900">Pending team join requests</h2>
              </div>
            </div>
            <div className="space-y-3">
              {pendingRequests.map((request) => (
                <div key={request.id} className="rounded-xl border border-violet-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-800">{request.userName || "Unknown user"}</p>
                      <p className="text-sm text-slate-500">{request.email || "No email"}</p>
                    </div>
                    <Link href={`/teams/${request.teamId}`} className="text-sm font-medium text-violet-700 hover:text-violet-900">
                      Review →
                    </Link>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{request.teamName} • {new Date(request.createdAt).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Your teams</h2>
              <p className="mt-1 text-sm text-slate-500">Create a new team or open an existing one.</p>
            </div>
            <form onSubmit={handleCreateTeam} className="flex w-full max-w-xl gap-3">
              <input
                value={teamName}
                onChange={(event) => setTeamName(event.target.value)}
                placeholder="New team name"
                className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 outline-none ring-0"
              />
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Creating…" : "Create team"}
              </button>
            </form>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {teams.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500 md:col-span-2">
                No teams yet. Create one to get started.
              </div>
            )}

            {teams.map((team) => (
              <Link
                key={team.id}
                href={`/teams/${team.id}`}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300 hover:bg-slate-100"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">{team.name}</h3>
                    <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">Team</p>
                  </div>
                  <span className="text-sm font-medium text-slate-600">Open →</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
