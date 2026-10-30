"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { apiFetch } from "../../../../../lib/api";
import { decrypt, encrypt, parseEnv } from "../../../../../lib/crypto";
import { supabase } from "../../../../../lib/supabase";
import { useTeamKeyStore } from "../../../../../store/teamKeyStore";

type Project = {
  id: string;
  name: string;
  team_id: string;
  environments: { id: string; name: string }[];
};

type EnvVersion = {
  id: string;
  environment_id: string;
  version_number: number;
  ciphertext: string;
  iv: string;
  key_names: string[];
  message?: string | null;
  pushed_by: string;
  created_at: string;
};

export default function ProjectPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-slate-100 p-8 text-slate-700">Loading…</main>}>
      <ProjectPageContent />
    </Suspense>
  );
}

function ProjectPageContent() {
  const params = useParams<{ teamId: string; projectId: string }>();
  const router = useRouter();
  const { teamId, projectId } = params;
  const teamKeyStore = useTeamKeyStore();
  const currentKey = useTeamKeyStore((state) => state.keys[teamId]);
  const [project, setProject] = useState<Project | null>(null);
  const [selectedEnvId, setSelectedEnvId] = useState<string>("");
  const [latestVersion, setLatestVersion] = useState<EnvVersion | null>(null);
  const [versionHistory, setVersionHistory] = useState<EnvVersion[]>([]);
  const [pushText, setPushText] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [pushLoading, setPushLoading] = useState(false);
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [decryptedEnv, setDecryptedEnv] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [teamKeyInput, setTeamKeyInput] = useState("");

  const selectedEnv = useMemo(
    () => project?.environments.find((env) => env.id === selectedEnvId) ?? null,
    [project, selectedEnvId],
  );

  useEffect(() => {
    const ensureAuth = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/login");
        return;
      }

      try {
        const teams = await apiFetch<{ id: string; name: string }[]>("/teams");
        if (!teams.some((team) => team.id === teamId)) {
          router.replace("/dashboard");
          return;
        }

        const projectList = await apiFetch<Project[]>(`/teams/${teamId}/projects`);
        const nextProject = projectList.find((item) => item.id === projectId) ?? null;
        if (!nextProject) {
          router.replace(`/teams/${teamId}`);
          return;
        }

        setProject(nextProject);
        setSelectedEnvId(nextProject.environments[0]?.id ?? "");
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    ensureAuth();
  }, [projectId, router, teamId]);

  useEffect(() => {
    const loadLatestVersion = async () => {
      if (!selectedEnvId || !currentKey) {
        setLatestVersion(null);
        setVersionHistory([]);
        setDecryptedEnv({});
        return;
      }

      try {
        const [freshLatest, list] = await Promise.all([
          apiFetch<EnvVersion>(`/environments/${selectedEnvId}/versions/latest`),
          apiFetch<EnvVersion[]>(`/environments/${selectedEnvId}/versions`),
        ]);

        setLatestVersion(freshLatest);
        setVersionHistory(list);

        try {
          const decrypted = await decrypt(freshLatest.ciphertext, freshLatest.iv, currentKey);
          setDecryptedEnv(parseEnv(decrypted));
          setDecryptError(null);
        } catch {
          setDecryptError("Wrong team key");
          setDecryptedEnv({});
        }
      } catch (err) {
        console.error(err);
        setLatestVersion(null);
        setVersionHistory([]);
        setDecryptedEnv({});
      }
    };

    loadLatestVersion();
  }, [currentKey, selectedEnvId]);

  const handleSaveTeamKey = () => {
    const trimmed = teamKeyInput.trim();
    if (!trimmed) return;
    teamKeyStore.setKey(teamId, trimmed);
    setTeamKeyInput("");
  };

  const handlePush = async () => {
    if (!selectedEnvId || !currentKey) return;
    if (!pushText.trim()) return;

    setPushLoading(true);
    try {
      const payload = parseEnv(pushText);
      const { ciphertext, iv } = await encrypt(pushText, currentKey);
      await apiFetch(`/environments/${selectedEnvId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ciphertext,
          iv,
          key_names: Object.keys(payload),
          message: message.trim() || undefined,
        }),
      });

      setPushText("");
      setMessage("");
      const [latest, list] = await Promise.all([
        apiFetch<EnvVersion>(`/environments/${selectedEnvId}/versions/latest`),
        apiFetch<EnvVersion[]>(`/environments/${selectedEnvId}/versions`),
      ]);
      setLatestVersion(latest);
      setVersionHistory(list);
      setDecryptError(null);
      const decrypted = await decrypt(latest.ciphertext, latest.iv, currentKey);
      setDecryptedEnv(parseEnv(decrypted));
    } catch (err) {
      console.error(err);
      setDecryptError("Push failed.");
    } finally {
      setPushLoading(false);
    }
  };

  if (loading) {
    return <main className="min-h-screen bg-slate-100 p-8 text-slate-700">Loading…</main>;
  }

  if (!project) {
    return <main className="min-h-screen bg-slate-100 p-8 text-slate-700">Project not found.</main>;
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Link href={`/teams/${teamId}`} className="text-sm text-slate-600 hover:text-slate-900">
              ← Back to team
            </Link>
            <h1 className="mt-3 text-3xl font-semibold">{project.name}</h1>
          </div>
          {currentKey && (
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(currentKey)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Copy team key
            </button>
          )}
        </div>

        {!currentKey && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            <p className="font-medium">Paste your team key to decrypt and push envs.</p>
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

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {project.environments.map((env) => (
              <button
                key={env.id}
                type="button"
                onClick={() => setSelectedEnvId(env.id)}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${
                  env.id === selectedEnvId
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {env.name}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-semibold">Push {selectedEnv?.name ?? "environment"}</h2>
            <textarea
              value={pushText}
              onChange={(event) => setPushText(event.target.value)}
              rows={12}
              placeholder="DATABASE_URL=...\nAPI_KEY=..."
              className="mt-4 w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm text-slate-800 outline-none"
            />
            <input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Optional message"
              className="mt-3 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none"
            />
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handlePush}
                disabled={pushLoading || !selectedEnvId || !currentKey}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pushLoading ? "Pushing…" : "Push version"}
              </button>
            </div>
          </section>

          <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-semibold">Latest version</h2>
            {latestVersion ? (
              <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">v{latestVersion.version_number}</p>
                <p>{latestVersion.message || "No message"}</p>
                <p className="mt-1 text-xs text-slate-500">{new Date(latestVersion.created_at).toLocaleString()}</p>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">No version pushed yet.</p>
            )}

            {decryptError && <p className="mt-4 text-sm text-red-700">{decryptError}</p>}
          </aside>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold">Environment values</h2>
          {!latestVersion || !currentKey ? (
            <p className="mt-3 text-sm text-slate-500">Add a team key to view the decrypted environment.</p>
          ) : Object.keys(decryptedEnv).length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No values are available yet, or the key is invalid.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {Object.entries(decryptedEnv).map(([key, value]) => {
                const hidden = !revealed[key];
                return (
                  <div key={key} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-slate-800">{key}</p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setRevealed((current) => ({ ...current, [key]: !current[key] }))}
                          className="text-xs font-medium text-slate-700 hover:text-slate-900"
                        >
                          {hidden ? "Reveal" : "Hide"}
                        </button>
                        <button
                          type="button"
                          onClick={() => navigator.clipboard.writeText(value)}
                          className="text-xs font-medium text-slate-700 hover:text-slate-900"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                    <p className="mt-2 rounded-lg bg-white px-3 py-2 font-mono text-sm text-slate-700">
                      {hidden ? "••••••••••••" : value}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Version history</h2>
            {versionHistory.length > 1 && (
              <Link
                href={`/teams/${teamId}/projects/${projectId}/diff`}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Compare versions
              </Link>
            )}
          </div>
          {versionHistory.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No history yet.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {versionHistory.map((version) => (
                <div key={version.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-900">v{version.version_number}</p>
                    <span className="text-xs text-slate-500">{new Date(version.created_at).toLocaleString()}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{version.message || "No message"}</p>
                  <p className="mt-1 text-xs text-slate-500">Pushed by: {version.pushed_by}</p>
                  <p className="mt-1 text-xs text-slate-500">keys: {version.key_names.join(", ") || "—"}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
