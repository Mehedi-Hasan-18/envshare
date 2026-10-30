"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { apiFetch } from "../../../lib/api";
import { supabase } from "../../../lib/supabase";
import { useTeamKeyStore } from "../../../store/teamKeyStore";

export default function AuthCallbackPage() {
  const router = useRouter();
  const done = useRef(false);

  useEffect(() => {
    const redirect = (to: string) => {
      if (done.current) return;
      if (typeof window !== "undefined" && window.location.pathname === to) return;
      done.current = true;
      router.replace(to);
    };

    const handlePendingInvite = async () => {
      const pendingInviteRaw = localStorage.getItem("pendingInvite");
      if (!pendingInviteRaw) {
        redirect("/dashboard");
        return;
      }

      try {
        const pendingInvite = JSON.parse(pendingInviteRaw) as { token?: string; teamKey?: string };
        if (!pendingInvite.token) {
          redirect("/dashboard");
          return;
        }

        const result = await apiFetch<{ team_id: string }>(`/invites/${pendingInvite.token}/accept`);
        if (pendingInvite.teamKey) {
          useTeamKeyStore.getState().setKey(result.team_id, pendingInvite.teamKey);
        }
        localStorage.removeItem("pendingInvite");
        redirect(`/teams/${result.team_id}`);
      } catch (error) {
        console.error(error);
        redirect("/dashboard");
      }
    };

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        handlePendingInvite();
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
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
