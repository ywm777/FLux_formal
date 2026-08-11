import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AiController } from "./ai.controller";
import { AiService } from "./ai.service";
import { AiConnectionsService } from "./ai-connections.service";
import { AiCredentialService } from "./ai-credential.service";
import { AiProviderClient } from "./ai-provider.client";

@Module({
  imports: [AuthModule],
  controllers: [AiController],
  providers: [
    AiService,
    AiConnectionsService,
    AiCredentialService,
    AiProviderClient,
  ],
  exports: [AiService, AiConnectionsService],
})
export class AiModule {}
