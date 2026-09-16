import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard, AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { TeamInviteEntitlementGuard } from "../common/guards/entitlement.guard";
import { TeamsService } from "./teams.service";
import { CreateTeamDto } from "./dto/create-team.dto";
import { InviteMemberDto } from "./dto/invite-member.dto";

@Controller("teams")
@UseGuards(JwtAuthGuard)
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Get("my-invites")
  listMyInvites(@Req() req: AuthenticatedRequest) {
    return this.teams.listMyInvites(req.userId);
  }

  @Get("mine")
  listMyTeams(@Req() req: AuthenticatedRequest) {
    return this.teams.listMyTeams(req.userId);
  }

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateTeamDto) {
    return this.teams.createTeam(req.userId, dto.name);
  }

  @Get(":teamId")
  get(@Req() req: AuthenticatedRequest, @Param("teamId") teamId: string) {
    return this.teams.getTeam(req.userId, teamId);
  }

  @Post(":teamId/invites")
  @UseGuards(TeamInviteEntitlementGuard)
  invite(@Req() req: AuthenticatedRequest, @Param("teamId") teamId: string, @Body() dto: InviteMemberDto) {
    return this.teams.inviteMember(teamId, req.userId, dto.email);
  }

  @Post(":teamId/accept")
  accept(@Req() req: AuthenticatedRequest, @Param("teamId") teamId: string) {
    return this.teams.acceptInvite(req.userId, teamId);
  }

  @Delete(":teamId/members/:userId")
  async remove(@Req() req: AuthenticatedRequest, @Param("teamId") teamId: string, @Param("userId") userId: string) {
    await this.teams.removeMember(teamId, req.userId, userId);
    return { removed: true };
  }

  @Delete(":teamId/invites/:memberId")
  async cancelInvite(@Req() req: AuthenticatedRequest, @Param("teamId") teamId: string, @Param("memberId") memberId: string) {
    await this.teams.cancelPendingEmailInvite(teamId, req.userId, memberId);
    return { removed: true };
  }
}
