"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { apiFetch } from "../../../../../../lib/api";
import { decrypt, parseEnv } from "../../../../../../lib/crypto";
import { supabase } from "../../../../../../lib/supabase";
import { useTeamKeyStore } from "../../../../../../store/teamKeyStore";

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
  key_names: string[];
  message?: string | null;
  pushed_by: string;
  created_at: string;
  ciphertext?: string;
  iv?: string;
};

type DiffEntry = {
  key: string;
  type: "added" | "removed" | "changed";
  before?: string;
  after?: string;
};

export default function DiffPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-slate-100 p-8 text-slate-700">Loading diff…</main>}>
      <DiffPageContent />
    </Suspense>
  );
}

function DiffPageContent() {
  const params = useParams<{ teamId: string; projectId: string }>();
  const router = useRouter();
  const teamId = params.teamId;
  const projectId = params.projectId;
  const teamKeyStore = useTeamKeyStore();
  const currentKey = useTeamKeyStore((state) => state.keys[teamId]);
  const [project, setProject] = useState<Project | null>(null);
  const [versions, setVersions] = useState<EnvVersion[]>([]);
  const [selectedEnvId, setSelectedEnvId] = useState("");
  const [leftVersion, setLeftVersion] = useState<number | null>(null);
  const [rightVersion, setRightVersion] = useState<number | null>(null);
  const [diffEntries, setDiffEntries] = useState<DiffEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamKeyInput, setTeamKeyInput] = useState("");
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const sortedVersions = useMemo(
    () => [...versions].sort((a, b) => b.version_number - a.version_number),
    [versions],
  );

  useEffect(() => {
    const ensureAccess = async () => {
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
        const initialEnvId = nextProject.environments[0]?.id ?? "";
        setSelectedEnvId(initialEnvId);

        if (initialEnvId) {
          const envVersions = await apiFetch<EnvVersion[]>(`/environments/${initialEnvId}/versions`);
          setVersions(envVersions);
          if (envVersions.length > 1) {
            setLeftVersion(envVersions[1].version_number);
            setRightVersion(envVersions[0].version_number);
          } else if (envVersions.length === 1) {
            setLeftVersion(envVersions[0].version_number);
            setRightVersion(envVersions[0].version_number);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    ensureAccess();
  }, [projectId, router, teamId]);

  useEffect(() => {
    const runCompare = async () => {
      if (!selectedEnvId || leftVersion == null || rightVersion == null || !currentKey) {
        setDiffEntries([]);
        setDecryptError(null);
        return;
      }

      const baseVersion = sortedVersions.find((version) => version.version_number === leftVersion);
      const targetVersion = sortedVersions.find((version) => version.version_number === rightVersion);
      if (!baseVersion || !targetVersion) {
        setDiffEntries([]);
        return;
      }

      try {
        const [baseRecord, targetRecord] = await Promise.all([
          apiFetch<EnvVersion>(`/environments/${selectedEnvId}/versions/${baseVersion.version_number}`),
          apiFetch<EnvVersion>(`/environments/${selectedEnvId}/versions/${targetVersion.version_number}`),
        ]);

        const [baseText, targetText] = await Promise.all([
          decrypt(baseRecord.ciphertext ?? "", baseRecord.iv ?? "", currentKey),
          decrypt(targetRecord.ciphertext ?? "", targetRecord.iv ?? "", currentKey),
        ]);

        const baseMap = parseEnv(baseText);
        const targetMap = parseEnv(targetText);
        const allKeys = Array.from(new Set([...Object.keys(baseMap), ...Object.keys(targetMap)])).sort();

        const nextEntries: DiffEntry[] = [];

        for (const key of allKeys) {
          const before = baseMap[key];
          const after = targetMap[key];

          if (!(key in baseMap)) {
            nextEntries.push({ key, type: "added", after });
            continue;
          }

          if (!(key in targetMap)) {
            nextEntries.push({ key, type: "removed", before });
            continue;
          }

          if (before !== after) {
            nextEntries.push({ key, type: "changed", before, after });
          }
        }

        setDiffEntries(nextEntries);
        setDecryptError(null);
      } catch (err) {
        console.error(err);
        setDecryptError("Wrong team key or version data is unavailable.");
        setDiffEntries([]);
      }
    };

    runCompare();
  }, [currentKey, leftVersion, rightVersion, selectedEnvId, sortedVersions]);

  const handleSaveTeamKey = () => {
    const trimmed = teamKeyInput.trim();
    if (!trimmed) return;
    teamKeyStore.setKey(teamId, trimmed);
    setTeamKeyInput("");
  };

  const handleEnvChange = async (envId: string) => {
    setSelectedEnvId(envId);
    setDiffEntries([]);
    setDecryptError(null);
    if (!envId) return;

    try {
      const envVersions = await apiFetch<EnvVersion[]>(`/environments/${envId}/versions`);
      setVersions(envVersions);
      if (envVersions.length > 1) {
        setLeftVersion(envVersions[1].version_number);
        setRightVersion(envVersions[0].version_number);
      } else if (envVersions.length === 1) {
        setLeftVersion(envVersions[0].version_number);
        setRightVersion(envVersions[0].version_number);
      } else {
        setLeftVersion(null);
        setRightVersion(null);
      }
    } catch (err) {
      console.error(err);
      setVersions([]);
      setLeftVersion(null);
      setRightVersion(null);
    }
  };

  if (loading) {
    return <main className="min-h-screen bg-slate-100 p-8 text-slate-700">Loading…</main>;
  }

  if (!project) {
    return <main className="min-h-screen bg-slate-100 p-8 text-slate-700">Project not found.</main>;
  }

  const selectedEnv = project.environments.find((env) => env.id === selectedEnvId) ?? project.environments[0] ?? null;

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Link href={`/teams/${teamId}/projects/${projectId}`} className="text-sm text-slate-600 hover:text-slate-900">
              ← Back to project
            </Link>
            <h1 className="mt-3 text-3xl font-semibold">{project.name} diff</h1>
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
            <p className="font-medium">Paste your team key to compare versions.</p>
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

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="text-sm font-medium text-slate-700">Environment</label>
              <select
                value={selectedEnvId}
                onChange={(event) => handleEnvChange(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none"
              >
                {project.environments.map((env) => (
                  <option key={env.id} value={env.id}>{env.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">Compare from</label>
              <select
                value={leftVersion ?? ""}
                onChange={(event) => setLeftVersion(event.target.value ? Number(event.target.value) : null)}
                className="mt-2 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none"
                disabled={!selectedEnvId || sortedVersions.length === 0}
              >
                {sortedVersions.map((version) => (
                  <option key={version.id} value={version.version_number}>v{version.version_number}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">Compare to</label>
              <select
                value={rightVersion ?? ""}
                onChange={(event) => setRightVersion(event.target.value ? Number(event.target.value) : null)}
                className="mt-2 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none"
                disabled={!selectedEnvId || sortedVersions.length === 0}
              >
                {sortedVersions.map((version) => (
                  <option key={version.id} value={version.version_number}>v{version.version_number}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {decryptError && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{decryptError}</p>}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Changes</h2>
            {leftVersion != null && rightVersion != null && (
              <p className="text-sm text-slate-500">Comparing v{leftVersion} → v{rightVersion}</p>
            )}
          </div>

          {diffEntries.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              {selectedEnv ? "No differences to show yet." : "Select an environment to compare."}
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {diffEntries.map((entry) => {
                const hidden = !revealed[entry.key];
                const badgeClass =
                  entry.type === "added"
                    ? "bg-emerald-100 text-emerald-700"
                    : entry.type === "removed"
                      ? "bg-rose-100 text-rose-700"
                      : "bg-amber-100 text-amber-700";

                return (
                  <div key={entry.key} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${badgeClass}`}>{entry.type}</span>
                      <button
                        type="button"
                        onClick={() => setRevealed((current) => ({ ...current, [entry.key]: !current[entry.key] }))}
                        className="text-xs font-medium text-slate-700 hover:text-slate-900"
                      >
                        {hidden ? "Reveal" : "Hide"}
                      </button>
                    </div>
                    <p className="mt-3 font-medium text-slate-900">{entry.key}</p>

                    {entry.type === "added" && (
                      <div className="mt-2 rounded-lg bg-white p-3 font-mono text-sm text-slate-700">
                        {hidden ? "••••••••••••" : entry.after ?? ""}
                      </div>
                    )}

                    {entry.type === "removed" && (
                      <div className="mt-2 rounded-lg bg-white p-3 font-mono text-sm text-slate-700">
                        {hidden ? "••••••••••••" : entry.before ?? ""}
                      </div>
                    )}

                    {entry.type === "changed" && (
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div>
                          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Before</p>
                          <div className="mt-2 rounded-lg bg-white p-3 font-mono text-sm text-slate-700">
                            {hidden ? "••••••••••••" : entry.before ?? ""}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">After</p>
                          <div className="mt-2 rounded-lg bg-white p-3 font-mono text-sm text-slate-700">
                            {hidden ? "••••••••••••" : entry.after ?? ""}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
