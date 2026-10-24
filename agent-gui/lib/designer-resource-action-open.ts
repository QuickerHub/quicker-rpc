import type { ActionProjectBinding } from "./action-project-binding";
import type { DesignerCatalogContext } from "./action-editor/catalog/designerCatalogContext";
import type { WorkspaceDocumentOwner } from "./workspace-document-instances";

export const DESIGNER_RESOURCE_ACTION_OPEN_CAPABILITY = "action.legacyBody.read";
export type DesignerResourceActionOpenRequest = Readonly<{
  actionId: string;
  requestId: string;
  sourceOwner: WorkspaceDocumentOwner;
  catalogContext: DesignerCatalogContext;
}>;
export type DesignerResourceActionOpenSuccess = Readonly<{
  ok: true;
  actionId: string;
  projectDirectory: string;
  path: string;
  projectBinding: ActionProjectBinding;
  localPersistence: "unchanged" | "confirmed";
  origin: "existing" | "exported" | "recovered";
}>;
export type DesignerResourceActionOpenFailure = Readonly<{
  ok: false;
  code: string;
  error: string;
  retryable: false;
  projectDirectory?: string;
  localPersistence: "none" | "unknown" | "partial" | "confirmed";
  persistedParts?: Readonly<{ localProject?: boolean; binding?: boolean }>;
}>;
export type DesignerResourceActionOpenResult = DesignerResourceActionOpenSuccess | DesignerResourceActionOpenFailure;
