import React from 'react';

export const UsersIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg 
        xmlns="http://www.w3.org/2000/svg" 
        fill="none" 
        viewBox="0 0 24 24" 
        strokeWidth={1.5} 
        stroke="currentColor" 
        {...props}
    >
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 00-12 0m12 0a9.094 9.094 0 00-12 0m12 0A9.094 9.094 0 006 18.72m12 0a9.094 9.094 0 00-12 0m9-9.72h.008v.008H15V9m-3 0h.008v.008H12V9m-3 0h.008v.008H9V9m9 9a9.094 9.094 0 00-18 0m18 0a9.094 9.094 0 00-18 0m18 0A9.094 9.094 0 000 18.72m18 0a9.094 9.094 0 00-18 0" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.375 9a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
    </svg>
);
