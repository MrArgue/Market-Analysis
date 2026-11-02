import {VERSION} from './macro-model.js';
export const macroSnapshotKey=VERSION+':reviewed-inputs';
// Read only. No provider calls, writes, new schema or implicit ingestion.
export async function handleMacro(request,env={}) {
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 if(request.method!=='GET')return new Response('Method Not Allowed',{status:405,headers:{...headers,Allow:'GET'}});
 try {
  const row=await env.DB?.prepare('SELECT payload FROM market_history_cache WHERE cache_key=?').bind(macroSnapshotKey).first();
  if(!row?.payload || row.payload.length>5000000)throw Error();
  const input=JSON.parse(row.payload);
  if(input.version!==VERSION || input.provenance?.reviewed!==true || !Array.isArray(input.vintages)||!Array.isArray(input.cutoffs)||!input.returns)throw Error();
  // Only explicitly reviewed research input files belong in this namespace.
  return Response.json({version:input.version,provenance:input.provenance,vintages:input.vintages,cutoffs:input.cutoffs,returns:input.returns},{headers});
 }catch{return Response.json({status:'unavailable',reason:'No reviewed macro research snapshot is available.'},{status:503,headers});}
}
