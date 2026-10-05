import { copyFile, cp, mkdir } from 'node:fs/promises';

await mkdir('public/pdfjs', { recursive: true });
await copyFile('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'public/pdfjs/pdf.worker.min.mjs');
await cp('node_modules/pdfjs-dist/standard_fonts', 'public/pdfjs/standard_fonts', { recursive: true });
await cp('node_modules/pdfjs-dist/cmaps', 'public/pdfjs/cmaps', { recursive: true });
