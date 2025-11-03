import { ChatCompletionContentPart } from "@tambo-ai-cloud/core";
import { StorageService } from "../../common/services/storage.service";

/**
 * Process storage:// URLs in message content and convert to signed URLs
 * @param content - Array of content parts from message
 * @param storageService - Storage service for generating signed URLs
 * @returns Promise resolving to processed content parts
 */
export async function processStorageUrls(
  content: ChatCompletionContentPart[],
  storageService: StorageService,
): Promise<ChatCompletionContentPart[]> {
  return await Promise.all(
    content.map(async (part) => {
      if (
        part.type === "image_url" &&
        part.image_url.url.startsWith("storage://")
      ) {
        const path = part.image_url.url.replace("storage://", "");
        const signedUrl = await storageService.getSignedUrl(path);
        return { ...part, image_url: { ...part.image_url, url: signedUrl } };
      }

      if (part.type === "text" && part.text.startsWith("storage://")) {
        const [path] = part.text.replace("storage://", "").split("|");
        const signedUrl = await storageService.getSignedUrl(path);
        return {
          type: "image_url" as const,
          image_url: { url: signedUrl, detail: "auto" },
        };
      }

      return part;
    }),
  );
}
