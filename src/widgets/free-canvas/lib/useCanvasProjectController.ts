import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  CanvasEdge,
  CanvasElement,
  CanvasProjectExport,
  CanvasProjectRecord,
  CanvasSaveHistoryItem,
  CanvasTextElement,
  CanvasViewport,
} from "@/entities/canvas/model/types";
import { getCanvasTextTitle } from "@/entities/canvas/lib/textRoles";
import {
  addCanvasSaveHistory as addCanvasSaveHistoryRequest,
  deleteCanvasProject as deleteCanvasProjectRequest,
  deleteCanvasSaveHistoryItem as deleteCanvasSaveHistoryItemRequest,
  listCanvasProjects,
  listCanvasSaveHistory,
  loadCanvasProject,
  saveCanvasProject,
} from "@/entities/canvas/lib/projectApi";
import type {
  CanvasBrainChatMessage,
  CanvasDraftEdge,
  CanvasSnapshot,
} from "../model/types";
import {
  createCanvasProjectPayload,
  downloadFile,
  getCanvasProjectFilename,
  getCanvasProjectName,
  getCanvasSaveId,
  normalizeCanvasProjectExport,
  readActiveCanvasProjectId,
  removeActiveCanvasProjectId,
  writeActiveCanvasProjectId,
} from "./canvasProjectStorage";

type CanvasCommitInput =
  | { elements?: CanvasElement[]; edges?: CanvasEdge[] }
  | ((current: CanvasSnapshot) => { elements?: CanvasElement[]; edges?: CanvasEdge[] });

function getMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useCanvasProjectController(params: {
  elements: CanvasElement[];
  edges: CanvasEdge[];
  viewport: CanvasViewport;
  aiMessages: CanvasBrainChatMessage[];
  selectedId: string | null;
  commitCanvas: (next: CanvasCommitInput) => void;
  setElements: (elements: CanvasElement[]) => void;
  setEdges: (edges: CanvasEdge[]) => void;
  setViewport: (viewport: CanvasViewport) => void;
  setSelectedId: (id: string | null) => void;
  setSelectedEdgeId: (id: string | null) => void;
  setDraftEdge: (edge: CanvasDraftEdge | null) => void;
  setAiMessages: (messages: CanvasBrainChatMessage[]) => void;
  showCanvasSaveStatus: (message: string) => void;
}) {
  const router = useRouter();
  const {
    elements,
    edges,
    viewport,
    aiMessages,
    selectedId,
    commitCanvas,
    setElements,
    setEdges,
    setViewport,
    setSelectedId,
    setSelectedEdgeId,
    setDraftEdge,
    setAiMessages,
    showCanvasSaveStatus,
  } = params;
  const [canvasProjects, setCanvasProjects] = useState<CanvasProjectRecord[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [saveHistory, setSaveHistory] = useState<CanvasSaveHistoryItem[]>([]);
  const [saveHistoryOpen, setSaveHistoryOpen] = useState(false);
  const [deleteProjectConfirmOpen, setDeleteProjectConfirmOpen] = useState(false);
  const canvasStorageHydratedRef = useRef(false);

  const currentProject = currentProjectId
    ? canvasProjects.find((project) => project.id === currentProjectId) || null
    : null;

  const createAssistantSessionSummary = useCallback(() => {
    const recentMessages = aiMessages
      .filter((message) => message.content.trim())
      .slice(-8)
      .map((message) => `${message.role === "user" ? "用户" : "系统"}：${message.content.trim()}`);
    const assetTitles = elements
      .filter((element) => Boolean(element.asset))
      .slice(-12)
      .map((element) => element.asset?.title)
      .filter((title): title is string => Boolean(title?.trim()));
    const selectedElement = selectedId
      ? elements.find((element) => element.id === selectedId) || null
      : null;
    const selectedTitle =
      selectedElement?.asset?.title ||
      (selectedElement?.kind === "text"
        ? getCanvasTextTitle(selectedElement as CanvasTextElement)
        : undefined);

    return [
      recentMessages.length > 0 ? `最近沟通：\n${recentMessages.join("\n")}` : "",
      assetTitles.length > 0 ? `近期资产：${assetTitles.join("、")}` : "",
      selectedTitle ? `上次焦点：${selectedTitle}` : "",
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 2400);
  }, [aiMessages, elements, selectedId]);

  const createCurrentCanvasPayload = useCallback(
    () =>
      createCanvasProjectPayload({
        elements,
        edges,
        viewport,
        assistantMessages: aiMessages.map((message) => ({
          role: message.role,
          content: message.content,
          actions: message.actions,
        })),
        assistantSession: {
          summary: createAssistantSessionSummary(),
          lastFocusElementId: selectedId || undefined,
          updatedAt: new Date().toISOString(),
        },
      }),
    [aiMessages, createAssistantSessionSummary, edges, elements, selectedId, viewport],
  );

  const persistProjectRecord = useCallback(
    async (projectId: string, payload: CanvasProjectExport, name?: string) => {
      try {
        const record = await saveCanvasProject({
          id: projectId,
          payload,
          name,
        });

        setCanvasProjects((current) => [
          record,
          ...current.filter((project) => project.id !== projectId),
        ].sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        ));

        return true;
      } catch (error) {
        console.warn("Failed to persist canvas project", error);
        return false;
      }
    },
    [],
  );

  const addCanvasSaveHistory = useCallback(
    async (payload: CanvasProjectExport, name?: string) => {
      if (!currentProjectId) return null;

      try {
        const item = await addCanvasSaveHistoryRequest({
          projectId: currentProjectId,
          id: getCanvasSaveId(),
          payload,
          name: name?.trim() || getCanvasProjectName(payload),
        });
        setSaveHistory((current) => [
          item,
          ...current.filter((historyItem) => historyItem.id !== item.id),
        ]);
        return item;
      } catch (error) {
        console.warn("Failed to add canvas save history", error);
        showCanvasSaveStatus("保存记录写入失败，可导出到本地文件");
        return null;
      }
    },
    [currentProjectId, showCanvasSaveStatus],
  );

  const restoreCanvasProject = useCallback(
    (
      payload: CanvasProjectExport,
      options?: { projectId?: string; useHistory?: boolean },
    ) => {
      const normalized = normalizeCanvasProjectExport(payload);

      if (options?.useHistory) {
        commitCanvas({
          elements: normalized.elements,
          edges: normalized.edges,
        });
      } else {
        setElements(normalized.elements);
        setEdges(normalized.edges);
      }
      setViewport(normalized.viewport);
      setSelectedId(null);
      setSelectedEdgeId(null);
      setDraftEdge(null);
      setAiMessages(
        normalized.assistantMessages?.length
          ? normalized.assistantMessages.map((message) => ({
              id: getMessageId(),
              role: message.role,
              content: message.content,
              actions: message.actions,
            }))
          : [
              {
                id: getMessageId(),
                role: "assistant",
                content: normalized.assistantSession?.summary
                  ? "已恢复上次画布上下文，可以继续输入。"
                  : "说说你想创作什么，或选中节点后继续调整。",
              },
            ],
      );
      if (normalized.assistantSession?.lastFocusElementId) {
        const focusExists = normalized.elements.some(
          (element) => element.id === normalized.assistantSession?.lastFocusElementId,
        );
        if (focusExists) {
          setSelectedId(normalized.assistantSession.lastFocusElementId);
        }
      }
      if (options?.projectId) {
        writeActiveCanvasProjectId(options.projectId);
        void saveCanvasProject({
          id: options.projectId,
          payload: normalized,
        });
      }
      return true;
    },
    [
      commitCanvas,
      setAiMessages,
      setDraftEdge,
      setEdges,
      setElements,
      setSelectedEdgeId,
      setSelectedId,
      setViewport,
    ],
  );

  const saveCurrentCanvas = useCallback(async () => {
    if (!currentProjectId) return;
    const payload = createCurrentCanvasPayload();
    const savedCurrent = await persistProjectRecord(currentProjectId, payload);
    if (!savedCurrent) {
      showCanvasSaveStatus("保存失败，请稍后重试");
      return;
    }

    await addCanvasSaveHistory(payload);
    showCanvasSaveStatus("已保存，回到首页再进入会自动恢复");
  }, [
    addCanvasSaveHistory,
    createCurrentCanvasPayload,
    currentProjectId,
    persistProjectRecord,
    showCanvasSaveStatus,
  ]);

  const deleteCanvasSaveHistoryItem = useCallback(async (id: string) => {
    if (!currentProjectId) return;
    try {
      await deleteCanvasSaveHistoryItemRequest({
        projectId: currentProjectId,
        historyId: id,
      });
      setSaveHistory((current) => current.filter((item) => item.id !== id));
    } catch (error) {
      console.warn("Failed to delete canvas save history", error);
      showCanvasSaveStatus("保存记录删除失败");
    }
  }, [currentProjectId, showCanvasSaveStatus]);

  const downloadCanvasProject = useCallback((payload: CanvasProjectExport) => {
    downloadFile(
      getCanvasProjectFilename(payload),
      JSON.stringify(payload, null, 2),
      "application/json",
    );
  }, []);

  const openCanvasProject = useCallback(
    async (projectId: string) => {
      if (projectId === currentProjectId) return;

      if (currentProjectId) {
        await persistProjectRecord(currentProjectId, createCurrentCanvasPayload());
      }

      try {
        const project = await loadCanvasProject(projectId);
        restoreCanvasProject(project.payload, { projectId });
        setCurrentProjectId(projectId);
        setSaveHistory(await listCanvasSaveHistory(projectId));
        writeActiveCanvasProjectId(projectId);
        showCanvasSaveStatus("已切换画布");
      } catch (error) {
        console.warn("Failed to open canvas project", error);
        showCanvasSaveStatus("画布打开失败");
      }
    },
    [
      createCurrentCanvasPayload,
      currentProjectId,
      persistProjectRecord,
      restoreCanvasProject,
      showCanvasSaveStatus,
    ],
  );

  const deleteCurrentCanvasProject = useCallback(async () => {
    if (!currentProjectId) return;
    try {
      await deleteCanvasProjectRequest(currentProjectId);
      const nextProjects = canvasProjects.filter((project) => project.id !== currentProjectId);
      removeActiveCanvasProjectId();
      setCanvasProjects(nextProjects);
      setCurrentProjectId(null);
      setSaveHistory([]);
      router.push("/");
    } catch (error) {
      console.warn("Failed to delete canvas project", error);
      showCanvasSaveStatus("画布删除失败");
    }
  }, [canvasProjects, currentProjectId, router, showCanvasSaveStatus]);

  useEffect(() => {
    let disposed = false;

    async function hydrateCanvasProject() {
      try {
        const projects = await listCanvasProjects();
        if (disposed) return;
        if (projects.length === 0) {
          removeActiveCanvasProjectId();
          showCanvasSaveStatus("先新建画布");
          router.replace("/");
          return;
        }

        const storedActiveId = readActiveCanvasProjectId();
        const activeProject =
          projects.find((project) => project.id === storedActiveId) || projects[0];
        if (!activeProject) {
          removeActiveCanvasProjectId();
          router.replace("/");
          return;
        }

        const loaded = await loadCanvasProject(activeProject.id);
        const history = await listCanvasSaveHistory(activeProject.id);
        if (disposed) return;

        setCanvasProjects(projects);
        setCurrentProjectId(activeProject.id);
        setSaveHistory(history);
        restoreCanvasProject(loaded.payload, { projectId: activeProject.id });
        writeActiveCanvasProjectId(activeProject.id);
        canvasStorageHydratedRef.current = true;
      } catch (error) {
        console.warn("Failed to hydrate canvas project", error);
        if (!disposed) {
          removeActiveCanvasProjectId();
          showCanvasSaveStatus("请先登录");
          router.replace("/");
        }
      }
    }

    void hydrateCanvasProject();

    return () => {
      disposed = true;
    };
  }, [restoreCanvasProject, router, showCanvasSaveStatus]);

  useEffect(() => {
    if (!canvasStorageHydratedRef.current) return;
    if (!currentProjectId) return;

    const timer = setTimeout(() => {
      void persistProjectRecord(currentProjectId, createCurrentCanvasPayload());
    }, 500);

    return () => clearTimeout(timer);
  }, [createCurrentCanvasPayload, currentProjectId, persistProjectRecord]);

  return {
    canvasProjects,
    currentProject,
    currentProjectId,
    saveHistory,
    saveHistoryOpen,
    setSaveHistoryOpen,
    deleteProjectConfirmOpen,
    setDeleteProjectConfirmOpen,
    createCurrentCanvasPayload,
    persistProjectRecord,
    addCanvasSaveHistory,
    restoreCanvasProject,
    saveCurrentCanvas,
    deleteCanvasSaveHistoryItem,
    downloadCanvasProject,
    openCanvasProject,
    deleteCurrentCanvasProject,
    setCurrentProjectId,
    setSaveHistory,
  };
}
