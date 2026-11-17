import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'המוזיקה שלי',
  description: 'כל השירים החדשים מהאמנים האהובים עליך',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="he" dir="rtl"><body>{children}</body></html>;
}
