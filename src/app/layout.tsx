import type { Metadata } from 'next';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import './globals.css';
import './appearance.css';
import ThemeProvider from '@/components/theme-provider';

export const metadata: Metadata = {
  title: 'EKDK · Copenhagen FIR controller workspace',
  description: 'Airport information and reference workspace for Danish VATSIM controllers.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: "try{const saved=localStorage.getItem('ekdk-theme');document.documentElement.dataset.theme=saved==='light'||saved==='dark'?saved:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch{document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}" }} /></head><body><ThemeProvider>{children}</ThemeProvider></body></html>;
}
