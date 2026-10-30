"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "../../lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const done = useRef(false);

  const go = useCallback((to: string) => {
    if (done.current) return;
    if (typeof window !== "undefined" && window.location.pathname === to) return;
    done.current = true;
    router.replace(to);
  }, [router]);

  useEffect(() => {
    let active = true;

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;

      if (data.session) {
        go("/dashboard");
        return;
      }

      setReady(true);
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;

      if (session) {
        go("/dashboard");
        return;
      }

      if (event === "SIGNED_OUT") {
        setReady(true);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [go]);

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-700">
        Checking sign-in state…
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
            EnvShare
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-900">Sign in</h1>
        </div>

        <button
          type="button"
          onClick={async () => {
            const { error } = await supabase.auth.signInWithOAuth({
              provider: "google",
              options: {
                redirectTo: `${window.location.origin}/auth/callback`,
              },
            });

            if (error) {
              console.error(error);
            }
          }}
          className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700"
        >
          Continue with Google
        </button>
      </div>
    </main>
  );
}
