import { nanoid } from "nanoid";
import { db } from "./db";
import type { ExtractResult, ItemRow, PageRow, ProfileRow, RunRow } from "../shared/types";

export const profilesRepo = {
  list: () => db.profiles.orderBy("updatedAt").reverse().toArray(),
  enabled: () => db.profiles.where("enabled").equals(1).toArray(),
  get: (id: string) => db.profiles.get(id),
  put: (profile: ProfileRow) => db.profiles.put(profile),
  delete: (id: string) => db.profiles.delete(id)
};

export const runsRepo = {
  recent: (limit = 20) => db.runs.orderBy("startedAt").reverse().limit(limit).toArray(),
  get: (id: string) => db.runs.get(id),
  start: (profileId: string, sourceUrl: string): Promise<RunRow> => {
    const run: RunRow = {
      id: nanoid(),
      profileId,
      startedAt: Date.now(),
      finishedAt: null,
      status: "running",
      triggeredBy: "manual",
      pageCount: 0,
      itemCount: 0,
      imageBytes: 0,
      sourceUrl,
      deliveryStatus: "skipped"
    };
    return db.runs.add(run).then(() => run);
  },
  persistResult: async (run: RunRow, profile: ProfileRow, result: ExtractResult) => {
    const page: PageRow = {
      id: nanoid(),
      runId: run.id,
      profileId: profile.id,
      url: result.url,
      title: result.title,
      capturedAt: result.capturedAt,
      htmlHash: result.htmlHash,
      metaJson: {}
    };

    const items: ItemRow[] = result.items.map((item, index) => ({
      id: nanoid(),
      pageId: page.id,
      runId: run.id,
      profileId: profile.id,
      index,
      fields: item.fields,
      imageIds: [],
      capturedAt: result.capturedAt,
      flags: { pii: likelyHasPii(item.fields) }
    }));

    const status = result.errors.length > 0 ? "partial" : "success";
    await db.transaction("rw", [db.pages, db.items, db.runs, db.profiles, db.logs], async () => {
      await db.pages.add(page);
      await db.items.bulkAdd(items);
      await db.runs.update(run.id, {
        finishedAt: Date.now(),
        status,
        pageCount: 1,
        itemCount: items.length,
        errorSummary: result.errors.join(" / ") || undefined
      });
      await db.profiles.update(profile.id, {
        lastSuccessAt: status === "success" ? Date.now() : profile.lastSuccessAt,
        brokenSince: result.items.length === 0 || result.errors.length > 0 ? Date.now() : null,
        updatedAt: Date.now()
      });
      if (result.errors.length > 0) {
        await db.logs.add({
          id: nanoid(),
          runId: run.id,
          level: "warn",
          category: "extract",
          message: result.errors.join(" / "),
          loggedAt: Date.now()
        });
      }
    });
  }
};

function likelyHasPii(fields: Record<string, string | number | null>): boolean {
  return Object.values(fields).some((value) => {
    const text = String(value ?? "");
    return /[\w.+-]+@[\w.-]+\.\w+/.test(text) || /\d{2,4}-\d{2,4}-\d{3,4}/.test(text);
  });
}
