// Bounded local fixture; the browser/server never loads credentials or contacts Production.
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import esbuild from 'esbuild'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { shippingHarness } from './helpers/shipping-discount-harness.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(root, '.next/shipping-discount-preview')
fs.mkdirSync(out, { recursive: true })
await esbuild.build({ entryPoints: [path.join(root, 'tests/fixtures/shipping-discount-preview.jsx')], bundle: true, format: 'iife',
  outfile: path.join(out, 'fixture.js'), jsx: 'automatic', tsconfig: path.join(root, 'tsconfig.json'),
  nodePaths: [path.join(root, 'node_modules')], define: { 'process.env.NODE_ENV': '"development"' }, logLevel: 'error' })
const css = await postcss([tailwind({ base: root })]).process(fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8'), { from: path.join(root, 'app/globals.css') })
fs.writeFileSync(path.join(out, 'fixture.css'), css.css)
const h = shippingHarness({ percent: 60 })
http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname
    let response
    if (pathname === '/api/admin/shipping-discount') {
      if (req.method === 'PATCH') {
        let body = ''; for await (const chunk of req) body += chunk
        response = await h.load('app/api/admin/shipping-discount/route.ts').PATCH(new Request('http://localhost' + pathname, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body }))
      } else response = await h.load('app/api/admin/shipping-discount/route.ts').GET()
    } else if (pathname === '/api/checkout/shipping-quote') {
      let body = ''; for await (const chunk of req) body += chunk
      response = await h.load('app/api/checkout/shipping-quote/route.ts').POST(new Request('http://localhost' + pathname, { method: 'POST', headers: { 'content-type': 'application/json' }, body }))
    } else if (pathname === '/api/checkout/shipping-destinations') {
      response = Response.json({ destinations: [{ id: 'HK:default', countryCode: 'HK', shippingRegionKey: null, label: { en: 'Hong Kong' }, sortOrder: 1 }] })
    } else if (pathname === '/api/user/addresses') response = Response.json({ addresses: [] })
    if (response) {
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text()); return
    }
    if (pathname === '/fixture.css' || pathname === '/fixture.js') {
      res.setHeader('Content-Type', pathname.endsWith('.css') ? 'text/css' : 'text/javascript')
      res.end(fs.readFileSync(path.join(out, pathname.slice(1)))); return
    }
    if (pathname !== '/') { res.writeHead(404).end(); return }
    res.setHeader('Content-Type', 'text/html')
    res.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shipping discount · local fixture</title><link rel="stylesheet" href="/fixture.css"></head><body style="background:#fffaf2"><div id="root"></div><script src="/fixture.js"></script></body></html>')
  } catch (error) { console.error(error); res.writeHead(500).end('Local fixture failed') }
}).listen(0, '127.0.0.1', function () { console.log('SHIPPING_FIXTURE http://127.0.0.1:' + this.address().port) })
