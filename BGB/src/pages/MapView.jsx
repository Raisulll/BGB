import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip } from 'react-leaflet';
import { BD_LIMIT, BD_VIEW, TILE_ATTRIBUTION, TILE_URL } from '../lib/leaflet';
import BangladeshFrame from '../components/map/BangladeshFrame';
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

export default function MapView() {
  const { meta } = useApp();
  const { t, tv } = useI18n();
  const [category, setCategory] = useState('');
  const [severity, setSeverity] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // points = one marker per location (default), clusters = grouped by zoom, heat = density by severity
  const [mode, setMode] = useState('points');

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

  // Group incidents by GPS location / BOP and extract last 2 recent incidents
  const locationGroups = useMemo(() => {
    const groups = {};
    filtered.forEach((inc) => {
      const key = `${inc.bop || inc.location || 'BOP'}_${inc.lat.toFixed(3)}_${inc.lng.toFixed(3)}`;
      if (!groups[key]) {
        groups[key] = {
          key,
          bop: inc.bop || inc.location || t('map.point'),
          lat: inc.lat,
          lng: inc.lng,
          incidents: [],
        };
      }
      groups[key].incidents.push(inc);
    });

    Object.values(groups).forEach((g) => {
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

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Map Filter Bar */}
      <Card bodyClassName="p-3 sm:p-4">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-5">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
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
              onChange={(e) => setSeverity(e.target.value)}
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
              onChange={(e) => setStatus(e.target.value)}
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
              <input id="map-date-from" type="date" value={dateFrom} max={dateTo || undefined} onChange={(e) => setDateFrom(e.target.value)} className="form-input min-w-0" />
            </label>
            <label className="flex items-center gap-2">
              <span className="w-10 shrink-0 text-xs font-medium text-gray-500">{t('incidents.dateTo')}</span>
              <input id="map-date-to" type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} className="form-input min-w-0" />
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
          {/* Quarter-step zoom so Bangladesh fills the map instead of jumping between whole levels */}
          <MapContainer bounds={BD_VIEW} maxBounds={BD_LIMIT} maxBoundsViscosity={1} zoomSnap={0.25} zoomDelta={0.5} className="h-full w-full">
            <BangladeshFrame />
            <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} bounds={BD_LIMIT} noWrap />
            {mode === 'clusters' && <ClusterLayer incidents={filtered} labels={layerLabels} />}
            {mode === 'heat' && <HeatLayer incidents={filtered} />}
            {mode === 'points' && locationGroups.map((loc) => (
              <CircleMarker
                key={loc.key}
                center={[loc.lat, loc.lng]}
                radius={12}
                pathOptions={{
                  fillColor: SEVERITY_HEX[loc.highestSeverity] || '#6b7280',
                  color: '#ffffff',
                  weight: 2.5,
                  fillOpacity: 0.9,
                }}
              >
                {/* Hover Tooltip displaying last 2 recent incidents */}
                <Tooltip direction="top" offset={[0, -10]} opacity={0.98} sticky>
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

                {/* Click Popup displaying detailed cards for last 2 incidents */}
                <Popup>
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
                              className="text-xs font-bold text-bgb-700 hover:text-bgb-900 hover:underline"
                            >
                              {t('map.viewDetails')} &rarr;
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
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
