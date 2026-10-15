import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { MapContainer, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { BD_LIMIT, BD_VIEW } from '../lib/leaflet';
import BaseMap from '../components/map/BaseMap';
import BangladeshFrame from '../components/map/BangladeshFrame';
import { FitToIncidents, focusOn, ZoomControls } from '../components/map/FocusZoom';
import { useApp } from '../context/AppContext';
import * as incidentsApi from '../api/incidents';
import useApi from '../hooks/useApi';
import { formatDateDisplay, SEVERITY_HEX } from '../utils/helpers';
import { StatusBadge } from '../components/ui/Badges';
import { ClusterLayer, HeatLayer } from '../components/map/MapLayers';
import { cn } from '../utils/helpers';
import Card from '../components/ui/Card';
import ErrorState from '../components/ui/ErrorState';
import { useI18n } from '../i18n/I18nContext';

// Spec #18 — a location's marker shows how many incidents happened there and grows with the
// number, coloured by the most severe one
const locationIcons = new Map();
function locationIcon(severity, n) {
  const id = `${severity}:${n}`;
  if (!locationIcons.has(id)) {
    const size = 26 + Math.min(16, Math.round(Math.log2(n) * 5));
    locationIcons.set(
      id,
      L.divIcon({
        className: 'map-location',
        html: `<div style="width:${size}px;height:${size}px;background:${SEVERITY_HEX[severity] || '#6b7280'}">${n}</div>`,
        iconSize: [size, size],
        popupAnchor: [0, -size / 2],
        tooltipAnchor: [0, -size / 2],
      }),
    );
  }
  return locationIcons.get(id);
}

// Map state kept in the URL (filters, display mode, view, open location), so Back from an
// incident or the incidents list returns to the map exactly as it was left
const FILTER_KEYS = ['category', 'severity', 'status', 'dateFrom', 'dateTo'];
const MODE_IDS = ['points', 'clusters', 'heat'];

/** "lat,lng,zoom" from the URL, or null */
function parseView(v) {
  const [lat, lng, zoom] = (v || '').split(',').map(Number);
  return [lat, lng, zoom].every(Number.isFinite) ? { center: [lat, lng], zoom } : null;
}

/** Writes the map's centre and zoom to the URL after every move */
function TrackView({ onChange }) {
  const map = useMap();
  useEffect(() => {
    const save = () => {
      const c = map.getCenter();
      onChange(`${c.lat.toFixed(5)},${c.lng.toFixed(5)},${map.getZoom()}`);
    };
    map.on('moveend', save);
    return () => map.off('moveend', save);
  }, [map, onChange]);
  return null;
}

/** Spec #16 — the incidents list for one location, with the map's filters (archived included, as on the map) */
function locationListUrl(loc, filters) {
  const p = new URLSearchParams({ archived: 'include' });
  if (loc.sector) p.set('sector', loc.sector);
  if (loc.battalion) p.set('battalion', loc.battalion);
  p.set('bop', loc.bopName);
  for (const k of FILTER_KEYS) if (filters[k]) p.set(k, filters[k]);
  return `/incidents?${p}`;
}

export default function MapView() {
  const { meta } = useApp();
  const { t, tv } = useI18n();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || '']));
  const { category, severity, status, dateFrom, dateTo } = filters;
  // points = one marker per BOP (default), clusters = grouped by zoom, heat = density by severity
  const mode = MODE_IDS.includes(params.get('mode')) ? params.get('mode') : 'points';
  const openAt = params.get('at'); // location whose popup is open
  const [map, setMap] = useState(null);
  // Read once: a view in the URL on arrival (Back, reload) is restored instead of fitting to the incidents
  const [restored] = useState(() => parseView(params.get('v')));
  const markers = useRef({});
  // False once the page is leaving: Leaflet closes the open popup while tearing down, and that must
  // not write to the next page's URL. Layout cleanups run before react-leaflet removes its layers.
  const active = useRef(true);
  useLayoutEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  const patchParams = useCallback(
    (patch) =>
      active.current &&
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );
  const setFilter = (key) => (e) => patchParams({ [key]: e.target.value, at: '' });
  const setMode = (id) => patchParams({ mode: id === 'points' ? '' : id, at: '' });
  const saveView = useCallback((v) => patchParams({ v }), [patchParams]);

  // Specs #8, #18 — markers for geotagged incidents within the user's scope, filtered server-side
  const { data, error, message, reload } = useApi(
    () => incidentsApi.gis({ category, severity, status, dateFrom, dateTo }),
    [category, severity, status, dateFrom, dateTo],
  );
  const layerLabels = useMemo(() => ({ view: t('map.viewDetails'), severity: (s) => tv('severity', s), status: (s) => tv('status', s) }), [t, tv]);
  const MODES = [
    ['points', 'fa-map-marker-alt', t('map.modePoints')],
    ['clusters', 'fa-circle-nodes', t('map.modeClusters')],
    ['heat', 'fa-fire', t('map.modeHeat')],
  ];
  const filtered = useMemo(() => (data || []).filter((i) => i.lat != null && i.lng != null), [data]);

  // One marker per BOP (the place the incidents list can filter by), at the spot where most of
  // its incidents were recorded; incidents without a BOP are grouped by spot
  const locationGroups = useMemo(() => {
    const groups = {};
    filtered.forEach((inc) => {
      const spot = `${inc.lat.toFixed(3)},${inc.lng.toFixed(3)}`;
      const key = inc.bop ? `bop:${inc.bop}` : `at:${spot}`;
      const g = (groups[key] ??= { key, bopName: inc.bop || '', bop: inc.bop || t('map.point'), sector: inc.sector, battalion: inc.battalion, incidents: [], spots: {} });
      g.incidents.push(inc);
      const s = (g.spots[spot] ??= { lat: inc.lat, lng: inc.lng, n: 0 });
      s.n += 1;
    });

    Object.values(groups).forEach((g) => {
      const main = Object.values(g.spots).reduce((a, b) => (b.n > a.n ? b : a));
      g.lat = main.lat;
      g.lng = main.lng;
      // Sort by date descending to get the most recent incidents first
      g.incidents.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      g.recentTwo = g.incidents.slice(0, 2);

      // Determine highest severity for marker fill color
      const severities = g.incidents.map((i) => i.severity);
      if (severities.includes('Critical')) g.highestSeverity = 'Critical';
      else if (severities.includes('High')) g.highestSeverity = 'High';
      else if (severities.includes('Medium')) g.highestSeverity = 'Medium';
      else g.highestSeverity = 'Low';
    });

    return Object.values(groups);
  }, [filtered, t]);

  // Coming back: reopen the popup that was open on arrival (the view itself is already restored).
  // The markers exist only once the map has been created, so this waits for both; opening on the
  // next tick lets newly mounted markers settle first.
  const [arrivalAt] = useState(openAt);
  const reopened = useRef(false);
  useEffect(() => {
    if (reopened.current || !map || !arrivalAt || mode !== 'points' || !markers.current[arrivalAt]) return undefined;
    const timer = setTimeout(() => {
      reopened.current = true;
      markers.current[arrivalAt]?.openPopup();
    }, 0);
    return () => clearTimeout(timer);
  }, [map, arrivalAt, mode, locationGroups]);

  // Leaving for an incident or the list: the map's address goes along for the "Back to the map" link
  const backState = { backTo: `${location.pathname}${location.search}` };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Map Filter Bar */}
      <Card bodyClassName="p-3 sm:p-4">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-5">
            <select
              value={category}
              onChange={setFilter('category')}
              className="form-input"
              aria-label={t('map.filterCategory')}
            >
              <option value="">{t('common.allCategories')}</option>
              {(meta?.categories || []).map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={severity}
              onChange={setFilter('severity')}
              className="form-input"
              aria-label={t('map.filterSeverity')}
            >
              <option value="">{t('common.allSeverity')}</option>
              {(meta?.severities || []).map((s) => (
                <option key={s} value={s}>
                  {tv('severity', s)}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={setFilter('status')}
              className="form-input"
              aria-label={t('map.filterStatus')}
            >
              <option value="">{t('common.allStatus')}</option>
              {(meta?.statuses || []).map((s) => (
                <option key={s} value={s}>
                  {tv('status', s)}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2">
              <span className="w-10 shrink-0 text-xs font-medium text-gray-500">{t('incidents.dateFrom')}</span>
              <input id="map-date-from" type="date" value={dateFrom} max={dateTo || undefined} onChange={setFilter('dateFrom')} className="form-input min-w-0" />
            </label>
            <label className="flex items-center gap-2">
              <span className="w-10 shrink-0 text-xs font-medium text-gray-500">{t('incidents.dateTo')}</span>
              <input id="map-date-to" type="date" value={dateTo} min={dateFrom || undefined} onChange={setFilter('dateTo')} className="form-input min-w-0" />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600 sm:gap-4">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> {tv('severity', 'Critical')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-orange-500" /> {tv('severity', 'High')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-500" /> {tv('severity', 'Medium')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500" /> {tv('severity', 'Low')}
            </span>
          </div>
        </div>
      </Card>

      {error && (
        <Card>
          <ErrorState message={message} onRetry={reload} />
        </Card>
      )}

      {/* Interactive GIS Map */}
      <Card bodyClassName="p-2 sm:p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 sm:mb-3">
          <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-1" role="group" aria-label={t('map.mode')}>
            {MODES.map(([id, icon, label]) => (
              <button
                key={id}
                id={`map-mode-${id}`}
                type="button"
                onClick={() => setMode(id)}
                aria-pressed={mode === id}
                className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors', mode === id ? 'bg-bgb-700 text-white shadow-sm' : 'text-gray-600 hover:bg-white')}
              >
                <i className={`fas ${icon}`} /> {label}
              </button>
            ))}
          </div>
          <span className="text-xs text-gray-500">{t('map.shown', { n: filtered.length })}</span>
        </div>
        <div className="h-[440px] overflow-hidden rounded-md sm:h-[620px]">
          {/* Quarter-step zoom so Bangladesh fills the map instead of jumping between whole levels.
              Leaflet's own +/- is replaced by ZoomControls, which appear once the map is zoomed in. */}
          <MapContainer
            ref={setMap}
            {...(restored ? { center: restored.center, zoom: restored.zoom } : { bounds: BD_VIEW })}
            maxBounds={BD_LIMIT} maxBoundsViscosity={1} zoomSnap={0.25} zoomDelta={0.5} maxZoom={18} zoomControl={false} className="h-full w-full">
            <BangladeshFrame />
            <FitToIncidents points={locationGroups.map((g) => [g.lat, g.lng])} ready={data != null} keepFirst={Boolean(restored)} />
            <TrackView onChange={saveView} />
            <ZoomControls />
            <BaseMap />
            {mode === 'clusters' && <ClusterLayer incidents={filtered} labels={layerLabels} />}
            {mode === 'heat' && <HeatLayer incidents={filtered} />}
            {mode === 'points' && locationGroups.map((loc) => (
              <Marker
                key={loc.key}
                position={[loc.lat, loc.lng]}
                icon={locationIcon(loc.highestSeverity, loc.incidents.length)}
                title={loc.bop}
                zIndexOffset={loc.incidents.length * 100} // where markers overlap, the busiest location stays readable
                ref={(m) => {
                  if (m) markers.current[loc.key] = m;
                  else delete markers.current[loc.key];
                }}
                eventHandlers={{
                  click: (e) => map && focusOn(map, e.target.getLatLng()),
                  popupopen: () => patchParams({ at: loc.key }),
                  popupclose: () => patchParams({ at: '' }),
                }}
              >
                {/* Hover Tooltip displaying last 2 recent incidents */}
                <Tooltip direction="top" opacity={0.98}>
                  <div className="p-1 space-y-1.5 min-w-[200px]">
                    <div className="flex items-center justify-between border-b border-gray-200 pb-1">
                      <span className="font-semibold text-xs text-bgb-900">{loc.bop}</span>
                      <span className="rounded bg-bgb-100 px-1.5 py-0.5 text-xs font-bold text-bgb-800">
                        {t('map.total', { n: loc.incidents.length })}
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-gray-500">
                      {t('map.recentTwo')}
                    </div>
                    <div className="space-y-1">
                      {loc.recentTwo.map((inc, i) => (
                        <div key={inc.id} className="rounded bg-gray-50 p-1.5 border-l-2 border-bgb-600 text-xs">
                          <div className="font-bold text-gray-900 leading-tight">
                            {i + 1}. {inc.title}
                          </div>
                          <div className="mt-0.5 flex items-center justify-between text-xs text-gray-500">
                            <span>{inc.id}</span>
                            <span className="font-semibold text-bgb-700">{formatDateDisplay(inc.date)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </Tooltip>

                {/* Click Popup displaying detailed cards for last 2 incidents; focusOn() positions it */}
                <Popup autoPan={false}>
                  <div className="min-w-[220px] max-w-[260px] p-1 space-y-2">
                    <div className="border-b border-gray-200 pb-1 flex items-center justify-between">
                      <span className="font-semibold text-xs text-bgb-900">{loc.bop}</span>
                      <span className="text-xs font-bold text-gray-500">{t('map.lastTwo')}</span>
                    </div>

                    <div className="space-y-2">
                      {loc.recentTwo.map((inc) => (
                        <div key={inc.id} className="rounded-lg bg-gray-50 p-2 border border-gray-200 space-y-1 shadow-sm">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-mono font-bold text-bgb-700">{inc.id}</span>
                            <span className="font-semibold text-gray-500">{formatDateDisplay(inc.date)}</span>
                          </div>
                          <p className="text-xs font-bold text-gray-900 leading-tight">{inc.title}</p>
                          <div className="flex items-center justify-between pt-1 border-t border-gray-200/60">
                            <span className="text-xs font-semibold text-gray-600">{inc.category}</span>
                            <Link
                              to={`/incidents/${inc.id}`}
                              state={backState}
                              className="text-xs font-bold text-bgb-700 hover:text-bgb-900 hover:underline"
                            >
                              {t('map.viewDetails')} &rarr;
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Spec #16 — every incident at this place, in the incidents list; Back returns here */}
                    {loc.bopName && (
                      <Link id={`map-show-all-${loc.key}`} to={locationListUrl(loc, filters)} state={backState} className="btn btn-secondary btn-sm w-full">
                        <i className="fas fa-list" /> {t('map.showAll', { n: loc.incidents.length })}
                      </Link>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </Card>

      {/* Incident Locations List */}
      <Card title={`${t('map.locations')} (${filtered.length})`} bodyClassName="max-h-[28rem] divide-y divide-slate-200 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="p-4 text-center text-sm text-gray-400">{t('map.noLocations')}</p>
        ) : (
          filtered.map((inc) => (
            <Link
              key={inc.id}
              to={`/incidents/${inc.id}`}
              state={backState}
              className="flex items-center gap-3 p-3 transition-colors hover:bg-gray-50 sm:gap-4 sm:p-4"
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full sm:h-9 sm:w-9 ${
                  inc.severity === 'Critical'
                    ? 'bg-red-100 text-red-600'
                    : inc.severity === 'High'
                    ? 'bg-orange-100 text-orange-600'
                    : inc.severity === 'Medium'
                    ? 'bg-yellow-100 text-yellow-600'
                    : 'bg-green-100 text-green-600'
                }`}
              >
                <i className="fas fa-map-marker-alt text-sm" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800">{inc.title}</p>
                <p className="text-xs text-gray-500">
                  {inc.bop} &bull; {inc.lat}, {inc.lng}
                </p>
              </div>
              <StatusBadge status={inc.status} />
            </Link>
          ))
        )}
      </Card>
    </div>
  );
}
