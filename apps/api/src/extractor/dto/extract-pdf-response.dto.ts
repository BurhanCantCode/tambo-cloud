import { ApiProperty } from "@nestjs/swagger";

export class ExtractPdfResponseDto {
  @ApiProperty({
    description: "Storage path where the file was uploaded",
    type: "string",
  })
  storagePath!: string;

  @ApiProperty({
    description: "Normalized MIME type stored with the file",
    type: "string",
    example: "application/pdf",
  })
  mimeType!: string;
}
