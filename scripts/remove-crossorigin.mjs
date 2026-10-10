import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../www/index.html', import.meta.url);
const html = await readFile(file, 'utf8');
await writeFile(file, html.replaceAll(' crossorigin', '').replace(/\r\n/g, '\n'), 'utf8');
