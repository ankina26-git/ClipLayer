"use strict";
(() => {
  // src/shared/extract.ts
  async function extractFromDocument(profile, doc = document) {
    const now = Date.now();
    const rootSelector = profile.selectors.find((selector) => selector.name === "__root__");
    const fieldSelectors = profile.selectors.filter((selector) => selector.name !== "__root__");
    const errors = [];
    const rows = rootSelector ? queryAll(doc, rootSelector) : [doc.body].filter(Boolean);
    if (rows.length === 0) errors.push("\u53D6\u308A\u8FBC\u307F\u5BFE\u8C61\u306E\u884C\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F");
    const items = rows.map((row) => {
      const fields = {};
      const imageUrls = [];
      for (const selector of fieldSelectors) {
        const target = queryOne(row, selector);
        const value = target ? readFieldValue(target, selector.type, selector.attr) : null;
        const transformed = value == null ? null : applyTransform(value, selector.transform);
        if (selector.required && !transformed) {
          errors.push(`\u5FC5\u9808\u9805\u76EE\u300C${selector.name}\u300D\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F`);
        }
        fields[selector.name] = transformed;
        if (selector.type === "image-url" && transformed) imageUrls.push(transformed);
      }
      return { fields, imageUrls };
    });
    return {
      url: location.href,
      title: doc.title,
      capturedAt: now,
      htmlHash: await sha256(doc.documentElement.outerHTML),
      items,
      errors: Array.from(new Set(errors))
    };
  }
  function previewProfile(profile, limit = 5) {
    const trimmedProfile = { ...profile };
    return extractFromDocument(trimmedProfile).then((result) => ({
      ...result,
      items: result.items.slice(0, limit)
    }));
  }
  function queryAll(root, selector) {
    if (selector.selectorType === "xpath") {
      const doc = root.ownerDocument ?? document;
      const result = doc.evaluate(selector.selector, root, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE);
      return Array.from({ length: result.snapshotLength }, (_, index) => result.snapshotItem(index)).filter(
        (node) => node instanceof Element
      );
    }
    return Array.from(root.querySelectorAll(selector.selector));
  }
  function queryOne(root, selector) {
    if (selector.selectorType === "xpath") return queryAll(root, selector)[0] ?? null;
    return root.querySelector(selector.selector);
  }
  function readFieldValue(el, type, attr) {
    switch (type) {
      case "attr":
        return el.getAttribute(attr ?? "value") ?? "";
      case "html":
        return el.innerHTML;
      case "image-url":
        return el instanceof HTMLImageElement ? el.currentSrc || el.src : el.getAttribute("src") ?? "";
      case "text":
      default:
        return el.textContent ?? "";
    }
  }
  function applyTransform(value, transform) {
    let out = transform?.trim === false ? value : value.trim();
    if (transform?.regex) {
      const match = out.match(new RegExp(transform.regex.pattern));
      out = match?.[transform.regex.group] ?? "";
    }
    if (transform?.case === "upper") out = out.toUpperCase();
    if (transform?.case === "lower") out = out.toLowerCase();
    return out;
  }
  async function sha256(value) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  // node_modules/nanoid/url-alphabet/index.js
  var urlAlphabet = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";

  // node_modules/nanoid/index.browser.js
  var nanoid = (size = 21) => {
    let id = "";
    let bytes = crypto.getRandomValues(new Uint8Array(size |= 0));
    while (size--) {
      id += urlAlphabet[bytes[size] & 63];
    }
    return id;
  };

  // src/shared/match.ts
  function patternForUrl(url, scope) {
    const parsed = new URL(url);
    if (scope === "page") return parsed.href;
    if (scope === "path") return `${parsed.origin}${parsed.pathname.replace(/\/?$/, "")}*`;
    return `${parsed.origin}/*`;
  }

  // src/extension/content/selector.ts
  function detectRepeatingRow(el) {
    let current = el;
    while (current !== null && current.parentElement !== null) {
      const subject = current;
      const parent = subject.parentElement;
      if (parent === null) break;
      const siblings = Array.from(parent.children).filter(
        (sibling) => sibling.tagName === subject.tagName && classSimilarity(sibling, subject) > 0.7 && structuralSimilarity(sibling, subject) > 0.6
      );
      if (siblings.length >= 3) {
        return {
          row: subject,
          allRows: siblings,
          rootSelector: generateStableSelector(subject)
        };
      }
      current = parent;
    }
    return { row: el, allRows: [el], rootSelector: generateStableSelector(el) };
  }
  function generateRelativeSelector(row, target) {
    const path = [];
    let cur = target;
    while (cur && cur !== row) {
      path.unshift(stableTokenFor(cur));
      cur = cur.parentElement;
    }
    return path.join(" > ");
  }
  function generateStableSelector(el) {
    const path = [];
    let cur = el;
    while (cur && cur !== document.documentElement) {
      const token = stableTokenFor(cur);
      path.unshift(token);
      if (token.startsWith("#") || token.startsWith("[data-")) break;
      cur = cur.parentElement;
    }
    return path.join(" > ");
  }
  function stableTokenFor(el) {
    const id = el.getAttribute("id");
    if (id && isStableToken(id)) return `#${CSS.escape(id)}`;
    const dataAttr = Array.from(el.attributes).find(
      (attr) => attr.name.startsWith("data-") && attr.value && !/^data-(react|v-|key|index|id|testid-)/.test(attr.name) && isStableToken(attr.value)
    );
    if (dataAttr) return `[${dataAttr.name}="${CSS.escape(dataAttr.value)}"]`;
    const role = el.getAttribute("role");
    if (role) return `${el.tagName.toLowerCase()}[role="${CSS.escape(role)}"]`;
    const stableClasses = Array.from(el.classList).filter(isStableToken);
    if (stableClasses.length > 0) {
      return `${el.tagName.toLowerCase()}.${stableClasses.slice(0, 2).map((c) => CSS.escape(c)).join(".")}`;
    }
    const siblings = Array.from(el.parentElement?.children ?? []).filter((sibling) => sibling.tagName === el.tagName);
    const nth = siblings.indexOf(el) + 1;
    return `${el.tagName.toLowerCase()}:nth-of-type(${Math.max(nth, 1)})`;
  }
  function guessFieldType(el) {
    if (el instanceof HTMLImageElement) return "image-url";
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return "attr";
    return "text";
  }
  function classSimilarity(a, b) {
    const left = new Set(Array.from(a.classList));
    const right = new Set(Array.from(b.classList));
    if (left.size === 0 && right.size === 0) return 1;
    const intersection = Array.from(left).filter((item) => right.has(item)).length;
    return intersection / (/* @__PURE__ */ new Set([...left, ...right])).size;
  }
  function structuralSimilarity(a, b) {
    const left = Array.from(a.children).map((child) => child.tagName).join(",");
    const right = Array.from(b.children).map((child) => child.tagName).join(",");
    if (left === right) return 1;
    const length = Math.max(left.length, right.length);
    if (length === 0) return 1;
    return 1 - levenshtein(left, right) / length;
  }
  function levenshtein(a, b) {
    const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;
    for (let i = 1; i <= a.length; i += 1) {
      for (let j = 1; j <= b.length; j += 1) {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
    }
    return matrix[a.length][b.length];
  }
  function isStableToken(value) {
    return value.length > 1 && !/^(css-|sc-|jss|ember|ng-|v-|_[a-z0-9]|[a-z0-9_-]*\d{5,})/i.test(value) && !/-[a-z0-9]{5,}$/i.test(value);
  }

  // src/extension/content/picker.ts
  var ElementPicker = class {
    constructor(profileName) {
      this.profileName = profileName;
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
    profileName;
    host;
    root;
    stage = "row";
    hover;
    detection = null;
    fields = [];
    destroy() {
      document.removeEventListener("mouseover", this.onMouseOver, true);
      document.removeEventListener("click", this.onClick, true);
      this.host.remove();
    }
    onMouseOver = (event) => {
      const target = event.target;
      if (!(target instanceof Element) || this.host.contains(target)) return;
      this.placeBox(this.hover, target, "rgba(37, 99, 235, 0.25)", "#2563eb");
    };
    onClick = (event) => {
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
          this.toast("\u30EA\u30B9\u30C8\u306E\u5185\u5074\u3092\u30AF\u30EA\u30C3\u30AF\u3057\u3066\u304F\u3060\u3055\u3044");
          return;
        }
        const sample = readSample(target);
        const label = window.prompt("\u9805\u76EE\u540D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044", suggestName(sample));
        if (!label) return;
        this.fields.push({
          name: label,
          selector: generateRelativeSelector(owningRow, target),
          selectorType: "css",
          type: guessFieldType(target),
          attr: target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ? "value" : void 0,
          required: true
        });
        this.render();
      }
    };
    render() {
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
      this.hover = this.root.querySelector("#hover");
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
    panelBody(count, preview) {
      if (this.stage === "row") {
        return `<strong>Step 1 / 3: \u30EA\u30B9\u30C8\u884C\u306E\u6307\u5B9A</strong><span class="muted">\u53D6\u308A\u8FBC\u307F\u305F\u3044\u4E00\u89A7\u306E\u3046\u3061\u30011 \u4EF6\u5206\u306E\u884C\u3092\u30AF\u30EA\u30C3\u30AF\u3057\u3066\u304F\u3060\u3055\u3044\u3002</span>`;
      }
      if (this.stage === "confirm") {
        return `
        <strong>Step 2 / 3: \u691C\u51FA\u7D50\u679C\u306E\u78BA\u8A8D</strong>
        <span>${count} \u4EF6\u306E\u7E70\u308A\u8FD4\u3057\u8981\u7D20\u3092\u691C\u51FA\u3057\u307E\u3057\u305F\u3002</span>
        <div class="actions"><button id="confirm" class="primary">\u5408\u3063\u3066\u3044\u308B</button><button id="restart">\u3084\u308A\u76F4\u3059</button></div>
      `;
      }
      return `
      <strong>Step 3 / 3: \u9805\u76EE\u306E\u6307\u5B9A</strong>
      <span class="muted">\u884C\u306E\u5185\u5074\u306B\u3042\u308B\u53D6\u308A\u51FA\u3057\u305F\u3044\u9805\u76EE\u3092\u30AF\u30EA\u30C3\u30AF\u3057\u3066\u304F\u3060\u3055\u3044\u3002</span>
      <div>${this.fields.map((field) => `\u2713 ${escapeHtml(field.name)}`).join("<br>") || "\u9805\u76EE\u306F\u672A\u8FFD\u52A0\u3067\u3059"}</div>
      ${preview.length > 0 ? renderPreview(preview) : ""}
      <div class="actions"><button id="save" class="primary" ${this.fields.length === 0 ? "disabled" : ""}>\u4FDD\u5B58</button><button id="restart">\u3084\u308A\u76F4\u3059</button></div>
    `;
    }
    renderRowBoxes() {
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
    placeBox(box, element, background, border) {
      const rect = element.getBoundingClientRect();
      box.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;border:2px solid ${border};background:${background};pointer-events:none;border-radius:4px;`;
    }
    previewRows() {
      if (!this.detection || this.fields.length === 0) return [];
      return this.detection.allRows.slice(0, 5).map(
        (row) => Object.fromEntries(
          this.fields.map((field) => {
            const el = row.querySelector(field.selector);
            return [field.name, el ? readSample(el) : "(\u53D6\u5F97\u4E0D\u53EF)"];
          })
        )
      );
    }
    save() {
      if (!this.detection) return;
      const now = Date.now();
      const profile = {
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
    toast(message) {
      window.alert(message);
    }
  };
  function readSample(el) {
    if (el instanceof HTMLImageElement) return el.currentSrc || el.src;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value;
    return (el.textContent ?? "").trim();
  }
  function suggestName(sample) {
    if (/@/.test(sample)) return "email";
    if (/\d{2,4}-\d{2,4}-\d{3,4}/.test(sample)) return "phone";
    if (/\d{4}[/-]\d{1,2}[/-]\d{1,2}/.test(sample)) return "date";
    return "field";
  }
  function renderPreview(rows) {
    const columns = Object.keys(rows[0] ?? {});
    return `
    <table>
      <thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(row[column] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>
  `;
  }
  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char] ?? char);
  }

  // src/extension/content/index.ts
  var picker = null;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
})();
