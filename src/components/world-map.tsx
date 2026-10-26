"use client";

import { ComposableMap, Geographies, Geography, Marker } from "react-simple-maps";
import { useEffect, useState } from "react";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// City coordinates [lng, lat] for known banner countries.
const COORDS: Record<string, [number, number]> = {
    Spain: [-3.7038, 40.4168],
    France: [2.3522, 48.8566],
    Germany: [11.582, 48.1351],
    Italy: [9.19, 45.4642],
    Singapore: [103.8198, 1.3521],
    Thailand: [100.5018, 13.7563],
    Australia: [151.2093, -33.8688],
    England: [-0.1278, 51.5074],
    Austria: [16.3738, 48.2082],
    Switzerland: [8.5417, 47.3769],
    Netherlands: [4.9041, 52.3676],
};

export interface MapPoint { country: string; count: number; banner: string }

export function WorldMap({ points }: { points: MapPoint[] }) {
    const [hover, setHover] = useState<MapPoint | null>(null);
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    const max = Math.max(...points.map((p) => p.count), 1);

    // The d3-geo projection math behind react-simple-maps can differ in the last
    // float digit between server and client, causing a hydration mismatch — render
    // the map client-only to sidestep it entirely.
    if (!mounted) {
        return <div className="w-full aspect-[900/420] rounded-md bg-slate-50" />;
    }

    return (
        <div className="relative w-full">
            <ComposableMap
                projectionConfig={{ scale: 145 }}
                width={900}
                height={420}
                style={{ width: "100%", height: "auto" }}
            >
                <Geographies geography={GEO_URL}>
                    {({ geographies }) =>
                        geographies.map((geo) => (
                            <Geography
                                key={geo.rsmKey}
                                geography={geo}
                                fill="#e8eef5"
                                stroke="#cbd5e1"
                                strokeWidth={0.4}
                                style={{ default: { outline: "none" }, hover: { fill: "#dbe4ee", outline: "none" }, pressed: { outline: "none" } }}
                            />
                        ))
                    }
                </Geographies>
                {points.map((p) => {
                    const coord = COORDS[p.country];
                    if (!coord) return null;
                    const r = 6 + (p.count / max) * 16;
                    return (
                        <Marker key={p.country} coordinates={coord}
                            onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)}>
                            <circle r={r} fill="#0b1f3a" fillOpacity={0.18} />
                            <circle r={r * 0.5} fill="#0b1f3a" fillOpacity={0.85} />
                            <text textAnchor="middle" y={-r - 4} className="fill-[#0b1f3a]" style={{ fontSize: 10, fontWeight: 700 }}>
                                {p.count}
                            </text>
                        </Marker>
                    );
                })}
            </ComposableMap>
            {hover && (
                <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md bg-[#0b1f3a] px-3 py-1.5 text-xs text-white shadow">
                    <strong>{hover.country}</strong> · {hover.count} employees · {hover.banner}
                </div>
            )}
        </div>
    );
}
