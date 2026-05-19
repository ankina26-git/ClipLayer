import React from "react";
import { createRoot } from "react-dom/client";
import { PanelRightOpen, Settings } from "lucide-react";
import "./styles.css";

function Popup() {
  async function openSidePanel() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) await chrome.sidePanel.open({ tabId: tab.id });
    window.close();
  }

  function openOptions() {
    chrome.runtime.openOptionsPage();
  }

  return (
    <main className="popup">
      <div className="brand">
        <strong>ClipLayer</strong>
        <span>ログイン後ページからデータを取り込みます</span>
      </div>
      <button className="primary" onClick={openSidePanel}>
        <PanelRightOpen size={16} /> Side Panel
      </button>
      <button onClick={openOptions}>
        <Settings size={16} /> 設定
      </button>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Popup />);
