/** Lossless JSON transport for VND integers and timestamps. */
export function encodeAdmin(value:unknown):unknown {
  if(typeof value==="bigint")return {__ledgerType:"bigint",value:value.toString()};
  if(value instanceof Date)return {__ledgerType:"date",value:value.toISOString()};
  if(Array.isArray(value))return value.map(encodeAdmin);
  if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encodeAdmin(v)]));
  return value;
}
export function decodeAdmin<T>(value:unknown):T {
  function decode(v:unknown):unknown {
    if(Array.isArray(v))return v.map(decode);
    if(v&&typeof v==="object"){
      const record=v as Record<string,unknown>;
      if(Object.keys(record).length===2&&typeof record.value==="string"){
        if(record.__ledgerType==="bigint"&&/^-?\d+$/.test(record.value))return BigInt(record.value);
        if(record.__ledgerType==="date"&&!Number.isNaN(Date.parse(record.value)))return new Date(record.value);
      }
      return Object.fromEntries(Object.entries(record).map(([k,x])=>[k,decode(x)]));
    }
    return v;
  }
  return decode(value) as T;
}
