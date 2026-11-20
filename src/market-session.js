import {exchangeDate} from './current-quote.js';

// Expected US equity-session date, not a claim that vendor EOD prices are final.
// Regular scheduled full-session NYSE holidays. Extraordinary closures are not
// predictable here; they require an explicit calendar exception.
function iso(y,m,d){return new Date(Date.UTC(y,m-1,d)).toISOString().slice(0,10);}
function observed(y,m,d){const date=new Date(Date.UTC(y,m-1,d)),weekday=date.getUTCDay();date.setUTCDate(date.getUTCDate()+(weekday===6?-1:weekday===0?1:0));return date.toISOString().slice(0,10);}
function nthWeekday(y,m,weekday,n){const first=new Date(Date.UTC(y,m-1,1)),offset=(weekday-first.getUTCDay()+7)%7;return iso(y,m,1+offset+(n-1)*7);}
function lastWeekday(y,m,weekday){const last=new Date(Date.UTC(y,m,0)),back=(last.getUTCDay()-weekday+7)%7;return iso(y,m,last.getUTCDate()-back);}
function easter(y){const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k+7)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=1+(h+l-7*m+114)%31;return new Date(Date.UTC(y,month-1,day));}
function holidaySet(y){
 const eas=easter(y);eas.setUTCDate(eas.getUTCDate()-2);
 return new Set([observed(y,1,1),nthWeekday(y,1,1,3),nthWeekday(y,2,1,3),
 eas.toISOString().slice(0,10),lastWeekday(y,5,1),observed(y,6,19),
 observed(y,7,4),nthWeekday(y,9,1,1),nthWeekday(y,11,4,4),observed(y,12,25),
 observed(y+1,1,1)]);
}
function tradingDay(date){const day=new Date(date+'T12:00:00Z'),w=day.getUTCDay(),y=day.getUTCFullYear();return w!==0&&w!==6&&!holidaySet(y).has(date);}
function prior(date){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);}
export function expectedMarketSession(now){
 const day=exchangeDate(now),parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now));
 const hour=Number(parts.find(p=>p.type==='hour').value),minute=Number(parts.find(p=>p.type==='minute').value);
 let candidate=day;
 // Before 9:30 ET, the last *completed* session is the preceding trading day.
 // From 9:30 onward, intraday quotes for the current regular session are valid.
 if(hour*60+minute<570||!tradingDay(candidate))candidate=prior(candidate);
 while(!tradingDay(candidate))candidate=prior(candidate);
 return candidate;
}
export function quoteSessionFreshness(quoteTimestamp,now){
 const quoteDate=exchangeDate(quoteTimestamp*1000),expected=expectedMarketSession(now);
 return{quoteDate,expected,fresh:quoteDate>=expected};
}
