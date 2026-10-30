"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { apiFetch } from "../../../lib/api";
import { supabase } from "../../../lib/supabase";
import { useTeamKeyStore } from "../../../store/teamKeyStore";

type Team = {
  id: string;
  name: string;
  owner_id: string;
  created_at?: string;
};

type TeamMember = {
  id: string;
  team_id: string;
  user_id: string;
  role: string;
  name: string | null;
  email: string | null;
};

type Project = {
  id: string;
  name: string;
  team_id: string;
  environments: { id: string; name: string }[];
};

type AuditEntry = {
  id: string;
  team_id: string;
  user_id: string;
  action: string;
  target: string;
  user_name: string;
  created_at: string;
};

export default function TeamPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-slate-100 p-8 text-slate-700">Loading…</main>}>
      <TeamPageContent />
    </Suspense>
  );
}

function TeamPageContent() {
  const params = useParams<{ teamId: string }>();
  const router = useRouter();
  const teamId = params.teamId;
  const teamKeyStore = useTeamKeyStore();
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectName, setProjectName] = useState("");
  const [teamKeyInput, setTeamKeyInput] = useState("");
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [activeTab, setActiveTab] = useState<"projects" | "activity">("projects");
  const [loading, setLoading] = useState(true);
  const [savingProject, setSavingProject] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const keys = useTeamKeyStore((state) => state.keys);
  const currentKey = useMemo(() => keys[teamId], [keys, teamId]);

  useEffect(() => {
    const ensureAuthenticated = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/login");
        return;
      }

      try {
        const teams = await apiFetch<Team[]>("/teams");
        const nextTeam = teams.find((item) => item.id === teamId) ?? null;
        setTeam(nextTeam);

        if (!nextTeam) {
          router.replace("/dashboard");
          return;
        }

        const [memberList, projectList, auditList] = await Promise.all([
          apiFetch<TeamMember[]>(`/teams/${teamId}/members`),
          apiFetch<Project[]>(`/teams/${teamId}/projects`),
          apiFetch<AuditEntry[]>(`/teams/${teamId}/audit`),
        ]);

        setMembers(memberList);
        setProjects(projectList);
        setAuditEntries(auditList);
      } catch (err) {
        console.error(err);
        setError("Unable to load team details.");
      } finally {
        setLoading(false);
      }
    };

    ensureAuthenticated();
  }, [router, teamId]);

  const handleSaveTeamKey = () => {
    const trimmed = teamKeyInput.trim();
    if (!trimmed) {
      setError("Paste a team key to continue.");
      return;
    }

    teamKeyStore.setKey(teamId, trimmed);
    setTeamKeyInput("");
    setError(null);
  };

  const handleCreateProject = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = projectName.trim();
    if (!trimmed) return;

    setSavingProject(true);
    try {
      const nextProject = await apiFetch<Project>(`/teams/${teamId}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });

      setProjects((current) => [...current, nextProject]);
      setProjectName("");
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Project creation failed.");
    } finally {
      setSavingProject(false);
    }
  };

  const handleCreateInvite = async () => {
    if (!currentKey) {
      setError("Paste a team key before creating an invite link.");
      return;
    }

    try {
      const result = await apiFetch<{ token: string; expires_at: string }>(`/teams/${teamId}/invites`, {
        method: "POST",
      });

      const nextInviteLink = `${window.location.origin}/invite/${result.token}#${currentKey}`;
      setInviteLink(nextInviteLink);
      await navigator.clipboard.writeText(nextInviteLink);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Invite creation failed.");
    }
  };

  if (loading) {
    return <main className="min-h-screen bg-slate-100 p-8 text-slate-700">Loading…</main>;
  }

  if (!team) {
    return <main className="min-h-screen bg-slate-100 p-8 text-slate-700">Team not found.</main>;
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Link href="/dashboard" className="text-sm text-slate-600 hover:text-slate-900">
              ← Back to dashboard
            </Link>
            <h1 className="mt-3 text-3xl font-semibold">{team.name}</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleCreateInvite}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Create invite
            </button>
            <button
              type="button"
              onClick={() => {
                if (!currentKey) return;
                navigator.clipboard.writeText(currentKey);
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Copy team key
            </button>
          </div>
        </div>

        {inviteLink && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="font-medium">Invite link copied to clipboard.</p>
            <p className="mt-2 break-all font-mono text-xs">{inviteLink}</p>
          </div>
        )}

        {!currentKey && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            <p className="font-medium">Paste your team key to decrypt env values.</p>
            <div className="mt-3 flex gap-3">
              <input
                value={teamKeyInput}
                onChange={(event) => setTeamKeyInput(event.target.value)}
                placeholder="Paste team key"
                className="flex-1 rounded-lg border border-amber-200 bg-white px-3 py-2 text-slate-900 outline-none"
              />
              <button
                type="button"
                onClick={handleSaveTeamKey}
                className="rounded-lg bg-amber-600 px-4 py-2 font-medium text-white hover:bg-amber-500"
              >
                Save key
              </button>
            </div>
          </section>
        )}

        {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        <div className="mb-6 flex gap-2 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setActiveTab("projects")}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              activeTab === "projects" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Projects
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("activity")}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              activeTab === "activity" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Activity
          </button>
        </div>

        {activeTab === "projects" ? (
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Projects</h2>
              </div>

              <form onSubmit={handleCreateProject} className="mt-4 flex gap-3">
                <input
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  placeholder="New project name"
                  className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 outline-none"
                />
                <button
                  type="submit"
                  disabled={savingProject}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingProject ? "Creating…" : "Create project"}
                </button>
              </form>

              <div className="mt-6 space-y-3">
                {projects.length === 0 && (
                  <p className="text-sm text-slate-500">No projects yet. Create one to get started.</p>
                )}
                {projects.map((project) => (
                  <Link
                    key={project.id}
                    href={`/teams/${teamId}/projects/${project.id}`}
                    className="block rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300 hover:bg-slate-100"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">{project.name}</h3>
                        <p className="text-sm text-slate-500">
                          {project.environments.length} environment{project.environments.length === 1 ? "" : "s"}
                        </p>
                      </div>
                      <span className="text-sm font-medium text-slate-600">Open →</span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>

            <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-semibold">Members</h2>
              <div className="mt-5 space-y-3">
                {members.map((member) => (
                  <div key={member.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
                    <div>
                      <p className="font-medium text-slate-800">{member.name || "Unknown user"}</p>
                      <p className="text-sm text-slate-500">{member.email || "No email"}</p>
                    </div>
                    <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-medium uppercase tracking-wide text-slate-700">
                      {member.role}
                    </span>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        ) : (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-semibold">Activity</h2>
            <div className="mt-5 space-y-3">
              {auditEntries.length === 0 ? (
                <p className="text-sm text-slate-500">No recent activity yet.</p>
              ) : (
                auditEntries.map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-800">{entry.user_name}</p>
                        <p className="text-sm text-slate-600 uppercase tracking-wide">{entry.action}</p>
                      </div>
                      <span className="text-xs text-slate-500">
                        {new Date(entry.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{entry.target}</p>
                  </div>
                ))
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
