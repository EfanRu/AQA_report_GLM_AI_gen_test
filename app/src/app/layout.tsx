import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TestReport — отчёты по автотестам',
  description: 'Перезапуски, комментарии и отчёты по билдам',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
