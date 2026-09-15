import { Module } from "@nestjs/common";
import { TokenModule } from "../auth/token.module";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";

@Module({
  imports: [TokenModule],
  controllers: [BillingController],
  providers: [BillingService],
})
export class BillingModule {}
