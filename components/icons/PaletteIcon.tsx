import React from 'react';

export const PaletteIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    fill="none" 
    viewBox="0 0 24 24" 
    strokeWidth={1.5} 
    stroke="currentColor" 
    {...props}
    >
    <path 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402a3.75 3.75 0 00-5.304-5.304L4.098 14.6c-1.451 1.451-1.451 3.853 0 5.304zm4.596-5.304a2.25 2.25 0 00-3.182-3.182s-4.5 5.625-4.5 6.375a4.5 4.5 0 004.5 4.5c.75 0 6.375-4.5 6.375-4.5s-1.828-1.828-3.182-3.182zm9.252-9.252a2.25 2.25 0 00-3.182-3.182s-4.5 5.625-4.5 6.375a4.5 4.5 0 004.5 4.5c.75 0 6.375-4.5 6.375-4.5s-1.828-1.828-3.182-3.182z" 
    />
  </svg>
);
