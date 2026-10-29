export const DEFAULT_WATCHLIST = [
  "AAPL",
  "MSFT",
  "NVDA",
  "TSLA",
  "GOOGL",
  "AMZN",
  "BTC-USD",
  "ETH-USD",
] as const;

// Same rule as the backend (app/api/deps.py): letters, digits and . - = ^ (BRK.B, EURUSD=X, ^GSPC).
const SYMBOL_PATTERN = /^[A-Z0-9.\-=^]{1,15}$/;

export const SYMBOL_NAMES: Readonly<Record<string, string>> = {
  AAPL: "Apple",
  MSFT: "Microsoft",
  NVDA: "NVIDIA",
  TSLA: "Tesla",
  GOOGL: "Alphabet",
  AMZN: "Amazon",
  "BTC-USD": "Bitcoin",
  "ETH-USD": "Ethereum",
};

export function normalizeSymbol(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidSymbol(symbol: string): boolean {
  return SYMBOL_PATTERN.test(symbol);
}

export function isCrypto(symbol: string): boolean {
  return symbol.endsWith("-USD");
}
