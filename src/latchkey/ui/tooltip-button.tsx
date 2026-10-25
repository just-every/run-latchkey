import { useId, useState, type ButtonHTMLAttributes } from 'react';

export function TooltipButton({ tooltip, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tooltip: string }) {
 const id = useId(), [dismissed, setDismissed] = useState(false);
 // CSS tracks the actual hovered element even after layout or rendering changes.
 return <span className="lk-tooltip-control" data-tooltip-dismissed={dismissed || undefined} onMouseEnter={() => setDismissed(false)}>
  <button {...props} aria-describedby={!dismissed ? [props['aria-describedby'], id].filter(Boolean).join(' ') : props['aria-describedby']} onFocus={event => { setDismissed(false); props.onFocus?.(event); }} onKeyDown={event => { if (event.key === 'Escape') setDismissed(true); props.onKeyDown?.(event); }}>{children}</button>
  <span id={id} role="tooltip">{tooltip}</span>
 </span>;
}
