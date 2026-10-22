const paths: Record<string, React.ReactNode> = {
 file: <path d="M5 2h9l5 5v15H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2ZM13 2v6h6"/>,
 search: <><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></>,
 chevron: <path d="m9 5 6 7-6 7"/>, plus: <path d="M12 4v16M4 12h16"/>,
 copy: <><rect x="8" y="4" width="12" height="15" rx="2"/><path d="M15 19v2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/></>,
 edit: <path d="m4 16 12-12a2 2 0 0 1 4 4L8 20l-5 1Zm10-10 4 4"/>,
 eye: <><path d="M2 12c5-9 15-9 20 0-5 9-15 9-20 0"/><circle cx="12" cy="12" r="3"/></>,
 download: <path d="M12 3v13m-5-5 5 5 5-5M4 16v5h16v-5"/>,
 card: <><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 9h20M6 15h4"/></>,
};
export function Icon({ name, className = '' }: { name: string; className?: string }) { return <svg className={className} viewBox="0 0 24 24" aria-hidden="true">{paths[name] ?? paths.file}</svg>; }
