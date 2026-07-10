import type {
  CanvasProjectExport,
  CanvasProjectRecord,
  CanvasSaveHistoryItem,
} from "@/entities/canvas/model/types";

async function parseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || "画布项目请求失败");
  }
  return payload;
}

export async function listCanvasProjects(): Promise<CanvasProjectRecord[]> {
  const response = await fetch("/api/canvas/projects");
  const payload = await parseJson<{ projects: CanvasProjectRecord[] }>(response);
  return payload.projects;
}

export async function loadCanvasProject(projectId: string): Promise<{
  record: CanvasProjectRecord;
  payload: CanvasProjectExport;
}> {
  const response = await fetch(`/api/canvas/projects/${encodeURIComponent(projectId)}`);
  return parseJson<{
    record: CanvasProjectRecord;
    payload: CanvasProjectExport;
  }>(response);
}

export async function saveCanvasProject(params: {
  id: string;
  payload: CanvasProjectExport;
  name?: string;
}): Promise<CanvasProjectRecord> {
  const response = await fetch(`/api/canvas/projects/${encodeURIComponent(params.id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: params.name,
      payload: params.payload,
    }),
  });
  const result = await parseJson<{ record: CanvasProjectRecord }>(response);
  return result.record;
}

export async function createCanvasProject(params: {
  id: string;
  payload: CanvasProjectExport;
  name: string;
}): Promise<CanvasProjectRecord> {
  const response = await fetch("/api/canvas/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const result = await parseJson<{ record: CanvasProjectRecord }>(response);
  return result.record;
}

export async function deleteCanvasProject(projectId: string): Promise<void> {
  const response = await fetch(`/api/canvas/projects/${encodeURIComponent(projectId)}`, {
    method: "DELETE",
  });
  await parseJson<{ success: boolean }>(response);
}

export async function listCanvasSaveHistory(
  projectId: string,
): Promise<CanvasSaveHistoryItem[]> {
  const response = await fetch(
    `/api/canvas/projects/${encodeURIComponent(projectId)}/history`,
  );
  const result = await parseJson<{ items: CanvasSaveHistoryItem[] }>(response);
  return result.items;
}

export async function addCanvasSaveHistory(params: {
  projectId: string;
  id: string;
  payload: CanvasProjectExport;
  name?: string;
}): Promise<CanvasSaveHistoryItem> {
  const response = await fetch(
    `/api/canvas/projects/${encodeURIComponent(params.projectId)}/history`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: params.id,
        name: params.name,
        payload: params.payload,
      }),
    },
  );
  const result = await parseJson<{ item: CanvasSaveHistoryItem }>(response);
  return result.item;
}

export async function deleteCanvasSaveHistoryItem(params: {
  projectId: string;
  historyId: string;
}): Promise<void> {
  const response = await fetch(
    `/api/canvas/projects/${encodeURIComponent(params.projectId)}/history/${encodeURIComponent(
      params.historyId,
    )}`,
    { method: "DELETE" },
  );
  await parseJson<{ success: boolean }>(response);
}
