// One-off review fixture. Uses installed dependencies; no package install or live data.
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import esbuild from 'esbuild'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
const __dirname=path.dirname(fileURLToPath(import.meta.url))
async function main(){
  const root=path.resolve(__dirname,'..'),out=path.resolve(process.argv[2] || path.join(root,'.next/materials-preview'))
  fs.mkdirSync(out,{recursive:true})
  const stub=path.join(out,'assets-stub.ts')
  fs.writeFileSync(stub,'export async function uploadUserAsset(){return {asset_id:"00000000-0000-4000-8000-000000000090",voice_authorization_id:"synthetic-only"}}')
  const imageStub=path.join(out,'image-stub.jsx')
  fs.writeFileSync(imageStub,'import React from "react";export default function Image({fill,unoptimized,sizes,...props}){return <img {...props} style={{width:"100%",height:"100%"}}/>}')
  const linkStub=path.join(out,'link-stub.jsx')
  fs.writeFileSync(linkStub,'import React from "react";export default function Link(props){return <a {...props}/>;}')
  await esbuild.build({entryPoints:[path.join(root,'tests/fixtures/order-materials-preview.jsx')],bundle:true,format:'iife',
    outfile:path.join(out,'fixture.js'),jsx:'automatic',tsconfig:path.join(root,'tsconfig.json'),
    nodePaths:[path.join(root,'node_modules')],alias:{'@/services/assets':stub,'next/image':imageStub,'next/link':linkStub},
    define:{'process.env.NODE_ENV':'"development"'},logLevel:'error'})
  const css=await postcss([tailwind({base:root})]).process(fs.readFileSync(path.join(root,'app/globals.css'),'utf8'),{from:path.join(root,'app/globals.css')})
  fs.writeFileSync(path.join(out,'fixture.css'),css.css)
  fs.writeFileSync(path.join(out,'index.html'),'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>19 S3 local synthetic fixture</title><link rel="stylesheet" href="fixture.css"><body style="background:#fffaf2"><div id="root"></div><script src="fixture.js"></script></body></html>')
  http.createServer((req,res)=>{
    const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html'
    if(name==='fixture-cover.svg'){res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" rx="12" fill="#fce6b4"/><circle cx="80" cy="65" r="27" fill="#f4b862"/><text x="80" y="124" text-anchor="middle" font-size="14" fill="#78350f">Birthday Adventure</text></svg>');return}
    if(!['index.html','fixture.css','fixture.js'].includes(name)){res.writeHead(404).end();return}
    res.setHeader('Content-Type',name.endsWith('.css')?'text/css':name.endsWith('.js')?'text/javascript':'text/html')
    res.end(fs.readFileSync(path.join(out,name)))
  }).listen(0,'127.0.0.1',function(){console.log('SYNTHETIC_FIXTURE http://127.0.0.1:'+this.address().port)})
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
