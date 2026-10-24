import React from 'react';

/** Accessible, token-restyled base button following the project's shadcn/ui control pattern. */
export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;
export function Button({ className = '', ...props }: ButtonProps) {
  return <button className={`primary-button ${className}`.trim()} {...props}/>;
}
