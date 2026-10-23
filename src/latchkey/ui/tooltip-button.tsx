import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes } from 'react';

export function TooltipButton({ tooltip, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tooltip: string }) {
 const id = useId(), [visible, setVisible] = useState(false), timer = useRef<ReturnType<typeof setTimeout> | null>(null), focused = useRef(false);
 const cancel = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
 useEffect(() => cancel, []);
 return <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }} onMouseEnter={() => { cancel(); timer.current = setTimeout(() => setVisible(true), 300); }} onMouseLeave={() => { cancel(); if (!focused.current) setVisible(false); }}>
  <button {...props} aria-describedby={visible ? [props['aria-describedby'], id].filter(Boolean).join(' ') : props['aria-describedby']} onFocus={event => { focused.current = true; cancel(); setVisible(true); props.onFocus?.(event); }} onBlur={event => { focused.current = false; cancel(); setVisible(false); props.onBlur?.(event); }} onKeyDown={event => { if (event.key === 'Escape') { cancel(); setVisible(false); } props.onKeyDown?.(event); }}>{children}</button>
  {visible && <span id={id} role="tooltip" style={{ position: 'absolute', zIndex: 20, bottom: 'calc(100% + 6px)', right: 0, width: 'max-content', maxWidth: 180, padding: '4px 8px', background: 'var(--ink)', color: 'var(--page)', fontSize: 12, pointerEvents: 'none' }}>{tooltip}</span>}
 </span>;
}
