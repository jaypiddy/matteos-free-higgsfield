"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export interface RowItem {
  key: string;
  /** width / height, used to size the tile within its row. */
  ratio: number;
  render: (style: React.CSSProperties) => ReactNode;
}

/**
 * Justified rows, the way a photo gallery lays out.
 *
 * Items flow left-to-right and wrap, so the newest sits top-left and the next
 * one is beside it. Column masonry reads top-to-bottom instead, which puts the
 * second-newest underneath the newest — confusing for a newest-first library.
 *
 * Each row is filled greedily, then scaled so it spans the full width exactly,
 * which keeps every aspect ratio intact with no cropping and no ragged edge.
 * No image measuring is needed because each tile's ratio is known up front
 * from the parameters its job was submitted with.
 */
export default function JustifiedRows({
  items,
  targetHeight = 270,
  gap = 14,
}: {
  items: RowItem[];
  targetHeight?: number;
  gap?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Before the first measurement there's no sensible width to lay out against.
  if (!width) return <div ref={ref} style={{ minHeight: "6rem" }} />;

  const rows: RowItem[][] = [];
  let row: RowItem[] = [];
  let ratioSum = 0;

  for (const item of items) {
    row.push(item);
    ratioSum += item.ratio;
    // Width the row would occupy at the target height, including its gaps.
    const projected = ratioSum * targetHeight + (row.length - 1) * gap;
    if (projected >= width) {
      rows.push(row);
      row = [];
      ratioSum = 0;
    }
  }
  if (row.length) rows.push(row);

  return (
    <div ref={ref} style={{ display: "flex", flexDirection: "column", gap }}>
      {rows.map((r, i) => {
        const sum = r.reduce((a, b) => a + b.ratio, 0);
        const available = width - (r.length - 1) * gap;
        // The final row keeps the target height rather than stretching a
        // couple of tiles across the full width.
        const isLast = i === rows.length - 1;
        const projected = sum * targetHeight + (r.length - 1) * gap;
        const h = isLast && projected < width ? targetHeight : available / sum;

        return (
          <div key={i} style={{ display: "flex", gap }}>
            {r.map((item) =>
              item.render({ width: item.ratio * h, height: h, flexShrink: 0 }),
            )}
          </div>
        );
      })}
    </div>
  );
}
