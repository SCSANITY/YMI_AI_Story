import assert from 'node:assert/strict'
import test from 'node:test'
import { DealerSendError, fetchDealerSendTracking, parseDealerSendTracking, readDealerSendConfig, verifiedDelivery } from './dealer-send'

const env={DEALER_SEND_SYNC_ENABLED:'true',DEALER_SEND_API_BASE_URL:'https://fixture.dealer-send.com',DEALER_SEND_API_KEY:'x'.repeat(32)}
const config=readDealerSendConfig(env)!
const event={LocalTime:'2026-09-16T08:00:00',CarrierApiType:'fixture-api',CarrierApiCountryCode:'gb',CarrierApiTrackingStatus:'D',CarrierApiDescription:'At destination'}
function payload(events:unknown= [event]) { return {Response:{Code:200,Message:'OK'},Tracking:{TrackingNumber:'TRACK1',CarrierGuid:'fixture-carrier',TrackingEvent:events}} }
const mapping={carrierId:'fixture-carrier',apiType:'fixture-api',status:'D',reference:'Synthetic test mapping, NOT a production mapping'}

test('sync is disabled by default and rejects untrusted hosts and credential-bearing origins',()=>{
  assert.equal(readDealerSendConfig({...env,DEALER_SEND_SYNC_ENABLED:undefined}),null)
  assert.deepEqual(config.mappings,[])
  for (const host of ['http://fixture.dealer-send.com','https://dealer-send.com.evil.test','https://127.0.0.1',
    'https://user:secret@fixture.dealer-send.com','https://fixture.dealer-send.com/api','https://fixture.dealer-send.com/?token=x','https://fixture.dealer-send.com:1234']) {
    assert.equal(readDealerSendConfig({...env,DEALER_SEND_API_BASE_URL:host}),null)
  }
  assert.equal(readDealerSendConfig({...env,DEALER_SEND_API_KEY:'short'}),null)
})

test('delivery configuration is bounded, exact and requires an evidence reference',()=>{
  assert.deepEqual(readDealerSendConfig({...env,DEALER_SEND_DELIVERED_CODES_JSON:JSON.stringify([mapping])})?.mappings,[mapping])
  for (const value of ['invalid','{}',JSON.stringify([{...mapping,reference:''}]),JSON.stringify(Array(31).fill(mapping))]) {
    assert.equal(readDealerSendConfig({...env,DEALER_SEND_DELIVERED_CODES_JSON:value}),null)
  }
})

test('nullable/empty provider events are valid and repeated records are deduplicated',()=>{
  assert.deepEqual(parseDealerSendTracking(payload(null),'TRACK1'),[])
  assert.deepEqual(parseDealerSendTracking(payload([]),'TRACK1'),[])
  const events=parseDealerSendTracking(payload([event,event]),'TRACK1')
  assert.equal(events.length,1)
  assert.equal(events[0].country,'GB')
  assert.equal(events[0].time,event.LocalTime) // do not invent a timezone
  assert.match(events[0].key,/^[a-f0-9]{64}$/)
  const nullable=parseDealerSendTracking(payload([{LocalTime:null,CarrierApiType:null,CarrierApiCountryCode:null,CarrierApiTrackingStatus:null,CarrierApiDescription:null}]),'TRACK1')
  assert.equal(nullable[0].description,'Carrier update received')
  assert.equal(verifiedDelivery(nullable,[mapping]),null)
})

test('mismatched tracking numbers, missing schema, oversized text and oversized arrays fail closed',()=>{
  for (const value of [{}, {...payload(),Tracking:{...payload().Tracking,TrackingNumber:'OTHER'}},
    {...payload(),Tracking:{TrackingNumber:'TRACK1',CarrierGuid:'fixture-carrier'}},payload(Array(201).fill(event)),
    payload([{...event,CarrierApiDescription:'x'.repeat(501)}])]) {
    assert.throws(()=>parseDealerSendTracking(value,'TRACK1'),DealerSendError)
  }
})

test('delivery never follows English descriptions or another carrier/api/status mapping',()=>{
  const events=parseDealerSendTracking(payload([{...event,CarrierApiTrackingStatus:'P',CarrierApiDescription:'Not delivered; delivery attempted'}]),'TRACK1')
  assert.equal(verifiedDelivery(events,[mapping]),null)
  const delivered=parseDealerSendTracking(payload(),'TRACK1')
  assert.equal(verifiedDelivery(delivered,[]),null)
  for (const wrong of [{...mapping,carrierId:'other'},{...mapping,apiType:'other'},{...mapping,status:'d'}]) assert.equal(verifiedDelivery(delivered,[wrong]),null)
  assert.deepEqual(verifiedDelivery(delivered,[mapping]),{key:delivered[0].key,reference:mapping.reference})
})

test('provider requests are bounded, private, non-redirecting and use the documented detail route',async()=>{
  let calls=0
  const fetcher:typeof fetch=async(input,options)=>{
    calls++
    const url=new URL(String(input))
    assert.equal(url.pathname,'/api/Portalapi/GetTrackingDetails')
    assert.equal(url.searchParams.get('TrackingNumber'),'TRACK1')
    assert.equal(options?.cache,'no-store');assert.equal(options?.redirect,'error')
    assert.ok(options?.signal)
    return Response.json(payload())
  }
  assert.equal((await fetchDealerSendTracking(config,'TRACK1',fetcher)).length,1)
  await assert.rejects(()=>fetchDealerSendTracking(config,'unsafe&key=x',fetcher),DealerSendError)
  assert.equal(calls,1)
})

test('raw network exceptions, provider messages and credential URLs never escape',async()=>{
  for (const fetcher of [async()=>{throw new Error(`secret URL ApiKey=${config.apiKey}`)},async()=>Response.json({...payload(),Response:{Code:403,Message:config.apiKey}})]) {
    await assert.rejects(()=>fetchDealerSendTracking(config,'TRACK1',fetcher),error=>error instanceof DealerSendError && error.message==='provider_unavailable' && !JSON.stringify(error).includes(config.apiKey))
  }
})

test('malformed JSON and streamed oversized bodies are rejected without storing raw payload',async()=>{
  for (const body of ['not json','x'.repeat(256001)]) {
    await assert.rejects(()=>fetchDealerSendTracking(config,'TRACK1',async()=>new Response(body)),error=>error instanceof DealerSendError && error.code==='invalid_response')
  }
})
