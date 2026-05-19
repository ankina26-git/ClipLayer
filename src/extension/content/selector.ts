export interface RowDetection {
  row: Element;
  allRows: Element[];
  rootSelector: string;
}

export function detectRepeatingRow(el: Element): RowDetection {
  let current: Element | null = el;
  while (current !== null && current.parentElement !== null) {
    const subject: Element = current;
    const parent = subject.parentElement;
    if (parent === null) break;
    const siblings = Array.from(parent.children).filter(
      (sibling): sibling is Element =>
        sibling.tagName === subject.tagName &&
        classSimilarity(sibling, subject) > 0.7 &&
        structuralSimilarity(sibling, subject) > 0.6
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

export function generateRelativeSelector(row: Element, target: Element): string {
  const path: string[] = [];
  let cur: Element | null = target;
  while (cur && cur !== row) {
    path.unshift(stableTokenFor(cur));
    cur = cur.parentElement;
  }
  return path.join(" > ");
}

export function generateStableSelector(el: Element): string {
  const path: string[] = [];
  let cur: Element | null = el;
  while (cur && cur !== document.documentElement) {
    const token = stableTokenFor(cur);
    path.unshift(token);
    if (token.startsWith("#") || token.startsWith("[data-")) break;
    cur = cur.parentElement;
  }
  return path.join(" > ");
}

export function stableTokenFor(el: Element): string {
  const id = el.getAttribute("id");
  if (id && isStableToken(id)) return `#${CSS.escape(id)}`;

  const dataAttr = Array.from(el.attributes).find(
    (attr) =>
      attr.name.startsWith("data-") &&
      attr.value &&
      !/^data-(react|v-|key|index|id|testid-)/.test(attr.name) &&
      isStableToken(attr.value)
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

export function guessFieldType(el: Element): "text" | "attr" | "html" | "image-url" {
  if (el instanceof HTMLImageElement) return "image-url";
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return "attr";
  return "text";
}

function classSimilarity(a: Element, b: Element): number {
  const left = new Set(Array.from(a.classList));
  const right = new Set(Array.from(b.classList));
  if (left.size === 0 && right.size === 0) return 1;
  const intersection = Array.from(left).filter((item) => right.has(item)).length;
  return intersection / new Set([...left, ...right]).size;
}

function structuralSimilarity(a: Element, b: Element): number {
  const left = Array.from(a.children).map((child) => child.tagName).join(",");
  const right = Array.from(b.children).map((child) => child.tagName).join(",");
  if (left === right) return 1;
  const length = Math.max(left.length, right.length);
  if (length === 0) return 1;
  return 1 - levenshtein(left, right) / length;
}

function levenshtein(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
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

function isStableToken(value: string): boolean {
  return (
    value.length > 1 &&
    !/^(css-|sc-|jss|ember|ng-|v-|_[a-z0-9]|[a-z0-9_-]*\d{5,})/i.test(value) &&
    !/-[a-z0-9]{5,}$/i.test(value)
  );
}
