// כתובת באנגלית (רחוב בלועזית) נכתבת לפי הסדר הלועזי - מספר בית ואז שם הרחוב (12 Main St),
// לעומת כתובת בעברית שבה מקובל רחוב ואז מספר (רחוב הרצל 12)
export function formatAddressLines(
  street: string | null,
  houseNumber: string | null,
  city: string | null
): { line1: string; line2: string } {
  const isEnglish = street ? /^[A-Za-z]/.test(street.trim()) : false;
  const parts = isEnglish ? [houseNumber, street] : [street, houseNumber];
  const line1 = parts.filter(Boolean).join(" ");
  return { line1, line2: city || "" };
}
