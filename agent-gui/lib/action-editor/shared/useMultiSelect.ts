import { useState, type Dispatch, type SetStateAction } from "react";

type SelectOptions = {
  additive: boolean;
  rangeSelect: boolean;
  orderedIds: string[];
};

type MultiSelectInitialState = {
  selectedIds?: string[];
  selectionAnchorId?: string;
};

type UseMultiSelectResult = {
  selectedId: string;
  selectedIds: string[];
  selectionAnchorId: string;
  setSelectedId: Dispatch<SetStateAction<string>>;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  setSelectionAnchorId: Dispatch<SetStateAction<string>>;
  setSingleSelection: (id: string) => void;
  clearSelection: () => void;
  selectItem: (id: string, options: SelectOptions) => void;
};

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids.filter(Boolean)));
}

export function useMultiSelect(
  initialId: string,
  initial?: MultiSelectInitialState,
): UseMultiSelectResult {
  const [selectedId, setSelectedId] = useState<string>(initialId);
  const [selectedIds, setSelectedIds] = useState<string[]>(
    initial?.selectedIds ?? (initialId ? [initialId] : []),
  );
  const [selectionAnchorId, setSelectionAnchorId] = useState<string>(
    initial?.selectionAnchorId ?? initialId,
  );

  const setSingleSelection = (id: string): void => {
    setSelectedId(id);
    setSelectedIds(id ? [id] : []);
    setSelectionAnchorId(id);
  };

  const clearSelection = (): void => {
    setSingleSelection("");
  };

  const selectItem = (id: string, options: SelectOptions): void => {
    const { additive, rangeSelect, orderedIds } = options;

    if (rangeSelect) {
      const anchorId = selectionAnchorId || selectedId || id;
      const start = orderedIds.indexOf(anchorId);
      const end = orderedIds.indexOf(id);
      if (start >= 0 && end >= 0) {
        const [from, to] = start <= end ? [start, end] : [end, start];
        const rangeIds = orderedIds.slice(from, to + 1);
        setSelectedIds((prev) => (additive ? uniqueIds([...prev, ...rangeIds]) : rangeIds));
        setSelectedId(id);
        return;
      }
    }

    if (!additive) {
      setSingleSelection(id);
      return;
    }

    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((itemId) => itemId !== id);
        setSelectedId((current) => (current !== id ? current : next[next.length - 1] ?? ""));
        return next;
      }

      const next = uniqueIds([...prev, id]);
      setSelectedId(id);
      setSelectionAnchorId(id);
      return next;
    });
  };

  return {
    selectedId,
    selectedIds,
    selectionAnchorId,
    setSelectedId,
    setSelectedIds,
    setSelectionAnchorId,
    setSingleSelection,
    clearSelection,
    selectItem
  };
}

