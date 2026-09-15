import { Controller, Get, NotFoundException, Query, UseGuards } from "@nestjs/common";
import { IsEmail } from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PrismaService } from "../prisma/prisma.service";

class LookupQueryDto {
  @IsEmail()
  email!: string;
}

/**
 * Authenticated-only public-key lookup, needed so a client can ECIES-wrap an
 * item key for a sharing recipient before it ever calls POST
 * /vault/items/:id/shares. Deliberately not enumeration-resistant like
 * /auth/kdf-params — knowing "does this email have an account" is an
 * accepted, minor disclosure for an invite-by-email feature (the same
 * tradeoff most sharing products make), unlike leaking KDF parameters for a
 * password-guessing account probe.
 */
@Controller("users")
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("lookup")
  async lookup(@Query() query: LookupQueryDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: query.email },
      select: { id: true, publicKey: true },
    });
    if (!user) throw new NotFoundException("No account found for that email");
    return user;
  }
}
