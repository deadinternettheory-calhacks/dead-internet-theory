/** Lightweight first paint and a complete illustration when WebGL is unavailable. */
export function GlobePoster() {
  return <svg className="globe-poster" viewBox="0 0 480 340" fill="none" aria-hidden="true">
    <g stroke="#759084" strokeWidth=".8" opacity=".65">
      <circle cx="240" cy="162" r="116"/>
      <ellipse cx="240" cy="162" rx="76" ry="116"/>
      <ellipse cx="240" cy="162" rx="29" ry="116"/>
      <ellipse cx="240" cy="162" rx="116" ry="29"/>
      <ellipse cx="240" cy="162" rx="116" ry="76"/>
      <path d="M124 162h232M240 46v232"/>
    </g>
    {[
      [208, 137, -12], [269, 190, 18], [287, 100, 28], [168, 194, -30],
      [228, 239, 12], [327, 152, 55], [195, 77, -30], [138, 133, -65],
    ].map(([x, y, angle], i) => <g key={i} transform={`translate(${x} ${y}) rotate(${angle})`}>
      <path d="M-11 13V-8a11 11 0 0 1 22 0v21Z" fill={i % 3 === 0 ? '#284D43' : '#EAF1ED'} stroke="#648575" strokeWidth="1.2"/>
      <path d="M-5 0H5M-3 5H3" stroke={i % 3 === 0 ? '#EAF1ED' : '#759084'} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M-14 13h28v4h-28Z" fill="#C5D2C9"/>
    </g>)}
  </svg>;
}
