import React from 'react';
import styles from './FilterChips.module.css';

export interface FilterChip<T extends string> {
  id: T;
  label: string;
  count?: number;
}

export interface FilterChipsProps<T extends string> {
  chips: ReadonlyArray<FilterChip<T>>;
  selected: T;
  onSelect: (id: T) => void;
  label: string;
}

export function FilterChips<T extends string>({
  chips,
  selected,
  onSelect,
  label
}: FilterChipsProps<T>): React.JSX.Element {
  return (
    <div className={styles.row} role="tablist" aria-label={label}>
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          role="tab"
          aria-selected={chip.id === selected}
          className={`${styles.chip} ${chip.id === selected ? styles.selected : ''}`}
          onClick={() => onSelect(chip.id)}
        >
          {chip.label}
          {chip.count !== undefined && <span className={styles.count}>{chip.count}</span>}
        </button>
      ))}
    </div>
  );
}
