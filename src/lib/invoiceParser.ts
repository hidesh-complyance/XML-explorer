export const MAX_FILE_SIZE = 1024 * 1024;

const CBC = "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
const CAC = "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
const INVOICE_NS = "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"

export type Field = {
    label: string;
    value: string;
    sourceId :string;
    path: string;
    suffix? :string;
};
export type Section  = {title: string, fields: Field[]};

export type LineItem = {
    sourceId: string;
    fields :{
        id? :Field;
        description? :Field;
        quantity? :Field;
        price? :Field
        amount? : Field;
    }
};

export type XMLRow = {
    key: string;
    sourceId: string;
    depth: number;
    text: string;
    boolean: boolean;
};

export type Invoice = {
    details: Section;
    seller: Section;
    buyer: Section;
    total : Section;
    items: LineItem[];
    rows: XMLRow[];
    elementCount: number;
};

function findChildren(parent: Element | undefined, name:string) : Element[] {
    if(!parent) return [];

    let namespace: string;
    if (name.startsWith("cbc:")) {
        namespace = CBC;
    } else if (name.startsWith("cac:")) {
        namespace = CAC;
    } else {
        return [];
}

const localName = name.slice(4);
const matches: Element[] = [];
for (const child of parent.children){
    if(child.namespaceURI === namespace && child.localName === localName){
        matches.push(child);
    }
}
return matches;
}

function findElement(
    parent: Element | undefined, 
    ...path :string[]
): Element | undefined {
    let element = parent;

    for (const name of path){
        element = findChildren(element, name)[0];
        if(!element) return undefined;
    }
    return element;
}

function removingmissFields(fields: (Field | undefined)[]): Field[] {
    const result: Field [] =[];
    for (const field of fields){
        if(field !== undefined){
            result.push(field);
        }
    }
    return result;
}

function shrinkXML(text:string) {
    return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}


export function parseInvoice(xml: string): Invoice {
  const size = new TextEncoder().encode(xml).length;
  if (size > MAX_FILE_SIZE) {
    throw new Error("very large invoice.");
  }
  if (!xml.trim()) {
    throw new Error("not an xml.");
  }
  if (/<!DOCTYPE/i.test(xml)) {
    throw new Error(
      "Not supported.",
    );
  }

  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagNameNS("*", "parsererror").length > 0) {
    throw new Error(
      "XML is not formatted .",
    );
  }
  const root = doc.documentElement;
  if (root.localName !== "Invoice" || root.namespaceURI !== INVOICE_NS) {
    throw new Error(
      "Unsupported format.",
    );
  }

  const sources: { element: Element; sourceId: string; path: string }[] = [];
  const rows: XMLRow[] = [];
  let count = 0;

  function findSource(element: Element) {
    for (const source of sources) {
      if (source.element === element) {
        return source;
      }
    }
    throw new Error("Could not locate an invoice element in the XML.");
  }

  function visit(element: Element, depth: number, path: string) {
    if (depth > 80 || count >= 6000) {
      throw new Error(
        "This invoice is too complex",
      );
    }
    const sourceId = "xml-" + count;
    count += 1;
    sources.push({ element, sourceId, path });

    let attrs = "";
    for (const attribute of element.attributes) {
      attrs += ` ${attribute.name}="${shrinkXML(attribute.value)}"`;
    }
    const tag = `<${element.tagName}${attrs}`;
    const nodes: Node[] = [];
    let textOnly = true;
    for (const node of element.childNodes) {
      if (
        node.nodeType === Node.ELEMENT_NODE ||
        node.nodeType === Node.COMMENT_NODE
      ) {
        nodes.push(node);
        textOnly = false;
      } else if (
        node.nodeType === Node.TEXT_NODE ||
        node.nodeType === Node.CDATA_SECTION_NODE
      ) {
        if (node.textContent && node.textContent.trim()) {
          nodes.push(node);
        }
      }
    }

    if (element.children.length === 0 && textOnly) {
      let text = `${tag} />`;
      if (nodes.length > 0) {
        text = `${tag}>${shrinkXML(element.textContent || "")}</${element.tagName}>`;
      }
      rows.push({
        key: sourceId,
        sourceId,
        depth,
        text,
        boolean: false,
      });
      return;
    }
    rows.push({
      key: sourceId,
      sourceId,
      depth,
      text: `${tag}>`,
      boolean: false,
    });
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      if (node.nodeType === Node.ELEMENT_NODE) {
        const child = node as Element;
        let ordinal = 1;
        let sibling = child.previousElementSibling;
        while (sibling) {
          if (
            sibling.namespaceURI === child.namespaceURI &&
            sibling.localName === child.localName
          ) {
            ordinal += 1;
          }
          sibling = sibling.previousElementSibling;
        }
        visit(child, depth + 1, `${path}/${child.tagName}[${ordinal}]`);
      } else {
        let text = shrinkXML(node.textContent || "");
        if (node.nodeType === Node.COMMENT_NODE) {
          text = `<!--${node.textContent}-->`;
        }
        rows.push({
          key: `${sourceId}-text-${index}`,
          sourceId,
          depth: depth + 1,
          text,
          boolean: true,
        });
      }
    }
    rows.push({
      key: `${sourceId}-close`,
      sourceId,
      depth,
      text: `</${element.tagName}>`,
      boolean: true,
    });
  }
  visit(root, 0, `/${root.tagName}[1]`);

  function readField(
    label: string,
    element: Element | undefined,
  ): Field | undefined {
    if (!element) return undefined;

    const value = (element.textContent || "").trim();
    if (!value) return undefined;

    const source = findSource(element);
    const field: Field = {
      label,
      value,
      sourceId: source.sourceId,
      path: source.path,
    };
    let suffix = element.getAttribute("currencyID");
    if (suffix === null) {
      suffix = element.getAttribute("unitCode");
    }
    if (suffix !== null) {
      field.suffix = suffix;
    }
    return field;
  }

  function readParty(title: string, container: string): Section {
    const party = findElement(root, container, "cac:Party");
    const address = findElement(party, "cac:PostalAddress");
    const legalEntity = findElement(party, "cac:PartyLegalEntity");
    let name = findElement(party, "cac:PartyName", "cbc:Name");
    if (!name) {
      name = findElement(legalEntity, "cbc:RegistrationName");
    }
    const addressLines: Field[] = [];
    for (const line of findChildren(address, "cac:AddressLine")) {
      const field = readField("Address line", findElement(line, "cbc:Line"));
      if (field) addressLines.push(field);
    }

    return {
      title,
      fields: removingmissFields([
        readField("Name", name),
        readField(
          "Tax ID",
          findElement(party, "cac:PartyTaxScheme", "cbc:CompanyID"),
        ),
        readField("Registration ID", findElement(legalEntity, "cbc:CompanyID")),
        readField("Street", findElement(address, "cbc:StreetName")),
        readField(
          "Additional address",
          findElement(address, "cbc:AdditionalStreetName"),
        ),
        ...addressLines,
        readField("City", findElement(address, "cbc:CityName")),
        readField("Postal code", findElement(address, "cbc:PostalZone")),
        readField("Region", findElement(address, "cbc:CountrySubentity")),
        readField(
          "Country",
          findElement(address, "cac:Country", "cbc:IdentificationCode"),
        ),
        readField(
          "Email",
          findElement(party, "cac:Contact", "cbc:ElectronicMail"),
        ),
      ]),
    };
  }

  const notes: Field[] = [];
  for (const note of findChildren(root, "cbc:Note")) {
    const field = readField("Note", note);
    if (field) notes.push(field);
  }
  const details: Section = {
    title: "Invoice details",
    fields: removingmissFields([
      readField("Invoice number", findElement(root, "cbc:ID")),
      readField("Invoice type", findElement(root, "cbc:InvoiceTypeCode")),
      readField("Issue date", findElement(root, "cbc:IssueDate")),
      readField("Due date", findElement(root, "cbc:DueDate")),
      readField("Currency", findElement(root, "cbc:DocumentCurrencyCode")),
      readField("Buyer reference", findElement(root, "cbc:BuyerReference")),
      readField(
        "Order reference",
        findElement(root, "cac:OrderReference", "cbc:ID"),
      ),
      ...notes,
    ]),
  };

  const items: LineItem[] = [];
  for (const line of findChildren(root, "cac:InvoiceLine")) {
    const item = findElement(line, "cac:Item");
    let description = findElement(item, "cbc:Name");
    if (!description) {
      description = findElement(item, "cbc:Description");
    }
    const sourceId = findSource(line).sourceId;

    items.push({
      sourceId,
      fields: {
        id: readField("Line ID", findElement(line, "cbc:ID")),
        description: readField("Description", description),
        quantity: readField(
          "Quantity",
          findElement(line, "cbc:InvoicedQuantity"),
        ),
        price: readField(
          "Unit price",
          findElement(line, "cac:Price", "cbc:PriceAmount"),
        ),
        amount: readField(
          "Line amount",
          findElement(line, "cbc:LineExtensionAmount"),
        ),
      },
    });
  }

  const money = findElement(root, "cac:LegalMonetaryTotal");
  const taxes: Field[] = [];
  for (const tax of findChildren(root, "cac:TaxTotal")) {
    const field = readField("Tax", findElement(tax, "cbc:TaxAmount"));
    if (field) taxes.push(field);
  }
  const total: Section = {
    title: "total",
    fields: removingmissFields([
      readField("Line subtotal", findElement(money, "cbc:LineExtensionAmount")),
      readField("Allowances", findElement(money, "cbc:AllowanceTotalAmount")),
      readField("Charges", findElement(money, "cbc:ChargeTotalAmount")),
      readField("Excluding tax", findElement(money, "cbc:TaxExclusiveAmount")),
      ...taxes,
      readField("Including tax", findElement(money, "cbc:TaxInclusiveAmount")),
      readField("Prepaid", findElement(money, "cbc:PrepaidAmount")),
      readField("Rounding", findElement(money, "cbc:PayableRoundingAmount")),
      readField("Amount due", findElement(money, "cbc:PayableAmount")),
    ]),
  };

  return {
    details,
    seller: readParty("Seller", "cac:AccountingSupplierParty"),
    buyer: readParty("Buyer", "cac:AccountingCustomerParty"),
    items,
    total,
    rows,
    elementCount: count,
  };
}