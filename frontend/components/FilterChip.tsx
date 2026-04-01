import React from 'react';

type MatchChipProps = {
  value: string;
  handleClear: () => void;
  key?: string;
};

export const FilterChip = ({ value, handleClear }: MatchChipProps) => {
  const onClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    handleClear();
  };

  return (
    <span className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-blue-200 text-blue-900 text-xs font-semibold">
      <span className="truncate max-w-[10rem]">{value}</span>
      <button
        type="button"
        aria-label={`Remove ${value}`}
        onClick={onClear}
        className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-700 text-white shadow-sm hover:bg-blue-800 focus:outline-none border-0 ring-0 focus:ring-0 appearance-none cursor-pointer"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-3 h-3"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </span>
  );
};

export default FilterChip;
