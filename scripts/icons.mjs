// Мастер иконки состоит из векторных контуров. PNG рисуются сразу в целевом размере.
import sharp from 'sharp';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export async function generateIcons() {
  const svg = await fs.readFile('public/favicon.svg');
  for (const [file, size] of [['favicon-16.png',16],['favicon-32.png',32],['apple-touch-icon.png',180],['icon-192.png',192],['icon-512.png',512]]) {
    await sharp(svg, { density: 384 }).resize(size,size).png().toFile(`public/${file}`);
  }
  await fs.writeFile('public/site.webmanifest', JSON.stringify({ name:'d1fast', short_name:'d1fast', start_url:'/', display:'browser', background_color:'#E3E9ED', theme_color:'#E3E9ED', icons:[{src:'/icon-192.png',sizes:'192x192',type:'image/png'},{src:'/icon-512.png',sizes:'512x512',type:'image/png'}] },null,2)+'\n');
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await generateIcons();
