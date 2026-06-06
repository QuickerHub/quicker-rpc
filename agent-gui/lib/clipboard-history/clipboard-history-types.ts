export type ClipKind = "text" | "html" | "image" | "files";

export type HighlightRange = {
  start: number;
  end: number;
};

export type ClipItemDto = {
  id: string;
  kind: ClipKind;
  title: string;
  preview: string;
  sourceProcess?: string | null;
  isPinned: boolean;
  usageCount: number;
  textLength?: number | null;
  fileCount?: number | null;
  imageSizeBytes?: number | null;
  createdAt: number;
  updatedAt: number;
  highlightedText?: string | null;
  highlightHitRanges: HighlightRange[];
};

export type ClipItemDetailDto = {
  id: string;
  kind: ClipKind;
  title: string;
  preview: string;
  bodyText?: string | null;
  htmlData?: string | null;
  filePaths: string[];
  imageUrl?: string | null;
  sourceProcess?: string | null;
  isPinned: boolean;
  usageCount: number;
  createdAt: number;
  updatedAt: number;
};

export type PagedClipItemsResponse = {
  total: number;
  items: ClipItemDto[];
};

export type ClipSearchRequest = {
  query?: string;
  kind?: ClipKind | "all";
  skip?: number;
  take?: number;
  pinnedOnly?: boolean;
  sourceProcess?: string;
};

export type ClipboardPluginStatus =
  | "not_installed"
  | "installed"
  | "starting"
  | "running"
  | "stopped"
  | "error";

export type ClipboardPluginStatusDto = {
  status: ClipboardPluginStatus;
  installed: boolean;
  running: boolean;
  httpPort: number;
  pluginDir: string | null;
  message: string | null;
};
