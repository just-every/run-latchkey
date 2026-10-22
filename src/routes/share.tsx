import { createFileRoute } from '@tanstack/react-router';
import { SharedRecipient } from '../latchkey/sharing/recipient';
export const Route=createFileRoute('/share')({head:()=>({meta:[{title:'Private shared item · Latchkey'},{name:'referrer',content:'no-referrer'},{name:'robots',content:'noindex,nofollow'}]}),component:SharedRecipient});
