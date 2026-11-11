/**
 * Banks, insurers, brokers and lenders: companies whose balance sheet is the business.
 *
 * For them the usual industrial readings mislead. Deposits and loan books flow through
 * operating cash flow, so "free cash flow" swings by hundreds of billions with lending
 * ($-148B for JPMorgan in 2025 is not cash burned); "cash and investments" includes the
 * securities book, so cash minus debt shows a bank holding $555B of "net cash"; and
 * debt to equity is the leverage a bank is built on. The stock page leaves those out for
 * these companies and shows what applies instead (return on equity, the dividend and its
 * payout).
 *
 * Payment networks, exchanges, data vendors and insurance brokers sit in the same sector
 * but run like ordinary businesses, so their cash flow and debt still read normally.
 */

type CompanyKind = {
  sector?: string | null;
  industry?: string | null;
  ticker?: string | null;
};

/** Financials that run like ordinary businesses: fees, not a balance sheet. */
const FEE_BUSINESS_INDUSTRY = /payment|transaction|exchange|financial data|insurance brokers?|asset management/i;
/** Custody banks share the GICS industry "Asset Management & Custody Banks" with the fee-earning managers. */
const BALANCE_SHEET_TICKERS = new Set(["BK", "STT", "NTRS"]);
/** Card networks and wallets are filed under "Credit Services" next to the card lenders. */
const FEE_BUSINESS_TICKERS = new Set(["V", "MA", "PYPL", "XYZ", "FI", "FISV", "GPN", "FIS", "CPAY", "WEX", "TOST", "AFRM"]);
/** Lending, deposit-taking and underwriting industries, by the names our data providers use. */
const BALANCE_SHEET_INDUSTRY =
  /\bbank|banking|capital markets|insurance|reinsurance|insurers?\b|consumer finance|credit services|mortgage|thrift|savings|lending|lenders?\b|multi-sector holdings|diversified financial|custody|broker-?dealers?|investment banking/i;

function isFinancialSector(sector: string | null | undefined): boolean {
  return /^financial/i.test(String(sector ?? "").trim());
}

export function isBalanceSheetFinancial(company: CompanyKind | null | undefined): boolean {
  if (!company) return false;
  const industry = String(company.industry ?? "").trim();
  const ticker = String(company.ticker ?? "").trim().toUpperCase();
  const financialSector = isFinancialSector(company.sector);
  // An insurer or bank filed under another sector still counts by its industry (but not a health plan: its cash flow is ordinary).
  if (!financialSector) return /\bbanks?\b|^insurance|reinsurance/i.test(industry);
  if (ticker && BALANCE_SHEET_TICKERS.has(ticker)) return true;
  if (ticker && FEE_BUSINESS_TICKERS.has(ticker)) return false;
  if (FEE_BUSINESS_INDUSTRY.test(industry)) return false;
  // A financial with no industry, or the catch-all "Financials", is most likely a bank or insurer: leave the misleading figures out.
  if (!industry || /^financials?( services)?$/i.test(industry)) return true;
  return BALANCE_SHEET_INDUSTRY.test(industry);
}
