import React from 'react';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  title?: string;
}

export const ExclamationTriangleIcon: React.FC<IconProps> = ({ title, ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 20 20"
    fill="currentColor"
    aria-hidden={title ? 'false' : 'true'}
    focusable={title ? 'true' : 'false'}
    {...props}
  >
    {title && <title>{title}</title>}
    <path
      fillRule="evenodd"
      d="M18.278 14.121l-4.879-8.452a2 2 0 00-3.464 0l-4.879 8.452a2 2 0 001.732 3.003h9.758a2 2 0 001.732-3.003zM10 14a1 1 0 110-2 1 1 0 010 2zm-1-4a1 1 0 011-1h0a1 1 0 011 1v2a1 1 0 01-2 0V10z"
      clipRule="evenodd"
      className="text-accent-yellow"
    />
  </svg>
);