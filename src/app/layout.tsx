import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Salary Management',
  description: 'Manage employees and analyse compensation across the workforce.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="bg-background text-foreground min-h-full antialiased">{children}</body>
    </html>
  );
}
