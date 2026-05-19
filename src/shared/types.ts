export type ProfileSource = "user" | "official";
export type PageType = "list" | "detail" | "table" | "custom";
export type SelectorType = "css" | "xpath";
export type FieldType = "text" | "attr" | "html" | "image-url";
export type RunStatus = "running" | "success" | "partial" | "failed";
export type DeliveryType = "none" | "webhook" | "csv" | "cloud-sync" | "google-sheets";

export interface TransformDef {
  trim?: boolean;
  regex?: { pattern: string; group: number };
  case?: "upper" | "lower";
}

export interface SelectorDef {
  name: string;
  selector: string;
  selectorType: SelectorType;
  type: FieldType;
  attr?: string;
  required: boolean;
  transform?: TransformDef;
}

export interface PaginationDef {
  type: "next-button" | "infinite-scroll" | "url-pattern";
  nextSelector?: string;
  scrollDistance?: number;
  urlTemplate?: string;
  maxPages: number;
  waitMs: number;
}

export interface DeliveryConfig {
  type: Exclude<DeliveryType, "none">;
  webhookUrl?: string;
  webhookHeaders?: Record<string, string>;
  csvFilenameTemplate?: string;
  googleSheetsId?: string;
}

export interface ProfileRow {
  id: string;
  name: string;
  description?: string;
  source: ProfileSource;
  serverId?: string;
  version: number;
  signature?: string;
  matchPatterns: string[];
  pageType: PageType;
  selectors: SelectorDef[];
  pagination?: PaginationDef;
  delivery?: DeliveryConfig;
  enabled: boolean;
  acknowledgedAt: number;
  lastSyncedAt: number;
  lastSuccessAt: number | null;
  brokenSince: number | null;
  changelog?: string;
  createdAt: number;
  updatedAt: number;
}

export interface RunRow {
  id: string;
  profileId: string;
  startedAt: number;
  finishedAt: number | null;
  status: RunStatus;
  triggeredBy: "manual" | "schedule" | "auto-on-page";
  pageCount: number;
  itemCount: number;
  imageBytes: number;
  errorSummary?: string;
  sourceUrl: string;
  deliveryStatus?: "pending" | "delivered" | "failed" | "skipped";
}

export interface PageRow {
  id: string;
  runId: string;
  profileId: string;
  url: string;
  title: string;
  capturedAt: number;
  htmlHash: string;
  metaJson: Record<string, unknown>;
}

export interface ItemRow {
  id: string;
  pageId: string;
  runId: string;
  profileId: string;
  index: number;
  fields: Record<string, string | number | null>;
  imageIds: string[];
  capturedAt: number;
  flags: { pii: boolean };
}

export interface ImageRow {
  id: string;
  itemId: string;
  sourceUrl: string;
  sourceUrlHash: string;
  mimeType: string;
  byteSize: number;
  blob: Blob | null;
  capturedAt: number;
}

export interface LogRow {
  id: string;
  runId: string | null;
  level: "info" | "warn" | "error";
  category: "auth" | "sync" | "extract" | "delivery" | "system";
  message: string;
  contextJson?: Record<string, unknown>;
  loggedAt: number;
}

export interface DeliveryAttemptRow {
  id: string;
  runId: string;
  type: Exclude<DeliveryType, "none">;
  endpoint?: string;
  attemptedAt: number;
  finishedAt: number | null;
  status: "success" | "failed" | "pending";
  httpStatus?: number;
  errorMessage?: string;
  retryCount: number;
}

export interface ExtractedItem {
  fields: Record<string, string | null>;
  imageUrls: string[];
}

export interface ExtractResult {
  url: string;
  title: string;
  capturedAt: number;
  htmlHash: string;
  items: ExtractedItem[];
  errors: string[];
}

export interface AppSettings {
  theme: "light" | "dark" | "system";
  language: "ja" | "en";
  retention: {
    maxRuns: number;
    maxAgeDays: number;
    maxImageBytes: number;
  };
  defaultDelivery: {
    type: DeliveryType;
    webhookUrl?: string;
    webhookHeaders?: Record<string, string>;
  };
  auth: {
    email: string | null;
    deviceId: string;
    lastLoginAt: number | null;
  };
  acknowledgedTermsAt: number | null;
  aiOptIn: boolean;
  telemetryOptIn: boolean;
}

export type RuntimeMessage =
  | { type: "GET_CURRENT_TAB_STATE" }
  | { type: "RUN_PROFILE"; profileId: string }
  | { type: "START_PICKER"; profileName: string }
  | { type: "EXTRACT"; profile: ProfileRow }
  | { type: "PREVIEW_PROFILE"; profile: ProfileRow }
  | { type: "PICKER_SAVED"; profile: ProfileRow }
  | { type: "TAB_STATE"; url: string; title?: string; matchingProfiles: ProfileRow[] };
