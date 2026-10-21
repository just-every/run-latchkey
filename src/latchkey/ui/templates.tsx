import { useState } from 'react';
import { importKeeperTemplate } from './runtime.mjs';
import { DefinitionEditor } from './field-editor';
import type { Field, Task } from './types';

export function Templates({ templates, typed, vault, run, onSaved, onClose }: { templates: any[]; typed: any; vault: string; run: Task; onSaved: () => Promise<void>; onClose: () => void }) {
 const [object, setObject] = useState(''), [name, setName] = useState(''), [fields, setFields] = useState<Field[]>([]), [source, setSource] = useState<any>(undefined);
 function select(id: string) { const template = templates.find(t => t.object === id)?.value; setObject(id); setName(template?.name ?? ''); setFields(structuredClone(template?.fields ?? [])); setSource(template?.source); }
 return <section className="detail"><header className="detail-header"><div className="title"><h1>Custom templates</h1><p className="subtitle">Existing items retain the template and values they were saved with.</p></div><button onClick={onClose}>Close</button></header><form onSubmit={e => { e.preventDefault(); void run(async () => { await typed.saveTemplate(vault, { name, fields, ...(source ? { source } : {}) }, object || undefined); await onSaved(); select(''); }); }}><div className="section">
  <label>Choose a template<select value={object} onChange={e => select(e.target.value)}><option value="">Create a new template</option>{templates.map(t => <option key={t.object} value={t.object}>{t.value.name}</option>)}</select></label>
  <label>Template name<input required maxLength={200} value={name} onChange={e => setName(e.target.value)}/></label>
  {fields.map((field, i) => <div className="edit-field" key={i}><DefinitionEditor field={field} onChange={value => setFields(fields.map((f, index) => i === index ? value : f))}/><button type="button" onClick={() => setFields(fields.filter((_, index) => i !== index))}>Remove field</button></div>)}
  <button type="button" onClick={() => setFields([...fields, { id: `field-${crypto.randomUUID()}`, label: 'New field', type: 'text', secret: false }])}>Add field</button>
  <label className="file-upload">Import Keeper record type JSON<input type="file" accept=".json,application/json" onChange={e => { const file = e.target.files?.[0]; if (file) void run(async () => { if (file.size > 1000000) throw { code: 'template_too_large' }; const template = importKeeperTemplate(await file.text()); setObject(''); setName(template.name); setFields(template.fields); setSource(template.source); }); e.target.value = ''; }}/></label>
  <p className="muted">Changing a field’s type or sensitivity requires a new field ID. Saved records keep their original values and definitions.</p><button className="primary" type="submit">Save template</button>
 </div></form></section>;
}
