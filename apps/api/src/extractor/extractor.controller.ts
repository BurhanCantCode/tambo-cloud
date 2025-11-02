import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
} from "@nestjs/swagger";
import { Request } from "express";
import * as aiServiceInterface from "../ai/interfaces/ai.service.interface";
import { StorageService } from "../common/services/storage.service";
import { extractContextInfo } from "../common/utils/extract-context-info";
import { ExtractComponentResponseDto } from "./dto/extract-component-response.dto";
import { ExtractComponentDto } from "./dto/extract-component.dto";
import { ExtractPdfResponseDto } from "./dto/extract-pdf-response.dto";
import { ExtractPdfDto } from "./dto/extract-pdf.dto";

// Allowed MIME types for file uploads
const ALLOWED_FILE_TYPES = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "image/jpeg",
  "image/png",
] as const;

@Controller("extract")
export class ExtractorController {
  private readonly MAX_FILE_SIZE_MB = 50;

  constructor(
    @Inject("AIService")
    private aiService: aiServiceInterface.AIServiceInterface,
    private readonly storageService: StorageService,
  ) {}

  @Post()
  async extractComponent(
    @Body() extractComponentDto: ExtractComponentDto,
  ): Promise<ExtractComponentResponseDto[]> {
    return await this.aiService.extractComponentDefinitions(
      extractComponentDto.content ?? "",
    );
  }

  @Post("pdf")
  @UseInterceptors(FileInterceptor("file"))
  @ApiConsumes("multipart/form-data")
  @ApiBody({ type: ExtractPdfDto })
  @ApiOperation({
    summary: "Upload file to storage",
    description:
      "Upload a file (PDF, TXT, MD, CSV, JPG, PNG) to Supabase Storage. Maximum file size is 50MB.",
  })
  @ApiResponse({
    status: 200,
    description: "File successfully uploaded",
    type: ExtractPdfResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "Invalid file or format",
  })
  async extractPdfText(
    @Req() request: Request,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ExtractPdfResponseDto> {
    this.validateFile(file);
    const { projectId } = extractContextInfo(request, undefined);
    const storagePath = await this.storageService.upload(
      projectId,
      file.originalname,
      file.buffer,
      file.mimetype,
    );
    return {
      storagePath,
    };
  }

  private validateFile(file: Express.Multer.File): void {
    const maxSizeBytes = this.MAX_FILE_SIZE_MB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      throw new BadRequestException(
        `File too large. Maximum size is ${this.MAX_FILE_SIZE_MB}MB`,
      );
    }
    if (!ALLOWED_FILE_TYPES.includes(file.mimetype as any)) {
      throw new BadRequestException(
        `Invalid file type: ${file.mimetype}. Supported types: PDF, TXT, MD, CSV, JPG, PNG`,
      );
    }
  }
}
