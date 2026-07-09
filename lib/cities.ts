export type CityEntry = { city: string; country: string };

// רשימה סטטית מתוחזקת ידנית — ערים עיקריות בישראל וריכוזי קהילות יהודיות
// עולמיות, עם שם העיר והמדינה בעברית. הרשימה אינה ממצה את כל ערי העולם.
export const CITIES: CityEntry[] = [
  // ישראל
  { city: "ירושלים", country: "ישראל" },
  { city: "תל אביב-יפו", country: "ישראל" },
  { city: "חיפה", country: "ישראל" },
  { city: "ראשון לציון", country: "ישראל" },
  { city: "פתח תקווה", country: "ישראל" },
  { city: "אשדוד", country: "ישראל" },
  { city: "נתניה", country: "ישראל" },
  { city: "באר שבע", country: "ישראל" },
  { city: "בני ברק", country: "ישראל" },
  { city: "חולון", country: "ישראל" },
  { city: "רמת גן", country: "ישראל" },
  { city: "אשקלון", country: "ישראל" },
  { city: "רחובות", country: "ישראל" },
  { city: "בת ים", country: "ישראל" },
  { city: "בית שמש", country: "ישראל" },
  { city: "כפר סבא", country: "ישראל" },
  { city: "הרצליה", country: "ישראל" },
  { city: "חדרה", country: "ישראל" },
  { city: "מודיעין-מכבים-רעות", country: "ישראל" },
  { city: "נצרת", country: "ישראל" },
  { city: "לוד", country: "ישראל" },
  { city: "רמלה", country: "ישראל" },
  { city: "רעננה", country: "ישראל" },
  { city: "מודיעין עילית", country: "ישראל" },
  { city: "ביתר עילית", country: "ישראל" },
  { city: "קריית גת", country: "ישראל" },
  { city: "קריית מוצקין", country: "ישראל" },
  { city: "קריית ים", country: "ישראל" },
  { city: "קריית אתא", country: "ישראל" },
  { city: "קריית ביאליק", country: "ישראל" },
  { city: "קריית שמונה", country: "ישראל" },
  { city: "אילת", country: "ישראל" },
  { city: "טבריה", country: "ישראל" },
  { city: "צפת", country: "ישראל" },
  { city: "עפולה", country: "ישראל" },
  { city: "נהריה", country: "ישראל" },
  { city: "יבנה", country: "ישראל" },
  { city: "אור יהודה", country: "ישראל" },
  { city: "גבעתיים", country: "ישראל" },
  { city: "כפר יונה", country: "ישראל" },
  { city: "שוהם", country: "ישראל" },
  { city: "אלעד", country: "ישראל" },
  { city: "טירת כרמל", country: "ישראל" },
  { city: "נשר", country: "ישראל" },
  { city: "מגדל העמק", country: "ישראל" },
  { city: "דימונה", country: "ישראל" },
  { city: "ערד", country: "ישראל" },
  { city: "אופקים", country: "ישראל" },
  { city: "שדרות", country: "ישראל" },
  { city: "נתיבות", country: "ישראל" },
  { city: "קריית מלאכי", country: "ישראל" },
  { city: "גבעת שמואל", country: "ישראל" },
  { city: "יהוד-מונוסון", country: "ישראל" },
  { city: "אור עקיבא", country: "ישראל" },
  { city: "זכרון יעקב", country: "ישראל" },
  { city: "כרמיאל", country: "ישראל" },
  { city: "מעלות-תרשיחא", country: "ישראל" },
  { city: "בנימינה-גבעת עדה", country: "ישראל" },
  { city: "גדרה", country: "ישראל" },
  { city: "פרדס חנה-כרכור", country: "ישראל" },
  { city: "עמנואל", country: "ישראל" },

  // ארצות הברית
  { city: "ניו יורק", country: "ארצות הברית" },
  { city: "ברוקלין", country: "ארצות הברית" },
  { city: "מונסי", country: "ארצות הברית" },
  { city: "לייקווד", country: "ארצות הברית" },
  { city: "לוס אנג'לס", country: "ארצות הברית" },
  { city: "מיאמי", country: "ארצות הברית" },
  { city: "שיקגו", country: "ארצות הברית" },
  { city: "בוסטון", country: "ארצות הברית" },
  { city: "פילדלפיה", country: "ארצות הברית" },
  { city: "בולטימור", country: "ארצות הברית" },
  { city: "וושינגטון הבירה", country: "ארצות הברית" },
  { city: "קליבלנד", country: "ארצות הברית" },
  { city: "דטרויט", country: "ארצות הברית" },
  { city: "אטלנטה", country: "ארצות הברית" },
  { city: "יוסטון", country: "ארצות הברית" },
  { city: "דאלאס", country: "ארצות הברית" },
  { city: "לאס וגאס", country: "ארצות הברית" },
  { city: "סן פרנסיסקו", country: "ארצות הברית" },
  { city: "סיאטל", country: "ארצות הברית" },
  { city: "פיטסבורג", country: "ארצות הברית" },
  { city: "סנט לואיס", country: "ארצות הברית" },
  { city: "מיניאפוליס", country: "ארצות הברית" },
  { city: "דנוור", country: "ארצות הברית" },

  // קנדה
  { city: "טורונטו", country: "קנדה" },
  { city: "מונטריאול", country: "קנדה" },
  { city: "ונקובר", country: "קנדה" },
  { city: "אוטווה", country: "קנדה" },

  // בריטניה
  { city: "לונדון", country: "בריטניה" },
  { city: "מנצ'סטר", country: "בריטניה" },
  { city: "גייטסהד", country: "בריטניה" },
  { city: "לידס", country: "בריטניה" },
  { city: "ליברפול", country: "בריטניה" },
  { city: "גלזגו", country: "בריטניה" },

  // צרפת
  { city: "פריז", country: "צרפת" },
  { city: "מרסיי", country: "צרפת" },
  { city: "ליון", country: "צרפת" },
  { city: "סטרסבורג", country: "צרפת" },
  { city: "ניס", country: "צרפת" },

  // בלגיה והולנד
  { city: "אנטוורפן", country: "בלגיה" },
  { city: "בריסל", country: "בלגיה" },
  { city: "אמסטרדם", country: "הולנד" },

  // גרמניה, שווייץ, אוסטריה
  { city: "ברלין", country: "גרמניה" },
  { city: "פרנקפורט", country: "גרמניה" },
  { city: "מינכן", country: "גרמניה" },
  { city: "המבורג", country: "גרמניה" },
  { city: "ציריך", country: "שווייץ" },
  { city: "ז'נבה", country: "שווייץ" },
  { city: "בזל", country: "שווייץ" },
  { city: "וינה", country: "אוסטריה" },

  // איטליה, ספרד, פורטוגל
  { city: "רומא", country: "איטליה" },
  { city: "מילאנו", country: "איטליה" },
  { city: "ונציה", country: "איטליה" },
  { city: "פירנצה", country: "איטליה" },
  { city: "מדריד", country: "ספרד" },
  { city: "ברצלונה", country: "ספרד" },
  { city: "ליסבון", country: "פורטוגל" },

  // מזרח אירופה
  { city: "בודפשט", country: "הונגריה" },
  { city: "ורשה", country: "פולין" },
  { city: "קרקוב", country: "פולין" },
  { city: "פראג", country: "צ'כיה" },
  { city: "בוקרשט", country: "רומניה" },
  { city: "סופיה", country: "בולגריה" },

  // ברית המועצות לשעבר
  { city: "מוסקבה", country: "רוסיה" },
  { city: "סנט פטרבורג", country: "רוסיה" },
  { city: "קייב", country: "אוקראינה" },
  { city: "אודסה", country: "אוקראינה" },
  { city: "דנייפרו", country: "אוקראינה" },
  { city: "חרקוב", country: "אוקראינה" },
  { city: "מינסק", country: "בלארוס" },
  { city: "וילנה", country: "ליטא" },
  { city: "ריגה", country: "לטביה" },

  // יוון וטורקיה
  { city: "אתונה", country: "יוון" },
  { city: "סלוניקי", country: "יוון" },
  { city: "איסטנבול", country: "טורקיה" },
  { city: "אנקרה", country: "טורקיה" },

  // צפון אפריקה ומזרח תיכון
  { city: "קזבלנקה", country: "מרוקו" },
  { city: "רבאט", country: "מרוקו" },
  { city: "מרקש", country: "מרוקו" },
  { city: "פאס", country: "מרוקו" },
  { city: "תוניס", country: "תוניסיה" },
  { city: "אלג'יר", country: "אלג'יריה" },
  { city: "קהיר", country: "מצרים" },
  { city: "אלכסנדריה", country: "מצרים" },
  { city: "דובאי", country: "איחוד האמירויות" },
  { city: "אבו דאבי", country: "איחוד האמירויות" },

  // אפריקה
  { city: "יוהנסבורג", country: "דרום אפריקה" },
  { city: "קייפטאון", country: "דרום אפריקה" },

  // אוסטרליה וניו זילנד
  { city: "מלבורן", country: "אוסטרליה" },
  { city: "סידני", country: "אוסטרליה" },
  { city: "פרת'", country: "אוסטרליה" },
  { city: "בריזביין", country: "אוסטרליה" },
  { city: "אוקלנד", country: "ניו זילנד" },
  { city: "ולינגטון", country: "ניו זילנד" },

  // דרום אמריקה ומקסיקו
  { city: "בואנוס איירס", country: "ארגנטינה" },
  { city: "סאו פאולו", country: "ברזיל" },
  { city: "ריו דה ז'ניירו", country: "ברזיל" },
  { city: "מקסיקו סיטי", country: "מקסיקו" },
  { city: "סנטיאגו", country: "צ'ילה" },
  { city: "מונטווידאו", country: "אורוגוואי" },

  // אסיה
  { city: "מומבאי", country: "הודו" },
  { city: "ניו דלהי", country: "הודו" },
  { city: "בייג'ינג", country: "סין" },
  { city: "שנגחאי", country: "סין" },
  { city: "הונג קונג", country: "סין" },
  { city: "טוקיו", country: "יפן" },
  { city: "בנגקוק", country: "תאילנד" },
  { city: "סינגפור", country: "סינגפור" },
];

export function findCountryByCity(city: string): string | undefined {
  return CITIES.find((c) => c.city === city)?.country;
}
