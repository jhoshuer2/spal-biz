import { useId } from "react";

/** The Spal mark: two voices. The small shape is her, the larger one is Spal, and where they meet is left empty.
 *  Colours come from --logo-you and --logo-spal so it is right in light, dark and auto. */
export function Logo({ size = 32, title = "Spal" }: { size?: number; title?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={title}>
      <defs>
        <mask id={id + "a"}><rect width="100" height="100" fill="#fff" /><path d="M13 35 A22 22 0 0 1 35 13 A22 22 0 0 1 57 35 L57 57 L35 57 A22 22 0 0 1 13 35 Z" fill="#000" /></mask>
        <mask id={id + "b"}><rect width="100" height="100" fill="#fff" /><path d="M89 63 A29 29 0 0 1 60 92 A29 29 0 0 1 31 63 L31 34 L60 34 A29 29 0 0 1 89 63 Z" fill="#000" /></mask>
      </defs>
      <path d="M89 63 A29 29 0 0 1 60 92 A29 29 0 0 1 31 63 L31 34 L60 34 A29 29 0 0 1 89 63 Z" fill="var(--logo-spal)" mask={`url(#${id}a)`} />
      <path d="M13 35 A22 22 0 0 1 35 13 A22 22 0 0 1 57 35 L57 57 L35 57 A22 22 0 0 1 13 35 Z" fill="var(--logo-you)" mask={`url(#${id}b)`} />
    </svg>
  );
}
