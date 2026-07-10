import type { ProviderType } from "@/types/provider";

export interface ServerModelCredential {
  id: string;
  ownerId: string;
  name: string;
  providerType: ProviderType;
  baseUrl: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
}

export async function saveServerModelCredential(params: {
  id?: string;
  name: string;
  providerType: ProviderType;
  baseUrl: string;
  apiKey: string;
}): Promise<ServerModelCredential> {
  const response = await fetch("/api/canvas/model-credentials", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });
  const data = (await response.json()) as {
    credential?: ServerModelCredential;
    error?: string;
  };
  if (!response.ok || !data.credential) {
    throw new Error(data.error || "模型凭据保存失败");
  }

  return data.credential;
}

export async function deleteServerModelCredential(
  credentialId: string,
): Promise<void> {
  const response = await fetch(
    `/api/canvas/model-credentials/${encodeURIComponent(credentialId)}`,
    {
      method: "DELETE",
    },
  );
  const data = (await response.json()) as { error?: string };
  if (!response.ok) {
    throw new Error(data.error || "模型凭据删除失败");
  }
}
