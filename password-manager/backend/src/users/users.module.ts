import { Module } from "@nestjs/common";
import { TokenModule } from "../auth/token.module";
import { UsersController } from "./users.controller";

@Module({
  imports: [TokenModule],
  controllers: [UsersController],
})
export class UsersModule {}
