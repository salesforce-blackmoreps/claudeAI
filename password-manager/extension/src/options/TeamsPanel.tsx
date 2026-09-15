import { useEffect, useState } from "react";
import {
  createTeam,
  getTeam,
  inviteTeamMember,
  removeTeamMember,
  acceptTeamInvite,
  listMyInvites,
  listMyTeams,
  ApiError,
  type MyInviteDto,
  type MyTeamDto,
  type TeamMemberDto,
} from "../lib/api-client";
import { getAccessToken } from "../background/vault-session";

/**
 * Team membership management (paid multi-user teams — distinct from direct
 * per-item sharing, which lives in the popup's ShareItemPanel). Requires the
 * vault to be unlocked (we read the access token straight from
 * chrome.storage.session, same as the popup — this page is an equally
 * trusted extension context).
 */
export function TeamsPanel() {
  const [accessToken, setAccessToken] = useState<string | null | undefined>(undefined);
  const [invites, setInvites] = useState<MyInviteDto[]>([]);
  const [teams, setTeams] = useState<MyTeamDto[]>([]);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [members, setMembers] = useState<TeamMemberDto[]>([]);
  const [newTeamName, setNewTeamName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getAccessToken().then(async (token) => {
      setAccessToken(token);
      if (token) await refresh(token);
    });
  }, []);

  async function refresh(token: string) {
    setInvites(await listMyInvites(token));
    setTeams(await listMyTeams(token));
  }

  async function withToken<T>(fn: (token: string) => Promise<T>): Promise<T | undefined> {
    if (!accessToken) return undefined;
    setBusy(true);
    setError(null);
    try {
      return await fn(accessToken);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateTeam(e: React.FormEvent) {
    e.preventDefault();
    await withToken(async (token) => {
      await createTeam(token, newTeamName);
      setNewTeamName("");
      await refresh(token);
    });
  }

  async function handleAcceptInvite(teamId: string) {
    await withToken(async (token) => {
      await acceptTeamInvite(token, teamId);
      await refresh(token);
    });
  }

  async function handleExpandTeam(teamId: string) {
    if (expandedTeamId === teamId) {
      setExpandedTeamId(null);
      return;
    }
    setExpandedTeamId(teamId);
    await withToken(async (token) => {
      const { members } = await getTeam(token, teamId);
      setMembers(members);
    });
  }

  async function handleInvite(e: React.FormEvent, teamId: string) {
    e.preventDefault();
    await withToken(async (token) => {
      await inviteTeamMember(token, teamId, inviteEmail);
      setInviteEmail("");
      const { members } = await getTeam(token, teamId);
      setMembers(members);
    });
  }

  async function handleRemoveMember(teamId: string, userId: string) {
    await withToken(async (token) => {
      await removeTeamMember(token, teamId, userId);
      const { members } = await getTeam(token, teamId);
      setMembers(members);
    });
  }

  if (accessToken === undefined) return <p>Loading…</p>;
  if (accessToken === null) return <p>Unlock the extension popup first to manage teams.</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 480 }}>
      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {invites.length > 0 && (
        <section>
          <h2 style={{ fontSize: 15 }}>Pending invites</h2>
          <ul>
            {invites.map((invite) => (
              <li key={invite.id} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                {invite.team.name}
                <button type="button" disabled={busy} onClick={() => handleAcceptInvite(invite.teamId)}>
                  Accept
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 style={{ fontSize: 15 }}>Your teams</h2>
        {teams.length === 0 && <p style={{ fontSize: 13, color: "#666" }}>You're not on any teams yet.</p>}
        <ul style={{ listStyle: "none", padding: 0 }}>
          {teams.map((membership) => (
            <li key={membership.teamId} style={{ marginBottom: 8 }}>
              <button type="button" onClick={() => handleExpandTeam(membership.teamId)}>
                {expandedTeamId === membership.teamId ? "▾" : "▸"} {membership.team.name} ({membership.role})
              </button>
              {expandedTeamId === membership.teamId && (
                <div style={{ paddingLeft: 16 }}>
                  <ul>
                    {members.map((member) => (
                      <li key={member.id} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        {member.user.email} — {member.role} ({member.status})
                        {member.role !== "owner" && (
                          <button type="button" disabled={busy} onClick={() => handleRemoveMember(membership.teamId, member.userId)}>
                            Remove
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                  {(membership.role === "owner" || membership.role === "admin") && (
                    <form onSubmit={(e) => handleInvite(e, membership.teamId)} style={{ display: "flex", gap: 4 }}>
                      <input
                        type="email"
                        required
                        placeholder="teammate@example.com"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                      />
                      <button type="submit" disabled={busy}>
                        Invite
                      </button>
                    </form>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 style={{ fontSize: 15 }}>Create a team</h2>
        <form onSubmit={handleCreateTeam} style={{ display: "flex", gap: 4 }}>
          <input required placeholder="Team name" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} />
          <button type="submit" disabled={busy}>
            Create
          </button>
        </form>
      </section>
    </div>
  );
}
