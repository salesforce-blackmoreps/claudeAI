import { useEffect, useState } from "react";
import { loadSession, type StoredSession } from "../lib/storage/local-store";
import { sendToBackground } from "../background/messages";
import { Signup } from "./screens/Signup";
import { Login } from "./screens/Login";
import { Unlock } from "./screens/Unlock";
import { Unlocked } from "./screens/Unlocked";

type Screen =
  | { name: "loading" }
  | { name: "signup" }
  | { name: "login" }
  | { name: "unlock"; session: StoredSession }
  | { name: "unlocked"; email: string };

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: "loading" });

  useEffect(() => {
    void resolveInitialScreen().then(setScreen);
  }, []);

  switch (screen.name) {
    case "loading":
      return <div style={{ padding: 16 }}>Loading…</div>;
    case "signup":
      return <Signup onSignedUp={() => refresh(setScreen)} onSwitchToLogin={() => setScreen({ name: "login" })} />;
    case "login":
      return <Login onLoggedIn={() => refresh(setScreen)} onSwitchToSignup={() => setScreen({ name: "signup" })} />;
    case "unlock":
      return (
        <Unlock
          session={screen.session}
          onUnlocked={() => refresh(setScreen)}
          onSessionInvalid={() => setScreen({ name: "login" })}
        />
      );
    case "unlocked":
      return (
        <Unlocked
          email={screen.email}
          onLocked={() => refresh(setScreen)}
          onLoggedOut={() => refresh(setScreen)}
        />
      );
  }
}

async function resolveInitialScreen(): Promise<Screen> {
  const session = await loadSession();
  if (!session) {
    return { name: "signup" };
  }
  const status = await sendToBackground<{ unlocked: boolean }>({ type: "VAULT_STATUS" });
  return status.unlocked ? { name: "unlocked", email: session.email } : { name: "unlock", session };
}

function refresh(setScreen: (screen: Screen) => void): void {
  void resolveInitialScreen().then(setScreen);
}
