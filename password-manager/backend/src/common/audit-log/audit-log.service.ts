import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Append-only security audit trail (invariant #3): every entry records
 * *what happened* — actor, event type, target id, non-secret metadata — and
 * never decrypted vault content, master password/keys, or any plaintext
 * credential. Callers must only ever pass metadata that is safe to store
 * and read back in the clear (ids, timestamps, counts, email addresses of
 * the actor/target — never item field values).
 */
export const AUDIT_EVENTS = {
  LOGIN_SUCCEEDED: "auth.login.succeeded",
  LOGIN_FAILED: "auth.login.failed",
  LOGIN_LOCKED_OUT: "auth.login.locked_out",
  SIGNUP: "auth.signup",
  ITEM_DELETED: "vault.item.deleted",
  SHARE_GRANTED: "sharing.share.granted",
  SHARE_REVOKED: "sharing.share.revoked",
  SHARE_KEY_ROTATED: "sharing.item_key.rotated",
  TEAM_MEMBER_INVITED: "team.member.invited",
  TEAM_MEMBER_REMOVED: "team.member.removed",
  PLAN_CHANGED: "billing.plan.changed",
} as const;

export interface AuditLogEvent {
  actorUserId?: string | null;
  teamId?: string | null;
  eventType: string;
  targetId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(event: AuditLogEvent): Promise<void> {
    await this.prisma.auditLogEntry.create({
      data: {
        actorUserId: event.actorUserId ?? null,
        teamId: event.teamId ?? null,
        eventType: event.eventType,
        targetId: event.targetId ?? null,
        metadata: event.metadata ? { ...event.metadata } : undefined,
      },
    });
  }
}
