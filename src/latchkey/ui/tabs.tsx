import { useEffect, useRef } from 'react';

// The top bar's destinations as underline tabs; a short visible label keeps the
// panel's full name as its accessible name. Where the strip is narrower than its
// tabs (phones) it scrolls sideways: it keeps the active tab in view, clear of
// the fade, and fades each edge that has more tabs past it.
const fade = 36;
export function Tabs({ tabs, current, onPick }: { tabs: [string, string, string?][]; current: string | undefined; onPick: (name: string) => void }) {
 const strip = useRef<HTMLElement>(null);
 useEffect(() => {
  const nav = strip.current; if (!nav) return;
  const mark = () => { const more = nav.scrollWidth - nav.clientWidth; nav.dataset.fade = more <= 1 ? '' : [nav.scrollLeft > 1 && 'start', nav.scrollLeft < more - 1 && 'end'].filter(Boolean).join(' '); };
  const reveal = () => {
   const active = nav.querySelector<HTMLElement>('[aria-current=page]');
   if (active && nav.scrollWidth > nav.clientWidth + 1) {
    const edge = nav.getBoundingClientRect(), tab = active.getBoundingClientRect();
    if (tab.left < edge.left + fade) nav.scrollLeft -= edge.left + fade - tab.left;
    else if (tab.right > edge.right - fade) nav.scrollLeft += tab.right - edge.right + fade;
   }
   mark();
  };
  reveal();
  const resized = new ResizeObserver(reveal); resized.observe(nav); nav.addEventListener('scroll', mark, { passive: true });
  return () => { resized.disconnect(); nav.removeEventListener('scroll', mark); };
 }, [current]);
 return <nav className="tabs" ref={strip} aria-label="Main navigation">{tabs.map(([name, label, full]) => <button type="button" key={label} aria-label={full} aria-current={label === current ? 'page' : undefined} onClick={() => onPick(name)}>{label}</button>)}</nav>;
}
