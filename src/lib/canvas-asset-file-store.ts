import type { CanvasProjectExport } from "@/entities/canvas/model/types";
import {
  deleteStoredCanvasAsset,
  isCanvasStoredAssetUrl,
} from "./canvas-asset-storage";
import { prisma } from "./prisma";

export type CanvasAssetFileKind = "image" | "video" | "audio" | "file";

export async function createCanvasAssetFileRecord(params: {
  ownerId: string;
  projectId?: string | null;
  url: string;
  storageKey: string;
  kind: CanvasAssetFileKind;
  mimeType: string;
  size: number;
  originalName?: string;
}): Promise<void> {
  await prisma.canvasAssetFile.upsert({
    where: { url: params.url },
    create: {
      id: `asset_file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ownerId: params.ownerId,
      projectId: params.projectId || null,
      url: params.url,
      storageKey: params.storageKey,
      kind: params.kind,
      mimeType: params.mimeType,
      size: params.size,
      originalName: params.originalName,
      lastReferencedAt: new Date(),
    },
    update: {
      projectId: params.projectId || null,
      status: "active",
      lastReferencedAt: new Date(),
    },
  });
}

function collectCanvasAssetUrls(value: unknown, urls = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    if (isCanvasStoredAssetUrl(value)) {
      urls.add(value);
    }
    return urls;
  }

  if (!value || typeof value !== "object") return urls;

  if (Array.isArray(value)) {
    value.forEach((item) => collectCanvasAssetUrls(item, urls));
    return urls;
  }

  Object.values(value as Record<string, unknown>).forEach((item) =>
    collectCanvasAssetUrls(item, urls),
  );
  return urls;
}

export async function syncCanvasProjectAssetFileReferences(params: {
  ownerId: string;
  projectId: string;
  payload: CanvasProjectExport;
}): Promise<void> {
  const referencedUrls = Array.from(collectCanvasAssetUrls(params.payload));

  await prisma.$transaction(async (tx) => {
    if (referencedUrls.length > 0) {
      await tx.canvasAssetFile.updateMany({
        where: {
          ownerId: params.ownerId,
          url: {
            in: referencedUrls,
          },
        },
        data: {
          projectId: params.projectId,
          status: "active",
          lastReferencedAt: new Date(),
        },
      });
    }

    await tx.canvasAssetFile.updateMany({
      where: {
        ownerId: params.ownerId,
        projectId: params.projectId,
        status: "active",
        ...(referencedUrls.length > 0
          ? {
              url: {
                notIn: referencedUrls,
              },
            }
          : {}),
      },
      data: {
        status: "unreferenced",
      },
    });
  });
}

export async function deleteCanvasProjectAssetFiles(params: {
  ownerId: string;
  projectId: string;
}): Promise<void> {
  const files = await prisma.canvasAssetFile.findMany({
    where: {
      ownerId: params.ownerId,
      projectId: params.projectId,
      status: {
        in: ["active", "unreferenced"],
      },
    },
    select: {
      id: true,
      storageKey: true,
    },
  });

  await Promise.all(
    files.map(async (file) => {
      await deleteStoredCanvasAsset(file.storageKey).catch(() => undefined);
    }),
  );

  if (files.length > 0) {
    await prisma.canvasAssetFile.updateMany({
      where: {
        id: {
          in: files.map((file) => file.id),
        },
      },
      data: {
        status: "deleted",
      },
    });
  }
}

export async function deleteUnreferencedCanvasAssetFiles(params: {
  ownerId?: string;
  olderThanDays: number;
  limit?: number;
}): Promise<number> {
  const cutoff = new Date(Date.now() - params.olderThanDays * 86_400_000);
  const files = await prisma.canvasAssetFile.findMany({
    where: {
      ...(params.ownerId ? { ownerId: params.ownerId } : {}),
      status: "unreferenced",
      lastReferencedAt: {
        lt: cutoff,
      },
    },
    orderBy: {
      lastReferencedAt: "asc",
    },
    take: params.limit || 100,
    select: {
      id: true,
      storageKey: true,
    },
  });

  await Promise.all(
    files.map(async (file) => {
      await deleteStoredCanvasAsset(file.storageKey).catch(() => undefined);
    }),
  );

  if (files.length > 0) {
    await prisma.canvasAssetFile.updateMany({
      where: {
        id: {
          in: files.map((file) => file.id),
        },
      },
      data: {
        status: "deleted",
      },
    });
  }

  return files.length;
}
