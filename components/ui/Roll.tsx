"use client";
import { useEffect, useState } from "react";

/** Money or any number whose digits roll when it changes. The signature motion. */
export function Roll({ value, prefix = "", className }: { value: number; prefix?: string; className?: string }) {
  const text = value.toLocaleString("en-NG");
  // First paint shows the final value so there is no roll on load; rolls happen on change.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <span className={`roll ${className ?? ""}`} role="text" aria-label={`${prefix}${text}`}>
      {prefix && <span className="sym" aria-hidden="true">{prefix}</span>}
      {text.split("").map((ch, i) =>
        /\d/.test(ch) ? (
          <span className="col" key={text.length - i} aria-hidden="true">
            <span className="strip" style={{ transform: `translateY(-${Number(ch)}em)`, transitionDuration: mounted ? undefined : "0s" }}>
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => <span key={d}>{d}</span>)}
            </span>
          </span>
        ) : (
          <span className="sym" key={text.length - i} aria-hidden="true">{ch}</span>
        ),
      )}
    </span>
  );
}
