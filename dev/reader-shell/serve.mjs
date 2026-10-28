import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const wt=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const req=createRequire(path.join(wt,'package.json')),esbuild=req('esbuild'),postcss=req('postcss'),tailwind=req('@tailwindcss/postcss');
const out=path.join(wt,'tmp/reader-shell-fixture');
fs.mkdirSync(out,{recursive:true});
const from=f=>JSON.stringify(path.join(wt,f).replaceAll('\\','/'));
fs.writeFileSync(path.join(out,'entry.tsx'),`import ${from('dev/reader-shell/fixture.tsx')};`);
const shim={
 'next/navigation':`export const useRouter=()=>({push:url=>{document.querySelector('[data-fixture-requests]').textContent=url}});`,
 '@/contexts/GlobalContext':`export const useGlobalContext=()=>({user:{customerId:'fixture-owner'},isHydrated:true,openLoginModal:()=>{}});`,
 'next/link':`import React from 'react';export default function Link(p){return <a {...p}/>;}`,
 'next/image':`import React from 'react';export function getImageProps(p){const{priority,fill,unoptimized,quality,...v}=p;return{props:v};}export default function Image({fill,priority,unoptimized,quality,...p}){return <img {...p} style={{...p.style,...(fill?{position:'absolute',inset:0,width:'100%',height:'100%'}:{})}}/>;}`,
};
async function main(){
 const build=await esbuild.build({entryPoints:[path.join(out,'entry.tsx')],bundle:true,outfile:path.join(out,'fixture.js'),format:'iife',platform:'browser',jsx:'automatic',nodePaths:[path.join(wt,'node_modules')],tsconfig:path.join(wt,'tsconfig.json'),define:{'process.env.NODE_ENV':'"development"'},metafile:true,external:['/customize-product/*'],logLevel:'error',plugins:[{name:'framework-shims',setup(b){b.onResolve({filter:/^(next\/(link|image|navigation)|@\/contexts\/GlobalContext)$/},a=>({path:a.path,namespace:'shim'}));b.onLoad({filter:/.*/,namespace:'shim'},a=>({contents:shim[a.path],loader:'tsx',resolveDir:wt}));}}]});
 fs.writeFileSync(path.join(out,'metafile.json'),JSON.stringify(build.metafile));
 const css=await postcss([tailwind({base:wt})]).process(fs.readFileSync(path.join(wt,'app/globals.css'),'utf8'),{from:path.join(wt,'app/globals.css')});fs.writeFileSync(path.join(out,'tailwind.css'),css.css);
 fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Issue27 actual Reader</title><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Playfair+Display:ital,wght@0,700;1,700&display=swap" rel="stylesheet"><link rel="stylesheet" href="/tailwind.css"><link rel="stylesheet" href="/fixture.css"><style>body{margin:0;--font-inter:Inter;--font-playfair:'Playfair Display';--font-product-italic:'Playfair Display';font-family:Inter,sans-serif}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`);
 const log=path.join(out,'requests.jsonl');
 http.createServer((r,s)=>{
  const url=new URL(r.url,'http://127.0.0.1');let f;
  if(['/','/reader'].includes(url.pathname))f=path.join(out,'index.html');
  else if(['/fixture.js','/fixture.css','/tailwind.css'].includes(url.pathname))f=path.join(out,url.pathname);
  else if(url.pathname.startsWith('/storage/v1/object/sign/raw-private/reader-')){
    const index=Number(url.pathname.match(/reader-(\d+)/)?.[1]||0);
    f=path.join(wt,'public',index===0?'customize-product/v1/c-hardcover-01.jpg':`customize-product/v3/s1-${index%2?'left':'right'}-1200.webp`);
  } else {const publicRoot=path.join(wt,'public');f=path.resolve(publicRoot,'.'+url.pathname);if(!f.startsWith(publicRoot+path.sep)){s.writeHead(404);s.end();return;}}
  if(!fs.existsSync(f)||!fs.statSync(f).isFile()){s.writeHead(404);s.end();return;}
  const bytes=fs.readFileSync(f),ext=path.extname(f),range=r.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
  s.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.mp3':'audio/mpeg'})[ext]||'application/octet-stream');
  s.setHeader('Cache-Control',url.pathname.startsWith('/storage/v1/object/sign/')?'private, max-age=3600':url.pathname.startsWith('/customize-product/')?'public, max-age=31536000, immutable':'no-store');
  s.setHeader('Accept-Ranges','bytes');
  let start=0,end=bytes.length-1;if(range){start=+range[1];end=range[2]?Math.min(+range[2],end):end;s.statusCode=206;s.setHeader('Content-Range',`bytes ${start}-${end}/${bytes.length}`);}
  fs.appendFileSync(log,JSON.stringify({at:Date.now(),url:url.pathname,query:url.search,range:r.headers.range||null,bytes:end-start+1})+'\n');
  s.setHeader('Content-Length',end-start+1);const send=()=>s.end(bytes.subarray(start,end+1));if(url.pathname.endsWith('reader-0.webp')&&Number(url.searchParams.get('token'))>1)setTimeout(send,600);else send();
 }).listen(43128,'127.0.0.1',()=>console.log('27 fixture READY http://127.0.0.1:43128/reader'));
}
main().catch(e=>{console.error(e);process.exitCode=1});
