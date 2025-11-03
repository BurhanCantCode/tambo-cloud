import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AIModule } from "../ai/ai.module";
import { StorageService } from "../common/services/storage.service";
import { ExtractorController } from "./extractor.controller";
@Module({
  imports: [AIModule, ConfigModule],
  controllers: [ExtractorController],
  providers: [StorageService],
})
export class ExtractorModule {}
