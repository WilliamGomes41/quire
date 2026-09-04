import { productName } from "./copy";

const flourish = "M10 5 C 30 5, 45 15, 85 5 L 88 12 C 55 25, 35 15, 10 32 Z";
const fold = "M85 5 L 78 8";

export function QuireMark({ className }: { className?: string }) {
  const initial = productName.slice(0, 1);
  const rest = productName.slice(1);

  return (
    <span className={["quire-mark", className].filter(Boolean).join(" ")}>
      <span className="quire-mark-word">
        <span className="quire-mark-q">
          {initial}
          <svg className="quire-mark-flourish" viewBox="0 0 100 40" aria-hidden>
            <path d={flourish} />
            <path className="quire-mark-fold" d={fold} />
          </svg>
        </span>
        {rest}
      </span>
      <span className="quire-mark-stitch" aria-hidden />
    </span>
  );
}
