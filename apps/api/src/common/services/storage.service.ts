import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

@Injectable()
export class StorageService {
  private readonly client: SupabaseClient;
  private readonly bucketName = "user-files";

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>("SUPABASE_URL");
    const supabaseKey = this.configService.get<string>(
      "SUPABASE_SERVICE_ROLE_KEY",
    );

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured",
      );
    }

    this.client = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Upload a file to Supabase Storage
   * @param projectId - The project ID to organize files by
   * @param fileName - Original file name
   * @param buffer - File content as Buffer
   * @param mimeType - MIME type of the file
   * @returns Promise resolving to the storage path
   */
  async upload(
    projectId: string,
    fileName: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    const timestamp = Date.now();
    const path = `${projectId}/${timestamp}-${fileName}`;

    const { error } = await this.client.storage
      .from(this.bucketName)
      .upload(path, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (error) {
      throw new Error(`Failed to upload file: ${error.message}`);
    }

    return path;
  }

  /**
   * Download a file from Supabase Storage
   * @param path - The storage path returned from upload()
   * @returns Promise resolving to the file content as Buffer
   */
  async get(path: string): Promise<Buffer> {
    const { data, error } = await this.client.storage
      .from(this.bucketName)
      .download(path);

    if (error) {
      throw new Error(`Failed to download file: ${error.message}`);
    }

    return Buffer.from(await data.arrayBuffer());
  }

  /**
   * Delete a file from Supabase Storage
   * @param path - The storage path to delete
   */
  async delete(path: string): Promise<void> {
    const { error } = await this.client.storage
      .from(this.bucketName)
      .remove([path]);

    if (error) {
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }

  /**
   * Get signed URL for file (valid for 1 hour)
   * LLM providers can fetch directly from this URL
   * @param path - The storage path
   * @returns Promise resolving to signed URL
   */
  async getSignedUrl(path: string): Promise<string> {
    const { data, error } = await this.client.storage
      .from(this.bucketName)
      .createSignedUrl(path, 3600);

    if (error) {
      throw new Error(`Failed to create signed URL: ${error.message}`);
    }

    return data.signedUrl;
  }
}
