import { nanoid } from "nanoid";
import { profileMatchesUrl } from "../../shared/match";
import type { ExtractResult, ProfileRow, RuntimeMessage } from "../../shared/types";
import { profilesRepo, runsRepo } from "../../storage/repositories";
import { getSettings } from "../../storage/settings";

chrome.runtime.onInstalled.addListener(async () => {
  await getSettings();
  await seedSampleProfile();
  chrome.alarms.create("retention", { periodInMinutes: 24 * 60 });
  chrome.alarms.create("profile-sync", { periodInMinutes: 24 * 60 });
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) await chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  if (message.type === "GET_CURRENT_TAB_STATE") {
    getCurrentTabState().then(sendResponse);
    return true;
  }

  if (message.type === "RUN_PROFILE") {
    runProfile(message.profileId).then(sendResponse);
    return true;
  }

  if (message.type === "START_PICKER") {
    startPicker(message.profileName).then(sendResponse);
    return true;
  }

  if (message.type === "PICKER_SAVED") {
    profilesRepo.put(message.profile).then(() => {
      chrome.runtime.sendMessage({ type: "TAB_STATE_REFRESHED" }).catch(() => undefined);
      sendResponse({ ok: true });
    });
    return true;
  }

  return false;
});

async function getCurrentTabState() {
  const tab = await getActiveTab();
  const url = tab?.url ?? "";
  const profiles = await profilesRepo.list();
  return {
    url,
    title: tab?.title,
    matchingProfiles: profiles.filter((profile) => url && profileMatchesUrl(profile, url))
  };
}

async function runProfile(profileId: string): Promise<{ ok: boolean; result?: ExtractResult; error?: string }> {
  const [tab, profile] = await Promise.all([getActiveTab(), profilesRepo.get(profileId)]);
  if (!tab?.id || !tab.url) return { ok: false, error: "対象タブが見つかりません" };
  if (!isScriptableUrl(tab.url)) return { ok: false, error: "このページでは拡張機能を実行できません。通常の Web ページで試してください。" };
  if (!profile) return { ok: false, error: "Profile が見つかりません" };

  const run = await runsRepo.start(profile.id, tab.url);
  try {
    const result = (await sendToContentScript(tab.id, { type: "EXTRACT", profile })) as ExtractResult;
    await runsRepo.persistResult(run, profile, result);
    return { ok: true, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "抽出に失敗しました";
    return { ok: false, error: message };
  }
}

async function startPicker(profileName: string): Promise<{ ok: boolean; error?: string }> {
  const tab = await getActiveTab();
  if (!tab?.id || !tab.url) return { ok: false, error: "対象タブが見つかりません" };
  if (!isScriptableUrl(tab.url)) return { ok: false, error: "このページではピックモードを実行できません。通常の Web ページで試してください。" };
  try {
    await sendToContentScript(tab.id, { type: "START_PICKER", profileName });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "ピックモードを開始できませんでした";
    return { ok: false, error: message };
  }
}

async function sendToContentScript(tabId: number, message: RuntimeMessage): Promise<unknown> {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    if (!isMissingReceiverError(error)) throw error;
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["assets/content.js"]
    });
    return chrome.tabs.sendMessage(tabId, message);
  }
}

function isMissingReceiverError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Receiving end does not exist") || message.includes("Could not establish connection");
}

function isScriptableUrl(url: string): boolean {
  return /^(https?:|file:)/.test(url);
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function seedSampleProfile(): Promise<void> {
  const existing = await profilesRepo.get("sample-table");
  if (existing) return;
  const now = Date.now();
  const profile: ProfileRow = {
    id: "sample-table",
    name: "サンプル テーブル抽出",
    description: "テーブル行から最初の 3 列を抽出する開発用 profile",
    source: "user",
    version: 1,
    matchPatterns: ["http://*/*", "https://*/*"],
    pageType: "table",
    selectors: [
      { name: "__root__", selector: "table tbody tr", selectorType: "css", type: "html", required: true },
      { name: "col_1", selector: "td:nth-of-type(1)", selectorType: "css", type: "text", required: false },
      { name: "col_2", selector: "td:nth-of-type(2)", selectorType: "css", type: "text", required: false },
      { name: "col_3", selector: "td:nth-of-type(3)", selectorType: "css", type: "text", required: false }
    ],
    enabled: true,
    acknowledgedAt: now,
    lastSyncedAt: 0,
    lastSuccessAt: null,
    brokenSince: null,
    createdAt: now,
    updatedAt: now
  };
  await profilesRepo.put(profile);
}

export function createOfficialProfile(input: Omit<ProfileRow, "id" | "source" | "version" | "createdAt" | "updatedAt">): ProfileRow {
  const now = Date.now();
  return {
    ...input,
    id: nanoid(),
    source: "official",
    version: 1,
    createdAt: now,
    updatedAt: now
  };
}
