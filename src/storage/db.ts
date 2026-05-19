import Dexie, { type Table } from "dexie";
import type {
  DeliveryAttemptRow,
  ImageRow,
  ItemRow,
  LogRow,
  PageRow,
  ProfileRow,
  RunRow
} from "../shared/types";

class AppDB extends Dexie {
  profiles!: Table<ProfileRow, string>;
  runs!: Table<RunRow, string>;
  pages!: Table<PageRow, string>;
  items!: Table<ItemRow, string>;
  images!: Table<ImageRow, string>;
  logs!: Table<LogRow, string>;
  deliveries!: Table<DeliveryAttemptRow, string>;

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
  }
}

export const db = new AppDB();
