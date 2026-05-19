import { nanoid } from "nanoid";
import type { AppSettings } from "../shared/types";

const SETTINGS_KEY = "cliplayer:settings";

export async function getSettings(): Promise<AppSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  if (stored[SETTINGS_KEY]) return stored[SETTINGS_KEY] as AppSettings;

  const settings: AppSettings = {
    theme: "system",
    language: "ja",
    retention: {
      maxRuns: 100,
      maxAgeDays: 90,
      maxImageBytes: 500 * 1024 * 1024
    },
    defaultDelivery: { type: "none" },
    auth: {
      email: null,
      deviceId: nanoid(),
      lastLoginAt: null
    },
    acknowledgedTermsAt: null,
    aiOptIn: false,
    telemetryOptIn: false
  };

  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  return settings;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}
