"use client";

import { useState } from "react";

import { apiFetch } from "../../lib/api";
import { encrypt, generateTeamKey } from "../../lib/crypto";

export default function SharePage() {
  const [text, setText] = useState("");
  const [ttlHours, setTtlHours] = useState<number>(24);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setError("Paste text or a .env file before creating a share link.");
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const key = await generateTeamKey();
      const { ciphertext, iv } = await encrypt(trimmed, key);
      const result = await apiFetch<{ id: string; expires_at: string }>("/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ciphertext, iv, ttl_hours: ttlHours }),
      });

      const nextLink = `${window.location.origin}/s/${result.id}#${key}`;
      setLink(nextLink);
      await navigator.clipboard.writeText(nextLink);
    } catch (err) {
      console.error(err);
      setError("Unable to create the share link.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">EnvShare</p>
          <h1 className="mt-3 text-3xl font-semibold">One-time share</h1>
        </div>

        {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <label className="block text-sm font-medium text-slate-700">Text to share</label>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={12}
            placeholder="DATABASE_URL=...\nAPI_KEY=..."
            className="mt-3 w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm text-slate-800 outline-none"
          />

          <div className="mt-4 flex items-center gap-3">
            <label className="text-sm font-medium text-slate-700">Expiry</label>
            <select
              value={ttlHours}
              onChange={(event) => setTtlHours(Number(event.target.value))}
              className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none"
            >
              <option value={1}>1 hour</option>
              <option value={24}>24 hours</option>
              <option value={168}>7 days</option>
            </select>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? "Creating…" : "Create share link"}
            </button>
          </div>
        </section>

        {link && (
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
            <p className="font-medium">Share link copied to clipboard.</p>
            <p className="mt-2 break-all font-mono text-xs">{link}</p>
          </section>
        )}
      </div>
    </main>
  );
}
