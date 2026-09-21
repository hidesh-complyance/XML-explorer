import type {Field} from "./invoiceParser"
const currencies: Record<string, string> = {
    AED : "UAE Dirham",
    MYR : "Malaysian Ringgit",
    SAR: "Saudi Riyal",
    OMR: "Omani Rial",
    USD : "United States Dollar",
    EUR : "Euro",
    GBP : "British Pound Sterling",
    JPY : "Japanese Yen",
    CNY : "Chinese Yuan",
    INR : "Indian Rupee",
    AUD : "Australian Dollar"
};
 const units: Record<string, string> = {
    HUR: "Hour",
    DAY : "Day",
    WEE : "Week",
    MON : "Month",
    YEA : "Year",
    SEC : "Second",
    MIN : "Minute",
    MTQ : "Cubic Meter"
};
const invoiceTypes: Record<string, string> = {
    "380" : "Commercial Invoice",
    "381" : "Proforma Invoice",
    "383" : "Credit Note",
    "384" : "Debit Note"
};

export function rules(field: Field): string | undefined {
  if (field.label === "Currency")
    return currencies[field.value] ?? "Unknown currency code";
  if (field.label === "Invoice type")
    return invoiceTypes[field.value] ?? "Unknown invoice type code";
  if (field.suffix && field.label === "Quantity")
    return units[field.suffix] ?? "Unknown unit code";
  if (field.suffix) return currencies[field.suffix] ?? "Unknown currency code";
  return undefined;
}