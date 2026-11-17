# המוזיקה שלי

אפליקציית Next.js בעברית מלאה (RTL) לריכוז שירים חדשים מערוצי YouTube שהמשתמש בחר. כוללת התחברות Supabase, ניהול אמנים, פיד, חיפוש, סינון ומועדפים.

## דרישות

- Node.js 20 ומעלה
- פרויקט Supabase עם הסכמה והפונקציה המתוארים בהמשך
- מפתח YouTube Data API v3 בצד שרת

## התקנה מקומית

1. שכפל את המאגר והיכנס לתיקייה:
   ```bash
   git clone https://github.com/y0534148693-prog/favorite-singers-new-songs.git
   cd favorite-singers-new-songs
   ```
2. התקן תלויות:
   ```bash
   npm install
   ```
3. העתק את `.env.local.example` אל `.env.local` והשלם את הערכים:
   ```bash
   cp .env.local.example .env.local
   ```
   ב-Windows אפשר להעתיק את הקובץ ידנית ולשנות את שמו.
4. הפעל:
   ```bash
   npm run dev
   ```
5. פתח http://localhost:3000.

## משתני סביבה

| משתנה | תיאור |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | כתובת פרויקט Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | מפתח Publishable ציבורי של Supabase |
| `NEXT_PUBLIC_YOUTUBE_FEED_URL` | כתובת Edge Function בשם `youtube-feed` |

אין להוסיף ל-GitHub את `.env.local`, מפתחות Service Role, מפתחות Google פרטיים או refresh tokens. קובץ `.env.local.example` הוא תבנית בלבד.

## שירותי Supabase שהוכנו

פרויקט Supabase בשם `my-music` באזור `eu-central-1`:
- טבלאות `profiles`, `user_artists`, `dismissed_artists`, `favorite_songs`, `music_preferences`.
- מדיניות RLS מגבילה נתוני משתמשים לבעליהם.
- `private.youtube_connections` נשמרת בסכמה פרטית.
- Edge Function מאובטחת `youtube-feed` דורשת JWT ומחזירה פריטי YouTube לפי ערוצי המשתמש.

## הפעלת פיד YouTube

יש להגדיר ב-Supabase Dashboard → Edge Functions → Secrets:
- `YOUTUBE_API_KEY` — מפתח YouTube Data API v3.

עד להגדרת המפתח, הפיד לא יחזיר שירים. הפונקציה מבצעת סינון בסיסי של ראיונות/פודקאסטים ומחזירה סימון ביטחון לסיווג תוכן.

## מצב הפיתוח הנוכחי

- קיים: ממשק RTL רספונסיבי, התחברות והרשמה עם Supabase Auth, הוספה והסרה של ערוצים לפי Channel ID, פיד דרך Edge Function, חיפוש, סינון ומועדפים.
- נדרש להשלמה: חיפוש ערוצים אוטומטי ואימות ערוץ רשמי, המלצות אמנים, זרימת Google/YouTube OAuth, בדיקות אוטומטיות וטיפול משופר בשגיאות/מכסות.
- Google OAuth עדיין אינו מחובר. אין להכניס Client Secret או refresh tokens לקוד הדפדפן.
- התראות YouTube אוטומטיות אינן ממומשות; התראות ערוץ מנוהלות ב-YouTube.
- הפרויקט עדיין לא נפרס לאתר ציבורי. אין שימוש ב-Vercel כחלק מהתהליך.

## פקודות

- `npm run dev` — שרת פיתוח
- `npm run build` — יצירת build לייצור
- `npm run start` — הפעלת build קיים
