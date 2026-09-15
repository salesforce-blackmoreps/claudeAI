import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService, AUDIT_EVENTS } from "../common/audit-log/audit-log.service";

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
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

    const invitee = await this.prisma.user.findUnique({ where: { email } });
    if (!invitee) {
      throw new NotFoundException("No account found for that email. Ask them to sign up, then invite them again.");
    }

    const existing = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: invitee.id } },
    });
    if (existing && existing.status !== "removed") {
      throw new ConflictException("This person is already invited to or a member of this team.");
    }
    const member = existing
      ? await this.prisma.teamMember.update({
          where: { id: existing.id },
          data: { status: "pending", invitedAt: new Date(), joinedAt: null },
        })
      : await this.prisma.teamMember.create({
          data: { teamId, userId: invitee.id, role: "member", status: "pending" },
        });

    await this.auditLog.record({
      actorUserId: inviterId,
      teamId,
      eventType: AUDIT_EVENTS.TEAM_MEMBER_INVITED,
      targetId: invitee.id,
    });
    return member;
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
