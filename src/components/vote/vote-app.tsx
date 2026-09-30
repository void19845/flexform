"use client";

import { useEffect, useState } from "react";
import { LoginForm } from "@/components/vote/login-form";
import { VotePage } from "@/components/vote/vote-page";
import { api } from "@/lib/client/api";

/** loading : en attente de /api/me ; login : formulaire de connexion, avec un message éventuel ; poll : page de vote */
type View = { name: "loading" } | { name: "login"; message: string } | { name: "poll" };

/** Page des votants : connexion par pseudo, puis sondages. */
export function VoteApp() {
  const [view, setView] = useState<View>({ name: "loading" });

  useEffect(() => {
    void api<{ pseudo: string | null }>("/api/me").then(({ pseudo }) =>
      setView(pseudo ? { name: "poll" } : { name: "login", message: "" }),
    );
  }, []);

  if (view.name === "loading") return null;
  if (view.name === "login") {
    // key : un nouveau message recrée le formulaire (le message n'est lu qu'à l'ouverture)
    return <LoginForm key={view.message} message={view.message} onJoined={() => setView({ name: "poll" })} />;
  }
  return <VotePage onSignedOut={(message = "") => setView({ name: "login", message })} />;
}
