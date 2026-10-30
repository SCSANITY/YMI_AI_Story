import vm from 'node:vm'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
const root=new URL('../../',import.meta.url)
export function loadUi(file,stubs={},globals={}) {
 const cache=new Map()
 const load=file=>{
  if(cache.has(file))return cache.get(file)
  const mod={exports:{}};cache.set(file,mod.exports)
  const jsx=(type,props)=>typeof type==='function'?type(props):({type,props})
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(file,root),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{
   module:mod,exports:mod.exports,AbortController,Request,Response,console,...globals,
   require(name){
    if(name in stubs)return stubs[name]
    if(name==='node:async_hooks')return {AsyncLocalStorage:class {getStore(){return undefined}run(_context,callback){return callback()}}}
    if(name==='node:crypto')return {randomUUID:()=> 'fixture-instance'}
    if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'fragment'}
    if(name==='react')return {memo:fn=>fn}
    if(name==='next/image')return {default:'img',__esModule:true}
    if(name==='next/dynamic')return {default:()=> 'LazyComponent',__esModule:true}
    if(name==='lucide-react')return new Proxy({},{get:(_,key)=>key})
    if(name.endsWith('.css'))return {default:new Proxy({},{get:(_,key)=>key}),__esModule:true}
    let base=name.startsWith('@/')?name.replace('@/','').replace(/^lib\//,'src/lib/'):path.posix.join(path.posix.dirname(file),name)
    const target=[base,base+'.ts',base+'.tsx'].find(p=>fs.existsSync(new URL(p,root)))
    if(target)return load(target)
    throw Error('Unmocked import '+name+' from '+file)
   }
  })
  return mod.exports
 }
 return load(file)
}
export const uiNodes=node=>!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(uiNodes)]
export const uiText=node=>node==null?'':typeof node!=='object'?String(node):[node.props?.children].flat(Infinity).map(uiText).join('')

// Runs the real hook body with retained state/refs and dependency-scoped effects.
export function hookHarness(file,exportName,{reduced=false,globals={}}={}) {
 const cells=[],effects=[],refs=[],callbacks=[];let cursor=0,dirty=false,args=[],output
 const react={
  useState(initial){const i=cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return[cells[i],value=>{cells[i]=typeof value==='function'?value(cells[i]):value;dirty=true}]},
  useRef(initial){const i=cursor++;return refs[i]??=( {current:initial} )},
  useCallback(fn,deps){const i=cursor++,old=callbacks[i];if(!old||deps.some((d,n)=>d!==old.deps[n]))callbacks[i]={fn,deps};return callbacks[i].fn},
  useEffect(fn,deps){const i=cursor++,old=effects[i];if(!old||deps.some((d,n)=>d!==old.deps[n]))effects[i]={deps,fn,cleanup:old?.cleanup,pending:true}},
 }
 react.useLayoutEffect=react.useEffect
 const hook=loadUi(file,{react,'framer-motion':{useReducedMotion:()=>reduced}},globals)[exportName]
 const render=(...next)=>{if(next.length)args=next;let count=0;do{dirty=false;cursor=0;output=hook(...args);if(++count>20)throw Error('Render loop')}while(dirty);for(const e of effects)if(e?.pending){e.pending=false;e.cleanup?.();e.cleanup=e.fn()}return output}
 return{render,unmount:()=>effects.forEach(e=>e?.cleanup?.())}
}
