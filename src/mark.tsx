import { productName } from "./copy";

const flourish = "M10 5 C 30 5, 45 15, 85 5 L 88 12 C 55 25, 35 15, 10 32 Z";
const fold = "M85 5 L 78 8";

export function QuireMark({ className }: { className?: string }) {
  const initial = productName.slice(0, 1);
  const mid = productName.slice(1, 3);
  const tail = productName.slice(3);

  return (
    <span className={["quire-mark", className].filter(Boolean).join(" ")}>
      <span className="quire-mark-word">
        <span className="quire-mark-qui">
          <span className="quire-mark-q">
            {initial}
            <svg className="quire-mark-flourish" viewBox="0 0 100 40" aria-hidden="true">
              <path d={flourish} />
              <path className="quire-mark-fold" d={fold} />
            </svg>
          </span>
          {mid}
        </span>
        {tail}
      </span>
      <span className="quire-mark-stitch" aria-hidden="true" />
    </span>
  );
}
