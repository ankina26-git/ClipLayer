import { extractFromDocument, previewProfile } from "../../shared/extract";
import type { RuntimeMessage } from "../../shared/types";
import { ElementPicker } from "./picker";

let picker: ElementPicker | null = null;

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  if (message.type === "EXTRACT") {
    extractFromDocument(message.profile).then(sendResponse);
    return true;
  }

  if (message.type === "PREVIEW_PROFILE") {
    previewProfile(message.profile).then(sendResponse);
    return true;
  }

  if (message.type === "START_PICKER") {
    picker?.destroy();
    picker = new ElementPicker(message.profileName);
    sendResponse({ ok: true });
    return false;
  }

  return false;
});
