import React from "react";
import { createRoot } from "react-dom/client";

// Phase 5/6 replace this with org management and billing settings UI.
function OptionsApp() {
  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>Settings</h1>
      <p>Scaffolding in progress.</p>
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
