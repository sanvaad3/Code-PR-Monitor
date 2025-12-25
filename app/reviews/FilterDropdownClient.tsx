"use client";

export function FilterDropdownClient({
  label,
  options,
  currentValue,
  param,
}: {
  label: string;
  options: { value: string; label: string }[];
  currentValue: string;
  param: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm font-medium text-gray-700">{label}:</label>
      <select
        className="block w-48 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
        value={currentValue}
        onChange={(e) => {
          const url = new URL(window.location.href);
          if (e.target.value) {
            url.searchParams.set(param, e.target.value);
          } else {
            url.searchParams.delete(param);
          }
          window.location.href = url.toString();
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
