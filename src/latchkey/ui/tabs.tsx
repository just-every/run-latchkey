import { useEffect, useRef } from 'react';

// The top bar's destinations as underline tabs; a short visible label keeps the
// panel's full name as its accessible name. Where the strip is narrower than its
// tabs (phones) it scrolls sideways: it brings the active tab, and any tab that
// takes keyboard focus, wholly into view clear of the fade (with room for the
// focus ring), and fades each edge that has more tabs past it.
const fade = 36, ring = 4;
export function Tabs({ tabs, current, onPick }: { tabs: [string, string, string?][]; current: string | undefined; onPick: (name: string) => void }) {
 const strip = useRef<HTMLElement>(null);
 useEffect(() => {
  const nav = strip.current; if (!nav) return;
  const mark = () => { const more = nav.scrollWidth - nav.clientWidth; nav.dataset.fade = more <= 1 ? '' : [nav.scrollLeft > 1 && 'start', nav.scrollLeft < more - 1 && 'end'].filter(Boolean).join(' '); };
  const reveal = (tab: HTMLElement | null) => {
   if (tab && nav.scrollWidth > nav.clientWidth + 1) {
    const edge = nav.getBoundingClientRect(), box = tab.getBoundingClientRect(), room = fade + ring;
    if (box.left < edge.left + room) nav.scrollLeft -= edge.left + room - box.left;
    else if (box.right > edge.right - room) nav.scrollLeft += box.right - edge.right + room;
   }
   mark();
  };
  const active = () => reveal(nav.querySelector<HTMLElement>('[aria-current=page]'));
  // Focus scrolls the strip only as far as its edge; finish the reveal once that settles.
  const focused = (event: FocusEvent) => { const tab = event.target as HTMLElement; reveal(tab); requestAnimationFrame(() => { if (document.activeElement === tab) reveal(tab); }); };
  active();
  const resized = new ResizeObserver(() => reveal(nav.contains(document.activeElement) ? document.activeElement as HTMLElement : nav.querySelector<HTMLElement>('[aria-current=page]')));
  resized.observe(nav); nav.addEventListener('scroll', mark, { passive: true }); nav.addEventListener('focusin', focused);
  return () => { resized.disconnect(); nav.removeEventListener('scroll', mark); nav.removeEventListener('focusin', focused); };
 }, [current]);
 return <nav className="tabs" ref={strip} aria-label="Main navigation">{tabs.map(([name, label, full]) => <button type="button" key={label} aria-label={full} aria-current={label === current ? 'page' : undefined} onClick={() => onPick(name)}>{label}</button>)}</nav>;
}
