import { parseInvoice } from "./lib/invoiceParser";
import type { Field, Invoice, Section } from "./lib/invoiceParser";
import { rules } from "./lib/rules";

const form = document.querySelector<HTMLFormElement>("#invoice-form")!;
const input = document.querySelector<HTMLTextAreaElement>("#invoice-input")!;
const error = document.querySelector<HTMLParagraphElement>("#error")!;
const viewer = document.querySelector<HTMLElement>("#viewer")!;
const summary = document.querySelector<HTMLDivElement>("#invoice-summary")!;
const xmlSource = document.querySelector<HTMLPreElement>("#xml-source")!;
const selection = document.querySelector<HTMLParagraphElement>("#selection")!;
const sourcePath = document.querySelector<HTMLElement>("#source-path")!;
const copyButton = document.querySelector<HTMLButtonElement>("#copy-path")!;

const fields = new Map<string, Field>();
const fieldButtons = new Map<string, HTMLButtonElement>();
const xmlButtons = new Map<string, HTMLButtonElement[]>();
let highlighted: HTMLButtonElement[] = [];

function showError(message: string) {
  error.textContent = message;
  error.hidden = false;
}

function highlight(button: HTMLButtonElement) {
  const mark = document.createElement("mark");
  mark.textContent = button.textContent;
  button.replaceChildren(mark);
  button.setAttribute("aria-pressed", "true");
  highlighted.push(button);
}

function selectElement(sourceId: string, fromXml: boolean) {
  for (const button of highlighted) {
    button.replaceChildren(document.createTextNode(button.textContent ?? ""));
    button.setAttribute("aria-pressed", "false");
  }
  highlighted = [];

  const field = fields.get(sourceId);
  const fieldButton = fieldButtons.get(sourceId);
  const rows = xmlButtons.get(sourceId) ?? [];
  if (fieldButton) highlight(fieldButton);
  for (const row of rows) highlight(row);

  selection.textContent = field
    ? `${field.label}: ${field.value}${field.suffix ? ` ${field.suffix}` : ""}`
    : "Cannot find the element";
  sourcePath.textContent = field?.path ?? "";
  copyButton.hidden = !field;
  copyButton.textContent = "Copy path";

  const target = fromXml ? fieldButton ?? selection : rows[0];
  target?.scrollIntoView({ block: "center", inline: "nearest" });
  if (target instanceof HTMLButtonElement) target.focus({ preventScroll: true });
}

function createValue(field?: Field): HTMLElement {
  if (!field) {
    const missing = document.createElement("span");
    missing.textContent = "Not provided";
    return missing;
  }

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = field.value;
  if (field.suffix) button.textContent += ` ${field.suffix}`;
  const label = rules(field);
  if (label) button.textContent += ` — ${label}`;
  button.title = `Locate ${field.label} in XML`;
  button.setAttribute("aria-pressed", "false");
  button.addEventListener("click", () => selectElement(field.sourceId, false));
  fields.set(field.sourceId, field);
  fieldButtons.set(field.sourceId, button);
  return button;
}

function createSection(section: Section): HTMLElement {
  const container = document.createElement("section");
  const heading = document.createElement("h3");
  heading.textContent = section.title;
  container.append(heading);

  if (!section.fields.length) {
    const empty = document.createElement("p");
    empty.textContent = "Not provided.";
    container.append(empty);
    return container;
  }

  const list = document.createElement("dl");
  for (const field of section.fields) {
    const label = document.createElement("dt");
    label.textContent = field.label;
    const value = document.createElement("dd");
    value.append(createValue(field));
    list.append(label, value);
  }
  container.append(list);
  return container;
}

function createItems(invoice: Invoice): HTMLElement {
  const container = document.createElement("section");
  const heading = document.createElement("h3");
  heading.textContent = "Line items";
  container.append(heading);

  if (!invoice.items.length) {
    const empty = document.createElement("p");
    empty.textContent = "No invoice items.";
    container.append(empty);
    return container;
  }

  const table = document.createElement("table");
  const header = table.createTHead().insertRow();
  for (const name of ["ID", "Description", "Quantity", "Unit price", "Amount"]) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = name;
    header.append(cell);
  }
  const body = table.createTBody();
  for (const item of invoice.items) {
    const row = body.insertRow();
    for (const key of ["id", "description", "quantity", "price", "amount"] as const) {
      row.insertCell().append(createValue(item.fields[key]));
    }
  }
  container.append(table);
  return container;
}

function renderInvoice(invoice: Invoice) {
  fields.clear();
  fieldButtons.clear();
  xmlButtons.clear();
  highlighted = [];
  selection.textContent = "No element selected.";
  sourcePath.textContent = "";
  copyButton.hidden = true;
  copyButton.textContent = "Copy path";

  summary.replaceChildren(
    createSection(invoice.details),
    createSection(invoice.seller),
    createSection(invoice.buyer),
    createItems(invoice),
    createSection(invoice.total),
  );

  const fragment = document.createDocumentFragment();
  for (const [index, row] of invoice.rows.entries()) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = row.text;
    button.title = "Summary can be found in the page";
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => selectElement(row.sourceId, true));
    const buttons = xmlButtons.get(row.sourceId) ?? [];
    buttons.push(button);
    xmlButtons.set(row.sourceId, buttons);
    fragment.append(`${index + 1} ${"  ".repeat(row.depth)}`, button, "\n");
  }
  xmlSource.replaceChildren(fragment);
  viewer.hidden = false;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const invoice = parseInvoice(input.value);
    renderInvoice(invoice);
    error.hidden = true;
    error.textContent = "";
    summary.scrollIntoView({ block: "start" });
  } catch (cause) {
    showError(cause instanceof Error ? cause.message : "This invoice could not be parsed.");
  }
});

