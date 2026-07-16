export function MosqueSilhouette({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Far background dome + minaret */}
      <ellipse cx="260" cy="90" rx="18" ry="6" fill="#1a5c38" opacity="0.4" />
      <rect x="252" y="55" width="16" height="35" rx="2" fill="#1a5c38" opacity="0.4" />
      <ellipse cx="260" cy="55" rx="10" ry="10" fill="#1a5c38" opacity="0.4" />
      <rect x="258" y="30" width="4" height="25" fill="#1a5c38" opacity="0.4" />
      <path d="M258 30 Q260 24 262 30" fill="#1a5c38" opacity="0.4" />

      {/* Small building right */}
      <rect x="278" y="68" width="20" height="28" rx="2" fill="#1a5c38" opacity="0.35" />
      <rect x="282" y="62" width="12" height="10" rx="1" fill="#1a5c38" opacity="0.35" />

      {/* Main mosque center */}
      <rect x="120" y="52" width="80" height="52" rx="3" fill="#2d7a4f" opacity="0.7" />
      {/* Main dome */}
      <ellipse cx="160" cy="52" rx="30" ry="28" fill="#2d7a4f" opacity="0.7" />
      <rect x="154" y="18" width="12" height="34" fill="#2d7a4f" opacity="0.7" />
      {/* Dome spire */}
      <path d="M154 18 Q160 8 166 18" fill="#2d7a4f" opacity="0.7" />
      <circle cx="160" cy="7" r="2.5" fill="#3a9e63" opacity="0.8" />

      {/* Left minaret */}
      <rect x="108" y="32" width="14" height="72" rx="2" fill="#2d7a4f" opacity="0.65" />
      <ellipse cx="115" cy="32" rx="9" ry="12" fill="#2d7a4f" opacity="0.65" />
      <rect x="113" y="10" width="4" height="22" fill="#2d7a4f" opacity="0.65" />
      <path d="M113 10 Q115 4 117 10" fill="#2d7a4f" opacity="0.65" />
      <circle cx="115" cy="3" r="2" fill="#3a9e63" opacity="0.75" />

      {/* Right minaret */}
      <rect x="198" y="32" width="14" height="72" rx="2" fill="#2d7a4f" opacity="0.65" />
      <ellipse cx="205" cy="32" rx="9" ry="12" fill="#2d7a4f" opacity="0.65" />
      <rect x="203" y="10" width="4" height="22" fill="#2d7a4f" opacity="0.65" />
      <path d="M203 10 Q205 4 207 10" fill="#2d7a4f" opacity="0.65" />
      <circle cx="205" cy="3" r="2" fill="#3a9e63" opacity="0.75" />

      {/* Windows on main building */}
      <rect x="140" y="72" width="10" height="14" rx="5" fill="#1a5c38" opacity="0.5" />
      <rect x="155" y="72" width="10" height="14" rx="5" fill="#1a5c38" opacity="0.5" />
      <rect x="170" y="72" width="10" height="14" rx="5" fill="#1a5c38" opacity="0.5" />

      {/* Door */}
      <rect x="151" y="86" width="18" height="18" rx="9" fill="#1a5c38" opacity="0.5" />

      {/* Far left small mosque */}
      <rect x="55" y="70" width="40" height="34" rx="2" fill="#1e6e40" opacity="0.45" />
      <ellipse cx="75" cy="70" rx="16" ry="15" fill="#1e6e40" opacity="0.45" />
      <rect x="72" y="48" width="6" height="22" fill="#1e6e40" opacity="0.45" />
      <path d="M72 48 Q75 42 78 48" fill="#1e6e40" opacity="0.45" />
      <rect x="47" y="52" width="10" height="52" rx="2" fill="#1e6e40" opacity="0.4" />
      <ellipse cx="52" cy="52" rx="7" ry="9" fill="#1e6e40" opacity="0.4" />
      <rect x="95" y="52" width="10" height="52" rx="2" fill="#1e6e40" opacity="0.4" />
      <ellipse cx="100" cy="52" rx="7" ry="9" fill="#1e6e40" opacity="0.4" />

      {/* Ground line */}
      <rect x="0" y="104" width="320" height="2" rx="1" fill="#1a5c38" opacity="0.3" />

      {/* Trees / bushes */}
      <ellipse cx="30" cy="100" rx="14" ry="10" fill="#1a5c38" opacity="0.35" />
      <ellipse cx="290" cy="100" rx="14" ry="10" fill="#1a5c38" opacity="0.35" />
    </svg>
  );
}

export function MosqueSilhouetteMini({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Right side mosque */}
      <rect x="110" y="38" width="55" height="62" rx="2" fill="#2d7a4f" opacity="0.5" />
      <ellipse cx="138" cy="38" rx="22" ry="20" fill="#2d7a4f" opacity="0.5" />
      <rect x="133" y="13" width="9" height="25" fill="#2d7a4f" opacity="0.5" />
      <path d="M133 13 Q138 6 143 13" fill="#2d7a4f" opacity="0.5" />
      <circle cx="138" cy="5" r="2" fill="#3a9e63" opacity="0.7" />
      
      {/* Left minaret */}
      <rect x="100" y="28" width="11" height="72" rx="2" fill="#2d7a4f" opacity="0.45" />
      <ellipse cx="106" cy="28" rx="7" ry="9" fill="#2d7a4f" opacity="0.45" />
      <rect x="104" y="10" width="3" height="18" fill="#2d7a4f" opacity="0.45" />
      
      {/* Right minaret */}
      <rect x="165" y="28" width="11" height="72" rx="2" fill="#2d7a4f" opacity="0.45" />
      <ellipse cx="171" cy="28" rx="7" ry="9" fill="#2d7a4f" opacity="0.45" />
      <rect x="169" y="10" width="3" height="18" fill="#2d7a4f" opacity="0.45" />

      {/* Left small building */}
      <rect x="55" y="58" width="35" height="42" rx="2" fill="#1e6e40" opacity="0.38" />
      <ellipse cx="72" cy="58" rx="14" ry="13" fill="#1e6e40" opacity="0.38" />
      <rect x="69" y="38" width="5" height="20" fill="#1e6e40" opacity="0.38" />

      {/* Far left tiny */}
      <rect x="20" y="68" width="25" height="32" rx="2" fill="#1a5c38" opacity="0.3" />
      <ellipse cx="33" cy="68" rx="10" ry="10" fill="#1a5c38" opacity="0.3" />
      <rect x="30" y="52" width="4" height="16" fill="#1a5c38" opacity="0.3" />

      {/* Trees */}
      <ellipse cx="10" cy="92" rx="10" ry="8" fill="#1a5c38" opacity="0.3" />
      <ellipse cx="190" cy="92" rx="10" ry="8" fill="#1a5c38" opacity="0.3" />

      {/* Ground */}
      <rect x="0" y="98" width="200" height="2" rx="1" fill="#1a5c38" opacity="0.25" />
    </svg>
  );
}
