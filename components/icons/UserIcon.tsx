import React from 'react';

// FIX: Define IconProps to accept an optional title for accessibility.
interface IconProps extends React.SVGProps<SVGSVGElement> {
  title?: string;
}

export const UserIcon: React.FC<IconProps> = ({ title, ...props }) => (
    <svg 
        xmlns="http://www.w3.org/2000/svg" 
        fill="none" 
        viewBox="0 0 24 24" 
        strokeWidth={1.5} 
        stroke="currentColor" 
        // FIX: Add accessibility attributes based on title presence.
        aria-hidden={title ? 'false' : 'true'}
        focusable={title ? 'true' : 'false'}
        {...props}
    >
        {/* FIX: Render a <title> element inside the SVG for tooltips and screen readers. */}
        {title && <title>{title}</title>}
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
);