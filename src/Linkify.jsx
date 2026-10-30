// Turns web addresses inside chat text into links that open in a new tab.
const URL_RE =
  /(https?:\/\/[^\s<>"]+|(?:www\.)?(?:[a-z0-9-]+\.)+(?:com|io|co\.za|org\.za|org|net|app|dev|ai|me|ac\.za|gov\.za|edu|info|xyz)(?:\/[^\s<>"]*)?)/gi;

export default function Linkify({ text, mine = false }) {
  const s = String(text ?? "");
  const parts = [];
  let last = 0;
  let m;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(s)) !== null) {
    const start = m.index;
    const before = start > 0 ? s[start - 1] : "";
    // part of an email address or a longer word, not a link
    if (before && /[\w@.-]/.test(before)) continue;

    const url = m[0].replace(/[.,;:!?)\]'"]+$/, "");
    if (!url) continue;

    if (start > last) parts.push(s.slice(last, start));
    const href = /^https?:\/\//i.test(url) ? url : "https://" + url;
    parts.push(
      <a
        key={start}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`underline underline-offset-2 break-all ${
          mine ? "text-[#0B0B0C] font-semibold" : "text-[#C9A44C]"
        }`}
      >
        {url}
      </a>
    );
    last = start + url.length;
  }
  if (last < s.length) parts.push(s.slice(last));
  return <>{parts}</>;
}
