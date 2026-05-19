import type { ExtractResult, FieldType, ProfileRow, SelectorDef, TransformDef } from "./types";

export async function extractFromDocument(profile: ProfileRow, doc: Document = document): Promise<ExtractResult> {
  const now = Date.now();
  const rootSelector = profile.selectors.find((selector) => selector.name === "__root__");
  const fieldSelectors = profile.selectors.filter((selector) => selector.name !== "__root__");
  const errors: string[] = [];

  const rows = rootSelector ? queryAll(doc, rootSelector) : [doc.body].filter(Boolean);
  if (rows.length === 0) errors.push("取り込み対象の行が見つかりませんでした");

  const items = rows.map((row) => {
    const fields: Record<string, string | null> = {};
    const imageUrls: string[] = [];

    for (const selector of fieldSelectors) {
      const target = queryOne(row, selector);
      const value = target ? readFieldValue(target, selector.type, selector.attr) : null;
      const transformed = value == null ? null : applyTransform(value, selector.transform);

      if (selector.required && !transformed) {
        errors.push(`必須項目「${selector.name}」を取得できませんでした`);
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

export function previewProfile(profile: ProfileRow, limit = 5): Promise<ExtractResult> {
  const trimmedProfile = { ...profile };
  return extractFromDocument(trimmedProfile).then((result) => ({
    ...result,
    items: result.items.slice(0, limit)
  }));
}

function queryAll(root: Document | Element, selector: SelectorDef): Element[] {
  if (selector.selectorType === "xpath") {
    const doc = root.ownerDocument ?? document;
    const result = doc.evaluate(selector.selector, root, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE);
    return Array.from({ length: result.snapshotLength }, (_, index) => result.snapshotItem(index)).filter(
      (node): node is Element => node instanceof Element
    );
  }

  return Array.from(root.querySelectorAll(selector.selector));
}

function queryOne(root: Document | Element, selector: SelectorDef): Element | null {
  if (selector.selectorType === "xpath") return queryAll(root, selector)[0] ?? null;
  return root.querySelector(selector.selector);
}

function readFieldValue(el: Element, type: FieldType, attr?: string): string {
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

function applyTransform(value: string, transform?: TransformDef): string {
  let out = transform?.trim === false ? value : value.trim();
  if (transform?.regex) {
    const match = out.match(new RegExp(transform.regex.pattern));
    out = match?.[transform.regex.group] ?? "";
  }
  if (transform?.case === "upper") out = out.toUpperCase();
  if (transform?.case === "lower") out = out.toLowerCase();
  return out;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
