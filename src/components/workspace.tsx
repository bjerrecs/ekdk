'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, BookOpen, Check, ChevronDown, ChevronRight, Cloud, CloudSun, Copy, ExternalLink, FileText, Gauge, Home, Info, LogOut, Map, Maximize, Minus, Navigation, Pin, Plane, Plus, Radio, RotateCw, Search, Settings, ShieldCheck, SlidersHorizontal, Target, Thermometer, Trash2, Wind, Wrench, UserRound, Moon, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Brand from './brand';
import { useTheme, type ThemePreference } from './theme-provider';
import { airports, sources, topics } from '@/lib/data';
import { searchWorkspace } from '@/lib/search';
import RunwayDiagram, { runwayLayout } from './runway-diagram';
import PdfDocument from './pdf-document';
import ApproachQuickReference from './approach-quick-reference';
import { MiniWeather, WeatherSummary, WeatherReport } from './airport-weather';
import useCharts from './use-charts';
import { chartGroup, matchApproachCharts } from '@/lib/chart-policy';
import type { ChartDescriptor } from '@/lib/chart-types';

type Airport = typeof airports[number];
type Section = 'overview' | 'airport' | 'approaches' | 'charts' | 'weather' | 'procedures' | 'tools' | 'pinned';
type Item = { id: string; label: string; section: Section; airportId?: string; runway?: string; procedure?: string; topic?: string; chartName?: string };
type ViewerState = { zoom: number; rotation: number; left: number; top: number };
type SavedWorkspace = { airportId: string | null; section: Section; runway: string; procedure: string; topic: string; open: Item[]; pinned: Item[]; activeId: string | null; viewers: Record<string, ViewerState>; configurations: Record<string, { arrivals: string; departures: string }> };
const navigation: { section: Section; label: string; icon: LucideIcon }[] = [
  { section: 'overview', label: 'Overview', icon: Home },
  { section: 'airport', label: 'Airport', icon: Plane },
  { section: 'approaches', label: 'Approaches', icon: Navigation },
  { section: 'charts', label: 'Charts', icon: Map },
  { section: 'weather', label: 'Weather', icon: Cloud },
  { section: 'procedures', label: 'Procedures', icon: FileText },
  { section: 'pinned', label: 'Pinned', icon: Pin },
];
const defaultPins: Item[] = topics.slice(0, 5).map(topic => ({ id: `reference-${topic}`, label: topic, section: 'procedures', topic }));
const defaultRunway = (value: Airport) => value.id === 'EKCH' ? '22L' : value.runways[0];
const initialWorkspace: SavedWorkspace = { airportId: null, section: 'overview', runway: '22L', procedure: 'ILS', topic: 'Danish AFIS procedures', open: [], pinned: defaultPins, activeId: null, viewers: {}, configurations: {} };

function ReferenceIcon({ section }: { section: Section }) {
  return <svg className="reference-nav-icon" viewBox="0 0 25 25" fill="none" aria-hidden="true"><use href={`/reference-icons.svg#${section}`} /></svg>;
}

function AirportDiagram({ airport, large = false }: { airport: Airport; large?: boolean }) {
  return <RunwayDiagram icao={airport.id} large={large} />;
}

function Panel({ title, icon: Icon, children, action, className = '' }: { title: string; icon?: LucideIcon; children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return <section className={`panel ${className}`}><div className="panel-heading">{Icon && <Icon size={22} />}<h2>{title}</h2>{action}</div><div className="panel-body">{children}</div></section>;
}
function Unavailable({ children }: { children: React.ReactNode }) {
  return <div className="unavailable"><Info size={18} /><span>{children}</span></div>;
}
function SourceLink({ type, children = 'Open source portal' }: { type: 'charts' | 'procedures'; children?: React.ReactNode }) {
  return <a className="button secondary" href={sources[type]} target="_blank" rel="noreferrer">{children}<ExternalLink size={16} /></a>;
}

function ChartRows({ charts, open, loading, error, retry }: { charts: ChartDescriptor[]; open: (chart: ChartDescriptor) => void; loading: boolean; error: string; retry: () => void }) {
  if (loading && !charts.length) return <div className="catalogue-status" role="status">Loading current Naviair charts…</div>;
  if (error) return <div className="catalogue-status" role="alert"><Unavailable>{error}</Unavailable><button className="secondary" onClick={retry}>Retry catalogue</button><SourceLink type="charts" /></div>;
  if (!charts.length) return <Unavailable>No applicable chart was found in the current Naviair catalogue.</Unavailable>;
  return <>{charts.map(chart => <button className="library-row" key={chart.name} onClick={() => open(chart)}><FileText size={22} /><div><strong>{chart.title}</strong><small>NAVIAIR · effective {chart.effective || 'date unavailable'}</small></div><ChevronRight size={18} /></button>)}</>;
}
function ChartViewer({ item, airport, active, state, update, pinned, onPin }: { item: Item; airport: Airport; active: boolean; state: ViewerState; update: (state: ViewerState) => void; pinned: boolean; onPin: () => void }) {
  const viewport = useRef<HTMLDivElement>(null);
  const { charts, loading, error, retry } = useCharts(airport.id);
  const chart = charts.find(value => value.name === item.chartName);
  useEffect(() => {
    if (active && viewport.current) { viewport.current.scrollLeft = state.left; viewport.current.scrollTop = state.top; }
  }, [active]);
  const zoom = (amount: number) => update({ ...state, zoom: Math.min(250, Math.max(50, state.zoom + amount)) });
  return <section className="chart-view" hidden={!active}>
    <div className="chart-toolbar"><div className="chart-title"><FileText size={26} /><h1>{item.label}</h1></div><div className="chart-controls"><div className="zoom-control"><button aria-label="Zoom out" disabled={state.zoom <= 50} onClick={() => zoom(-25)}><Minus size={18} /></button><span>{state.zoom}%</span><button aria-label="Zoom in" disabled={state.zoom >= 250} onClick={() => zoom(25)}><Plus size={18} /></button></div><button onClick={() => update({ zoom: 100, rotation: 0, left: 0, top: 0 })}><Maximize size={18} />Fit</button><button onClick={() => update({ ...state, rotation: (state.rotation + 90) % 360 })}><RotateCw size={18} />Rotate</button><button aria-pressed={pinned} onClick={onPin}><Pin size={18} />{pinned ? 'Pinned' : 'Pin'}</button><SourceLink type="charts">Source portal</SourceLink></div></div>
    <div className="chart-metadata"><span>Source: NAVIAIR · AIP Denmark</span><span>{chart?.name || 'Resolving current document…'}</span><span>Version effective: {chart?.effective || 'Unavailable'}</span></div>
    <div className="chart-viewport" ref={viewport} tabIndex={0} aria-label="Chart document viewport" onScroll={event => { if (active) update({ ...state, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop }); }}><div className="pdf-zoom-container" style={{ width: `${state.zoom}%` }}>{chart ? <PdfDocument icao={airport.id} name={chart.name} rotation={state.rotation} /> : <div className="pdf-loading"><FileText size={30} /><p>{loading ? 'Resolving official Naviair chart…' : error || 'Choose a current chart from the airport chart library.'}</p>{error && <button className="secondary" onClick={retry}>Retry catalogue</button>}</div>}</div></div>
    <div className="chart-document-note"><Info size={16} /><span>Official source PDF · verify chart revision and applicability before use.</span>{chart && <a href={chart.url} target="_blank" rel="noreferrer">Open original source<ExternalLink size={14} /></a>}</div>
  </section>;
}

function AirportSwitcher({ current, open, setOpen, select }: { current?: Airport; open: boolean; setOpen: (open: boolean) => void; select: (airport: Airport) => void }) {
  const [filter, setFilter] = useState('');
  const [index, setIndex] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const needle = filter.trim().toLowerCase();
  const matches = airports.filter(value => !needle || [value.id, value.name, value.local, ...value.aliases].some(term => term.toLowerCase().includes(needle)));
  useEffect(() => { if (open) { setFilter(''); setIndex(Math.max(0, airports.findIndex(value => value.id === current?.id))); } }, [open]);
  useEffect(() => { if (open && matches[index]) document.getElementById(`airport-option-${matches[index].id}`)?.scrollIntoView({ block: 'nearest' }); }, [open, index, filter]);
  function choose(value: Airport) { select(value); trigger.current?.focus(); }
  return <div className="context-control airport-switcher">
    <button ref={trigger} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? 'airport-menu' : undefined} onClick={() => setOpen(!open)}><span><strong>{current ? <>{current.id}<span className="airport-switcher-name"> · {current.name}</span></> : 'Choose airport'}</strong><small>{current ? 'Switch airport' : 'No airport selected'}</small></span><ChevronDown size={18} /></button>
    {open && <div className="context-menu airport-menu" id="airport-menu">
      <label className="airport-filter"><Search size={16} /><input autoFocus value={filter} placeholder="Filter airports" aria-label="Filter airports" role="combobox" aria-expanded="true" aria-controls="airport-options" aria-autocomplete="list" aria-activedescendant={matches[index] ? `airport-option-${matches[index].id}` : undefined} onChange={event => { setFilter(event.target.value); setIndex(0); }} onKeyDown={event => {
        if (event.key === 'ArrowDown') { event.preventDefault(); setIndex(previous => Math.min(previous + 1, matches.length - 1)); }
        if (event.key === 'ArrowUp') { event.preventDefault(); setIndex(previous => Math.max(previous - 1, 0)); }
        if (event.key === 'Enter' && matches[index]) { event.preventDefault(); choose(matches[index]); }
        if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
      }} /></label>
      <div role="listbox" id="airport-options" aria-label="Airports">{matches.map((value, position) => <button id={`airport-option-${value.id}`} key={value.id} role="option" aria-selected={value.id === current?.id} className={position === index ? 'selected' : ''} onMouseEnter={() => setIndex(position)} onClick={() => choose(value)}><span className="context-code">{value.id}</span><span>{value.name}</span>{value.id === current?.id && <Check size={16} />}</button>)}</div>
      {!matches.length && <p className="airport-empty">No matching airport</p>}
    </div>}
  </div>;
}

export default function Workspace({ member, logout }: { member: { name: string; cid: string }; logout: () => Promise<void> }) {
  const [workspace, setWorkspace] = useState<SavedWorkspace>(initialWorkspace);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [resultIndex, setResultIndex] = useState(0);
  const [accountOpen, setAccountOpen] = useState(false);
  const [airportMenuOpen, setAirportMenuOpen] = useState(false);
  const { preference, setPreference } = useTheme();
  const [clock, setClock] = useState('--:--:--');
  const [overviewTab, setOverviewTab] = useState('Summary');
  const [procedureFilter, setProcedureFilter] = useState('');
  const [toast, setToast] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const storageKey = `ekdk-session-${member.cid}`;
  const airport = airports.find(value => value.id === workspace.airportId);
  const { charts, loading: chartsLoading, error: chartsError, retry: retryCharts } = useCharts(airport?.id);
  const approachCharts = matchApproachCharts(charts, workspace.runway, workspace.procedure) as ChartDescriptor[];
  const aerodromeChart = charts.find(chart => /_ADC_en\.pdf$/i.test(chart.name));
  const layout = airport ? runwayLayout(airport.id) : undefined;
  const selectedThreshold = layout?.thresholds.find(threshold => threshold.runway === workspace.runway);
  const results = searchWorkspace(query, airport);
  const currentChart = workspace.open.find(item => item.id === workspace.activeId && item.id.includes('-chart-'));

  useEffect(() => {
    let restored = initialWorkspace;
    try { const saved = sessionStorage.getItem(storageKey); if (saved) { const parsed = JSON.parse(saved); if (Array.isArray(parsed.open) && Array.isArray(parsed.pinned) && (navigation.some(item => item.section === parsed.section) || parsed.section === 'tools')) restored = { ...initialWorkspace, ...parsed }; } } catch { }
    const reference = new URLSearchParams(window.location.search).get('reference');
    if (reference && (topics.includes(reference) || airports.some(value => ['Parking', 'Taxi procedures', 'Coordination'].some(topic => reference === `${value.id} ${topic}`)))) {
      const item: Item = { id: `reference-${reference}`, label: reference, section: 'procedures', topic: reference };
      restored = { ...restored, section: 'procedures', topic: reference, activeId: item.id, open: restored.open.some(value => value.id === item.id) ? restored.open : [...restored.open, item] };
    }
    setWorkspace(restored);
    setReady(true);
    const tick = () => setClock(new Date().toISOString().slice(11, 19));
    tick();
    const timer = setInterval(tick, 1000);
    const keyboard = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchRef.current?.focus(); setSearchOpen(true); }
      if (event.key === 'Escape') { setSearchOpen(false); setAccountOpen(false); setAirportMenuOpen(false); }
    };
    window.addEventListener('keydown', keyboard);
    return () => { clearInterval(timer); window.removeEventListener('keydown', keyboard); };
  }, [storageKey]);
  useEffect(() => { if (ready) { try { sessionStorage.setItem(storageKey, JSON.stringify(workspace)); } catch { } } }, [workspace, ready, storageKey]);
  useEffect(() => { setResultIndex(0); }, [query]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { if (!currentChart) contentRef.current?.scrollTo(0, 0); }, [workspace.section, workspace.activeId, workspace.airportId, currentChart]);

  function openItem(item: Item) {
    const nextUrl = item.section === 'procedures' && item.topic ? `/?reference=${encodeURIComponent(item.topic)}` : '/';
    window.history.replaceState(null, '', nextUrl);
    setWorkspace(previous => ({ ...previous, section: item.section, airportId: item.airportId || previous.airportId, runway: item.runway || previous.runway, procedure: item.procedure || previous.procedure, topic: item.topic || previous.topic, activeId: item.id, open: previous.open.some(value => value.id === item.id) ? previous.open.map(value => value.id === item.id ? item : value) : [...previous.open, item] }));
    setSearchOpen(false);
  }
  function openAirport(value: Airport, section: Section = 'airport') {
    openItem({ id: `${value.id}-${section}`, airportId: value.id, section, label: `${section === 'airport' ? 'Airport' : section === 'weather' ? 'Weather' : 'Charts'} (${value.id})`, runway: defaultRunway(value) });
    setOverviewTab('Summary');
  }
  function openApproach(value: Airport, runway = workspace.runway, procedure = workspace.procedure) { openItem({ id: `${value.id}-${procedure}-${runway}`, label: `${value.id} · ${procedure} ${runway} reference`, airportId: value.id, section: 'approaches', runway, procedure }); }
  function openChart(value: Airport, chart: ChartDescriptor, runway?: string) { openItem({ id: `${value.id}-chart-${chart.name}`, airportId: value.id, label: chart.title, section: 'charts', runway, chartName: chart.name }); }
  function switchAirport(value: Airport) {
    setAirportMenuOpen(false);
    if (value.id === airport?.id && workspace.section !== 'overview') return;
    // Stay in the current airport section; FIR-wide sections land on the airport overview.
    if (workspace.section === 'approaches') openApproach(value, defaultRunway(value));
    else openAirport(value, workspace.section === 'weather' || workspace.section === 'charts' ? workspace.section : 'airport');
  }
  function openReference(topic: string) { openItem({ id: `reference-${topic}`, label: topic, section: 'procedures', topic }); }
  function navigate(section: Section) {
    setSearchOpen(false);
    if (section === 'airport' || section === 'weather' || section === 'charts') {
      if (airport) openAirport(airport, section);
      else { setWorkspace(previous => ({ ...previous, section: 'overview', activeId: null })); setToast('Choose an airport to open this section.'); setAirportMenuOpen(true); }
    } else if (section === 'approaches') {
      if (airport) openApproach(airport);
      else { setWorkspace(previous => ({ ...previous, section: 'overview', activeId: null })); setToast('Choose an airport to browse approaches.'); setAirportMenuOpen(true); }
    } else if (section === 'procedures') openReference(workspace.topic);
    else setWorkspace(previous => ({ ...previous, section, activeId: null }));
  }
  function selectResult(index: number) {
    const result = results[index]; if (!result) return;
    if (result.topic) openReference(result.topic);
    else if (result.airport) { if (result.section === 'approaches') openApproach(result.airport, result.runway, result.procedure); else openAirport(result.airport, result.section as Section); }
    searchRef.current?.blur();
  }
  function togglePin(item: Item) {
    const exists = workspace.pinned.some(value => value.id === item.id);
    setWorkspace(previous => ({ ...previous, pinned: exists ? previous.pinned.filter(value => value.id !== item.id) : [...previous.pinned, item] }));
    setToast(exists ? 'Reference unpinned.' : 'Reference pinned for this session.');
  }
  function closeItem(item: Item) {
    const remaining = workspace.open.filter(value => value.id !== item.id);
    if (workspace.activeId === item.id && remaining.length) openItem(remaining[remaining.length - 1]);
    setWorkspace(previous => ({ ...previous, open: remaining, ...(previous.activeId === item.id && !remaining.length ? { activeId: null, section: 'overview' } : {}) }));
  }
  function configure(field: 'arrivals' | 'departures', value: string) {
    if (!airport) return;
    setWorkspace(previous => ({ ...previous, configurations: { ...previous.configurations, [airport.id]: { arrivals: previous.configurations[airport.id]?.arrivals || airport.runways[0], departures: previous.configurations[airport.id]?.departures || airport.runways[0], [field]: value } } }));
  }
  const configuration = airport ? workspace.configurations[airport.id] || { arrivals: airport.runways[0], departures: airport.runways[0] } : null;
  const approachItem: Item | undefined = airport ? { id: `${airport.id}-${workspace.procedure}-${workspace.runway}`, airportId: airport.id, label: `${airport.id} · ${workspace.procedure} ${workspace.runway} reference`, section: 'approaches', runway: workspace.runway, procedure: workspace.procedure } : undefined;

  return <div className="workspace-shell">
    <a className="skip-link" href="#workspace-main">Skip to workspace</a>
    <header className="command-bar"><button className="brand-button" aria-label="Copenhagen FIR overview" onClick={() => navigate('overview')}><Brand /></button>
      <div className="search-container"><Search size={23} className="search-icon" /><input ref={searchRef} value={query} placeholder="Search airports, charts, procedures..." aria-label="Search airports, charts and procedures" role="combobox" aria-expanded={searchOpen} aria-controls="search-results" aria-autocomplete="list" aria-activedescendant={searchOpen && results[resultIndex] ? `search-result-${resultIndex}` : undefined} onFocus={() => { setSearchOpen(true); setAirportMenuOpen(false); }} onChange={event => { setQuery(event.target.value); setSearchOpen(true); }} onKeyDown={event => {
        if (event.key === 'ArrowDown') { event.preventDefault(); setResultIndex(previous => Math.min(previous + 1, results.length - 1)); }
        if (event.key === 'ArrowUp') { event.preventDefault(); setResultIndex(previous => Math.max(previous - 1, 0)); }
        if (event.key === 'Enter') { event.preventDefault(); if (results.length === 1 || searchOpen) selectResult(Math.max(0, resultIndex)); else setSearchOpen(true); }
      }} /><div className="shortcut"><kbd>Ctrl</kbd><kbd>K</kbd></div>
      {searchOpen && <div className="search-results" id="search-results" role="listbox" aria-label="Workspace search results">{query.trim() ? results.length ? <><div className="search-help">{results.length > 1 ? 'Choose a matching reference' : 'Matching reference'}</div>{results.map((result, index) => <button id={`search-result-${index}`} key={result.label} role="option" aria-selected={index === resultIndex} className={index === resultIndex ? 'selected' : ''} onMouseDown={event => event.preventDefault()} onClick={() => selectResult(index)}><FileText size={19} /><span>{result.label}</span><ArrowUpRight size={16} /></button>)}</> : <div className="search-empty"><Search size={23} /><strong>No matching reference</strong><p>Try an airport identifier, runway or procedure topic.</p></div> : <><div className="search-help">Search your workspace</div><button role="option" aria-selected={false} onClick={() => { setQuery('cph 22l ils'); searchRef.current?.focus(); }}><Target size={18} /><span>cph 22l ils</span><small>Approach quick reference</small></button><button role="option" aria-selected={false} onClick={() => { setQuery('EKSB'); searchRef.current?.focus(); }}><Plane size={18} /><span>EKSB</span><small>Airport overview</small></button><p className="search-hint">Airport names, aliases, runways and reference topics</p></>}</div>}
      </div>
      <AirportSwitcher current={airport} open={airportMenuOpen} setOpen={open => { setAirportMenuOpen(open); setSearchOpen(false); setAccountOpen(false); }} select={switchAirport} />
      <div className="clock" aria-label="Current UTC time"><span>UTC</span><strong suppressHydrationWarning>{clock}</strong></div>
      <div className="account-control"><button className="account-trigger" aria-label="Account settings" title="Account settings" aria-expanded={accountOpen} aria-controls={accountOpen ? "account-settings-menu" : undefined} onClick={() => { setAccountOpen(!accountOpen); setSearchOpen(false); setAirportMenuOpen(false); }}><UserRound size={23} strokeWidth={1.7} /></button>{accountOpen && <div className="account-menu" id="account-settings-menu"><ShieldCheck size={19} /><div className="account-identity"><strong>{member.name}</strong><span title="VATSIM CID">{member.cid}</span></div><label className="appearance-setting"><span><Moon size={17} />Appearance</span><select value={preference} onChange={event => setPreference(event.target.value as ThemePreference)}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label><button onClick={() => { sessionStorage.removeItem(storageKey); void logout(); }}><LogOut size={17} />Sign out</button></div>}</div>
    </header>
    {(searchOpen || accountOpen || airportMenuOpen) && <button className="dropdown-dismiss" tabIndex={-1} aria-label="Close open menu" onClick={() => { setSearchOpen(false); setAccountOpen(false); setAirportMenuOpen(false); }} />}
    <aside className="sidebar"><nav aria-label="Primary navigation">{navigation.map(({ section, label }) => <button key={section} title={label} aria-current={workspace.section === section ? 'page' : undefined} onClick={() => navigate(section)}><ReferenceIcon section={section} /><span>{label}</span>{section === 'pinned' && workspace.pinned.length > 5 && <small>{workspace.pinned.length}</small>}</button>)}</nav><button className="tools-nav" title="Guide" aria-current={workspace.section === 'tools' ? 'page' : undefined} onClick={() => navigate('tools')}><BookOpen size={23} /><span>Guide</span></button></aside>
    <main id="workspace-main" className={`main-content ${currentChart ? 'has-chart' : ''}`} ref={contentRef} tabIndex={-1}>
      {!ready ? <div className="workspace-loading">Restoring workspace…</div> : <>
      {workspace.section === 'overview' && <section className="fir-overview"><div className="airport-grid">{airports.map(value => <article className="airport-card" key={value.id}><header><span className="airport-code">{value.id}</span><div><h2>{value.name}</h2></div></header><div className="airport-card-middle"><AirportDiagram airport={value} /><MiniWeather airport={value} /></div><footer><button className="primary" onClick={() => openAirport(value)}><ExternalLink size={20} />Open workspace</button><button className="secondary" onClick={() => openAirport(value, 'charts')}><FileText size={20} />Charts</button></footer></article>)}</div></section>}
      {workspace.section === 'airport' && airport && <section className="airport-overview page-section"><div className="page-heading"><div><h1>{airport.name} airport</h1><p>{airport.id}</p></div><div className="runway-switch" aria-label="Select runway">{airport.runways.map(runway => <button key={runway} aria-pressed={workspace.runway === runway} onClick={() => setWorkspace(previous => ({ ...previous, runway }))}>{runway}</button>)}</div></div><div className="section-tabs" role="tablist" aria-label="Airport sections">{['Summary', 'Ground', 'Runways', 'Local procedures'].map(tab => <button role="tab" aria-selected={overviewTab === tab} key={tab} onClick={() => setOverviewTab(tab)}>{tab}</button>)}</div>
      {overviewTab === 'Local procedures' ? <Panel title="Local procedures" icon={BookOpen}><Unavailable>Reviewed {airport.id} local procedures have not been connected.</Unavailable><p>Use the controller reference source to verify current procedures before your session.</p><SourceLink type="procedures" /></Panel> : <div className={`airport-overview-grid ${overviewTab === "Ground" ? "ground-mode" : overviewTab === "Runways" ? "runways-mode" : ""}`}><div><div className="large-layout"><AirportDiagram airport={airport} large /><span className="layout-label">Chart-derived runway schematic · not for navigation</span><button className="layout-open" onClick={() => aerodromeChart ? openChart(airport, aerodromeChart) : openAirport(airport, 'charts')}><Maximize size={17} />Official ADC</button></div><Panel title="Runway details" icon={Navigation}><table><thead><tr><th>Runway</th><th>Length</th><th>Surface</th><th>Reference</th></tr></thead><tbody>{airport.runways.map(runway => <tr key={runway}><td>{runway}</td><td>{layout?.thresholds.find(value => value.runway === runway)?.length.toLocaleString()} m</td><td>{layout?.thresholds.find(value => value.runway === runway)?.surface || "Unavailable"}</td><td><button className="text-link" onClick={() => openApproach(airport, runway)}>Approach<ChevronRight size={15} /></button></td></tr>)}</tbody></table><div className="table-note">Source: NAVIAIR AIP AD 2 runway physical characteristics; threshold geometry cross-checked against ADC.</div></Panel></div><div className="airport-right"><Panel title="Weather" icon={Cloud} action={<button aria-label="Open airport weather" onClick={() => openAirport(airport, 'weather')}><ChevronRight size={20} /></button>}><WeatherSummary airport={airport.id} /></Panel><Panel title="Working configuration" icon={Settings}><label className="select-row">Arrivals<select value={configuration?.arrivals} onChange={event => configure('arrivals', event.target.value)}>{airport.runways.map(runway => <option key={runway}>{runway}</option>)}</select></label><label className="select-row">Departures<select value={configuration?.departures} onChange={event => configure('departures', event.target.value)}>{airport.runways.map(runway => <option key={runway}>{runway}</option>)}</select></label><small className="muted">Manual session configuration</small></Panel><Panel title="Local references" icon={Map}>{['Parking', 'Taxi procedures', 'Coordination'].map(topic => <button className="reference-row" key={topic} onClick={() => openReference(`${airport.id} ${topic}`)}><FileText size={20} /><span>{topic}</span><ChevronRight size={18} /></button>)}</Panel></div></div>}
      </section>}
      {workspace.section === 'approaches' && airport && <div className="split-workspace">
        <aside className="secondary-nav"><h2>Approaches</h2><p>{airport.id} · {airport.name}</p><div className="procedure-types">{['ILS', 'RNAV', 'VOR'].map(type => <button key={type} aria-pressed={workspace.procedure === type} onClick={() => openApproach(airport, workspace.runway, type)}>{type}</button>)}</div>{airport.runways.map(runway => <button className="secondary-nav-item" key={runway} aria-current={workspace.runway === runway ? 'page' : undefined} onClick={() => openApproach(airport, runway)}><span>RWY {runway}</span><ChevronRight size={18} /></button>)}</aside>
        <section className="approach-content"><div className="page-heading"><div><h1>{workspace.procedure} runway {workspace.runway}</h1><p>{airport.name} · {workspace.runway} · {workspace.procedure}</p></div><button className="icon-button" aria-label="Pin approach reference" aria-pressed={workspace.pinned.some(value => value.id === approachItem?.id)} onClick={() => approachItem && togglePin(approachItem)}><Pin size={20} /></button></div>
          <ApproachQuickReference key={`${airport.id}-${workspace.runway}-${workspace.procedure}`} airport={airport.id} runway={workspace.runway} procedure={workspace.procedure} length={selectedThreshold?.length} openChart={chart => openChart(airport, chart, workspace.runway)} />
          <div className="approach-details"><div><Panel title="Official approach charts" icon={Map}><ChartRows charts={approachCharts} loading={chartsLoading} error={chartsError} retry={retryCharts} open={chart => openChart(airport, chart, workspace.runway)} /></Panel>{aerodromeChart && <Panel title="Aerodrome chart" icon={Map}><ChartRows charts={[aerodromeChart]} loading={false} error="" retry={retryCharts} open={chart => openChart(airport, chart)} /></Panel>}</div>
            <Panel title="Runway configuration" icon={Navigation} className="preview-panel"><div className="sourced-preview"><AirportDiagram airport={airport} large /><p>North-up schematic derived from published WGS-84 threshold positions.</p><button className="secondary" onClick={() => aerodromeChart ? openChart(airport, aerodromeChart) : openAirport(airport, 'charts')}>Open official aerodrome chart<ArrowUpRight size={16} /></button></div></Panel></div>
          <div className="source-strip"><Info size={22} /><strong>Source information</strong><div><span>Publisher</span><strong>NAVIAIR · AIP Denmark</strong></div><button className="secondary" onClick={() => approachItem && togglePin(approachItem)}><Pin size={18} />{workspace.pinned.some(value => value.id === approachItem?.id) ? 'Unpin reference' : 'Pin reference'}</button></div>
        </section>
      </div>}
      {workspace.section === 'charts' && airport && !currentChart && <section className="page-section"><div className="page-heading"><div><h1>{airport.name} charts</h1><p>{airport.id} · Official Naviair chart library</p></div><SourceLink type="charts" /></div><div className="chart-catalogue-note"><Info size={18} /><span>Current chart URLs resolved with naviair-charts. Select the applicable variant to view the official PDF inside your workspace.</span></div>{chartsLoading || chartsError ? <ChartRows charts={charts} loading={chartsLoading} error={chartsError} retry={retryCharts} open={chart => openChart(airport, chart)} /> : <div className="chart-library">{['Aerodrome', 'Approaches', 'Arrivals', 'Departures', 'References'].filter(group => charts.some(chart => chartGroup(chart) === group)).map(group => <Panel key={group} title={group} icon={group === 'Aerodrome' ? Map : FileText}><ChartRows charts={charts.filter(chart => chartGroup(chart) === group)} loading={false} error="" retry={retryCharts} open={chart => openChart(airport, chart)} /></Panel>)}</div>}</section>}
      {workspace.open.filter(item => item.section === 'charts' && item.id.includes('-chart-')).map(item => { const chartAirport = airports.find(value => value.id === item.airportId); return chartAirport ? <ChartViewer key={item.id} item={item} airport={chartAirport} active={workspace.activeId === item.id} state={workspace.viewers[item.id] || { zoom: 100, rotation: 0, left: 0, top: 0 }} update={state => setWorkspace(previous => ({ ...previous, viewers: { ...previous.viewers, [item.id]: state } }))} pinned={workspace.pinned.some(value => value.id === item.id)} onPin={() => togglePin(item)} /> : null; })}
      {workspace.section === 'weather' && airport && <section className="page-section weather-page"><div className="page-heading"><div><h1>{airport.name} weather</h1><p>{airport.id} · VATSIM METAR</p></div></div><WeatherReport airport={airport.id} /><Panel title="Controller configuration" icon={Settings}><label className="select-row">Arrivals RWY<select value={configuration?.arrivals} onChange={event => configure('arrivals', event.target.value)}>{airport.runways.map(runway => <option key={runway}>{runway}</option>)}</select></label><label className="select-row">Departures RWY<select value={configuration?.departures} onChange={event => configure('departures', event.target.value)}>{airport.runways.map(runway => <option key={runway}>{runway}</option>)}</select></label><small className="muted">Selected manually · no automated runway recommendation</small></Panel></section>}
      {workspace.section === 'procedures' && <section className="page-section procedures-page"><div className="page-heading"><div><h1>Controller quick references</h1><p>Essential reference material for Danish VATSIM controllers.</p></div></div><div className="procedure-layout"><aside className="procedure-topics"><label className="topic-search"><Search size={17} /><input placeholder="Filter references..." aria-label="Filter procedure references" value={procedureFilter} onChange={event => setProcedureFilter(event.target.value)} /></label>{topics.filter(topic => topic.toLowerCase().includes(procedureFilter.toLowerCase())).map(topic => <button key={topic} aria-current={workspace.topic === topic ? 'page' : undefined} onClick={() => openReference(topic)}><FileText size={19} />{topic}</button>)}{!topics.some(topic => topic.toLowerCase().includes(procedureFilter.toLowerCase())) && <p className="muted">No references match this filter.</p>}</aside><article className="procedure-document"><div className="document-actions"><button className="secondary" onClick={() => togglePin({ id: `reference-${workspace.topic}`, label: workspace.topic, section: 'procedures', topic: workspace.topic })}><Pin size={17} />{workspace.pinned.some(value => value.id === `reference-${workspace.topic}`) ? 'Unpin' : 'Pin'}</button><button className="secondary" onClick={async () => { try { await navigator.clipboard.writeText(`${window.location.origin}/?reference=${encodeURIComponent(workspace.topic)}`); setToast('Reference link copied.'); } catch { setToast('Clipboard unavailable. Copy the reference name instead.'); } }}><Copy size={16} />Copy link</button><SourceLink type="procedures">Full source</SourceLink></div><h2>{workspace.topic}</h2><span className="reference-status"><Info size={15} />Awaiting reviewed content</span>{['Scope', 'Quick reference', 'Coordination'].map(title => <section key={title}><h3>{title}</h3><p>Reviewed guidance has not been connected for this reference.</p></section>)}<Unavailable>This reference is not approved operational guidance. Consult the current source documentation.</Unavailable></article><aside className="related-references"><h3>Related references</h3>{['Airspace classes', 'Local procedures', 'Phraseology'].filter(topic => topic !== workspace.topic).map(topic => <button key={topic} onClick={() => openReference(topic)}><BookOpen size={24} /><div><strong>{topic}</strong><small>Open controller reference</small></div><ChevronRight size={18} /></button>)}</aside></div></section>}
      {workspace.section === 'pinned' && <section className="page-section"><div className="page-heading"><div><h1>Pinned references</h1><p>Direct access to the items you need throughout this session.</p></div><button className="secondary" onClick={() => { searchRef.current?.focus(); setSearchOpen(true); }}><Plus size={18} />Add reference</button></div>{workspace.pinned.length ? <div className="pinned-list">{workspace.pinned.map(item => <div key={item.id}><button onClick={() => openItem(item)}><Pin size={21} /><span><strong>{item.label}</strong><small>{item.airportId || 'Copenhagen FIR'} · {item.section}</small></span><ChevronRight size={18} /></button><button className="icon-button" aria-label={`Unpin ${item.label}`} onClick={() => togglePin(item)}><Trash2 size={18} /></button></div>)}</div> : <div className="empty-state"><Pin size={38} /><h2>No pinned references yet</h2><p>Open any chart or reference and select Pin to keep it close.</p><button className="primary" onClick={() => navigate('procedures')}>Browse references<ChevronRight size={17} /></button></div>}</section>}
      {workspace.section === 'tools' && <section className="page-section"><div className="page-heading"><div><h1>Workspace guide</h1><p>Workspace configuration and keyboard shortcuts.</p></div></div><Panel title="Keyboard shortcuts" icon={SlidersHorizontal}><dl className="detail-list"><div><dt>Focus global search</dt><dd><kbd>Ctrl / Cmd</kbd> + <kbd>K</kbd></dd></div><div><dt>Choose search result</dt><dd><kbd>↑</kbd> <kbd>↓</kbd> <kbd>Enter</kbd></dd></div><div><dt>Dismiss menus</dt><dd><kbd>Esc</kbd></dd></div></dl></Panel><Panel title="Session storage" icon={ShieldCheck}><p>Pins, open references, airport configuration and viewer settings are saved in this browser tab for your signed-in session.</p><button className="secondary" onClick={() => { setWorkspace(initialWorkspace); setToast('Workspace session reset.'); }}>Reset workspace session</button></Panel></section>}
      </>}
    </main>
    <footer className="session-tray"><div className="tray-label"><Pin size={21} /><strong>{workspace.open.length ? 'Open references' : 'Pinned references'}</strong></div><div className="tray-items">{(workspace.open.length ? workspace.open : workspace.pinned).map(item => <div className={`tray-item ${item.id === workspace.activeId ? 'active' : ''}`} key={item.id}><button onClick={() => openItem(item)}><FileText size={20} /><span>{item.label}</span>{workspace.pinned.some(value => value.id === item.id) && workspace.open.length > 0 && <Pin size={12} />}</button><button aria-label={workspace.open.length ? `Close ${item.label}` : `Unpin ${item.label}`} onClick={() => workspace.open.length ? closeItem(item) : togglePin(item)}><X size={15} /></button></div>)}<button className="add-reference" onClick={() => { searchRef.current?.focus(); setSearchOpen(true); }}><Plus size={18} /><span>{workspace.open.length ? 'Open reference' : 'Add reference'}</span></button></div></footer>
    {toast && <div className="toast" role="status"><Check size={17} />{toast}</div>}
  </div>;
}
