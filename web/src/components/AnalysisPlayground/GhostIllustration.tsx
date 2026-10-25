/** Shared ghost artwork for the scene fallback and homepage decoration. */
export function GhostIllustration({ waving = false }: { waving?: boolean }) {
  return <>
      <ellipse cx="-32" cy="4" rx="7" ry="14" transform={`rotate(${waving ? 135 : 35} -32 4)`} fill="#FFFFFF" stroke="#D4DFD5"/>
      <ellipse cx="32" cy="4" rx="7" ry="14" transform="rotate(-35 32 4)" fill="#FFFFFF" stroke="#D4DFD5"/>
      <path d="M-29 25V-9a29 29 0 0 1 58 0v34q0 10-10 0t-10 1Q0 42-9 26q-5-9-10-1t-10 0Z" fill="#FFFFFF" stroke="#D4DFD5" strokeWidth="1.5"/>
      <g className="ghost-face-eyes">
      <ellipse cx="-10" cy="-9" rx="4.5" ry="6.5" fill="#284D43"/>
      <ellipse cx="10" cy="-9" rx="4.5" ry="6.5" fill="#284D43"/>
      <circle cx="-11.5" cy="-11" r="1.4" fill="#FFFFFF"/><circle cx="8.5" cy="-11" r="1.4" fill="#FFFFFF"/>
      </g>
      <ellipse cx="-20" cy="2" rx="5" ry="2.7" fill="#DDAF9E"/><ellipse cx="20" cy="2" rx="5" ry="2.7" fill="#DDAF9E"/>
      <path d="M-7 5q7 10 14 0" stroke="#284D43" strokeWidth="2.5" strokeLinecap="round"/>
  </>;
}
