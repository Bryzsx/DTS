/** Return today's date string (YYYY-MM-DD) in Asia/Manila timezone. */
export function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })
}
