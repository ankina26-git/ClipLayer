import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import type { AppSettings } from "../../shared/types";
import { getSettings, saveSettings } from "../../storage/settings";

function Options() {
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  async function update(next: AppSettings) {
    setSettings(next);
    await saveSettings(next);
  }

  if (!settings) return <main className="content">読み込み中...</main>;

  return (
    <main className="content" style={{ maxWidth: 760, margin: "0 auto" }}>
      <div className="topbar">
        <div className="brand">
          <strong>ClipLayer 設定</strong>
          <span>Device ID: {settings.auth.deviceId}</span>
        </div>
      </div>
      <section className="card form">
        <div className="title">保存期間</div>
        <label>
          最大履歴数
          <input
            type="number"
            value={settings.retention.maxRuns}
            onChange={(event) =>
              update({ ...settings, retention: { ...settings.retention, maxRuns: Number(event.target.value) } })
            }
          />
        </label>
        <label>
          最大保存日数
          <input
            type="number"
            value={settings.retention.maxAgeDays}
            onChange={(event) =>
              update({ ...settings, retention: { ...settings.retention, maxAgeDays: Number(event.target.value) } })
            }
          />
        </label>
      </section>
      <section className="card">
        <div className="title">同意とオプトイン</div>
        <label>
          <input
            type="checkbox"
            checked={settings.telemetryOptIn}
            onChange={(event) => update({ ...settings, telemetryOptIn: event.target.checked })}
          />
          利用状況の送信を許可
        </label>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Options />);
