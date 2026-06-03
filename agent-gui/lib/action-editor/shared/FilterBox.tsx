import { useMemo, type ChangeEvent, type KeyboardEvent } from "react";
import { createDoubleClickClearFilterHandlers } from "./filterInputDoubleClickClear";

type FilterBoxProps = {
  value: string;
  placeholder?: string;
  className?: string;
  onChange: (nextValue: string) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
};

export default function FilterBox({
  value,
  placeholder,
  className,
  onChange,
  onKeyDown
}: FilterBoxProps): JSX.Element {
  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    onChange(event.target.value);
  };

  const { onDoubleClick } = useMemo(
    () =>
      createDoubleClickClearFilterHandlers({
        getKeyword: () => value,
        clearKeyword: () => onChange("")
      }),
    [value, onChange]
  );

  return (
    <input
      type="text"
      className={className ? `filter-box ${className}` : "filter-box"}
      placeholder={placeholder}
      title="双击清空"
      value={value}
      onChange={handleChange}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
    />
  );
}
