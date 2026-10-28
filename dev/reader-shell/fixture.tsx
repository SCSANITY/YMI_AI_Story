import React, {useState} from 'react'
import {createRoot} from 'react-dom/client'
import {OwnedBookReader} from '../../app/my-books/[creationId]/OwnedBookReader'
import {createFinalV3Metadata} from '../../src/lib/final-page-metadata.fixture'

// Loopback-only development entry, never imported by an app route. All names,
// paid/release metadata and signing tokens below are synthetic; art is public.
let mode = new URLSearchParams(location.search).get('state') ?? 'ready'
let token = 0
const requests: string[] = []
window.fetch = async input => {
  const url = String(input)
  if (!url.startsWith('/api/my-books/')) throw new Error(`No live requests in Reader fixture: ${url}`)
  requests.push(url)
  window.dispatchEvent(new CustomEvent('reader-fixture-request'))
  const current = ++token
  if(mode==='service') return Response.json({}, {status:503})
  if(mode==='signed_out') return Response.json({}, {status:401})
  if(mode==='refunded') return Response.json({reason:'refunded'}, {status:403})
  if(mode==='not_found') return Response.json({}, {status:404})
  if(mode==='loading') return new Promise<Response>(()=>{})
  return Response.json({eligible:true,finalReady:mode!=='preparing',schemaVersion:mode==='invalid'?2:3,assetLayout:'single-page',latestPackageType:'supreme',latestOrderDisplayId:'DEMO-ONLY',
    creation:{creationId:'reader-demo',templateId:'Demo_story',template:{name:'A Story To Treasure'},customizeSnapshot:{childName:'Alston'}},
    pages:createFinalV3Metadata().map(p=>({pageIndex:p.page_index,outputOrder:p.output_order,role:p.role,spreadIndex:p.spread_index,side:p.side,pageNumber:p.page_number,
      url:`/storage/v1/object/sign/raw-private/reader-${p.output_order}.webp?token=${current}`})),
  })
}
function Fixture(){
  const [identity,setIdentity]=useState('reader-demo')
  const [started,setStarted]=useState(mode==='ready')
  const [requestCount,setRequestCount]=useState(0)
  React.useEffect(()=>{const update=()=>setRequestCount(requests.length);window.addEventListener('reader-fixture-request',update);update();return()=>window.removeEventListener('reader-fixture-request',update)},[])
  return <>
    <nav aria-label="Fixture controls" style={{padding:12,display:'flex',flexWrap:'wrap',gap:12,background:'#e9dfcc',position:'relative',zIndex:100}}>
      <span>Local Reader fixture</span>
      <label>State <select aria-label="Fixture state" defaultValue={mode} onChange={e=>{mode=e.target.value;window.dispatchEvent(new Event('focus'))}}>
        {['ready','preparing','loading','service','invalid','signed_out','refunded','not_found'].map(value=><option key={value}>{value}</option>)}
      </select></label>
      <button onClick={()=>window.dispatchEvent(new Event('focus'))}>Refresh signed URLs</button>
      <button onClick={()=>setIdentity(value=>value==='reader-demo'?'reader-other':'reader-demo')}>Change identity</button>
      <output data-fixture-requests>{requestCount} reader GETs</output>
    </nav>
    {started?<OwnedBookReader creationId={identity}/>:<button onClick={()=>setStarted(true)} style={{margin:24}}>Start Reader state</button>}
  </>
}
createRoot(document.getElementById('root')!).render(<Fixture/> )
