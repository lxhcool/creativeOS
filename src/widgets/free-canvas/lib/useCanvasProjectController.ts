import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createCanvasEdge } from "@/entities/canvas/lib/factory";
import { getCanvasTextRole } from "@/entities/canvas/lib/textRoles";
import { getCanvasWorkflowStrategy } from "@/features/canvas-workflows";
import type {
  CanvasEdge,
  CanvasElement,
  CanvasProjectExport,
  CanvasTextElement,
  CanvasTextRole,
  CanvasViewport,
  CanvasWorkflowType,
} from "@/entities/canvas/model/types";
import type { CanvasDraftEdge, CanvasSnapshot } from "../model/types";
import {
  CANVAS_SAVE_HISTORY_LIMIT,
  createBlankCanvasProjectPayload,
  createCanvasProjectPayload,
  createCanvasProjectRecord,
  downloadFile,
  getCanvasProjectFilename,
  getCanvasProjectId,
  getCanvasProjectName,
  getCanvasProjectStorageKey,
  getCanvasSaveId,
  getNormalizedWorkflowType,
  normalizeCanvasProjectExport,
  readActiveCanvasProjectId,
  readCanvasProjectFromStorage,
  readCanvasProjectRecords,
  readCanvasSaveHistory,
  removeActiveCanvasProjectId,
  removeCanvasProjectFromStorage,
  writeActiveCanvasProjectId,
  writeCanvasProjectRecords,
  writeCanvasProjectToStorage,
  writeCanvasSaveHistory,
  type CanvasProjectRecord,
  type CanvasSaveHistoryItem,
} from "./canvasProjectStorage";
import type { CanvasBrainChatMessage } from "../ui/CanvasBrainPanel";

type CanvasCommitInput =
  | { elements?: CanvasElement[]; edges?: CanvasEdge[] }
  | ((current: CanvasSnapshot) => { elements?: CanvasElement[]; edges?: CanvasEdge[] });

const NOVEL_RESTORE_LAYOUT: Partial<Record<CanvasTextRole, { x: number; y: number }>> = {
  novel_setup: { x: -915, y: -760 },
  novel_core: { x: -915, y: 0 },
  character_cast: { x: -305, y: 0 },
  novel_world: { x: 305, y: 0 },
  novel_style_guide: { x: 915, y: 0 },
  novel_outline: { x: -915, y: 560 },
  novel_volume_outline: { x: -915, y: 1120 },
  novel_chapter_outline: { x: -915, y: 1680 },
  novel_chapter: { x: -915, y: 2240 },
};

const NOVEL_RESTORE_ROLES = new Set(Object.keys(NOVEL_RESTORE_LAYOUT) as CanvasTextRole[]);

function getMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getElementCenter(element: CanvasElement): { x: number; y: number } {
  return {
    x: element.x + element.width / 2,
    y: element.y + element.height / 2,
  };
}

function getFirstTextByRole(
  elements: CanvasElement[],
  role: CanvasTextRole,
): CanvasTextElement | undefined {
  return elements.find(
    (element): element is CanvasTextElement =>
      element.kind === "text" && getCanvasTextRole(element.textRole) === role,
  );
}

function createNovelRestoreEdge(
  source: CanvasTextElement | undefined,
  target: CanvasTextElement | undefined,
): CanvasEdge[] {
  if (!source || !target) return [];
  return [
    createCanvasEdge({
      sourceId: source.id,
      targetId: target.id,
    }),
  ];
}

function migrateNovelCanvasLayout(params: {
  elements: CanvasElement[];
  edges: CanvasEdge[];
  workflowType: CanvasWorkflowType;
}): { elements: CanvasElement[]; edges: CanvasEdge[] } {
  if (params.workflowType !== "novel") return params;

  const setup = getFirstTextByRole(params.elements, "novel_setup");
  const fallback = params.elements.find(
    (element): element is CanvasTextElement =>
      element.kind === "text" && NOVEL_RESTORE_ROLES.has(getCanvasTextRole(element.textRole)),
  );
  const anchor = setup || fallback;
  if (!anchor) return params;

  const anchorRole = getCanvasTextRole(anchor.textRole);
  const anchorOffset = NOVEL_RESTORE_LAYOUT[anchorRole] || NOVEL_RESTORE_LAYOUT.novel_setup!;
  const anchorCenter = getElementCenter(anchor);
  const baseCenter = {
    x: anchorCenter.x - anchorOffset.x,
    y: anchorCenter.y - anchorOffset.y,
  };

  const elements = params.elements.map((element) => {
    if (element.kind !== "text") return element;
    const role = getCanvasTextRole(element.textRole);
    const offset = NOVEL_RESTORE_LAYOUT[role];
    if (!offset) return element;

    return {
      ...element,
      x: baseCenter.x + offset.x - element.width / 2,
      y: baseCenter.y + offset.y - element.height / 2,
      meta: {
        ...(element.meta || {}),
        workflowLocked: true,
      },
    } satisfies CanvasTextElement;
  });

  const byRole = (role: CanvasTextRole) => getFirstTextByRole(elements, role);
  const migratedIds = new Set(
    elements
      .filter(
        (element): element is CanvasTextElement =>
          element.kind === "text" && NOVEL_RESTORE_ROLES.has(getCanvasTextRole(element.textRole)),
      )
      .map((element) => element.id),
  );
  const foundationTarget =
    byRole("character_cast") ||
    byRole("novel_core") ||
    byRole("novel_world") ||
    byRole("novel_style_guide");

  const workflowEdges = [
    ...createNovelRestoreEdge(byRole("novel_setup"), foundationTarget),
    ...createNovelRestoreEdge(foundationTarget, byRole("novel_outline")),
    ...createNovelRestoreEdge(byRole("novel_outline"), byRole("novel_volume_outline")),
    ...createNovelRestoreEdge(byRole("novel_volume_outline"), byRole("novel_chapter_outline")),
    ...createNovelRestoreEdge(byRole("novel_chapter_outline"), byRole("novel_chapter")),
  ];
  const edgeKeys = new Set<string>();
  const edges = [
    ...params.edges.filter(
      (edge) => !(migratedIds.has(edge.sourceId) && migratedIds.has(edge.targetId)),
    ),
    ...workflowEdges,
  ].filter((edge) => {
    const key = `${edge.sourceId}:${edge.targetId}`;
    if (edgeKeys.has(key)) return false;
    edgeKeys.add(key);
    return true;
  });

  return { elements, edges };
}

export function useCanvasProjectController(params: {
  elements: CanvasElement[];
  edges: CanvasEdge[];
  viewport: CanvasViewport;
  aiMessages: CanvasBrainChatMessage[];
  commitCanvas: (next: CanvasCommitInput) => void;
  setElements: (elements: CanvasElement[]) => void;
  setEdges: (edges: CanvasEdge[]) => void;
  setViewport: (viewport: CanvasViewport) => void;
  setSelectedId: (id: string | null) => void;
  setSelectedEdgeId: (id: string | null) => void;
  setDraftEdge: (edge: CanvasDraftEdge | null) => void;
  setChatOpen: (open: boolean) => void;
  setAiMessages: (messages: CanvasBrainChatMessage[]) => void;
  showCanvasSaveStatus: (message: string) => void;
}) {
  const router = useRouter();
  const {
    elements,
    edges,
    viewport,
    aiMessages,
    commitCanvas,
    setElements,
    setEdges,
    setViewport,
    setSelectedId,
    setSelectedEdgeId,
    setDraftEdge,
    setChatOpen,
    setAiMessages,
    showCanvasSaveStatus,
  } = params;
  const [canvasProjects, setCanvasProjects] = useState<CanvasProjectRecord[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [currentWorkflowType, setCurrentWorkflowType] =
    useState<CanvasWorkflowType>("free");
  const [saveHistory, setSaveHistory] = useState<CanvasSaveHistoryItem[]>([]);
  const [saveHistoryOpen, setSaveHistoryOpen] = useState(false);
  const [projectNameOpen, setProjectNameOpen] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const [projectWorkflowDraft, setProjectWorkflowDraft] =
    useState<CanvasWorkflowType>("free");
  const [deleteProjectConfirmOpen, setDeleteProjectConfirmOpen] = useState(false);
  const canvasStorageHydratedRef = useRef(false);

  const currentProject = currentProjectId
    ? canvasProjects.find((project) => project.id === currentProjectId) || null
    : null;

  const createCurrentCanvasPayload = useCallback(
    () =>
      createCanvasProjectPayload({
        elements,
        edges,
        viewport,
        workflowType: currentWorkflowType,
        assistantMessages: aiMessages.map((message) => ({
          role: message.role,
          content: message.content,
          actions: message.actions,
        })),
      }),
    [aiMessages, currentWorkflowType, edges, elements, viewport],
  );

  const persistProjectRecord = useCallback(
    (projectId: string, payload: CanvasProjectExport, name?: string) => {
      const savedProject = writeCanvasProjectToStorage(
        getCanvasProjectStorageKey(projectId),
        payload,
      );
      if (!savedProject) return false;

      setCanvasProjects((current) => {
        const existing = current.find((project) => project.id === projectId);
        const record = createCanvasProjectRecord({
          id: projectId,
          payload,
          name,
          previous: existing,
        });
        const next = [
          record,
          ...current.filter((project) => project.id !== projectId),
        ].sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
        writeCanvasProjectRecords(next);
        return next;
      });

      return true;
    },
    [],
  );

  const addCanvasSaveHistory = useCallback(
    (payload: CanvasProjectExport, name?: string) => {
      if (!currentProjectId) return null;

      const item: CanvasSaveHistoryItem = {
        id: getCanvasSaveId(),
        name: name?.trim() || getCanvasProjectName(payload),
        savedAt: new Date().toISOString(),
        nodeCount: payload.elements.length,
        edgeCount: payload.edges.length,
        payload,
      };

      setSaveHistory((current) => {
        const next = [
          item,
          ...current.filter((historyItem) => historyItem.id !== item.id),
        ].slice(0, CANVAS_SAVE_HISTORY_LIMIT);
        const saved = writeCanvasSaveHistory(currentProjectId, next);
        if (!saved) {
          showCanvasSaveStatus("保存记录空间不足，可导出到本地文件");
          return current;
        }
        return next;
      });

      return item;
    },
    [currentProjectId, showCanvasSaveStatus],
  );

  const restoreCanvasProject = useCallback(
    (
      payload: CanvasProjectExport,
      options?: { projectId?: string; useHistory?: boolean },
    ) => {
      const normalized = normalizeCanvasProjectExport(payload);
      const normalizedWorkflowType = getNormalizedWorkflowType(normalized.workflowType);
      const migrated = migrateNovelCanvasLayout({
        elements: normalized.elements,
        edges: normalized.edges,
        workflowType: normalizedWorkflowType,
      });
      const restoredAssistantConfig =
        getCanvasWorkflowStrategy(normalizedWorkflowType).getAIAssistantConfig();

      if (options?.useHistory) {
        commitCanvas({
          elements: migrated.elements,
          edges: migrated.edges,
        });
      } else {
        setElements(migrated.elements);
        setEdges(migrated.edges);
      }
      setViewport(normalized.viewport);
      setCurrentWorkflowType(normalizedWorkflowType);
      setChatOpen(restoredAssistantConfig.defaultOpen);
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
                content: restoredAssistantConfig.initialMessage,
              },
            ],
      );
      if (options?.projectId) {
        writeActiveCanvasProjectId(options.projectId);
        writeCanvasProjectToStorage(
          getCanvasProjectStorageKey(options.projectId),
          {
            ...normalized,
            elements: migrated.elements,
            edges: migrated.edges,
          },
        );
      }
      return true;
    },
    [
      commitCanvas,
      setAiMessages,
      setChatOpen,
      setDraftEdge,
      setEdges,
      setElements,
      setSelectedEdgeId,
      setSelectedId,
      setViewport,
    ],
  );

  const saveCurrentCanvas = useCallback(() => {
    if (!currentProjectId) return;
    const payload = createCurrentCanvasPayload();
    const savedCurrent = persistProjectRecord(currentProjectId, payload);
    if (!savedCurrent) {
      showCanvasSaveStatus("保存失败，本地空间不足");
      return;
    }

    addCanvasSaveHistory(payload);
    showCanvasSaveStatus("已保存，回到首页再进入会自动恢复");
  }, [
    addCanvasSaveHistory,
    createCurrentCanvasPayload,
    currentProjectId,
    persistProjectRecord,
    showCanvasSaveStatus,
  ]);

  const deleteCanvasSaveHistoryItem = useCallback((id: string) => {
    if (!currentProjectId) return;
    setSaveHistory((current) => {
      const next = current.filter((item) => item.id !== id);
      writeCanvasSaveHistory(currentProjectId, next);
      return next;
    });
  }, [currentProjectId]);

  const downloadCanvasProject = useCallback((payload: CanvasProjectExport) => {
    downloadFile(
      getCanvasProjectFilename(payload),
      JSON.stringify(payload, null, 2),
      "application/json",
    );
  }, []);

  const openCanvasProject = useCallback(
    (projectId: string) => {
      if (projectId === currentProjectId) return;

      if (currentProjectId) {
        persistProjectRecord(currentProjectId, createCurrentCanvasPayload());
      }

      const payload =
        readCanvasProjectFromStorage(getCanvasProjectStorageKey(projectId)) ||
        createBlankCanvasProjectPayload();
      restoreCanvasProject(payload, { projectId });
      setCurrentProjectId(projectId);
      setSaveHistory(readCanvasSaveHistory(projectId));
      writeActiveCanvasProjectId(projectId);
      showCanvasSaveStatus("已切换画布");
    },
    [
      createCurrentCanvasPayload,
      currentProjectId,
      persistProjectRecord,
      restoreCanvasProject,
      showCanvasSaveStatus,
    ],
  );

  const createNewCanvasProject = useCallback(
    (name: string, workflowType: CanvasWorkflowType) => {
      const normalizedName = name.trim();
      if (!normalizedName) return;

      if (currentProjectId) {
        persistProjectRecord(currentProjectId, createCurrentCanvasPayload());
      }

      const projectId = getCanvasProjectId();
      const payload = createBlankCanvasProjectPayload(workflowType);
      persistProjectRecord(projectId, payload, normalizedName);
      restoreCanvasProject(payload, { projectId });
      setCurrentProjectId(projectId);
      setSaveHistory([]);
      writeCanvasSaveHistory(projectId, []);
      writeActiveCanvasProjectId(projectId);
      showCanvasSaveStatus("已新建画布");
    },
    [
      createCurrentCanvasPayload,
      currentProjectId,
      persistProjectRecord,
      restoreCanvasProject,
      showCanvasSaveStatus,
    ],
  );

  const deleteCurrentCanvasProject = useCallback(() => {
    if (!currentProjectId) return;
    const nextProjects = canvasProjects.filter((project) => project.id !== currentProjectId);
    removeCanvasProjectFromStorage(currentProjectId);
    removeActiveCanvasProjectId();
    writeCanvasProjectRecords(nextProjects);
    setCanvasProjects(nextProjects);
    setCurrentProjectId(null);
    setSaveHistory([]);
    router.push("/");
  }, [canvasProjects, currentProjectId, router]);

  const submitProjectName = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const normalizedName = projectNameDraft.trim();
      if (!normalizedName) return;

      createNewCanvasProject(normalizedName, projectWorkflowDraft);
      setProjectNameDraft("");
      setProjectWorkflowDraft("free");
      setProjectNameOpen(false);
    },
    [createNewCanvasProject, projectNameDraft, projectWorkflowDraft],
  );

  useEffect(() => {
    const projects = readCanvasProjectRecords();
    if (projects.length === 0) {
      removeActiveCanvasProjectId();
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

    const activeProjectId = activeProject.id;
    const activePayload =
      readCanvasProjectFromStorage(getCanvasProjectStorageKey(activeProjectId)) ||
      createBlankCanvasProjectPayload();

    setCanvasProjects(projects);
    setCurrentProjectId(activeProjectId);
    setSaveHistory(readCanvasSaveHistory(activeProjectId));
    restoreCanvasProject(activePayload, { projectId: activeProjectId });
    writeActiveCanvasProjectId(activeProjectId);
    canvasStorageHydratedRef.current = true;
  }, [restoreCanvasProject, router]);

  useEffect(() => {
    if (!canvasStorageHydratedRef.current) return;
    if (!currentProjectId) return;

    const timer = setTimeout(() => {
      persistProjectRecord(currentProjectId, createCurrentCanvasPayload());
    }, 500);

    return () => clearTimeout(timer);
  }, [createCurrentCanvasPayload, currentProjectId, persistProjectRecord]);

  return {
    canvasProjects,
    currentProject,
    currentProjectId,
    currentWorkflowType,
    setCurrentWorkflowType,
    saveHistory,
    saveHistoryOpen,
    setSaveHistoryOpen,
    projectNameOpen,
    setProjectNameOpen,
    projectNameDraft,
    setProjectNameDraft,
    projectWorkflowDraft,
    setProjectWorkflowDraft,
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
    createNewCanvasProject,
    deleteCurrentCanvasProject,
    submitProjectName,
    setCurrentProjectId,
    setSaveHistory,
  };
}
