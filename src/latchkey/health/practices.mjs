// Inspect stored public keys only. A public-key format does not prove the
// algorithms a server accepts, private-key protection or provider rotation.
function sshKey(publicKey) {
 if(typeof publicKey!=='string')return null;
 const match=/^(ssh-rsa|ssh-dss|ssh-ed25519) ([A-Za-z0-9+/]+={0,2})(?:\s.*)?$/.exec(publicKey.trim());
 if(!match)return null;
 try {
  const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));
  let offset=0;
  const field=()=>{
   if(offset+4>bytes.length)throw Error();
   const size=new DataView(bytes.buffer).getUint32(offset);offset+=4;
   if(!size||offset+size>bytes.length)throw Error();
   const value=bytes.slice(offset,offset+size);offset+=size;return value;
  };
  const type=new TextDecoder().decode(field());if(type!==match[1])return null;
  if(type==='ssh-ed25519'){if(field().length!==32||offset!==bytes.length)return null;return {type};}
  if(type==='ssh-dss'){for(let i=0;i<4;i++)field();if(offset!==bytes.length)return null;return {type};}
  const exponent=field(),modulus=field();
  if(offset!==bytes.length||exponent[0]&128||modulus[0]&128)return null;
  const start=modulus.findIndex(n=>n!==0);if(start<0)return null;
  const bits=(modulus.length-start-1)*8+32-Math.clz32(modulus[start]);
  return {type,bits};
 }catch{return null;}
}

export function localPractices(rows) {
 const findings=[],unknown=[],tokens=new Map();
 for(const row of rows){
  const item=row.value,get=id=>item.fields?.find(field=>field.id===id)?.value;
  if(item.type==='ssh-key'){
   const key=sshKey(get('publicKey'));
   if(key?.type==='ssh-dss')findings.push({row,code:'outdated-ssh-key',source:'Stored SSH public key',detail:'DSA is obsolete. Replace this key at each authorized destination, verify access, then retire the old key.'});
   else if(key?.type==='ssh-rsa'&&key.bits<2048)findings.push({row,code:'outdated-ssh-key',source:'Stored SSH public key',detail:`The stored RSA key has ${key.bits} bits, below the 2048-bit minimum. Replace it at each authorized destination and verify access before retiring it.`});
   if(!key)unknown.push({object:row.object,coverage:'SSH public key missing, malformed or unsupported; key strength unknown'});
   unknown.push({object:row.object,coverage:'SSH server algorithms, private-key protection and provider replacement unverified'});
  }
  if(item.type==='api-credential'){
   const token=get('token');
   if(typeof token==='string'&&token){const group=tokens.get(token)??[];group.push(row);tokens.set(token,group);}
   unknown.push({object:row.object,coverage:'Provider secret scopes, expiry and rotation unverified'});
  }
 }
 for(const group of tokens.values())if(group.length>1)for(const row of group)findings.push({row,code:'reused-secret',source:'Local comparison of permitted active API credentials',detail:'The same token is stored in multiple items. Review whether these are intentional references; separate credentials require provider-confirmed issuance and consumer verification.',related:group.filter(other=>other.object!==row.object).map(other=>({object:other.object,title:other.value.title}))});
 return {findings,unknown};
}
