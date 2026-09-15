"use client";

import { useState } from "react";
import Link from "next/link";

type SimilarBidItem = { itemNo: string; category: string; description: string | null; qty: string; unit: string | null; unitPrice: string };
type SimilarBid = {
  id: string;
  jobName: string;
  customer: string | null;
  bidStatus: string;
  jobType: string | null;
  matchedOn: ("customer" | "jobType")[];
  totalBidPrice: number;
  items: SimilarBidItem[];
};

export default function SimilarBidsSection({ bids }: { bids: SimilarBid[] }) {
  if (!bids.length) return null;

  return (
    <div style={cardStyle}>
      <h3 style={{ fontSize: "1.02rem", textTransform: "uppercase", marginBottom: 4 }}>Similar Past Bids</h3>
      <p style={{ fontSize: "0.78rem", color: "var(--muted)", marginBottom: 14 }}>
        Same client or similar job type — use these to sanity-check your numbers before submitting.
      </p>
      {bids.map((b) => (
        <SimilarBidRow key={b.id} bid={b} />
      ))}
    </div>
  );
}

function SimilarBidRow({ bid }: { bid: SimilarBid }) {
  const [expanded, setExpanded] = useState(false);
  const statusColor = bid.bidStatus === "Won" ? "var(--active, #2e7d32)" : bid.bidStatus === "Lost" ? "var(--danger, #c0392b)" : "var(--muted)";

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div>
          <Link href={`/opportunities/${bid.id}`} style={{ fontWeight: 600, fontSize: "0.88rem", color: "inherit" }}>
            {bid.jobName}
          </Link>
          <div style={{ fontSize: "0.76rem", color: "var(--muted)" }}>
            {bid.customer || "—"} {bid.jobType ? `· ${bid.jobType}` : ""}
          </div>
          <div style={{ display: "flex", gap: 5, marginTop: 4 }}>
            {bid.matchedOn.includes("customer") && <span style={matchChipStyle}>Same client</span>}
            {bid.matchedOn.includes("jobType") && <span style={matchChipStyle}>Similar scope</span>}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ textTransform: "uppercase", fontWeight: 700, fontSize: "0.72rem", color: statusColor }}>{bid.bidStatus}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>${bid.totalBidPrice.toLocaleString()}</span>
          <button onClick={() => setExpanded((s) => !s)} style={addBtnStyle} disabled={!bid.items.length}>
            {expanded ? "Hide" : "View Items"}
          </button>
        </div>
      </div>

      {expanded && !!bid.items.length && (
        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
            <thead>
              <tr>
                {["#", "Category", "Description", "Qty", "Unit", "Unit Price"].map((h) => (
                  <th key={h} style={thStyle}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bid.items.map((i, idx) => (
                <tr key={idx}>
                  <td style={tdStyle}>{i.itemNo}</td>
                  <td style={{ ...tdStyle, fontFamily: "inherit" }}>{i.category}</td>
                  <td style={{ ...tdStyle, fontFamily: "inherit", whiteSpace: "normal", minWidth: 160 }}>{i.description}</td>
                  <td style={tdStyle}>{i.qty}</td>
                  <td style={tdStyle}>{i.unit}</td>
                  <td style={tdStyle}>${Number(i.unitPrice).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 };
const addBtnStyle: React.CSSProperties = { background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink)", padding: "6px 13px", borderRadius: 6, fontSize: "0.8rem", fontWeight: 600, cursor: "pointer" };
const matchChipStyle: React.CSSProperties = { background: "var(--surface-2)", color: "var(--ink-soft)", fontSize: "0.68rem", fontWeight: 700, padding: "2px 7px", borderRadius: 20, textTransform: "uppercase" };
const thStyle: React.CSSProperties = { textAlign: "left", fontSize: "0.66rem", textTransform: "uppercase", color: "var(--muted)", padding: "6px 9px", background: "var(--surface-2)", whiteSpace: "nowrap" };
const tdStyle: React.CSSProperties = { padding: "6px 9px", fontFamily: "var(--font-mono)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
