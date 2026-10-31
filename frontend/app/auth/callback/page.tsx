"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { apiFetch } from "../../../lib/api";
import { supabase } from "../../../lib/supabase";
import { useTeamKeyStore } from "../../../store/teamKeyStore";

export default function AuthCallbackPage() {
  const router = useRouter();
  const done = useRef(false);
  const acceptingRef = useRef(false);

  useEffect(() => {
    const redirect = (to: string) => {
      if (done.current) return;
      if (typeof window !== "undefined" && window.location.pathname === to) return;
      done.current = true;
      router.replace(to);
    };

    const handlePendingInvite = async () => {
      if (acceptingRef.current) return;
      acceptingRef.current = true;

      const pendingInviteRaw = localStorage.getItem("pendingInvite");
      if (!pendingInviteRaw) {
        redirect("/dashboard");
        return;
      }

      let pendingInvite: { token?: string; teamKey?: string } = {};
      try {
        pendingInvite = JSON.parse(pendingInviteRaw) as { token?: string; teamKey?: string };
        if (!pendingInvite.token) {
          localStorage.removeItem("pendingInvite");
          redirect("/dashboard");
          return;
        }

        const result = await apiFetch<{ team_id: string }>(`/invites/${pendingInvite.token}/accept`, { method: "POST" });
        if (pendingInvite.teamKey) {
          useTeamKeyStore.getState().setKey(result.team_id, pendingInvite.teamKey);
          localStorage.removeItem("pendingInvite");
          redirect(`/teams/${result.team_id}`);
          return;
        }
        localStorage.removeItem("pendingInvite");
        redirect(`/teams/${result.team_id}?inviteNotice=${encodeURIComponent("The team key was missing from the link. Paste it manually to continue.")}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "The invite could not be processed.";
        const isTransientNetworkError = error instanceof TypeError;
        if (!isTransientNetworkError) {
          localStorage.removeItem("pendingInvite");
        }
        if (pendingInvite?.token) {
          redirect(`/invite/${pendingInvite.token}?error=${encodeURIComponent(message)}`);
          return;
        }
        redirect("/dashboard");
      }
    };

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        handlePendingInvite();
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (acceptingRef.current) return;
      if (session) {
        handlePendingInvite();
        return;
      }

      if (event === "SIGNED_OUT") {
        redirect("/login");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100">
      <p className="text-slate-700">Finishing sign in…</p>
    </main>
  );
}
