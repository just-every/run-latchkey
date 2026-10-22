import { fieldTypes } from './runtime.mjs';
import { useState } from 'react';
import type { Field } from './types';

export const complex = (type: string) => ['json', 'otp', 'passkey'].includes(type);
export function FieldValue({ field, onChange }: { field: Field; onChange: (value: any) => void }) {
 const [shown, setShown] = useState(false);
 const id = `edit-${field.id}`;
 if (field.type === 'boolean') return <label className="check"><input id={id} type="checkbox" checked={field.value === true} onChange={e => onChange(e.target.checked)}/>{field.label}</label>;
 const value = complex(field.type) && typeof field.value === 'object' && field.value != null ? JSON.stringify(field.value, null, 2) : field.value ?? '';
 return <div><label htmlFor={id}>{field.label}{field.required ? ' *' : ''}{field.secret && <span className="muted">Sensitive field</span>}
  {field.type === 'multiline' || complex(field.type) ? field.secret && !shown ? <input id={id} type="password" readOnly value={value ? '••••••••••••' : ''} placeholder="Reveal to edit"/> : <textarea id={id} required={field.required} value={value} onChange={e => onChange(e.target.value)} rows={complex(field.type) ? 4 : 3} spellCheck={false}/> : <input id={id} required={field.required} type={field.secret && !shown ? 'password' : ['number', 'date', 'email', 'url'].includes(field.type) ? field.type : 'text'} value={value} autoComplete="off" onChange={e => onChange(field.type === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value)}/>}
 </label>{field.secret && <button type="button" className="field-toggle" onClick={() => setShown(!shown)}>{shown ? 'Hide' : 'Reveal to edit'} {field.label}</button>}</div>;
}
export function DefinitionEditor({ field, onChange }: { field: Field; onChange: (field: Field) => void }) {
 return <div className="form-grid definition"><label>Field ID<input required value={field.id} onChange={e => onChange({ ...field, id: e.target.value })}/></label><label>Label<input required value={field.label} onChange={e => onChange({ ...field, label: e.target.value })}/></label><label>Field type<select value={field.type} onChange={e => { const type = e.target.value; onChange({ ...field, type, secret: ['secret', 'otp', 'passkey'].includes(type) || field.secret, value: undefined }); }}>{fieldTypes.map(type => <option key={type}>{type}</option>)}</select></label><label className="check"><input type="checkbox" checked={field.secret} disabled={['secret', 'otp', 'passkey'].includes(field.type)} onChange={e => onChange({ ...field, secret: e.target.checked })}/>Sensitive</label><label className="check"><input type="checkbox" checked={field.required ?? false} onChange={e => onChange({ ...field, required: e.target.checked })}/>Required</label></div>;
}
