import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MarketController } from "./market.controller";
import { MarketService } from "./market.service";

@Module({
  imports: [AuthModule],
  controllers: [MarketController],
  providers: [MarketService],
})
export class MarketModule {}
