import { ChatCompletionContentPart } from "@tambo-ai-cloud/core";
import mimeTypes from "mime-types";
import { StorageService } from "../../common/services/storage.service";

/**
 * Process storage:// URLs in message content and download files to pass to LLM
 * @param content - Array of content parts from message
 * @param storageService - Storage service for downloading files
 * @returns Promise resolving to processed content parts
 */
type TamboFileContentPart = ChatCompletionContentPart & {
  type: "file";
  file: {
    file_data?: string;
    filename?: string;
    file_id?: string;
  };
  tamboMimeType: string;
};

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png"]);

const SUPPORTED_APPLICATION_TYPES = new Set(["application/pdf"]);

const SUPPORTED_TYPE_DESCRIPTION =
  "PDF, plain text, Markdown, CSV, JPEG, and PNG files";

function normalizeMimeType(
  rawMimeType: string | undefined,
  filename: string | undefined,
  path: string,
): string | undefined {
  const trimmed = rawMimeType?.trim();
  if (
    trimmed &&
    trimmed !== "" &&
    trimmed !== "application/octet-stream" &&
    trimmed !== "undefined" &&
    trimmed !== "null"
  ) {
    return trimmed;
  }

  const candidates = [
    filename?.trim(),
    (() => {
      const segments = path.split("/");
      return segments[segments.length - 1];
    })(),
  ].filter((value): value is string => !!value && value.trim().length > 0);

  for (const candidate of candidates) {
    const detected = mimeTypes.lookup(candidate);
    if (typeof detected === "string") {
      return detected;
    }
  }

  return undefined;
}

function isImageMimeType(mimeType: string): boolean {
  if (SUPPORTED_IMAGE_TYPES.has(mimeType)) {
    return true;
  }
  return mimeType.startsWith("image/");
}

function isSupportedMimeType(mimeType: string): boolean {
  if (isImageMimeType(mimeType)) {
    return true;
  }
  if (mimeType.startsWith("text/")) {
    return true;
  }
  return SUPPORTED_APPLICATION_TYPES.has(mimeType);
}

function toSafeFilename(filename: string | undefined, path: string): string {
  if (filename && filename.trim()) {
    return filename.trim();
  }
  const pathSegments = path.split("/");
  const fallback = pathSegments[pathSegments.length - 1];
  return fallback && fallback.trim() ? fallback.trim() : "file";
}

function createFileContentPart(
  base64Content: string,
  filename: string,
  mimeType: string,
): ChatCompletionContentPart {
  const filePart: TamboFileContentPart = {
    type: "file",
    file: {
      file_data: base64Content,
      filename,
    },
    tamboMimeType: mimeType,
  };
  return filePart;
}

export async function processStorageUrls(
  content: ChatCompletionContentPart[],
  storageService: StorageService,
): Promise<ChatCompletionContentPart[]> {
  return await Promise.all(
    content.map(async (part) => {
      // Handle image_url type with storage:// URL
      if (
        part.type === "image_url" &&
        part.image_url.url.startsWith("storage://")
      ) {
        const path = part.image_url.url.replace("storage://", "");
        const signedUrl = await storageService.getSignedUrl(path);
        return { ...part, image_url: { ...part.image_url, url: signedUrl } };
      }

      // Handle text type with storage:// URL (file reference)
      if (part.type === "text" && part.text.startsWith("storage://")) {
        const [rawPath = "", rawMimeType = "", rawFilename = ""] = part.text
          .replace("storage://", "")
          .split("|");

        const path = rawPath.trim();
        if (!path) {
          throw new Error(
            "Invalid storage reference: missing path component in message content.",
          );
        }

        const filename = rawFilename.trim();
        const normalizedMimeType = normalizeMimeType(
          rawMimeType,
          filename,
          path,
        );

        if (!normalizedMimeType) {
          throw new Error(
            `Unsupported file type for "${filename || path}". Supported types: ${SUPPORTED_TYPE_DESCRIPTION}`,
          );
        }

        if (isImageMimeType(normalizedMimeType)) {
          const signedUrl = await storageService.getSignedUrl(path);
          return {
            type: "image_url" as const,
            image_url: { url: signedUrl, detail: "auto" },
          };
        }

        if (!isSupportedMimeType(normalizedMimeType)) {
          console.error(
            "[STORAGE-URL-PROCESSOR] Unsupported file type:",
            normalizedMimeType,
          );
          throw new Error(
            `Unsupported file type "${normalizedMimeType}" for file "${filename || path}". Supported types: ${SUPPORTED_TYPE_DESCRIPTION}`,
          );
        }

        try {
          const fileBuffer = await storageService.get(path);
          const base64Content = fileBuffer.toString("base64");
          const resolvedFilename = toSafeFilename(filename, path);
          return createFileContentPart(
            base64Content,
            resolvedFilename,
            normalizedMimeType,
          );
        } catch (error) {
          console.error(
            "[STORAGE-URL-PROCESSOR] Error processing document:",
            error,
          );
          const message =
            error instanceof Error ? error.message : String(error);
          throw new Error(
            `Failed to process document "${filename || path}": ${message}`,
          );
        }
      }

      return part;
    }),
  );
}
