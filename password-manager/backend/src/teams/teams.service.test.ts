import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { TeamsService } from "./teams.service";

function makePrismaStub(overrides: Record<string, unknown> = {}) {
  return {
    teamMember: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    ...overrides,
  } as any;
}

describe("TeamsService authorization", () => {
  it("refuses to invite a member when the inviter is not an owner/admin", async () => {
    const prisma = makePrismaStub();
    prisma.teamMember.findUnique.mockResolvedValue({ role: "member", status: "active" });
    const service = new TeamsService(prisma);

    await expect(service.inviteMember("team-1", "inviter-1", "someone@example.com")).rejects.toThrow(ForbiddenException);
  });

  it("refuses to invite someone with no account", async () => {
    const prisma = makePrismaStub();
    prisma.teamMember.findUnique.mockResolvedValue({ role: "owner", status: "active" });
    prisma.user.findUnique.mockResolvedValue(null);
    const service = new TeamsService(prisma);

    await expect(service.inviteMember("team-1", "owner-1", "nobody@example.com")).rejects.toThrow(NotFoundException);
  });

  it("refuses to remove the team owner", async () => {
    const prisma = makePrismaStub();
    prisma.teamMember.findUnique
      .mockResolvedValueOnce({ role: "owner", status: "active" }) // actor permission check
      .mockResolvedValueOnce({ role: "owner", status: "active" }); // target lookup
    const service = new TeamsService(prisma);

    await expect(service.removeMember("team-1", "actor-1", "owner-user-id")).rejects.toThrow(ForbiddenException);
  });

  it("refuses to accept an invite that doesn't exist or isn't pending", async () => {
    const prisma = makePrismaStub();
    prisma.teamMember.findUnique.mockResolvedValue(null);
    const service = new TeamsService(prisma);

    await expect(service.acceptInvite("user-1", "team-1")).rejects.toThrow(NotFoundException);
  });
});
