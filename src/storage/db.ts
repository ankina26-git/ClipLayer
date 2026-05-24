import Dexie, { type Table } from "dexie";
import type {
  DeliveryAttemptRow,
  ImageRow,
  ItemRow,
  JobRow,
  LogRow,
  PageRow,
  ProfileRow,
  RunRow,
  TaskRow,
  TransferMappingSet,
  WriteProfileRow,
  WriteReceiptRow
} from "../shared/types";

class AppDB extends Dexie {
  profiles!: Table<ProfileRow, string>;
  runs!: Table<RunRow, string>;
  pages!: Table<PageRow, string>;
  items!: Table<ItemRow, string>;
  images!: Table<ImageRow, string>;
  logs!: Table<LogRow, string>;
  deliveries!: Table<DeliveryAttemptRow, string>;
  writeProfiles!: Table<WriteProfileRow, string>;
  jobs!: Table<JobRow, string>;
  tasks!: Table<TaskRow, string>;
  mappings!: Table<TransferMappingSet, string>;
  writeReceipts!: Table<WriteReceiptRow, string>;

  constructor() {
    super("cliplayer-app");
    this.version(1).stores({
      profiles: "id, source, serverId, enabled, updatedAt",
      runs: "id, profileId, startedAt, status, [profileId+startedAt]",
      pages: "id, runId, profileId, capturedAt, htmlHash",
      items: "id, pageId, runId, profileId, [profileId+capturedAt]",
      images: "id, itemId, sourceUrlHash, capturedAt",
      logs: "id, runId, level, loggedAt",
      deliveries: "id, runId, type, attemptedAt, status"
    });

    this.version(2).stores({
      profiles: "id, source, serverId, enabled, updatedAt",
      runs: "id, profileId, startedAt, status, [profileId+startedAt]",
      pages: "id, runId, profileId, capturedAt, htmlHash",
      items: "id, pageId, runId, profileId, [profileId+capturedAt]",
      images: "id, itemId, sourceUrlHash, capturedAt",
      logs: "id, runId, level, loggedAt",
      deliveries: "id, runId, type, attemptedAt, status",
      writeProfiles: "id, source, serverId, enabled, updatedAt",
      jobs: "id, kind, status, createdAt",
      tasks: "id, jobId, kind, status, [jobId+status]",
      mappings: "id, writeProfileId, sourceProfileId",
      writeReceipts: "id, writeProfileId, idempotencyKey, jobId, [writeProfileId+idempotencyKey]"
    });
  }
}

export const db = new AppDB();
