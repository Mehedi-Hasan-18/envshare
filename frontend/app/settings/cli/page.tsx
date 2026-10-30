"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "../../../lib/api";
import { supabase } from "../../../lib/supabase";

type TokenRow = {
  id: string;
  name: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export default function CliSettingsPage() {
  const [tokenName, setTokenName] = useState("EnvShare CLI");
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTokens = async () => {
    try {
      const rows = await apiFetch<TokenRow[]>("/tokens");
      setTokens(rows);
    } catch (err) {
      console.error(err);
      setError("Unable to load CLI tokens.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const ensureAuth = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        window.location.href = "/login";
        return;
      }
      await loadTokens();
    };

    ensureAuth();
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);

    try {
      const result = await apiFetch<{ id: string; name: string; token: string; created_at: string }>("/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: tokenName.trim() || "EnvShare CLI" }),
      });

      setNewToken(result.token);
      await loadTokens();
    } catch (err) {
      console.error(err);
      setError("Could not create a CLI token.");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await apiFetch<{ status: string; id: string }>(`/tokens/${id}`, { method: "DELETE" });
      await loadTokens();
    } catch (err) {
      console.error(err);
      setError("Could not revoke that token.");
    }
  };

  if (loading) {
    return <main className="min-h-screen bg-slate-100 p-8 text-slate-700">Loading CLI settings…</main>;
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">EnvShare</p>
          <h1 className="mt-3 text-3xl font-semibold">CLI tokens</h1>
        </div>

        {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        {newToken && (
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
            <p className="font-medium">New CLI token created. Copy it now — it won’t be shown again.</p>
            <div className="mt-3 flex items-center gap-3">
              <code className="flex-1 break-all rounded-lg bg-white/80 p-3 font-mono text-xs">{newToken}</code>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(newToken)}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
              >
                Copy
              </button>
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex gap-3">
            <input
              value={tokenName}
              onChange={(event) => setTokenName(event.target.value)}
              placeholder="Token name"
              className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none"
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? "Creating…" : "Create token"}
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold">Existing tokens</h2>
          {tokens.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No CLI tokens created yet.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {tokens.map((token) => (
                <div key={token.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div>
                    <p className="font-medium text-slate-900">{token.name}</p>
                    <p className="mt-1 text-xs text-slate-500">Created: {new Date(token.created_at).toLocaleString()}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {token.revoked_at ? `Revoked: ${new Date(token.revoked_at).toLocaleString()}` : token.last_used_at ? `Last used: ${new Date(token.last_used_at).toLocaleString()}` : "Never used"}
                    </p>
                  </div>
                  {!token.revoked_at && (
                    <button
                      type="button"
                      onClick={() => handleRevoke(token.id)}
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
