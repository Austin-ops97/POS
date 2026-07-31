export type OfficeFolderSummary = {
  id: string;
  parentId: string | null;
  name: string;
  color: string;
  _count: { documents: number };
};

export type OfficeFileSummary = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sortOrder: number;
  width: number | null;
  height: number | null;
};

export type OfficeDocumentSummary = {
  id: string;
  title: string;
  description: string | null;
  content: string;
  kind: "RICH_TEXT" | "SCAN" | "UPLOAD" | "TEMPLATE";
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  isSensitive: boolean;
  isFavorite: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  publishedAt: Date | string | null;
  folder: { id: string; name: string; color: string } | null;
  createdBy: { id: string; name: string };
  updatedBy: { id: string; name: string };
  files: OfficeFileSummary[];
  tags: Array<{ tag: { id: string; name: string; color: string } }>;
};

export type OfficeDocumentDetail = OfficeDocumentSummary & {
  folderId: string | null;
  locationId: string | null;
  versions: Array<{
    id: string;
    version: number;
    note: string | null;
    createdAt: Date | string;
    author: { name: string };
  }>;
};

