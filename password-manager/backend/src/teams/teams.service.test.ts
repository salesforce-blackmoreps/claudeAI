import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { TeamsService } from "./teams.service";

function makePrismaStub(overrides: Record<string, unknown> = {}) {
  const prisma = {
    teamMember: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    // inviteMember() runs inside $transaction(cb) to serialize the
    // entitlement check against the insert/update (see teams.service.ts) —
    // the mock just runs the callback against this same stub, which also
    // stands in as `tx`.
    $transaction: jest.fn().mockImplementation((cb) => cb(prisma)),
    ...overrides,
  } as any;
  return prisma;
}

function makeEntitlementsStub() {
  return { assertCanInviteTeamMember: jest.fn().mockResolvedValue(undefined) } as any;
}

function makeAuditLogStub() {
  return { record: jest.fn().mockResolvedValue(undefined) } as any;
}

describe("TeamsService authorization", () => {
  it("refuses to invite a member when the inviter is not an owner/admin", async () => {
    const prisma = makePrismaStub();
    prisma.teamMember.findUnique.mockResolvedValue({ role: "member", status: "active" });
    const service = new TeamsService(prisma, makeEntitlementsStub(), { record: jest.fn().mockResolvedValue(undefined) } as any);

    await expect(service.inviteMember("team-1", "inviter-1", "someone@example.com")).rejects.toThrow(ForbiddenException);
  });

  it("creates a pending invite keyed by email when the invitee has no account yet", async () => {
    const prisma = makePrismaStub();
    prisma.teamMember.findUnique
      .mockResolvedValueOnce({ role: "owner", status: "active" }) // inviter permission check
      .mockResolvedValueOnce(null); // no existing invite for this email
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.teamMember.create.mockResolvedValue({ id: "member-1", teamId: "team-1", inviteEmail: "nobody@example.com" });
    const service = new TeamsService(prisma, makeEntitlementsStub(), makeAuditLogStub());

    const member = await service.inviteMember("team-1", "owner-1", "nobody@example.com");

    expect(member).toEqual({ id: "member-1", teamId: "team-1", inviteEmail: "nobody@example.com" });
    expect(prisma.teamMember.create).toHaveBeenCalledWith({
      data: { teamId: "team-1", inviteEmail: "nobody@example.com", role: "member", status: "pending" },
    });
  });

  it("refuses a duplicate email-only invite that is still pending", async () => {
    const prisma = makePrismaStub();
    prisma.teamMember.findUnique
      .mockResolvedValueOnce({ role: "owner", status: "active" })
      .mockResolvedValueOnce({ id: "member-1", status: "pending" });
    prisma.user.findUnique.mockResolvedValue(null);
    const service = new TeamsService(prisma, makeEntitlementsStub(), makeAuditLogStub());

    await expect(service.inviteMember("team-1", "owner-1", "nobody@example.com")).rejects.toThrow(ConflictException);
  });

  it("refuses to cancel a pending invite that already has a linked account", async () => {
    const prisma = makePrismaStub();
    prisma.teamMember.findUnique
      .mockResolvedValueOnce({ role: "owner", status: "active" }) // actor permission check
      .mockResolvedValueOnce({ teamId: "team-1", userId: "user-5", status: "pending" }); // already resolved
    const service = new TeamsService(prisma, makeEntitlementsStub(), makeAuditLogStub());

    await expect(service.cancelPendingEmailInvite("team-1", "owner-1", "member-1")).rejects.toThrow(NotFoundException);
  });

  it("refuses to remove the team owner", async () => {
    const prisma = makePrismaStub();
    prisma.teamMember.findUnique
      .mockResolvedValueOnce({ role: "owner", status: "active" }) // actor permission check
      .mockResolvedValueOnce({ role: "owner", status: "active" }); // target lookup
    const service = new TeamsService(prisma, makeEntitlementsStub(), { record: jest.fn().mockResolvedValue(undefined) } as any);

    await expect(service.removeMember("team-1", "actor-1", "owner-user-id")).rejects.toThrow(ForbiddenException);
  });

  it("refuses to accept an invite that doesn't exist or isn't pending", async () => {
    const prisma = makePrismaStub();
    prisma.teamMember.findUnique.mockResolvedValue(null);
    const service = new TeamsService(prisma, makeEntitlementsStub(), { record: jest.fn().mockResolvedValue(undefined) } as any);

    await expect(service.acceptInvite("user-1", "team-1")).rejects.toThrow(NotFoundException);
  });
});
