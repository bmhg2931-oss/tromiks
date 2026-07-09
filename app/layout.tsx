import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "תרומיקס · ניהול תרומות ואנשי קשר",
  description: "מערכת ניהול תרומות ואנשי קשר לבית הכנסת",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("theme")==="dark")document.documentElement.classList.add("dark")}catch(e){}`,
          }}
        />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
