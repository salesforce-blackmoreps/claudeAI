import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async register(userId: string, name: string, platform: string, refreshTokenFamilyId: string) {
    return this.prisma.device.create({
      data: { userId, name, platform, refreshTokenFamilyId },
    });
  }

  async listForUser(userId: string) {
    return this.prisma.device.findMany({
      where: { userId },
      orderBy: { lastSeenAt: "desc" },
    });
  }

  async touch(refreshTokenFamilyId: string) {
    await this.prisma.device.update({
      where: { refreshTokenFamilyId },
      data: { lastSeenAt: new Date() },
    });
  }

  async revoke(userId: string, deviceId: string): Promise<{ refreshTokenFamilyId: string } | null> {
    const device = await this.prisma.device.findFirst({ where: { id: deviceId, userId } });
    if (!device) return null;
    await this.prisma.device.delete({ where: { id: deviceId } });
    return { refreshTokenFamilyId: device.refreshTokenFamilyId };
  }

  async deleteByFamilyId(refreshTokenFamilyId: string): Promise<void> {
    await this.prisma.device.deleteMany({ where: { refreshTokenFamilyId } });
  }
}
