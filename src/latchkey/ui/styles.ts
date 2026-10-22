// The app's stylesheet in the design desk's approved app look: one slim top bar,
// a centred column, hairline tables and square controls, tangerine only on the
// active tab and primary buttons. Every colour and face is a --rer-* token from
// public/rer-theme.css; the greys mix the ink into the page.
export const vaultCss = `
body:has(.lk){padding:0;background:var(--rer-page,#fff)}
.lk{--ink:var(--rer-text,#000);--page:var(--rer-page,#fff);--muted:var(--rer-muted,#4d4d4d);--accent:var(--rer-accent,#fd6415);--accent-ink:var(--rer-accent-text,#000);--control:var(--rer-border,#8c8c8c);--rule:color-mix(in srgb,var(--ink) 11%,var(--page));--edge:color-mix(in srgb,var(--ink) 30%,var(--page));--tint:color-mix(in srgb,var(--ink) 3.5%,var(--page));--hover:color-mix(in srgb,var(--ink) 6%,var(--page));--ring:color-mix(in srgb,var(--accent) 35%,transparent);--ok:#157f3c;--danger:#b42318;--heading:var(--rer-font-heading,Geist,'Helvetica Neue',Arial,sans-serif);color:var(--ink);background:var(--page);font:15px/1.5 var(--rer-font-body,system-ui,sans-serif);min-height:100vh;-webkit-font-smoothing:antialiased}
.lk *{box-sizing:border-box}.lk svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
.lk h1{font:800 32px/1.12 var(--heading);letter-spacing:-.025em;margin:0 0 12px;text-wrap:balance}.lk h2{font-size:16px;line-height:1.4;font-weight:600;margin:0 0 12px}.lk h3{font-size:15px;font-weight:600;margin:16px 0 8px}.lk p{margin:0 0 14px}.lk .muted,.lk small{color:var(--muted);font-size:13px}.lk a{color:inherit;text-underline-offset:3px}
.lk :focus-visible{outline:2px solid var(--rer-focus,#000);outline-offset:2px}
.lk button,.lk input,.lk select,.lk textarea{font:inherit;color:inherit}
.lk button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:40px;padding:0 16px;border:1px solid var(--edge);border-radius:0;background:var(--page);font-weight:500;cursor:pointer;max-width:100%;overflow-wrap:anywhere}.lk .topbar button,.lk .head-actions button{white-space:nowrap}.lk button svg{width:16px;height:16px}
.lk button:hover:not(:disabled){background:var(--hover)}.lk button:disabled{opacity:.45;cursor:default}
.lk .primary,.lk .add{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}.lk .primary:hover:not(:disabled),.lk .add:hover:not(:disabled){background:color-mix(in srgb,var(--accent) 88%,var(--ink))}
.lk .danger{border-color:var(--danger);color:var(--danger)}.lk .small{min-height:34px;padding:0 12px;font-size:14px}
.lk .link{border:0;background:none;min-height:36px;padding:0;font-weight:500;text-decoration:underline;text-underline-offset:3px}.lk .link:hover:not(:disabled){background:none;text-decoration-thickness:2px}
.lk input,.lk textarea,.lk select{border:1px solid var(--control);border-radius:0;background:var(--page);min-height:42px;padding:9px 12px;max-width:100%}.lk input,.lk textarea{width:100%}.lk select{padding-right:8px;min-width:0}.lk label>select,.lk .vault-select{width:100%}.lk .crumbs .vault-select{width:auto}
.lk input:focus-visible,.lk textarea:focus-visible,.lk select:focus-visible{outline:0;border-color:var(--ink);box-shadow:0 0 0 3px var(--ring)}
.lk input[type=file]{padding:8px 10px}.lk input[type=file]::file-selector-button{font:inherit;font-weight:500;border:1px solid var(--edge);background:var(--page);padding:4px 12px;margin-right:12px;cursor:pointer}
.lk textarea{resize:vertical;overflow-wrap:anywhere}.lk input[type=checkbox],.lk input[type=radio]{width:18px;height:18px;min-height:18px;margin:2px 0 0;flex-shrink:0;accent-color:var(--ink)}
.lk label{display:grid;gap:6px;font-weight:500;min-width:0}.lk .check{display:flex;align-items:flex-start;gap:10px;min-height:24px;margin:14px 0;font-weight:400}.lk form label+label{margin-top:14px}.lk form>label+:is(button,.actions){margin-top:14px}
.lk summary{cursor:pointer;font-weight:600;padding:4px 0;margin-bottom:8px}.lk details[open]>summary{margin-bottom:14px}
.lk .skip{position:absolute;left:12px;top:-100px;background:var(--page);padding:8px;z-index:10}.lk .skip:focus{top:10px}.lk .sr-only{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}

.lk .topbar{display:flex;align-items:center;gap:28px;min-height:64px;padding:0 32px;border-bottom:1px solid var(--rule);background:var(--rer-surface,#fff)}
.lk .lockup{display:inline-flex;align-items:center;gap:.6em;flex:none;min-height:24px;color:var(--ink);text-decoration:none;font:900 21px/1 var(--heading);letter-spacing:-.025em}.lk .lockup-mark{display:block;height:1.1em;width:auto}
.lk .search{display:flex;align-items:center;gap:10px;flex:0 1 340px;min-width:150px;height:40px;padding:0 10px 0 12px;border:1px solid var(--control);font-weight:400;color:var(--muted)}.lk .search:focus-within{border-color:var(--ink);box-shadow:0 0 0 3px var(--ring)}
.lk .search input,.lk .search input:focus-visible{border:0;outline:0;box-shadow:none;background:transparent;min-width:0;flex:1;padding:0;min-height:36px;color:var(--ink)}.lk kbd{font:12px/1 var(--rer-font-body,system-ui);color:var(--muted);border:1px solid var(--rule);padding:4px 6px;white-space:nowrap}
.lk .tabs{display:flex;align-self:stretch;gap:26px;margin-left:auto}.lk .tabs button{align-self:stretch;min-height:64px;padding:0 2px;border:0;border-bottom:3px solid transparent;border-top:3px solid transparent;background:none;font-weight:400;color:var(--ink)}
.lk .tabs button:hover:not(:disabled){background:none;border-bottom-color:var(--rule)}.lk .tabs button:focus-visible{outline-offset:-3px}.lk .tabs [aria-current=page]{font-weight:650;border-bottom-color:var(--accent)!important}
.lk .tabs[data-fade~=start]{-webkit-mask-image:linear-gradient(to right,transparent,#000 36px);mask-image:linear-gradient(to right,transparent,#000 36px)}.lk .tabs[data-fade~=end]{-webkit-mask-image:linear-gradient(to left,transparent,#000 36px);mask-image:linear-gradient(to left,transparent,#000 36px)}
.lk .tabs[data-fade~=start][data-fade~=end]{-webkit-mask-image:linear-gradient(to right,transparent,#000 36px,#000 calc(100% - 36px),transparent);mask-image:linear-gradient(to right,transparent,#000 36px,#000 calc(100% - 36px),transparent)}
.lk .menu{position:relative;flex:none}.lk .menu>summary{list-style:none;display:flex;align-items:center;gap:8px;min-height:40px;margin:0;padding:0 14px;border:1px solid var(--edge);font-weight:500}.lk .menu[open]>summary{margin:0}.lk .menu>summary::-webkit-details-marker{display:none}.lk .menu>summary::after{content:'';width:7px;height:7px;border:solid currentColor;border-width:0 1.5px 1.5px 0;transform:translateY(-2px) rotate(45deg)}
.lk .menu-list{position:absolute;right:0;top:calc(100% + 6px);z-index:5;display:grid;min-width:230px;padding:6px 0;background:var(--rer-surface,#fff);border:1px solid var(--rule);box-shadow:0 10px 30px color-mix(in srgb,var(--ink) 10%,transparent)}
.lk .menu-list button,.lk .menu-list a{justify-content:flex-start;width:100%;min-height:38px;padding:0 16px;border:0;background:none;font-weight:400;text-decoration:none;display:flex;align-items:center}.lk .menu-list a{border-top:1px solid var(--rule);margin-top:6px;padding-top:6px}.lk .menu-list :is(button,a):hover:not(:disabled){background:var(--hover)}
.lk .lock{flex:none}.lk .locked{margin-left:auto;color:var(--muted)}.lk .docs{display:inline-flex;align-items:center;min-height:24px;color:var(--muted)}

.lk .page{max-width:1254px;margin:0 auto;padding:36px 32px 72px}
.lk .page-head{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;column-gap:24px;padding-bottom:24px;margin-bottom:24px;border-bottom:1px solid var(--rule)}.lk .crumbs{grid-column:1/-1}
.lk .head-text{min-width:0}.lk .crumbs{display:flex;align-items:center;gap:8px;margin:0 0 10px;color:var(--muted)}.lk .crumbs select{min-height:32px;min-width:150px;padding:2px 28px 2px 8px;border-color:var(--rule);color:var(--ink);font-weight:500;max-width:min(320px,60vw)}
.lk .page-head h1{font-size:40px;line-height:1.08;margin:0;overflow-wrap:anywhere}.lk .subline{margin:8px 0 0;color:var(--muted);font-size:17px}
.lk .head-actions{display:flex;gap:12px;flex-wrap:wrap;justify-content:flex-end}.lk .head-actions button{min-height:46px;padding:0 22px;font-size:16px}

.lk .items-head,.lk .item{display:grid;grid-template-columns:minmax(0,2.3fr) minmax(0,1.8fr) minmax(0,1.7fr) minmax(0,.7fr) 20px;gap:20px;align-items:center;padding:0 18px}
.lk .items-head{min-height:44px;color:var(--muted);font-size:14px}
.lk .items{display:block;border:1px solid var(--rule);margin-bottom:16px}.lk .row{border-bottom:1px solid var(--rule)}.lk .row:last-of-type{border-bottom:0}
.lk .item{width:100%;min-height:62px;padding-top:9px;padding-bottom:9px;border:0;background:none;text-align:left;font-weight:400;font-size:16px;white-space:normal}.lk .item:hover:not(:disabled){background:var(--hover)}.lk .item.selected,.lk .item.selected:hover{background:var(--tint)}
/* Row text wraps (hosts after a dot, addresses before the @) rather than being cut off. */
.lk .cell{min-width:0;overflow-wrap:anywhere}.lk .name{display:flex;align-items:center;gap:14px}.lk .name-text{display:grid;gap:1px;min-width:0}.lk .item-sub{font-size:13px;line-height:1.4;color:var(--muted)}.lk .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.lk .user,.lk .changed{font-size:15px}.lk .user,.lk .state.none{color:var(--muted)}.lk .state{overflow:hidden;font-size:14px}.lk .changed{white-space:nowrap;font-variant-numeric:tabular-nums}
.lk .facts{display:flex;flex-wrap:wrap;row-gap:2px;margin-left:-15px}.lk .facts>span{min-width:0;overflow-wrap:anywhere}.lk .facts>span::before{content:'·';display:inline-block;width:15px;text-align:center;color:var(--muted)}
.lk .tile{display:grid;place-items:center;flex:none;width:32px;height:32px;background:var(--ink);color:var(--page);font:800 15px/1 var(--heading)}.lk .tile.quiet{background:var(--page);color:var(--ink);border:1px solid var(--rule)}.lk .tile svg{width:16px;height:16px}
.lk .chevron{width:16px;height:16px;color:var(--muted);transition:transform .15s}.lk .item.selected .chevron{transform:rotate(90deg)}
.lk .row>.detail,.lk .row>.editor{background:var(--tint);border-top:1px solid var(--rule);padding:20px 18px 24px 64px}
.lk .items .empty{padding:44px 24px;text-align:center}.lk .items .empty p{color:var(--muted);margin:0}.lk .more{margin:12px 18px}

.lk .detail{min-width:0}.lk .detail-header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px}.lk .subtitle{margin:0;color:var(--muted)}
.lk .actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.lk .actions button{min-height:38px}
.lk .detail-grid{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:28px 40px;padding-bottom:20px;border-bottom:1px solid var(--rule);margin-bottom:20px}
.lk .credentials{display:grid;gap:16px;align-content:start}.lk .field>label{margin-bottom:6px;font-size:13px;color:var(--muted)}
.lk .input-row{display:flex;align-items:center;gap:2px;min-height:42px;padding:0 4px 0 12px;border:1px solid var(--rule);background:var(--page)}.lk .input-row:focus-within{border-color:var(--ink);box-shadow:0 0 0 3px var(--ring)}
.lk .input-row input,.lk .input-row input:focus-visible{border:0;outline:0;box-shadow:none;background:transparent;min-width:0;flex:1;padding:0;min-height:38px;font-size:15px}.lk .input-row button{border:0;background:transparent;width:36px;min-height:36px;padding:0;color:var(--muted)}.lk .input-row button:hover:not(:disabled){color:var(--ink)}
.lk .field>.small{margin-top:8px}.lk .field-toggle{margin-top:6px;font-size:13px}
.lk .detail-side{display:grid;gap:20px;align-content:start}.lk .section h2{font-size:15px;margin-bottom:10px}.lk .rule-view{display:flex;gap:12px;margin:0 0 6px;overflow-wrap:anywhere}.lk .rule-view span:first-child{color:var(--muted);font-size:14px;min-width:84px}
.lk .file{display:flex;align-items:center;gap:12px;padding:8px 4px 8px 12px;margin:0 0 8px;border:1px solid var(--rule);background:var(--page)}.lk .file-text{flex:1;display:grid;gap:2px;font-size:14px;min-width:0;overflow-wrap:anywhere}.lk .file button{border:0;background:none;width:36px;padding:0}
.lk .history{margin-bottom:20px}.lk .history-box{border-top:1px solid var(--rule)}.lk .history-row{display:flex;align-items:center;gap:14px;width:100%;min-height:48px;padding:6px 4px;border:0;border-bottom:1px solid var(--rule);background:none;text-align:left;justify-content:flex-start;font-weight:400;white-space:normal}
.lk .dot{width:8px;height:8px;border-radius:50%;background:var(--ok);flex-shrink:0}.lk .history-text{display:grid;gap:1px;font-size:14px}.lk .history-row svg{margin-left:auto;width:14px;color:var(--muted)}
.lk .history-entry{border-top:1px solid var(--rule);padding:10px 0;display:flex;gap:8px;align-items:center;flex-wrap:wrap}.lk .history-entry>span{flex:1;min-width:160px}
.lk .restore-preview dd{margin:0 0 10px;color:var(--muted);overflow-wrap:anywhere}.lk .restore-preview dt{font-size:13px;font-weight:600}
.lk .row .section{padding:0 0 16px}.lk .row #sharing{padding-top:4px}
.lk .editor form>.section{margin-top:32px}.lk .editor form>.capture{margin-top:16px}.lk .editor form>.actions{margin-top:28px}.lk .editor .section>h2{margin-bottom:8px}

.lk .notice{border:1px solid var(--rule);background:var(--tint);margin:16px 0;padding:16px 18px;overflow-wrap:anywhere}.lk .notice h2{margin-top:0}
.lk .error{display:flex;align-items:center;gap:12px;justify-content:space-between;border:1px solid color-mix(in srgb,var(--danger) 45%,var(--page));background:color-mix(in srgb,var(--danger) 6%,var(--page));color:var(--danger);margin:0 0 16px;padding:10px 12px 10px 16px}.lk .error button{color:var(--ink)}
.lk .new-vault{margin:0 0 24px;padding:20px}.lk .new-vault p{margin:14px 0}
.lk .page>.detail:not(.empty){padding:0 0 8px}.lk .page>.detail>h1,.lk .page>.detail>.section>h1{margin-bottom:16px}.lk .page>.detail h2{margin-top:24px}.lk .page>.detail h2:first-child{margin-top:0}
.lk .page>.detail>button,.lk .page>.detail>.section>button{margin:0 0 16px}.lk .page>.detail>:is(form,label,.actions),.lk .page>.detail>.section>:is(form,label){margin-bottom:24px}.lk .section+.section{margin-top:4px}.lk .tool-box{margin:16px 0;border-top:1px solid var(--rule);padding-top:16px}.lk .tool-box label{margin:12px 0}.lk .tool-panel{margin:0}
.lk .definition{border:1px solid var(--rule);padding:14px 16px;margin:12px 0}.lk .choice{display:flex;align-items:flex-start;gap:10px;font-weight:400}
.lk .form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.lk .form-grid label+label{margin-top:0}.lk .edit-field{display:grid;gap:8px}
.lk .url-rule{display:grid;grid-template-columns:minmax(130px,1fr) minmax(180px,2fr) auto;gap:12px;align-items:end;margin:12px 0}.lk .url-rule label+label{margin:0}
.lk .file-upload{margin-top:14px}.lk video{width:100%;max-height:300px;margin-top:12px}.lk .fingerprint{overflow-wrap:anywhere;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px}
.lk .page>.empty{border:1px solid var(--rule);padding:64px 48px;margin-top:8px}.lk .page>.empty h1{font-size:30px}.lk .page>.empty p{color:var(--muted);max-width:52ch;margin-bottom:22px}.lk .page>.empty button{min-height:46px;padding:0 22px;font-size:16px}

.lk .lk-unlock{max-width:460px;margin:40px auto 0}.lk .lk-unlock h1{font-size:34px}.lk .lk-unlock .muted{font-size:15px;margin-bottom:24px}
.lk .lk-unlock form{display:grid;gap:16px}.lk .lk-unlock form label+label{margin-top:0}.lk .lk-unlock form .primary{min-height:46px;font-size:16px;margin-top:6px}.lk .lk-unlock form .link{justify-self:start}.lk .lk-unlock .actions{margin:16px 0}

/* The one-row top bar needs about 1270 px with its full gaps and 1180 px with the compact ones; below
   1300 px it stacks (lockup and actions, the search, then the tabs as their own scrolling row). */
@media(max-width:1359px){.lk .topbar{gap:20px;padding:0 24px}.lk .tabs{gap:18px}.lk .search{flex-basis:240px}}
@media(max-width:1300px){.lk .topbar{flex-wrap:wrap;row-gap:0;padding:10px 20px 0}.lk .lockup{order:1;margin-right:auto}.lk .menu{order:2}.lk .lock{order:3}.lk .locked{order:2}.lk .docs{order:3}.lk .search{order:4;flex:1 1 100%;margin:12px 0 4px}
 .lk .tabs{order:5;flex:1 1 100%;margin:0 -20px;padding:0 20px;overflow-x:auto;scrollbar-width:none}.lk .tabs::-webkit-scrollbar{display:none}.lk .tabs button{min-height:48px;flex:none}}
@media(max-width:980px){.lk .page{padding:28px 20px 56px}
 .lk .items-head,.lk .item{grid-template-columns:minmax(0,1.5fr) minmax(0,1.3fr) minmax(0,.6fr) 16px;gap:4px 14px}.lk .items-head span:nth-child(3){display:none}.lk .detail-grid{grid-template-columns:1fr}
 .lk .item .name{grid-area:1/1}.lk .item .user{grid-area:1/2}.lk .item .changed{grid-area:1/3}.lk .item .chevron{grid-area:1/4}.lk .item .state{grid-area:2/1/3/3;margin-left:46px}.lk .item .state.none{display:none}}
@media(max-width:640px){.lk{font-size:15px}.lk .topbar{padding:8px 16px 0;gap:10px}.lk .lockup{font-size:19px}.lk .menu>summary,.lk .lock{min-height:36px;padding:0 10px;font-size:14px}.lk .tabs{margin:0 -16px;padding:0 16px;gap:18px}.lk .page{padding:22px 16px 48px}
 .lk .page-head{grid-template-columns:1fr;row-gap:18px;padding-bottom:20px;margin-bottom:16px}.lk .crumbs{margin:0 0 -8px}.lk .page-head h1{font-size:32px}.lk .subline{font-size:15px}.lk .head-actions{flex-direction:column-reverse}.lk .head-actions button{width:100%}
 .lk .items-head{display:none}.lk .item{grid-template-columns:minmax(0,1fr) auto 14px;gap:2px 12px;padding:10px 14px;min-height:62px}.lk .item .user,.lk .item .state.none{display:none}.lk .name{gap:12px}.lk .item-title{display:block}
 .lk .item .name{grid-area:1/1}.lk .item .changed{grid-area:1/2}.lk .item .chevron{grid-area:1/3}.lk .item .state{grid-area:2/1/3/-1;margin-left:44px}
 .lk .row>.detail,.lk .row>.editor{padding:16px 14px 20px}.lk .detail-header{flex-wrap:wrap}.lk .detail-header .actions{width:100%}.lk .detail-header .actions button{flex:1}
 .lk .form-grid,.lk .url-rule{grid-template-columns:1fr}.lk .page>.empty{padding:40px 20px}.lk .page>.empty h1{font-size:26px}.lk .page>.empty button{width:100%}
 .lk .lk-unlock{margin-top:12px}.lk .lk-unlock h1{font-size:30px}.lk .error{align-items:flex-start;flex-wrap:wrap}}
`;
