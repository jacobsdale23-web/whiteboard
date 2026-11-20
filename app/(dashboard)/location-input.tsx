"use client";

import { useEffect, useId, useRef, useState } from "react";

const STATES: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO", Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA",
  Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS", Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH",
  "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR",
  Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT",
  Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY",
};

type Feature = { properties: { name?: string; state?: string; countrycode?: string; county?: string } };

// A location box that suggests real U.S. cities and towns as you type ("Lul" -> "Luling, LA"). It is still a plain text
// box: anything can be typed (street addresses, "Hwy 90 at Raceland"), and if the suggestion service can't be reached
// it simply behaves like a normal box. Only the letters typed are sent to the suggestion service, nothing else.
export default function LocationInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const listId = useId();
  const [options, setOptions] = useState<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      abort.current?.abort();
    },
    []
  );

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    props.onChange?.(e);
    const typed = e.target.value;
    if (timer.current) clearTimeout(timer.current);
    // Suggest for the city part only; skip street addresses (anything with a digit) and very short text.
    const q = typed.split(",")[0].trim();
    if (q.length < 3 || /\d/.test(q)) {
      setOptions([]);
      return;
    }
    timer.current = setTimeout(async () => {
      abort.current?.abort();
      const ctl = new AbortController();
      abort.current = ctl;
      try {
        const url =
          `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=10&lang=en&lat=30.5&lon=-91&bbox=-125,24,-66,50` +
          "&osm_tag=place:city&osm_tag=place:town&osm_tag=place:village&osm_tag=place:hamlet&osm_tag=place:suburb";
        const res = await fetch(url, { signal: ctl.signal });
        if (!res.ok) return;
        const json = (await res.json()) as { features?: Feature[] };
        const seen = new Set<string>();
        const out: string[] = [];
        for (const f of json.features || []) {
          const p = f.properties;
          const st = p.state ? STATES[p.state] : undefined;
          if (p.countrycode !== "US" || !p.name || !st) continue;
          const label = `${p.name}, ${st}`;
          if (!seen.has(label)) {
            seen.add(label);
            out.push(label);
          }
        }
        setOptions(out);
      } catch {
        /* offline or blocked: act like a plain text box */
      }
    }, 300);
  }

  return (
    <>
      <input {...props} type="text" list={listId} autoComplete="off" onChange={onChange} />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </>
  );
}
