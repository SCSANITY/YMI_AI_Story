import assert from 'node:assert/strict'
import test from 'node:test'
import { syncShippingOrder, type ShippingSyncStore, type ShippingLease } from './order-shipping-sync'
import type { DealerSendConfig } from './dealer-send'

const lease:ShippingLease={token:'fixture-lease',trackingNumber:'TRACK1',revision:3,bindingVersion:2}
const config:DealerSendConfig={baseUrl:'https://fixture.dealer-send.com',apiKey:'x'.repeat(32),mappings:[]}
const payload={Response:{Code:200},Tracking:{TrackingNumber:'TRACK1',CarrierGuid:'carrier',TrackingEvent:[
  {LocalTime:null,CarrierApiType:'api',CarrierApiTrackingStatus:'D',CarrierApiDescription:'Delivered',CarrierApiCountryCode:'GB'}]}}
const fetcher:typeof fetch=async()=>Response.json(payload)

test('missing configuration does not claim or contact the provider',async()=>{
  const never=async()=>{throw new Error('must not run')}
  assert.deepEqual(await syncShippingOrder('order',false,null,{claim:never,finish:never},never),{skipped:true,errorCode:'not_configured'})
})

test('active leases, ineligible order stages and refresh cooldown do not fetch',async()=>{
  assert.deepEqual(await syncShippingOrder('order',true,config,{claim:async()=>null,finish:async()=>{throw new Error('must not finish')}},async()=>{throw new Error('must not fetch')}),{skipped:true})
})

test('sync commits normalized events with the exact claimed revision, never description-inferred delivery',async()=>{
  const store:ShippingSyncStore={claim:async(id,force)=>{assert.equal(id,'order');assert.equal(force,true);return lease},
    finish:async(id,claimed,events,error,delivery)=>{
      assert.equal(id,'order');assert.deepEqual(claimed,lease);assert.equal(events.length,1);assert.equal(error,null);assert.equal(delivery,null)
      return {synced:true,delivered:false}
    }}
  assert.deepEqual(await syncShippingOrder('order',true,config,store,fetcher),{synced:true,delivered:false})
})

test('verified mapping supplies a delivery candidate, but the database decides whether to transition',async()=>{
  const mapped={...config,mappings:[{carrierId:'carrier',apiType:'api',status:'D',reference:'synthetic fixture only'}]}
  const store:ShippingSyncStore={claim:async()=>lease,finish:async(_id,_lease,events,_error,delivery)=>{
    assert.deepEqual(delivery,{key:events[0].key,reference:'synthetic fixture only'});return {stale:true}
  }}
  assert.deepEqual(await syncShippingOrder('order',false,mapped,store,fetcher),{stale:true})
})

test('provider outages record only a safe failure and do not replace known events',async()=>{
  const store:ShippingSyncStore={claim:async()=>lease,finish:async(_id,_lease,events,error,delivery)=>{
    assert.deepEqual(events,[]);assert.equal(error,'provider_unavailable');assert.equal(delivery,null);return {synced:false}
  }}
  assert.deepEqual(await syncShippingOrder('order',false,config,store,async()=>{throw new Error('raw secret')}),{synced:false,errorCode:'provider_unavailable'})
})

test('database guard rejection releases the lease through a safe error-only transaction',async()=>{
  let calls=0
  const store:ShippingSyncStore={claim:async()=>lease,finish:async(_id,_lease,events,error)=>{
    if (++calls===1) throw new Error('readiness guard rejected')
    assert.deepEqual(events,[]);assert.equal(error,'database_rejected');return {synced:false}
  }}
  assert.deepEqual(await syncShippingOrder('order',false,config,store,fetcher),{synced:false,errorCode:'database_rejected'})
  assert.equal(calls,2)
})

test('a null provider event array is a successful check, not a fabricated progress event',async()=>{
  const store:ShippingSyncStore={claim:async()=>lease,finish:async(_id,_lease,events,error,delivery)=>{
    assert.deepEqual(events,[]);assert.equal(error,null);assert.equal(delivery,null);return {synced:true,delivered:false}
  }}
  assert.equal((await syncShippingOrder('order',false,config,store,async()=>Response.json({...payload,Tracking:{...payload.Tracking,TrackingEvent:null}}))).synced,true)
})
