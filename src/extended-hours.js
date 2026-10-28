// Standard US equity session in exchange time; DST follows New York/Pacific.
export function marketSession(time) {
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(time));
 if(['Sat','Sun'].includes(parts.find(p=>p.type==='weekday').value)) return 'closed';
 const minute=Number(parts.find(p=>p.type==='hour').value)*60+Number(parts.find(p=>p.type==='minute').value);
 return minute<570?'pre-market':minute<960?'regular':'after-hours';
}
export function extendedTrade(payload,symbol,now) {
 const q=Array.isArray(payload)&&payload.length===1?payload[0]:null;
 if(q?.symbol!==symbol||!Number.isFinite(q.price)||q.price<=0||!Number.isInteger(q.timestamp))return null;
 // FMP aftermarket trade timestamps are milliseconds, unlike regular quotes.
 const time=q.timestamp;
 if(time<946684800000||time>now+60000)return null;
 const date=t=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));
 const session=marketSession(now);
 if(!['pre-market','after-hours'].includes(session)||marketSession(time)!==session||date(time)!==date(now))return null;
 return {price:q.price,asOf:new Date(time).toISOString(),session};
}