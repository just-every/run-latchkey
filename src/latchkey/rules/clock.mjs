// Calendar controls use UTC quarter boundaries, independent of local DST.
export function quarterBoundary(time) {
 const date=new Date(time);
 return Number.isFinite(date.getTime())&&date.getUTCMonth()%3===0&&date.getUTCDate()===1&&date.getUTCHours()===0&&date.getUTCMinutes()===0&&date.getUTCSeconds()===0&&date.getUTCMilliseconds()===0;
}
export function scheduleSlot(value,now) {
 if(value.recurrence!=='calendar-quarter'){
  const slot=Math.floor((now-value.startAt)/value.intervalMs);
  return {slot,startAt:value.startAt+slot*value.intervalMs};
 }
 const start=new Date(value.startAt),date=new Date(now);
 const slot=(date.getUTCFullYear()-start.getUTCFullYear())*4+Math.floor(date.getUTCMonth()/3)-Math.floor(start.getUTCMonth()/3);
 const boundary=new Date(value.startAt);boundary.setUTCMonth(start.getUTCMonth()+slot*3);
 return {slot,startAt:boundary.getTime()};
}
