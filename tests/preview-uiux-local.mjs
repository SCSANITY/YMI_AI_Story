// Bounded, credential-free local fixture. No provider or Production requests.
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import esbuild from 'esbuild'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const out=path.join(root,'tmp/preview-uiux-local')
fs.mkdirSync(out,{recursive:true})
const write=(name,text)=>{const file=path.join(out,name);fs.writeFileSync(file,text);return file}
const context=write('context.jsx',`import React,{useState,useEffect,useContext,createContext} from 'react';
const Context=createContext(null),noop=()=>{},cart=[];
export function Provider({children}){const [isHydrated,setHydrated]=useState(true);const [resumeData,setResume]=useState(()=>new URLSearchParams(location.search).get('fresh')==='1'?{bookID:'Fixture_story',personalization:{childName:'Mia',childAge:'6',language:'English',bookType:'basic',photoUrl:'/customize-product/v1/a-02-add-their-photo.jpg',assetId:'40000000-0000-4000-8000-000000000002',storagePath:'user-assets/fixture/photo.jpg',faceImageUrl:'/customize-product/v1/a-02-add-their-photo.jpg'}}:null);useEffect(()=>{setHydrated(true)},[]);return <Context.Provider value={{user:null,isHydrated,cart,resumeData,resumePersonalization:setResume,openLoginModal:noop,logout:noop,addToCart:async(book,personalization)=>{document.getElementById('fixture-purchase').textContent=JSON.stringify({bookID:book.bookID,personalization});return {...book,id:'local-cart',quantity:1,personalization}},removeFromCart:noop,updateCartQuantity:noop,prepareCheckout:noop,displayCurrency:'USD',currency:'USD',region:'US'}}>{children}</Context.Provider>}
export function useGlobalContext(){return useContext(Context)}`)
const nav=write('navigation.js',`const params=new URLSearchParams(location.search),router={push:()=>{},replace:()=>{},back:()=>{},refresh:()=>{},prefetch:()=>{}};export const useSearchParams=()=>params;export const useRouter=()=>router;export const usePathname=()=>location.pathname;`)
const image=write('image.jsx',`import React from 'react';export const getImageProps=props=>({props});export default function Image({fill,unoptimized,priority,sizes,quality,onLoadingComplete,...props}){return <img {...props} style={{...(fill?{position:'absolute',inset:0,width:'100%',height:'100%'}:{}),...props.style}}/>}`)
const link=write('link.jsx',`import React from 'react';export default function Link(props){return <a {...props}/>}`)
const dynamic=write('dynamic.jsx',`import React from 'react';export default function dynamic(){return ()=>null}`)
const assets=write('assets.js',`export const autoCropFaceImage=async()=>{throw Error('Generation/upload is outside this local fixture')};export const faceQualityCheck=autoCropFaceImage;export const prepareFaceImage=autoCropFaceImage;export const prepareRawHeicFallback=autoCropFaceImage;export const uploadUserAsset=autoCropFaceImage;export const validateFaceImage=autoCropFaceImage;`)
const ctx=await esbuild.context({entryPoints:[path.join(root,'tests/fixtures/preview-uiux-local.jsx')],bundle:true,format:'iife',outfile:path.join(out,'fixture.js'),jsx:'automatic',tsconfig:path.join(root,'tsconfig.json'),loader:{'.css':'local-css'},nodePaths:[path.join(root,'node_modules')],alias:{'@/contexts/GlobalContext':context,'next/navigation':nav,'next/image':image,'next/link':link,'next/dynamic':dynamic,'@/services/assets':assets},define:{'process.env.NODE_ENV':'"development"','process.env':'{}'},logLevel:'error'})
await ctx.watch()
const css=await postcss([tailwind({base:root})]).process(fs.readFileSync(path.join(root,'app/globals.css'),'utf8'),{from:path.join(root,'app/globals.css')})
write('global.css',css.css)
http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname)
 let file
 if(['/fixture.js','/fixture.css','/global.css'].includes(pathname))file=path.join(out,pathname.slice(1))
 else if(pathname.startsWith('/customize-product/')||pathname.startsWith('/images/')||pathname.startsWith('/fonts/'))file=path.join(root,'public',pathname)
 if(file&&file.startsWith(root)&&fs.existsSync(file)){res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.png')?'image/png':file.endsWith('.jpg')?'image/jpeg':'application/octet-stream');res.end(fs.readFileSync(file));return}
 if(pathname==='/cover.svg'){const color=new URL(req.url,'http://localhost').searchParams.get('v')==='1'?'#dbab64':'#adc3b2';res.setHeader('Content-Type','image/svg+xml');res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${color}"/><rect x="150" y="70" width="730" height="880" rx="35" fill="#fff2c9"/><circle cx="510" cy="530" r="200" fill="#dca76e"/><circle cx="450" cy="500" r="20"/><circle cx="570" cy="500" r="20"/><path d="M450 590 Q510 650 570 590" stroke="#604b40" stroke-width="10" fill="none"/><text x="512" y="200" text-anchor="middle" font-family="Georgia" font-size="58">An illustrated story</text><text x="512" y="860" text-anchor="middle" font-family="Georgia" font-size="32">Local fixture · not a generation</text></svg>`);return}
 if(pathname!=='/personalize/Fixture_story'){res.writeHead(404).end();return}
 res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Preview UIUX · local fixture</title><link rel="stylesheet" href="/global.css"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>')
}).listen(0,'127.0.0.1',function(){console.log('PREVIEW_UIUX_FIXTURE http://127.0.0.1:'+this.address().port+'/personalize/Fixture_story?view=preview&creationId=10000000-0000-4000-8000-000000000002&jobId=20000000-0000-4000-8000-000000000002')})
