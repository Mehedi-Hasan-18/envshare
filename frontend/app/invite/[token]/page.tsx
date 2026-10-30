"use client";

import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { apiFetch } from "../../../lib/api";
import { supabase } from "../../../lib/supabase";
import { useTeamKeyStore } from "../../../store/teamKeyStore";

export default function InviteLandingPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-700">Loading invite…</main>}>
      <InviteLandingPageContent />
    </Suspense>
  );
}

function InviteLandingPageContent() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [status, setStatus] = useState("Saving invite details…");

  useEffect(() => {
    const run = async () => {
      const teamKey = window.location.hash.replace(/^#/, "");
      localStorage.setItem(
        "pendingInvite",
        JSON.stringify({
          token,
          teamKey,
        }),
      );

      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setStatus("Redirecting to sign in…");
        router.replace("/login");
        return;
      }

      try {
        const result = await apiFetch<{ team_id: string }>(`/invites/${token}/accept`);
        const teamKeyStore = useTeamKeyStore.getState();
        if (teamKey) {
          teamKeyStore.setKey(result.team_id, teamKey);
        }
        localStorage.removeItem("pendingInvite");
        setStatus("Invite accepted. Redirecting…");
        router.replace(`/teams/${result.team_id}`);
      } catch (error) {
        console.error(error);
        setStatus("This invite is invalid or has expired.");
      }
    };

    run();
  }, [router, token]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 text-slate-700">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm uppercase tracking-[0.2em] text-slate-500">EnvShare</p>
        <h1 className="mt-3 text-xl font-semibold text-slate-900">Invite status</h1>
        <p className="mt-3 text-sm">{status}</p>
      </div>
    </main>
  );
}
