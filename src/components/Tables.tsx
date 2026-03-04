import type { RentComp, SaleComp } from "../types";
import { money, num } from "../lib/format";

export function RentalCompsTable(props: { comps: RentComp[] }) {
  if (props.comps.length === 0) return <div className="text-sm text-gray-700">No rental comps available.</div>;
  return (
    <table className="w-full text-sm border">
      <thead className="bg-gray-50">
        <tr>
          <th className="text-left p-2 border">Address</th>
          <th className="text-right p-2 border">Rent</th>
          <th className="text-right p-2 border">Beds</th>
          <th className="text-right p-2 border">Baths</th>
          <th className="text-right p-2 border">Sqft</th>
          <th className="text-right p-2 border">Miles</th>
          <th className="text-right p-2 border">Quality</th>
          <th className="text-left p-2 border">Link</th>
        </tr>
      </thead>
      <tbody>
        {props.comps.map((c, idx) => (
          <tr key={idx}>
            <td className="p-2 border">{c.address || `${c.city || ""} ${c.state || ""}`}</td>
            <td className="p-2 border text-right">{money(c.rent)}</td>
            <td className="p-2 border text-right">{num(c.bedrooms)}</td>
            <td className="p-2 border text-right">{num(c.bathrooms, 1)}</td>
            <td className="p-2 border text-right">{num(c.squareFootage)}</td>
            <td className="p-2 border text-right">{c.distanceMiles?.toFixed(2) ?? "—"}</td>
            <td className="p-2 border text-right">{c.score != null ? `${(c.score * 100).toFixed(0)}/100` : "—"}</td>
            <td className="p-2 border">
              {c.url ? (
                <a className="underline" href={c.url} target="_blank" rel="noreferrer">
                  open
                </a>
              ) : (
                "—"
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SalesCompsTable(props: { comps: SaleComp[]; onChange: (c: SaleComp[]) => void }) {
  const set = (i: number, patch: Partial<SaleComp>) => {
    const next = props.comps.map((c, idx) => (idx === i ? { ...c, ...patch } : c));
    props.onChange(next);
  };

  const add = () => {
    if (props.comps.length >= 10) return;
    props.onChange([...props.comps, { address: "", price: 0 }]);
  };

  const remove = (i: number) => props.onChange(props.comps.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-3">
      <div className="text-sm text-gray-700">
        Sales comps are auto-loaded from RentCast and can be edited manually.
      </div>
      {props.comps.map((c, i) => (
        <div key={i} className="grid grid-cols-1 md:grid-cols-6 gap-2 border rounded p-2">
          <input className="border rounded px-2 py-1 md:col-span-2" placeholder="Address" value={c.address} onChange={(e) => set(i, { address: e.target.value })} />
          <input className="border rounded px-2 py-1" type="number" placeholder="Price" value={c.price} onChange={(e) => set(i, { price: Number(e.target.value) })} />
          <input className="border rounded px-2 py-1" type="number" placeholder="Beds" value={c.bedrooms ?? ""} onChange={(e) => set(i, { bedrooms: e.target.value === "" ? undefined : Number(e.target.value) })} />
          <input className="border rounded px-2 py-1" type="number" placeholder="Baths" value={c.bathrooms ?? ""} onChange={(e) => set(i, { bathrooms: e.target.value === "" ? undefined : Number(e.target.value) })} />
          <input className="border rounded px-2 py-1" type="number" placeholder="Sqft" value={c.squareFootage ?? ""} onChange={(e) => set(i, { squareFootage: e.target.value === "" ? undefined : Number(e.target.value) })} />
          <input className="border rounded px-2 py-1 md:col-span-3" placeholder="Link (optional)" value={c.url ?? ""} onChange={(e) => set(i, { url: e.target.value })} />
          <input className="border rounded px-2 py-1 md:col-span-3" placeholder="Notes (optional)" value={c.notes ?? ""} onChange={(e) => set(i, { notes: e.target.value })} />
          <button className="text-sm underline text-left" onClick={() => remove(i)}>
            Remove
          </button>
        </div>
      ))}
      <button className="px-3 py-1 border rounded text-sm" onClick={add} disabled={props.comps.length >= 10}>
        Add sale comp (max 10)
      </button>
    </div>
  );
}
