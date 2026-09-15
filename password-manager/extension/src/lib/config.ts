// Overridden at build time for staging/production via Vite env vars; defaults
// to the local dev backend from infra/docker/docker-compose.yml.
export const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL ?? "http://localhost:3000";
