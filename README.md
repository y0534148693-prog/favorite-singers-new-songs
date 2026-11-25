# המוזיקה שלי

אפליקציית Next.js בעברית מלאה (RTL) לריכוז שירים חדשים מערוצי YouTube שהמשתמש בחר. כוללת התחברות Supabase, ניהול אמנים, פיד, חיפוש, סינון ומועדפים.

## דרישות

- Node.js 22 ומעלה
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
   npm ci
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
| `NEXT_PUBLIC_YOUTUBE_SEARCH_URL` | כתובת Edge Function בשם `youtube-search` |
| `NEXT_PUBLIC_YOUTUBE_SUBSCRIPTIONS_URL` | כתובת Edge Function בשם `youtube-subscriptions` |

אין להוסיף ל-GitHub את `.env.local`, מפתחות Service Role, מפתחות Google פרטיים או refresh tokens. קובץ `.env.local.example` הוא תבנית בלבד.

## שירותי Supabase שהוכנו

פרויקט Supabase בשם `my-music` באזור `eu-central-1`:
- טבלאות `profiles`, `user_artists`, `dismissed_artists`, `favorite_songs`, `music_preferences`.
- מדיניות RLS מגבילה נתוני משתמשים לבעליהם.
- `private.youtube_connections` נשמרת בסכמה פרטית.
- שלוש Edge Functions מאובטחות (`youtube-feed`, `youtube-search`, `youtube-subscriptions`) דורשות JWT ומאמתות את המשתמש. כל הטבלאות ב-`public` מפעילות RLS עם מדיניות בעלות. הטבלה `private.youtube_connections` חסומה למשתמשי API רגילים.

## חיפוש ערוצים

נפרסה פונקציית Edge Function בשם `youtube-search`, שמאמתת JWT של המשתמש ומחפשת ערוצי YouTube דרך YouTube Data API v3. היא משתמשת באותו סוד `YOUTUBE_API_KEY`.

נפרסה גם `youtube-subscriptions`, שמאמתת JWT של האתר, מקבלת אסימון Google זמני ומחזירה מינויים דרך YouTube Data API. אסימון Google אינו נשמר על ידי הפונקציה.

## הפעלת פיד YouTube

יש להגדיר ב-Supabase Dashboard → Edge Functions → Secrets:
- `YOUTUBE_API_KEY` — מפתח YouTube Data API v3.

עד להגדרת המפתח, הפיד לא יחזיר שירים. הפונקציה קוראת את רשימת ההעלאות של כל ערוץ באמצעות `channels.list` ו-`playlistItems.list`, כדי להימנע מחיפושי וידאו יקרים במכסות. היא בודקת עד 200 העלאות אחרונות לערוץ ומסננת לתקופה של 90 ימים לפי תאריך פרסום הווידאו. היא מסננת ראיונות/פודקאסטים ומסמנת תוכן עם מילות Official כ"מועמד" בלבד — לא כאימות רשמי.

## הגדרת Google OAuth

1. ב-Google Cloud צור OAuth Client מסוג Web Application.
2. הוסף Authorized JavaScript origin של סביבת הפיתוח: `http://localhost:3000`.
3. הוסף Authorized redirect URI:
   `https://xigjfarewkffelltbifl.supabase.co/auth/v1/callback`.
4. ב-Supabase → Authentication → Providers → Google, הפעל Google והכנס Client ID ו-Client Secret.
5. ב-Supabase → Authentication → URL Configuration, הוסף ל-Redirect URLs את `http://localhost:3000/**`.
6. הפעל Manual Identity Linking (Beta) בהגדרות Auth.
7. ב-Google Auth Platform → Data Access, הוסף את scope `https://www.googleapis.com/auth/youtube.readonly`.

חיבור Google אינו פעיל עד להשלמת ההגדרות האלה. כפתור ההתחברות של Google מבקש גם את scope `youtube.readonly`, כדי שהאסימון הזמני יוכל לשמש לייבוא מינויים. אם המשתמש נרשם בדוא"ל/סיסמה, כפתור חיבור YouTube מקשר זהות Google לחשבון הקיים. אם Google כבר מחובר, אין ניסיון לקשר את אותה זהות פעם נוספת. בעת ייבוא מינויים, האסימון מועבר לפונקציית Edge מאומתת ואינו נכתב למסד הנתונים. אם האסימון פג, יש להתחבר מחדש דרך Google.

## מצב הפיתוח הנוכחי

- קיים: ממשק RTL רספונסיבי, התחברות והרשמה עם Supabase Auth, הוספה והסרה של ערוצים לפי Channel ID או כתובת ערוץ קנונית, פיד דרך Edge Function, חיפוש, סינון ומועדפים.
- קיים: חיפוש ערוצי YouTube דרך פונקציית שרת מאומתת; הוספה לרשימת האמנים מתוצאות החיפוש.
- קיים: מסך „אולי תאהב” שמבצע חיפוש ערוצים לפי שמות האמנים והעדפות הז'אנר/השפה, מסנן ערוצים שכבר נוספו ושומר ערוצים שנדחו בטבלת `dismissed_artists` ב-Supabase. ההצעות מבוססות על חיפוש לפי האמנים והז'אנרים, וממוינות לפי מספר מנויים גלוי כאשר YouTube מחזיר אותו; אין בכך אימות רשמי או דירוג דמיון סמנטי.
- קיים: מסך העדפות ששומר ז'אנרים ושפות בטבלת `music_preferences` ומזין אותם לחיפוש ההמלצות.
- קיים בקוד וב-Supabase: זרימת קישור חשבון Google עם הרשאת `youtube.readonly` וייבוא מינויים באמצעות Edge Function. כדי להפעיל: להגדיר Google OAuth Client ב-Google Cloud, להוסיף את Client ID ו-Client Secret ב-Supabase → Authentication → Providers → Google, להפעיל Manual Identity Linking ב-Auth settings, ולהוסיף את כתובת האתר/localhost ל-Redirect URLs. יש לוודא שה-Consent Screen כולל את scope `https://www.googleapis.com/auth/youtube.readonly`.
- נדרש להשלמה: דירוג המלצות לפי פופולריות/דמיון אמיתי, אימות ערוץ רשמי מול מקורות נוספים, בדיקות אינטגרציה מקצה לקצה וטיפול מתקדם במכסות וב-cache.
- כפתור Google OAuth וחיבור חשבון YouTube קיימים בקוד, אך דורשים את הגדרות הספק וההרשאות שבסעיף הקודם. חיבור Google עדיין לא נבדק מקצה לקצה מול חשבון אמיתי. אין להכניס Client Secret או refresh tokens לקוד הדפדפן.
- התראות YouTube אוטומטיות אינן ממומשות; התראות ערוץ מנוהלות ב-YouTube.
- הפרויקט עדיין לא נפרס לאתר ציבורי. אין שימוש ב-Vercel כחלק מהתהליך.

## פקודות

- `npm run dev` — שרת פיתוח
- `npm run build` — יצירת build לייצור
- `npm run start` — הפעלת build קיים
