import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard, AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { ItemCreationEntitlementGuard } from "../common/guards/entitlement.guard";
import { VaultService } from "./vault.service";
import { CreateVaultItemDto } from "./dto/create-vault-item.dto";
import { UpdateVaultItemDto } from "./dto/update-vault-item.dto";
import { SyncQueryDto } from "./dto/sync-query.dto";

@Controller("vault")
@UseGuards(JwtAuthGuard)
export class VaultController {
  constructor(private readonly vault: VaultService) {}

  @Get("sync")
  sync(@Req() req: AuthenticatedRequest, @Query() query: SyncQueryDto) {
    return this.vault.sync(req.userId, query.since);
  }

  @Post("items")
  @UseGuards(ItemCreationEntitlementGuard)
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateVaultItemDto) {
    return this.vault.create(req.userId, dto);
  }

  @Get("items/:id")
  get(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.vault.get(req.userId, id);
  }

  @Put("items/:id")
  update(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() dto: UpdateVaultItemDto) {
    return this.vault.update(req.userId, id, dto);
  }

  @Delete("items/:id")
  async delete(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    await this.vault.delete(req.userId, id);
    return { deleted: true };
  }
}
