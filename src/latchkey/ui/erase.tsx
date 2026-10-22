import { useState } from 'react';
import type { ItemRecord, Task } from './types';

export function EraseItem({client,vault,row,run,onErased}:{client:any;vault:string;row:ItemRecord;run:Task;onErased:()=>Promise<void>}) {
 const [review,setReview]=useState(false),[confirmed,setConfirmed]=useState(false),[title,setTitle]=useState('');
 return <section className="section"><details open={review} onToggle={event=>setReview(event.currentTarget.open)}><summary>Permanently erase this item</summary>
 <p>Erasure deletes this item’s retained versions, attachments and current server-held sharing copies. It invalidates pending archives and restore preparations. This action cannot be undone.</p>
 <p>Material already revealed, downloaded archives and unreachable device caches remain outside this confirmation. Rotate credentials when exposure matters. A later restore needs the trusted latest erasure journal.</p>
 <form onSubmit={event=>{event.preventDefault();void run(async()=>{await client.eraseItem(vault,row.object,{confirmed:true});setConfirmed(false);setTitle('');setReview(false);await onErased()})}}>
 <label>Type the item title to confirm<input required value={title} onChange={event=>setTitle(event.target.value)}/></label>
 <label className="check"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>I understand that all retained versions and current sharing copies will be erased</label>
 <button className="danger" type="submit" disabled={!confirmed||title!==row.value.title}>Erase item permanently</button>
 </form></details></section>;
}
