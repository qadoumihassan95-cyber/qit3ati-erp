/**
 * UBL 2.1 XML builder for JoFotara submissions.
 *
 * JoFotara accepts UBL 2.1 Invoice / CreditNote documents. The exact schema
 * is described in the official ISTD onboarding kit (see Settings page for the
 * documentation link). This file produces the minimal-but-valid document that
 * the sandbox accepts and that production has historically accepted as well.
 *
 * IMPORTANT: ISTD may publish schema updates (e.g. new tax categories or
 * stamp requirements). Treat this file as a living document — bump
 * `UBL_PROFILE_ID` when a major change rolls out.
 */

export const UBL_PROFILE_ID = 'reporting:1.0';
export const UBL_CUSTOMIZATION_ID = 'urn:cen.eu:en16931:2017#compliant#urn:jofotara:1.0';

export type DocumentType = 'invoice' | 'credit_note' | 'debit_note';
export type PaymentMethod = 'cash' | 'credit' | 'card' | 'bank' | 'cheque';

export interface InvoiceXmlInput {
  documentType:    DocumentType;
  /** Internal invoice number (INV-2026-0042). */
  invoiceNumber:   string;
  /** ISO date (YYYY-MM-DD). */
  issueDate:       string;
  /** Reference invoice number — required for credit/debit notes. */
  referenceInvoice?: string;
  currency:        string;          // 'JOD'
  paymentMethod:   PaymentMethod;

  // Seller (the tenant)
  sellerName:      string;
  sellerTaxNumber: string;
  sellerActivityNumber?: string;

  // Buyer (optional — POS cash sales may not have a buyer)
  buyerName?:      string;
  buyerTaxNumber?: string;
  buyerPhone?:     string;

  // Line items
  items: Array<{
    description: string;
    quantity:    number;
    unitPrice:   number;
    /** Pre-tax discount per line. */
    discount:    number;
    /** Tax percentage applied to this line (e.g. 16). */
    taxRate:     number;
  }>;

  // Totals (must match line math — caller computes them)
  subtotal:    number;     // sum(qty*price) - line discounts
  discount:    number;     // invoice-level discount
  taxAmount:   number;     // total VAT
  total:       number;     // subtotal - discount + tax
}

const esc = (v: any): string => {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

const n = (x: number, d = 3) => Number(x).toFixed(d);

/** UBL invoice type codes from UN/CEFACT D.16B (used by JoFotara). */
const TYPE_CODE: Record<DocumentType, string> = {
  invoice:     '388', // Tax invoice
  credit_note: '381', // Credit note
  debit_note:  '383', // Debit note
};

/** Payment means code per UNECE 4461. */
const PAYMENT_CODE: Record<PaymentMethod, string> = {
  cash:   '10',
  credit: '30',     // credit transfer (also used for "credit / آجل")
  card:   '48',     // bank card
  bank:   '30',     // bank credit transfer
  cheque: '20',
};

/**
 * Build the complete UBL 2.1 XML for a JoFotara submission.
 * Returns the XML as a plain string; caller is responsible for base64-encoding
 * if the API endpoint requires it (current endpoint accepts raw XML payload
 * wrapped in JSON — see jofotara.service.ts).
 */
export function buildInvoiceXml(i: InvoiceXmlInput): string {
  const rootEl    = i.documentType === 'credit_note' ? 'CreditNote' : 'Invoice';
  const rootNs    = i.documentType === 'credit_note'
    ? 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2'
    : 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2';
  const typeCode  = TYPE_CODE[i.documentType];
  const payCode   = PAYMENT_CODE[i.paymentMethod];

  // Build line items
  const lines = i.items.map((it, idx) => {
    const lineSub = (it.quantity * it.unitPrice) - it.discount;
    const lineTax = lineSub * (it.taxRate / 100);
    return `
    <cac:InvoiceLine>
      <cbc:ID>${idx + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="PCE">${n(it.quantity, 2)}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="${esc(i.currency)}">${n(lineSub)}</cbc:LineExtensionAmount>
      <cac:AllowanceCharge>
        <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
        <cbc:AllowanceChargeReason>discount</cbc:AllowanceChargeReason>
        <cbc:Amount currencyID="${esc(i.currency)}">${n(it.discount)}</cbc:Amount>
      </cac:AllowanceCharge>
      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="${esc(i.currency)}">${n(lineTax)}</cbc:TaxAmount>
        <cbc:RoundingAmount currencyID="${esc(i.currency)}">${n(lineSub + lineTax)}</cbc:RoundingAmount>
      </cac:TaxTotal>
      <cac:Item>
        <cbc:Name>${esc(it.description)}</cbc:Name>
        <cac:ClassifiedTaxCategory>
          <cbc:ID>${it.taxRate > 0 ? 'S' : 'Z'}</cbc:ID>
          <cbc:Percent>${n(it.taxRate, 2)}</cbc:Percent>
          <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
        </cac:ClassifiedTaxCategory>
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="${esc(i.currency)}">${n(it.unitPrice)}</cbc:PriceAmount>
      </cac:Price>
    </cac:InvoiceLine>`;
  }).join('');

  // BillingReference is required for credit/debit notes
  const billingRef = (i.documentType !== 'invoice' && i.referenceInvoice)
    ? `<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${esc(i.referenceInvoice)}</cbc:ID></cac:InvoiceDocumentReference></cac:BillingReference>`
    : '';

  // Buyer block — JoFotara allows missing buyer for cash invoices below a threshold.
  // We include a minimal block even for "walk-in" so the schema stays consistent.
  const buyerBlock = `
  <cac:AccountingCustomerParty>
    <cac:Party>
      ${i.buyerTaxNumber ? `<cac:PartyTaxScheme><cbc:CompanyID>${esc(i.buyerTaxNumber)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : ''}
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(i.buyerName || 'عميل نقدي')}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
      ${i.buyerPhone ? `<cac:Contact><cbc:Telephone>${esc(i.buyerPhone)}</cbc:Telephone></cac:Contact>` : ''}
    </cac:Party>
  </cac:AccountingCustomerParty>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<${rootEl}
  xmlns="${rootNs}"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ProfileID>${UBL_PROFILE_ID}</cbc:ProfileID>
  <cbc:CustomizationID>${UBL_CUSTOMIZATION_ID}</cbc:CustomizationID>
  <cbc:ID>${esc(i.invoiceNumber)}</cbc:ID>
  <cbc:UUID>${esc(i.invoiceNumber)}-${Date.now().toString(36)}</cbc:UUID>
  <cbc:IssueDate>${esc(i.issueDate)}</cbc:IssueDate>
  <cbc:${rootEl}TypeCode name="${i.paymentMethod === 'cash' ? '012' : '022'}">${typeCode}</cbc:${rootEl}TypeCode>
  <cbc:DocumentCurrencyCode>${esc(i.currency)}</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>${esc(i.currency)}</cbc:TaxCurrencyCode>
  ${billingRef}
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="TIN">${esc(i.sellerTaxNumber)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${esc(i.sellerTaxNumber)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(i.sellerName)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  ${buyerBlock}
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode listID="UN/ECE 4461">${payCode}</cbc:PaymentMeansCode>
  </cac:PaymentMeans>
  <cac:AllowanceCharge>
    <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
    <cbc:AllowanceChargeReason>invoice-level discount</cbc:AllowanceChargeReason>
    <cbc:Amount currencyID="${esc(i.currency)}">${n(i.discount)}</cbc:Amount>
  </cac:AllowanceCharge>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${esc(i.currency)}">${n(i.taxAmount)}</cbc:TaxAmount>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:TaxExclusiveAmount currencyID="${esc(i.currency)}">${n(i.subtotal)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${esc(i.currency)}">${n(i.total)}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="${esc(i.currency)}">${n(i.discount)}</cbc:AllowanceTotalAmount>
    <cbc:PayableAmount currencyID="${esc(i.currency)}">${n(i.total)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  ${lines}
</${rootEl}>`;
}
