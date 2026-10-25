import { formationFor, type PlaygroundPhase } from './playground-types';

/** First paint and reduced-motion/WebGL fallback, following real phases. */
export function PlaygroundPoster({ phase }: { phase: PlaygroundPhase }) {
  const formation = formationFor(phase);
  const cards = formation === 'inspect'
    ? [[110,72,0],[220,72,0],[330,72,0],[440,72,0],[110,294,0],[220,294,0],[330,294,0],[440,294,0]]
    : formation === 'gather'
      ? [[105,95,-20],[160,60,10],[410,90,20],[440,230,-15],[350,280,5],[180,245,-10]]
      : [[125,116,-15],[409,107,12],[136,244,8],[410,249,-12],[268,67,-8],[297,294,6]];
  return <svg viewBox="0 0 560 370" fill="none" aria-hidden="true">
    <ellipse cx="280" cy="318" rx="82" ry="7" fill="#D4DFD5" opacity=".45"/>
    <g stroke="#9BB2A3" strokeWidth="1.2">
      <ellipse cx="280" cy="181" rx="138" ry="47" transform="rotate(-27 280 181)"/>
      <ellipse cx="280" cy="181" rx="138" ry="47" transform="rotate(54 280 181)"/>
    </g>
    <circle cx="280" cy="181" r="73" fill="#EAF1ED" stroke="#648575"/>
    <g stroke="#91AC9A" opacity=".7">
      <ellipse cx="280" cy="181" rx="31" ry="73"/>
      <ellipse cx="280" cy="181" rx="59" ry="73"/>
      <ellipse cx="280" cy="181" rx="73" ry="24"/>
      <ellipse cx="280" cy="181" rx="73" ry="53"/>
      <path d="M207 181h146M280 108v146"/>
    </g>
    {[[254,153,-12],[303,192,18],[297,125,25],[236,211,-23],[279,238,10],[325,166,45]].map(([x,y,r],i) => <g key={i} transform={`translate(${x} ${y}) rotate(${r})`}>
      <path d="M-9 10V-6a9 9 0 0 1 18 0v16Z" fill={i%3===0?'#284D43':'#D4DFD5'} stroke="#648575"/>
      <path d="M-4-1h8M-3 3h6" stroke={i%3===0?'#EAF1ED':'#648575'} strokeWidth="1.5"/>
    </g>)}
    {cards.map(([x,y,r],i) => <g key={i} transform={`translate(${x} ${y}) rotate(${r})`}>
      <path d="M-23-16h46a5 5 0 0 1 5 5v23a5 5 0 0 1-5 5H-9l-8 7v-7h-6a5 5 0 0 1-5-5v-23a5 5 0 0 1 5-5Z" fill={i===1?'#284D43':'#FFFFFF'} stroke="#B8C9BC"/>
      <circle cx="-16" cy="-5" r="4" fill={i===1?'#D4DFD5':'#8AA895'}/>
      <path d="M-6-6h24M-6 1h17M-19 9h36" stroke={i===1?'#EAF1ED':'#B0C4B6'} strokeWidth="2.5" strokeLinecap="round"/>
    </g>)}
  </svg>;
}

/** Static first paint and reduced-motion companion, kept above the page. */
export function GhostPoster({ phase }: { phase: PlaygroundPhase }) {
  const formation = formationFor(phase);
  return <svg viewBox="0 0 160 160" fill="none" aria-hidden="true">
    <g transform="translate(80 80) scale(1.65)">
      <ellipse cx="-32" cy="4" rx="7" ry="14" transform={`rotate(${formation === 'rest' ? 135 : 35} -32 4)`} fill="#FFFFFF" stroke="#D4DFD5"/>
      <ellipse cx="32" cy="4" rx="7" ry="14" transform="rotate(-35 32 4)" fill="#FFFFFF" stroke="#D4DFD5"/>
      <path d="M-29 25V-9a29 29 0 0 1 58 0v34q0 10-10 0t-10 1Q0 42-9 26q-5-9-10-1t-10 0Z" fill="#FFFFFF" stroke="#D4DFD5" strokeWidth="1.5"/>
      <ellipse cx="-10" cy="-9" rx="4.5" ry="6.5" fill="#284D43"/>
      <ellipse cx="10" cy="-9" rx="4.5" ry="6.5" fill="#284D43"/>
      <circle cx="-11.5" cy="-11" r="1.4" fill="#FFFFFF"/><circle cx="8.5" cy="-11" r="1.4" fill="#FFFFFF"/>
      <ellipse cx="-20" cy="2" rx="5" ry="2.7" fill="#DDAF9E"/><ellipse cx="20" cy="2" rx="5" ry="2.7" fill="#DDAF9E"/>
      <path d="M-7 5q7 10 14 0" stroke="#284D43" strokeWidth="2.5" strokeLinecap="round"/>
      {formation === 'inspect' && <g className="ghost-poster-lens" transform="translate(19 0)">
        <circle r="12" fill="#D4DFD5" fillOpacity=".18" stroke="#A86518" strokeWidth="3"/>
        <path d="M9 9l10 12" stroke="#284D43" strokeWidth="5" strokeLinecap="round"/>
      </g>}
    </g>
  </svg>;
}
