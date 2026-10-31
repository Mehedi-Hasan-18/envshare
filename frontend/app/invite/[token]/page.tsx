"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

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
  const acceptingRef = useRef(false);
  const [status, setStatus] = useState(() => {
    if (typeof window === "undefined") return "Saving invite details…";
    const errorFromUrl = new URLSearchParams(window.location.search).get("error");
    return errorFromUrl || "Saving invite details…";
  });

  useEffect(() => {
    if (!token) return;
    if (acceptingRef.current) return;
    if (new URLSearchParams(window.location.search).has("error")) return;

    const run = async () => {
      acceptingRef.current = true;
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
        const result = await apiFetch<{ team_id: string }>(`/invites/${token}/accept`, { method: "POST" });
        const teamKeyStore = useTeamKeyStore.getState();
        if (teamKey) {
          teamKeyStore.setKey(result.team_id, teamKey);
        } else {
          const notice = encodeURIComponent("The team key was missing from the link. Paste it manually to continue.");
          router.replace(`/teams/${result.team_id}?inviteNotice=${notice}`);
          localStorage.removeItem("pendingInvite");
          return;
        }
        localStorage.removeItem("pendingInvite");
        setStatus("Invite accepted. Redirecting…");
        router.replace(`/teams/${result.team_id}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to process this invite. Please try again.";
        localStorage.removeItem("pendingInvite");
        setStatus(message);
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
        <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium text-slate-700 underline">
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
