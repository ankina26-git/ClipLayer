import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Clock3, Crosshair, Database, Home, Play, RefreshCw, Settings } from "lucide-react";
import "./styles.css";
import type { ExtractResult, ProfileRow, RuntimeMessage, RunRow } from "../../shared/types";
import { profilesRepo, runsRepo } from "../../storage/repositories";

type Tab = "current" | "profiles" | "history" | "settings";

interface TabState {
  url: string;
  title?: string;
  matchingProfiles: ProfileRow[];
}

function App() {
  const [tab, setTab] = useState<Tab>("current");
  const [state, setState] = useState<TabState>({ url: "", matchingProfiles: [] });
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [profileName, setProfileName] = useState("新しい Profile");

  useEffect(() => {
    void refresh();
    const listener = () => void refresh();
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  async function refresh() {
    const current = (await chrome.runtime.sendMessage({ type: "GET_CURRENT_TAB_STATE" } satisfies RuntimeMessage)) as TabState;
    setState(current);
    setProfiles(await profilesRepo.list());
    setRuns(await runsRepo.recent());
  }

  async function run(profile: ProfileRow) {
    setBusy(profile.id);
    setResult(null);
    const response = (await chrome.runtime.sendMessage({ type: "RUN_PROFILE", profileId: profile.id } satisfies RuntimeMessage)) as {
      ok: boolean;
      result?: ExtractResult;
      error?: string;
    };
    setBusy(null);
    if (response.ok && response.result) setResult(response.result);
    if (!response.ok) window.alert(response.error ?? "実行に失敗しました");
    await refresh();
  }

  async function startPicker() {
    const response = (await chrome.runtime.sendMessage({
      type: "START_PICKER",
      profileName
    } satisfies RuntimeMessage)) as { ok: boolean; error?: string };
    if (!response.ok) window.alert(response.error ?? "ピックモードを開始できませんでした");
  }

  const tabs = [
    ["current", Home, "このページ"],
    ["profiles", Database, "Profiles"],
    ["history", Clock3, "履歴"],
    ["settings", Settings, "設定"]
  ] as const;

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          <strong>ClipLayer</strong>
          <span>{trimUrl(state.url) || "対象ページを開いてください"}</span>
        </div>
        <button title="更新" onClick={refresh}>
          <RefreshCw size={16} />
        </button>
      </header>

      <nav className="tabs">
        {tabs.map(([key, Icon, label]) => (
          <button key={key} className={`tab ${tab === key ? "active" : ""}`} onClick={() => setTab(key)}>
            <Icon size={17} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <section className="content">
        {tab === "current" && (
          <CurrentPage profiles={state.matchingProfiles} busy={busy} result={result} onRun={run} />
        )}
        {tab === "profiles" && (
          <Profiles profiles={profiles} profileName={profileName} setProfileName={setProfileName} onStartPicker={startPicker} />
        )}
        {tab === "history" && <History runs={runs} />}
        {tab === "settings" && <SettingsPanel />}
      </section>
    </main>
  );
}

function CurrentPage({
  profiles,
  busy,
  result,
  onRun
}: {
  profiles: ProfileRow[];
  busy: string | null;
  result: ExtractResult | null;
  onRun: (profile: ProfileRow) => void;
}) {
  return (
    <div className="stack">
      {profiles.length === 0 ? (
        <div className="card">
          <div className="title">このページで使える Profile はありません</div>
          <p className="muted">Profiles タブからピックモードを開始して、このページ用の Profile を作成できます。</p>
        </div>
      ) : (
        profiles.map((profile) => (
          <div className="card" key={profile.id}>
            <div className="row">
              <div>
                <div className="title">{profile.name}</div>
                <span className={`badge ${profile.brokenSince ? "warn" : ""}`}>
                  {profile.source === "official" ? "公式" : "自作"} v{profile.version}
                </span>
              </div>
              <button className="primary" disabled={busy === profile.id || Boolean(profile.brokenSince)} onClick={() => onRun(profile)}>
                <Play size={15} /> 実行
              </button>
            </div>
            {profile.brokenSince && <span className="muted">前回の抽出で問題を検知しました。Profile を確認してください。</span>}
          </div>
        ))
      )}
      {result && <ResultTable result={result} />}
    </div>
  );
}

function Profiles({
  profiles,
  profileName,
  setProfileName,
  onStartPicker
}: {
  profiles: ProfileRow[];
  profileName: string;
  setProfileName: (value: string) => void;
  onStartPicker: () => void;
}) {
  return (
    <div className="stack">
      <div className="card form">
        <div className="title">Profile 新規作成</div>
        <input value={profileName} onChange={(event) => setProfileName(event.target.value)} />
        <button className="primary" onClick={onStartPicker}>
          <Crosshair size={15} /> ピックモード開始
        </button>
      </div>
      {profiles.map((profile) => (
        <div className="card" key={profile.id}>
          <div className="row">
            <div>
              <div className="title">{profile.name}</div>
              <span className="muted">{profile.matchPatterns.join(", ")}</span>
            </div>
            <span className="badge">{profile.enabled ? "有効" : "無効"}</span>
          </div>
          <span className="muted">{profile.selectors.length - 1} 項目</span>
        </div>
      ))}
    </div>
  );
}

function History({ runs }: { runs: RunRow[] }) {
  return (
    <div className="stack">
      {runs.length === 0 ? (
        <div className="card">履歴はまだありません</div>
      ) : (
        runs.map((run) => (
          <div className="card" key={run.id}>
            <div className="row">
              <div className="title">{new Date(run.startedAt).toLocaleString("ja-JP")}</div>
              <span className={`badge ${run.status === "failed" || run.status === "partial" ? "warn" : ""}`}>{run.status}</span>
            </div>
            <span className="muted">
              {run.itemCount} 件 / {trimUrl(run.sourceUrl)}
            </span>
            {run.errorSummary && <span className="muted">{run.errorSummary}</span>}
          </div>
        ))
      )}
    </div>
  );
}

function SettingsPanel() {
  return (
    <div className="card">
      <div className="title">ローカルファースト設定</div>
      <p className="muted">抽出結果は IndexedDB に保存されます。Webhook、CSV、ログイン連携は次フェーズで接続します。</p>
    </div>
  );
}

function ResultTable({ result }: { result: ExtractResult }) {
  const columns = useMemo(() => Object.keys(result.items[0]?.fields ?? {}), [result]);
  return (
    <div className="card panel">
      <div className="row">
        <div className="title">抽出結果</div>
        <span className="badge">{result.items.length} 件</span>
      </div>
      {result.errors.length > 0 && <span className="muted">{result.errors.join(" / ")}</span>}
      <div className="result">
        <table>
          <thead>
            <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
          </thead>
          <tbody>
            {result.items.slice(0, 10).map((item, index) => (
              <tr key={index}>
                {columns.map((column) => (
                  <td key={column}>{item.fields[column]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function trimUrl(url: string): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return url;
  }
}

createRoot(document.getElementById("root")!).render(<App />);
