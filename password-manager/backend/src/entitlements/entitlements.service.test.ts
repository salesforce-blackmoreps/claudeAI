import { EntitlementsService, ItemLimitExceededError } from "./entitlements.service";

function makePrismaStub(itemCount: number) {
  return { vaultItem: { count: jest.fn().mockResolvedValue(itemCount) } } as any;
}

describe("EntitlementsService", () => {
  it("reports free-tier limits and current usage", async () => {
    const service = new EntitlementsService(makePrismaStub(4));
    const entitlements = await service.getEntitlementsForUser("user-1");
    expect(entitlements).toMatchObject({
      tier: "free",
      maxItemsPerUser: 10,
      maxShareMembers: 3,
      currentItemCount: 4,
    });
  });

  it("allows item creation under the free-tier cap", async () => {
    const service = new EntitlementsService(makePrismaStub(9));
    await expect(service.assertCanCreateItem("user-1")).resolves.toBeUndefined();
  });

  it("rejects item creation once the free-tier cap is reached", async () => {
    const service = new EntitlementsService(makePrismaStub(10));
    await expect(service.assertCanCreateItem("user-1")).rejects.toThrow(ItemLimitExceededError);
  });
});
