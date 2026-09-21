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
    fields : Partial <
    Record<"id" | "description" | "quantity" | "price" | "amount", Field>
>;
};

export type XMLRow = {
    key: string;
    sourceId: string;
    depth: string;
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

type ElementName = `cbc:${string}` | `cac:${string}` ;

function findChildren(
    parent: Element|undefined,
    name: ElementName,
): Element [] {
    if(!parent) return []; 

    const namespace = name.startsWith("cbc:") ? CBC : CAC;
    const localName = name.slice(4);

    return Array.from(parent.children).filter(
        (child) => child.namespaceURI === namespace && child.localName === localName,
    );
}

function findElement(
    parent: Element | undefined,
    ...path: ElementName[]
): Element | undefined {
    let element = parent;
    for (const name of path) {
        element = findChildren(element, name)[0];
        if (!element) return undefined;
    }
    return element;
}

function removeMissingFields(fields: (Field | undefined)[]): Field[] {
    return fields.filter((field): field is Field => field !== undefined);
}

function normalizeXML(text:string){
    return text .replaceAll
}

