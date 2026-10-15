export default function Logo({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 176 176" className="shrink-0">
      <defs>
        <linearGradient id="lgGold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#E8C97A" />
          <stop offset="55%" stopColor="#C9A44C" />
          <stop offset="100%" stopColor="#9C7C33" />
        </linearGradient>
      </defs>
      <rect width="176" height="176" rx="38" fill="#141311" stroke="#C9A44C" strokeWidth="1.5" opacity="0.6" />
      <g stroke="#8A8580" strokeWidth="3" opacity="0.9">
        <line x1="42" y1="140" x2="118" y2="46" />
        <line x1="126" y1="140" x2="64" y2="40" />
      </g>
      <path d="M118 46 L124 39 L130 46 Z" fill="#D8D2C4" />
      <path d="M64 40 L59 33 L69 33 Z" fill="#D8D2C4" />
      <path d="M118 46 L138 53 L118 58 Z" fill="#A13D2D" />
      <path
        d="M88 50 C 110 50 120 74 120 92 C 120 120 105 140 88 147 C 71 140 56 120 56 92 C 56 74 66 50 88 50 Z"
        fill="#EDE6D6"
        stroke="#0B0B0C"
        strokeWidth="1.5"
      />
      <line x1="88" y1="54" x2="88" y2="143" stroke="#0B0B0C" strokeWidth="1.5" />
      <g fill="#0B0B0C">
        <rect x="80" y="62" width="16" height="5" />
        <rect x="80" y="72" width="16" height="5" />
        <rect x="80" y="82" width="16" height="5" />
        <rect x="80" y="92" width="16" height="5" />
        <rect x="80" y="102" width="16" height="5" />
        <rect x="80" y="112" width="16" height="5" />
        <rect x="80" y="122" width="16" height="5" />
      </g>
      <g transform="translate(112, 100) scale(0.22)">
        <path
          d="M 176 152 L 304 152 L 304 196 L 208 196 L 208 220 L 304 220 L 304 328 L 176 328 L 176 284 L 272 284 L 272 260 L 176 260 Z"
          fill="url(#lgGold)"
        />
      </g>
    </svg>
  );
}
