import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip } from 'react-leaflet';
import { TILE_ATTRIBUTION, TILE_URL } from '../lib/leaflet';
import { useApp } from '../context/AppContext';
import * as incidentsApi from '../api/incidents';
import useApi from '../hooks/useApi';
import { formatDateDisplay, SEVERITY_HEX } from '../utils/helpers';
import { StatusBadge } from '../components/ui/Badges';
import Card from '../components/ui/Card';
import ErrorState from '../components/ui/ErrorState';

export default function MapView() {
  const { meta } = useApp();
  const [category, setCategory] = useState('');
  const [severity, setSeverity] = useState('');
  const [status, setStatus] = useState('');

  // Specs #8, #18 — markers for geotagged incidents within the user's scope, filtered server-side
  const { data, error, message, reload } = useApi(() => incidentsApi.gis({ category, severity, status }), [category, severity, status]);
  const filtered = useMemo(() => (data || []).filter((i) => i.lat != null && i.lng != null), [data]);

  // Group incidents by GPS location / BOP and extract last 2 recent incidents
  const locationGroups = useMemo(() => {
    const groups = {};
    filtered.forEach((inc) => {
      const key = `${inc.bop || inc.location || 'BOP'}_${inc.lat.toFixed(3)}_${inc.lng.toFixed(3)}`;
      if (!groups[key]) {
        groups[key] = {
          key,
          bop: inc.bop || inc.location || 'Operational Point',
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
  }, [filtered]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Map Filter Bar */}
      <Card bodyClassName="p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="form-input"
              aria-label="Filter by Category"
            >
              <option value="">All Categories</option>
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
              aria-label="Filter by Severity"
            >
              <option value="">All Severity</option>
              {(meta?.severities || []).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="form-input"
              aria-label="Filter by Status"
            >
              <option value="">All Status</option>
              {(meta?.statuses || []).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600 sm:gap-4">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Critical
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-orange-500" /> High
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-500" /> Medium
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500" /> Low
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
        <div className="h-[400px] overflow-hidden rounded-xl sm:h-[520px]">
          <MapContainer center={[21.5, 92.0]} zoom={7} className="h-full w-full">
            <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
            {locationGroups.map((loc) => (
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
                      <span className="font-extrabold text-xs text-bgb-900">{loc.bop}</span>
                      <span className="rounded bg-bgb-100 px-1.5 py-0.5 text-[9px] font-bold text-bgb-800">
                        {loc.incidents.length} Total
                      </span>
                    </div>
                    <div className="text-[10px] font-extrabold uppercase text-gray-500 tracking-wider">
                      Recent Incidents (Last 2)
                    </div>
                    <div className="space-y-1">
                      {loc.recentTwo.map((inc, i) => (
                        <div key={inc.id} className="rounded bg-gray-50 p-1.5 border-l-2 border-bgb-600 text-[11px]">
                          <div className="font-bold text-gray-900 leading-tight">
                            {i + 1}. {inc.title}
                          </div>
                          <div className="mt-0.5 flex items-center justify-between text-[9px] text-gray-500">
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
                      <span className="font-extrabold text-xs text-bgb-900">{loc.bop}</span>
                      <span className="text-[10px] font-bold text-gray-500">Last 2 Incidents</span>
                    </div>

                    <div className="space-y-2">
                      {loc.recentTwo.map((inc) => (
                        <div key={inc.id} className="rounded-lg bg-gray-50 p-2 border border-gray-200 space-y-1 shadow-sm">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="font-mono font-bold text-bgb-700">{inc.id}</span>
                            <span className="font-semibold text-gray-500">{formatDateDisplay(inc.date)}</span>
                          </div>
                          <p className="text-xs font-bold text-gray-900 leading-tight">{inc.title}</p>
                          <div className="flex items-center justify-between pt-1 border-t border-gray-200/60">
                            <span className="text-[10px] font-semibold text-gray-600">{inc.category}</span>
                            <Link
                              to={`/incidents/${inc.id}`}
                              className="text-[10px] font-bold text-bgb-700 hover:text-bgb-900 hover:underline"
                            >
                              View Details &rarr;
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
      <Card title="Incident Locations" bodyClassName="divide-y divide-gray-100">
        {filtered.length === 0 ? (
          <p className="p-4 text-center text-sm text-gray-400">No matching incident locations.</p>
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
