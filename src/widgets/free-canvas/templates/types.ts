import type { ReactNode } from "react";
import type {
  CanvasArtifactType,
  CanvasTemplateElement,
} from "@/entities/canvas/model/types";

export type CanvasTemplateContentProps = {
  element: CanvasTemplateElement;
};

export type CanvasTemplateStrategy = {
  id: string;
  label: string;
  supportedArtifactTypes: CanvasArtifactType[];
  renderContent: (props: CanvasTemplateContentProps) => ReactNode;
};
