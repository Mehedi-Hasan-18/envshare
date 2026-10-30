"use client";

import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { apiFetch } from "../../../lib/api";
import { decrypt } from "../../../lib/crypto";

export default function SharedSecretPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-slate-100 p-8 text-slate-700">Loading shared content…</main>}>
      <SharedSecretPageContent />
    </Suspense>
  );
}

function SharedSecretPageContent() {
  const params = useParams<{ id: string }>();
  const [secret, setSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      const shareId = params.id;
      const key = window.location.hash.replace(/^#/, "");

      if (!shareId || !key) {
        setError("This link is missing the decryption key.");
        setLoading(false);
        return;
      }

      try {
        const payload = await apiFetch<{ ciphertext: string; iv: string }>(`/share/${shareId}`);
        const decrypted = await decrypt(payload.ciphertext, payload.iv, key);
        setSecret(decrypted);
      } catch (err) {
        console.error(err);
        setError("This link has expired or has already been used.");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [params.id]);

  if (loading) {
    return <main className="min-h-screen bg-slate-100 p-8 text-slate-700">Loading shared content…</main>;
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">EnvShare</p>
        <h1 className="mt-3 text-2xl font-semibold">Shared content</h1>

        {error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        ) : secret ? (
          <pre className="mt-4 overflow-x-auto rounded-xl bg-slate-50 p-4 text-sm whitespace-pre-wrap text-slate-700">
            {secret}
          </pre>
        ) : null}
      </div>
    </main>
  );
}
