import sharp from 'sharp';
import {mkdir} from 'node:fs/promises';
import {pwaScreens} from '../src/lib/pwa-splash';
await mkdir('public/pwa/splash',{recursive:true});
for(const [w,h,ratio] of pwaScreens)for(const orientation of ['portrait','landscape']){
 const width=(orientation==='portrait'?w:h)*ratio,height=(orientation==='portrait'?h:w)*ratio,size=80*ratio;
 const logo=await sharp('public/pwa/icon-512.png').resize(size,size).png().toBuffer();
 const label=Buffer.from(`<svg width="${width}" height="${60*ratio}"><text x="50%" y="${30*ratio}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${20*ratio}" font-weight="700" fill="#7b3040">hvntvn</text></svg>`);
 await sharp({create:{width,height,channels:3,background:'#faf7f1'}}).composite([
  {input:logo,left:Math.round((width-size)/2),top:Math.round(height/2-size)},
  {input:label,left:0,top:Math.round(height/2+12*ratio)},
 ]).png({palette:true}).toFile(`public/pwa/splash/${w}-${h}-${ratio}-${orientation}.png`);
}
