const actions=['view','reveal','copy','fill','history','attachment','edit','grant','rotate','export'];
// Usage criteria narrow retained events only; posture keeps its full denominator.
export function usageFilters(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['actor','item','action'].includes(key)))throw Error('invalid_report_filter');
 const result={};
 for(const key of ['actor','item'])if(value[key]!==undefined){if(typeof value[key]!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value[key]))throw Error('invalid_report_filter');result[key]=value[key];}
 if(value.action!==undefined){if(!actions.includes(value.action))throw Error('invalid_report_filter');result.action=value.action;}
 return result;
}
