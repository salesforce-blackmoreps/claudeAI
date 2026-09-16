import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EntitlementsService, TeamMemberLimitExceededError } from "../entitlements/entitlements.service";
import { AuditLogService, AUDIT_EVENTS } from "../common/audit-log/audit-log.service";

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly auditLog: AuditLogService,
  ) {}

  async createTeam(ownerId: string, name: string) {
    return this.prisma.$transaction(async (tx) => {
      const team = await tx.team.create({ data: { name, ownerUserId: ownerId } });
      await tx.teamMember.create({
        data: { teamId: team.id, userId: ownerId, role: "owner", status: "active", joinedAt: new Date() },
      });
      return team;
    });
  }

  async getTeam(userId: string, teamId: string) {
    await this.assertIsActiveMember(userId, teamId);
    const team = await this.prisma.team.findUniqueOrThrow({ where: { id: teamId } });
    const members = await this.prisma.teamMember.findMany({
      where: { teamId },
      include: { user: { select: { id: true, email: true, publicKey: true } } },
      orderBy: { invitedAt: "asc" },
    });
    return { team, members };
  }

  async inviteMember(teamId: string, inviterId: string, email: string) {
    await this.assertIsAdminOrOwner(inviterId, teamId);

    // TeamInviteEntitlementGuard already checked the team-size cap at the
    // route level, but that's a plain COUNT with no lock — concurrent
    // invites to the same team can each pass it before any of their inserts
    // land (same class of bug as VaultService.create; see its comment for
    // the load-test that confirmed it there). Re-check here, serialized per
    // team via a Postgres advisory lock inside the same transaction as the
    // insert/update.
    let member;
    let invitedUserId: string | null;
    try {
      ({ member, invitedUserId } = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${teamId}))`;

        const invitee = await tx.user.findUnique({ where: { email } });
        if (invitee) {
          const existing = await tx.teamMember.findUnique({
            where: { teamId_userId: { teamId, userId: invitee.id } },
          });
          if (existing && existing.status !== "removed") {
            throw new ConflictException("This person is already invited to or a member of this team.");
          }
          if (!existing || existing.status === "removed") {
            await this.entitlements.assertCanInviteTeamMember(teamId, tx);
          }
          const member = existing
            ? await tx.teamMember.update({
                where: { id: existing.id },
                data: { status: "pending", invitedAt: new Date(), joinedAt: null, inviteEmail: null },
              })
            : await tx.teamMember.create({
                data: { teamId, userId: invitee.id, role: "member", status: "pending" },
              });
          return { member, invitedUserId: invitee.id };
        }

        // No account yet: store a pending invite keyed by email instead of
        // rejecting outright. AuthService.signup() links it to the new
        // user's id the moment they register with this exact address — see
        // the field comment on TeamMember.inviteEmail in schema.prisma.
        const existingByEmail = await tx.teamMember.findUnique({
          where: { teamId_inviteEmail: { teamId, inviteEmail: email } },
        });
        if (existingByEmail && existingByEmail.status !== "removed") {
          throw new ConflictException("This person is already invited to this team.");
        }
        if (!existingByEmail || existingByEmail.status === "removed") {
          await this.entitlements.assertCanInviteTeamMember(teamId, tx);
        }
        const member = existingByEmail
          ? await tx.teamMember.update({
              where: { id: existingByEmail.id },
              data: { status: "pending", invitedAt: new Date(), joinedAt: null },
            })
          : await tx.teamMember.create({
              data: { teamId, inviteEmail: email, role: "member", status: "pending" },
            });
        return { member, invitedUserId: null };
      }));
    } catch (err) {
      if (err instanceof TeamMemberLimitExceededError) {
        throw new ForbiddenException("Team member limit reached for your current plan. Upgrade to invite more members.");
      }
      throw err;
    }

    await this.auditLog.record({
      actorUserId: inviterId,
      teamId,
      eventType: AUDIT_EVENTS.TEAM_MEMBER_INVITED,
      targetId: invitedUserId,
      metadata: invitedUserId ? undefined : { inviteEmail: email },
    });
    return member;
  }

  /** Cancels a pending invite for someone who hasn't signed up yet (no userId to remove by). */
  async cancelPendingEmailInvite(teamId: string, actorId: string, memberId: string): Promise<void> {
    await this.assertIsAdminOrOwner(actorId, teamId);
    const member = await this.prisma.teamMember.findUnique({ where: { id: memberId } });
    if (!member || member.teamId !== teamId || member.userId !== null || member.status === "removed") {
      throw new NotFoundException("Pending invite not found");
    }
    await this.prisma.teamMember.update({ where: { id: memberId }, data: { status: "removed" } });
    await this.auditLog.record({
      actorUserId: actorId,
      teamId,
      eventType: AUDIT_EVENTS.TEAM_MEMBER_REMOVED,
      metadata: { inviteEmail: member.inviteEmail },
    });
  }

  async acceptInvite(userId: string, teamId: string) {
    const member = await this.prisma.teamMember.findUnique({ where: { teamId_userId: { teamId, userId } } });
    if (!member || member.status !== "pending") {
      throw new NotFoundException("No pending invite found for this team.");
    }
    return this.prisma.teamMember.update({
      where: { id: member.id },
      data: { status: "active", joinedAt: new Date() },
    });
  }

  async removeMember(teamId: string, actorId: string, targetUserId: string): Promise<void> {
    await this.assertIsAdminOrOwner(actorId, teamId);
    const target = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: targetUserId } },
    });
    if (!target) throw new NotFoundException("Member not found");
    if (target.role === "owner") throw new ForbiddenException("Cannot remove the team owner");

    await this.prisma.teamMember.update({ where: { id: target.id }, data: { status: "removed" } });
    await this.auditLog.record({
      actorUserId: actorId,
      teamId,
      eventType: AUDIT_EVENTS.TEAM_MEMBER_REMOVED,
      targetId: targetUserId,
    });
  }

  async listMyInvites(userId: string) {
    return this.prisma.teamMember.findMany({
      where: { userId, status: "pending" },
      include: { team: { select: { id: true, name: true } } },
    });
  }

  async listMyTeams(userId: string) {
    return this.prisma.teamMember.findMany({
      where: { userId, status: "active" },
      include: { team: { select: { id: true, name: true, ownerUserId: true } } },
    });
  }

  private async assertIsActiveMember(userId: string, teamId: string): Promise<void> {
    const member = await this.prisma.teamMember.findUnique({ where: { teamId_userId: { teamId, userId } } });
    if (!member || member.status !== "active") {
      throw new ForbiddenException("You are not a member of this team");
    }
  }

  private async assertIsAdminOrOwner(userId: string, teamId: string): Promise<void> {
    const member = await this.prisma.teamMember.findUnique({ where: { teamId_userId: { teamId, userId } } });
    if (!member || member.status !== "active" || (member.role !== "owner" && member.role !== "admin")) {
      throw new ForbiddenException("You do not have permission to manage this team");
    }
  }
}
