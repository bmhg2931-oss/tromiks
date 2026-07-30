export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// מסיר אפסים מובילים כדי שהשוואת/חיפוש טלפון לא יושפעו מ-0 בתחילת המספר
export function stripLeadingZeros(s: string): string {
  return s.replace(/^0+/, "");
}
