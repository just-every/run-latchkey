import {usageFilters} from './filters.mjs';
import {HealthClient} from '../health/client.mjs';
import {OrganizationClient} from '../collections/client.mjs';
import {reportRoute} from './service-route.mjs';
const policy='local-health-v1';
export class ReportsClient {
 constructor(client,options={}){this.client=client;this.health=new HealthClient(client,options);this.now=options.now??(()=>Date.now());}
 async source(vault,from,to,filters={}){return this.client.call(reportRoute,{vault,from,to,filters:usageFilters(filters)});}
 async inspect(vault,{network=false,days=30,filters={}}={}){
  if(![7,30,90,365].includes(days))throw Error('invalid_report_range');
  const asOf=this.now(),from=asOf-days*86400000,source=await this.source(vault,from,asOf,filters),health=await this.health.inspect(vault,{network});
  const risky=new Set(health.findings.map(f=>f.object)),unknown=new Set(health.unknown.map(f=>f.object));
  const rows=(await new OrganizationClient(this.client).load(vault)).records;
  const excluded=new Set((await this.client.call('lifecycle\u002flist',{vault})).items.filter(r=>r.state!=='active').map(r=>r.object));
  const items=rows.filter(r=>r.value.schema==='latchkey/item/v1'&&!excluded.has(r.object)).map(r=>({object:r.object,version:r.version,status:risky.has(r.object)?'risk':unknown.has(r.object)?'unknown':'clear',findings:health.findings.filter(f=>f.object===r.object).map(f=>({code:f.code,source:f.source,suppressed:!!f.suppression,remediation:'Not verified; a fresh observation is required.'})),unknown:health.unknown.filter(f=>f.object===r.object).map(f=>f.coverage)}));
  const clear=items.filter(r=>r.status==='clear').length;
  await this.health.validate(vault,source.revision);
  return {schema:'latchkey-report-v1',...source,policyVersion:policy,observedAt:health.observedAt,days,denominator:items.length,risky:risky.size,unknown:unknown.size,clear,score:items.length?Math.floor(100*clear/items.length):null,items,usage:aggregate(source.events.filter(f=>items.some(r=>r.object===f.item))),coverage:[...source.coverage,health.coverage,'Only current active permitted items; private and family vaults excluded. No retained daily or monthly trend source.']};
 }
 async validate(report){await this.source(report.vault,report.from,report.asOf,report.filters);await this.health.validate(report.vault,report.revision);}
 async saveView(vault,name,days,filters={}){const criteria=usageFilters(filters);if(![7,30,90,365].includes(days))throw Error('invalid_report_range');await this.source(vault,this.now()-days*86400000,this.now());if(typeof name!=='string'||!name.trim()||name.length>100)throw Error('invalid_report_name');return this.client.put(vault,{schema:'latchkey\u002freport-view\u002fv1',name:name.trim(),days,filters:criteria});}
 async views(vault){await this.source(vault,0,this.now());return (await new OrganizationClient(this.client).load(vault)).records.filter(r=>r.value.schema==='latchkey\u002freport-view\u002fv1');}
 async export(report,format){await this.validate(report);if(format==='csv')return reportCsv(report);if(format==='pdf')return reportPdf(report);throw Error('invalid_report_format');}
}
function aggregate(events){const rows=new Map();for(const f of events){if(!f.item)continue;const key=JSON.stringify([f.actor,f.item,f.action]),row=rows.get(key)??{actor:f.actor,item:f.item,action:f.action,count:0,lastAccess:0,maxReceiptDelay:0};row.count++;row.lastAccess=Math.max(row.lastAccess,f.time);row.maxReceiptDelay=Math.max(row.maxReceiptDelay,f.receiptTime-f.time);rows.set(key,row);}return [...rows.values()];}
const cell=value=>'"'+String(value??'').replaceAll('"','""').replace(/^[=+@-]/,"'$&")+'"';
const rows=report=>[
 ...Object.entries(report.filters??{}).map(([key,value])=>['usage filter '+key,value]),
 ['vault',report.vault],['asOf',report.asOf],['from',report.from],['policyVersion',report.policyVersion],['observedAt',report.observedAt],['denominator',report.denominator],['risky',report.risky],['unknown',report.unknown],['clear',report.clear],['confirmedClearPercent',report.score],
 ...Object.entries(report.adoption).filter(([key])=>key!=='company').map(([k,v])=>['adoption '+k,v??'unknown']),...Object.entries(report.adoption.company??{}).map(([k,v])=>['company '+k,v]),
 ...report.coverage.map(c=>['coverage',c]),...report.items.map(r=>['item',r.object,r.version,r.status,r.findings.map(f=>f.code+(f.suppressed?' (suppressed; risk retained)':'')).join('; '),r.unknown.join('; ')]),...report.usage.map(r=>['usage',r.actor,r.item,r.action,r.count,r.lastAccess,r.maxReceiptDelay])];
export const reportCsv=report=>rows(report).map(row=>row.map(cell).join(',')).join('\r\n');
// Small text PDF with a real page tree, byte offsets and a cross-reference table.
export function reportPdf(report){
 const lines=rows(report).flatMap(row=>row.join(' | ').replace(/[^\x20-\x7e]/g,'?').match(/.{1,92}/g)??['']);
 const pages=[];for(let i=0;i<lines.length;i+=48)pages.push(lines.slice(i,i+48));
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 pages.forEach((page,i)=>{const stream='BT /F1 10 Tf 36 800 Td 14 TL '+page.map((line,j)=>(j?'T* ':'')+'('+line.replace(/[\\()]/g,'\\$&')+') Tj').join('\n')+' ET';objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5+i*2} 0 R >>`,`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);});
 objects[1]=`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,i)=>`${4+i*2} 0 R`).join(' ')}] >>`;
 let pdf='%PDF-1.4\n',offsets=[0];objects.forEach((o,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${o}\nendobj\n`;});const start=pdf.length;pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;return pdf;
}
