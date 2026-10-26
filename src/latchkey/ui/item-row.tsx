import type { Item, ItemRecord } from './types';
import { Icon } from './icon';
import { hasValue, typeLabel } from './labels';

// One vault item as a table row: its tile, the title over its website host (or
// its kind, for anything but a login), the username, what is true of it now
// (sharing, codes, files, versions, labels, tags) and when it changed.
export function ItemRow({ row, links, open, onOpen }: { row: ItemRecord; links: number; open: boolean; onOpen: () => void }) {
 const item = row.value, site = siteOf(item), facts = factsOf(row, links), time = item.change?.time;
 return <button className={`item${open ? ' selected' : ''}`} aria-label={`${item.title} ${summary(item)}`} onClick={onOpen} aria-current={open ? 'true' : undefined}>
  <span className="cell name"><Tile item={item}/><span className="name-text"><span className="item-title">{item.title}</span>{site ? <span className="item-sub">{breakable(site)}</span> : item.type !== 'login' && <span className="item-sub">{typeLabel(item.type)}</span>}</span></span>
  <span className="cell user">{breakable(username(item) ?? '—')}</span>
  <span className={`cell state${facts.length ? '' : ' none'}`}>{facts.length ? <span className="facts">{facts.map((fact, i) => <span key={i}>{fact}</span>)}</span> : '—'}</span>
  <span className="cell changed">{time ? <time dateTime={time} title={new Date(time).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}>{changed(new Date(time))}</time> : '—'}</span>
  <Icon name="chevron" className="chevron"/>
 </button>;
}

export const ItemsHead = () => <div className="items-head" aria-hidden="true"><span>Name</span><span>Username</span><span>Details</span><span>Changed</span></div>;

// Long hosts and addresses may wrap after a dot or before the @, not mid-word.
const breakable = (text: string) => text.split(/(?<=\.)|(?=@)/).flatMap((part, i) => i ? [<wbr key={i}/>, part] : [part]);
const username = (item: Item) => item.fields.find(field => !field.secret && ['username', 'email', 'accountHolder', 'description'].includes(field.id))?.value as string | undefined;
const summary = (item: Item) => String(username(item) ?? item.type.replaceAll('-', ' '));
// The first rule a browser fills from, else the app it opens.
function siteOf(item: Item) {
 const rule = item.urls.find(rule => !['never-fill', 'native-app'].includes(rule.match) && rule.url) ?? item.urls.find(rule => rule.match === 'native-app');
 return rule ? rule.url ? new URL(rule.url).host : rule.appId : '';
}
// Each fact keeps its words together, so a wrapped line never ends on its separator.
function factsOf(row: ItemRecord, links: number) {
 const item = row.value, has = (type: string) => item.fields.some(field => field.type === type && hasValue(field)), files = item.attachments.length;
 return [item.favorite && 'Favorite', links > 0 && `Shared · ${links === 1 ? '1 link' : `${links} links`}`, has('otp') && 'One-time code', has('passkey') && 'Passkey', files > 0 && `${files} ${files === 1 ? 'attachment' : 'attachments'}`, row.version > 1 && `${row.version} versions`, ...item.labels, ...item.tags.map(tag => `#${tag}`)].filter(Boolean) as string[];
}
// The time for a change made today ("5:02 pm"), otherwise its date.
function changed(at: Date) {
 const now = new Date();
 if (at.toDateString() === now.toDateString()) return at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
 return at.toLocaleDateString('en-US', at.getFullYear() === now.getFullYear() ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}
function Tile({ item }: { item: Item }) { return item.type === 'login' ? <span className="tile" aria-hidden="true">{item.title.trim().charAt(0).toUpperCase() || '·'}</span> : <span className="tile quiet" aria-hidden="true"><Icon name={item.type === 'card' ? 'card' : 'file'}/></span>; }
