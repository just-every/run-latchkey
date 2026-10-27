// Pure projections of retained observations. Missing dates never become data.
export const dayMs=86400000;
export const utcDay=time=>new Date(time).toISOString().slice(0,10);
export const reportKeyContext=(tenant,vault,owner)=>({tenant,vault,object:owner,purpose:'report-key',epoch:1,version:1});
export const observationContext=(tenant,vault,object)=>({tenant,vault,object,purpose:'report-history',epoch:1,version:1});
export function observation(report){
 const {asOf,observedAt,revision,policyVersion,denominator,risky,unknown,clear,score,adoption,coverage}=report;
 return {schema:'latchkey-report-observation-v1',asOf,observedAt,revision,policyVersion,
  scoringPolicy:{id:policyVersion,measure:'Confirmed clear share',calculation:'floor(100 * clear / denominator)',unknown:'Included in denominator; never clear',empty:'Unknown'},
  denominator,risky,unknown,clear,score,adoption,coverage};
}
export function retainedHistory(observations,asOf,days=365){
 if(![7,30,90,365].includes(days))throw Error('invalid_report_range');
 const end=Date.parse(utcDay(asOf)),byDay=new Map(observations.filter(o=>o.asOf<=asOf).map(o=>[utcDay(o.asOf),o]));
 const daily=Array.from({length:days},(_,i)=>{const day=utcDay(end-(days-1-i)*dayMs);return {day,observation:byDay.get(day)??null};});
 const groups=new Map();
 for(const o of byDay.values()){
  const month=utcDay(o.asOf).slice(0,7),key=JSON.stringify([month,o.policyVersion]),g=groups.get(key)??{month,policyVersion:o.policyVersion,observedDays:0,scores:[],denominators:[],enrolled:[],active:[],devices:[],coverage:[]};
  g.observedDays++;if(o.score!==null)g.scores.push(o.score);g.denominators.push(o.denominator);g.enrolled.push(o.adoption.enrolled);g.active.push(o.adoption.active);g.devices.push(o.adoption.devices);g.coverage=[...new Set([...g.coverage,...o.coverage])];groups.set(key,g);
 }
 // Empty calendar months remain explicit gaps, including after erasure.
 if(byDay.size){
  const firstMonth=[...byDay.keys()].sort()[0].slice(0,7),cursor=new Date(firstMonth+'-01T00:00:00Z');
  while(+cursor<=end){const month=utcDay(+cursor).slice(0,7);if(![...groups.values()].some(g=>g.month===month))groups.set(month,{month,policyVersion:null,observedDays:0,scores:[],denominators:[],enrolled:[],active:[],devices:[],coverage:['No retained observations in this month']});cursor.setUTCMonth(cursor.getUTCMonth()+1);}
 }
 const mean=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
 const monthly=[...groups.values()].sort((a,b)=>a.month.localeCompare(b.month)||String(a.policyVersion).localeCompare(String(b.policyVersion))).map(g=>{
  const start=Date.parse(g.month+'-01'),next=new Date(start);next.setUTCMonth(next.getUTCMonth()+1);
  const expectedDays=Math.floor((Math.min(+next,end+dayMs)-start)/dayMs);
  return {month:g.month,policyVersion:g.policyVersion,observedDays:g.observedDays,expectedDays,missingDays:expectedDays-g.observedDays,scoredDays:g.scores.length,meanScore:mean(g.scores),meanDenominator:mean(g.denominators),meanEnrolled:mean(g.enrolled),meanActive:mean(g.active),meanDevices:mean(g.devices),coverage:g.coverage};
 });
 const current=byDay.get(utcDay(asOf))??null;
 const today=new Date(end),year=today.getUTCFullYear()-1,month=today.getUTCMonth();
 const previousYear=Date.UTC(year,month,Math.min(today.getUTCDate(),new Date(Date.UTC(year,month+1,0)).getUTCDate()));
 const comparisons=[...([7,30,90].map(n=>({range:n+' days',day:utcDay(end-n*dayMs)}))),{range:'12 months',day:utcDay(+previousYear)}].map(({range,day})=>{
  const baseline=byDay.get(day)??null,comparable=!!current&&!!baseline&&current.policyVersion===baseline.policyVersion&&current.score!==null&&baseline.score!==null;
  return {range,day,current,baseline,scoreDelta:comparable?current.score-baseline.score:null,reason:!current||!baseline?'Missing dated observation':!comparable?'Policy boundary or unknown score':'Same policy; observed scores only'};
 });
 return {asOf,days,daily,monthly,comparisons,observations:[...byDay.values()].sort((a,b)=>a.asOf-b.asOf)};
}
