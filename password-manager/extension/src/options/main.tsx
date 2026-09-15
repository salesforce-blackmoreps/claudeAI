import React from "react";
import { createRoot } from "react-dom/client";
import { TeamsPanel } from "./TeamsPanel";

// Phase 6 adds billing settings here alongside team management.
function OptionsApp() {
  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>Settings</h1>
      <TeamsPanel />
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <OptionsApp />
    </React.StrictMode>,
  );
}
