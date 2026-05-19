import { nanoid } from "nanoid";
import { patternForUrl } from "../../shared/match";
import type { ProfileRow, SelectorDef } from "../../shared/types";
import { detectRepeatingRow, generateRelativeSelector, guessFieldType, type RowDetection } from "./selector";

type Stage = "row" | "confirm" | "field";

export class ElementPicker {
  private host: HTMLDivElement;
  private root: ShadowRoot;
  private stage: Stage = "row";
  private hover: HTMLDivElement;
  private detection: RowDetection | null = null;
  private fields: SelectorDef[] = [];

  constructor(private profileName: string) {
    this.host = document.createElement("div");
    this.host.id = "__cliplayer_picker__";
    this.host.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none";
    document.documentElement.appendChild(this.host);
    this.root = this.host.attachShadow({ mode: "open" });
    this.hover = document.createElement("div");
    this.render();
    document.addEventListener("mouseover", this.onMouseOver, true);
    document.addEventListener("click", this.onClick, true);
  }

  destroy(): void {
    document.removeEventListener("mouseover", this.onMouseOver, true);
    document.removeEventListener("click", this.onClick, true);
    this.host.remove();
  }

  private onMouseOver = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element) || this.host.contains(target)) return;
    this.placeBox(this.hover, target, "rgba(37, 99, 235, 0.25)", "#2563eb");
  };

  private onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element) || this.host.contains(target)) return;
    event.preventDefault();
    event.stopPropagation();

    if (this.stage === "row") {
      this.detection = detectRepeatingRow(target);
      this.stage = "confirm";
      this.render();
      return;
    }

    if (this.stage === "field" && this.detection) {
      const owningRow = this.detection.allRows.find((row) => row.contains(target));
      if (!owningRow) {
        this.toast("リストの内側をクリックしてください");
        return;
      }
      const sample = readSample(target);
      const label = window.prompt("項目名を入力してください", suggestName(sample));
      if (!label) return;
      this.fields.push({
        name: label,
        selector: generateRelativeSelector(owningRow, target),
        selectorType: "css",
        type: guessFieldType(target),
        attr: target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ? "value" : undefined,
        required: true
      });
      this.render();
    }
  };

  private render(): void {
    const count = this.detection?.allRows.length ?? 0;
    const preview = this.previewRows();
    this.root.innerHTML = `
      <style>
        :host { all: initial; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        .box { position: fixed; border: 2px solid #2563eb; background: rgba(37, 99, 235, .12); pointer-events: none; border-radius: 4px; }
        .row { position: fixed; border: 2px solid #10b981; background: rgba(16, 185, 129, .10); pointer-events: none; border-radius: 4px; }
        .panel { pointer-events: auto; position: fixed; right: 16px; top: 16px; width: 360px; max-height: calc(100vh - 32px); overflow: auto; background: #fff; color: #172033; border: 1px solid #d8dee9; border-radius: 8px; box-shadow: 0 24px 80px rgba(15, 23, 42, .25); }
        .head { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid #e5e7eb; font-weight: 700; }
        .body { padding: 14px; display: grid; gap: 12px; font-size: 13px; line-height: 1.5; }
        .actions { display: flex; flex-wrap: wrap; gap: 8px; }
        button { border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; padding: 8px 10px; font: inherit; cursor: pointer; }
        button.primary { border-color: #2563eb; background: #2563eb; color: #fff; }
        button.danger { border-color: #dc2626; color: #dc2626; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        td, th { border-bottom: 1px solid #edf2f7; padding: 5px 4px; text-align: left; vertical-align: top; }
        .muted { color: #64748b; }
      </style>
      <div id="hover" class="box"></div>
      <div id="rows"></div>
      <section class="panel">
        <div class="head"><span>ClipLayer Picker</span><button id="close">x</button></div>
        <div class="body">
          ${this.panelBody(count, preview)}
        </div>
      </section>
    `;

    this.hover = this.root.querySelector("#hover") as HTMLDivElement;
    this.root.querySelector("#close")?.addEventListener("click", () => this.destroy());
    this.root.querySelector("#confirm")?.addEventListener("click", () => {
      this.stage = "field";
      this.render();
    });
    this.root.querySelector("#restart")?.addEventListener("click", () => {
      this.detection = null;
      this.fields = [];
      this.stage = "row";
      this.render();
    });
    this.root.querySelector("#save")?.addEventListener("click", () => this.save());
    this.renderRowBoxes();
  }

  private panelBody(count: number, preview: Record<string, string>[]): string {
    if (this.stage === "row") {
      return `<strong>Step 1 / 3: リスト行の指定</strong><span class="muted">取り込みたい一覧のうち、1 件分の行をクリックしてください。</span>`;
    }

    if (this.stage === "confirm") {
      return `
        <strong>Step 2 / 3: 検出結果の確認</strong>
        <span>${count} 件の繰り返し要素を検出しました。</span>
        <div class="actions"><button id="confirm" class="primary">合っている</button><button id="restart">やり直す</button></div>
      `;
    }

    return `
      <strong>Step 3 / 3: 項目の指定</strong>
      <span class="muted">行の内側にある取り出したい項目をクリックしてください。</span>
      <div>${this.fields.map((field) => `✓ ${escapeHtml(field.name)}`).join("<br>") || "項目は未追加です"}</div>
      ${preview.length > 0 ? renderPreview(preview) : ""}
      <div class="actions"><button id="save" class="primary" ${this.fields.length === 0 ? "disabled" : ""}>保存</button><button id="restart">やり直す</button></div>
    `;
  }

  private renderRowBoxes(): void {
    const container = this.root.querySelector("#rows");
    if (!container || !this.detection) return;
    container.innerHTML = "";
    for (const row of this.detection.allRows.slice(0, 200)) {
      const box = document.createElement("div");
      box.className = "row";
      this.placeBox(box, row, "rgba(16, 185, 129, .10)", "#10b981");
      container.appendChild(box);
    }
  }

  private placeBox(box: HTMLDivElement, element: Element, background: string, border: string): void {
    const rect = element.getBoundingClientRect();
    box.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;border:2px solid ${border};background:${background};pointer-events:none;border-radius:4px;`;
  }

  private previewRows(): Record<string, string>[] {
    if (!this.detection || this.fields.length === 0) return [];
    return this.detection.allRows.slice(0, 5).map((row) =>
      Object.fromEntries(
        this.fields.map((field) => {
          const el = row.querySelector(field.selector);
          return [field.name, el ? readSample(el) : "(取得不可)"];
        })
      )
    );
  }

  private save(): void {
    if (!this.detection) return;
    const now = Date.now();
    const profile: ProfileRow = {
      id: nanoid(),
      name: this.profileName,
      source: "user",
      version: 1,
      matchPatterns: [patternForUrl(location.href, "path")],
      pageType: "list",
      selectors: [
        { name: "__root__", selector: this.detection.rootSelector, selectorType: "css", type: "html", required: true },
        ...this.fields
      ],
      enabled: true,
      acknowledgedAt: now,
      lastSyncedAt: 0,
      lastSuccessAt: null,
      brokenSince: null,
      createdAt: now,
      updatedAt: now
    };
    chrome.runtime.sendMessage({ type: "PICKER_SAVED", profile });
    this.destroy();
  }

  private toast(message: string): void {
    window.alert(message);
  }
}

function readSample(el: Element): string {
  if (el instanceof HTMLImageElement) return el.currentSrc || el.src;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value;
  return (el.textContent ?? "").trim();
}

function suggestName(sample: string): string {
  if (/@/.test(sample)) return "email";
  if (/\d{2,4}-\d{2,4}-\d{3,4}/.test(sample)) return "phone";
  if (/\d{4}[/-]\d{1,2}[/-]\d{1,2}/.test(sample)) return "date";
  return "field";
}

function renderPreview(rows: Record<string, string>[]): string {
  const columns = Object.keys(rows[0] ?? {});
  return `
    <table>
      <thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(row[column] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>
  `;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char] ?? char);
}
