import type { Browser } from "puppeteer-core";

// בפיתוח מקומי על Windows אין בינארי כרום מותאם ל-serverless (@sparticuz/chromium
// הוא בינארי לינוקס בלבד) - שם נעזרים ב-puppeteer המלא (מוריד כרום משלו, ר'
// devDependencies). בענן/בפריסה (Vercel/Netlify/שרת לינוקס כלשהו) משתמשים ב-
// puppeteer-core + @sparticuz/chromium: בינארי כרום קליל שמותאם למגבלות הגודל של
// פונקציות serverless, בלי להוריד/לצרף כרום מלא (~300MB) לפריסה בענן.
async function launchBrowser(): Promise<Browser> {
  if (process.platform === "win32") {
    const puppeteer = (await import("puppeteer")).default;
    const browser = await puppeteer.launch({ headless: true });
    return browser as unknown as Browser;
  }
  const chromium = (await import("@sparticuz/chromium")).default;
  const puppeteerCore = (await import("puppeteer-core")).default;
  return puppeteerCore.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
}

// ממיר HTML מוכן (עם CSS מוטמע) ל-PDF אמיתי, על ידי הרצת כרום ללא ממשק (headless)
// ברקע. אותה תבנית HTML בדיוק כמו התצוגה המקדימה/המייל, כך שהקובץ המוריד תמיד תואם
// למה שהמשתמש רואה במסך.
export async function htmlToPdfBase64(html: string): Promise<string> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const buffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", bottom: "12mm", left: "10mm", right: "10mm" },
    });
    return Buffer.from(buffer).toString("base64");
  } finally {
    await browser.close();
  }
}
