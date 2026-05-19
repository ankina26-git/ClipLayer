import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "cliplayer-api",
    version: "0.1.0"
  })
);

app.get("/v1/profiles/catalog", (c) =>
  c.json({
    profiles: [
      {
        id: "sample-table",
        name: "サンプル テーブル抽出",
        category: "development",
        minimumPlan: "free"
      }
    ]
  })
);

const port = Number(process.env.PORT ?? 8787);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`ClipLayer API listening on http://localhost:${info.port}`);
});
