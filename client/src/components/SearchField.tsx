import Icon from './Icon';

/**
 * Search box with a leading icon and a clear button. Shared by the character
 * gallery and the asset browser so both look and behave the same.
 */
export default function SearchField({
  value,
  onChange,
  placeholder = 'Buscar…',
  label = 'Buscar',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
}) {
  return (
    <div className="search-field">
      <span className="search-ico">
        <Icon name="search" size={14} />
      </span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          type="button"
          className="search-clear"
          title="Limpiar búsqueda"
          aria-label="Limpiar búsqueda"
          onClick={() => onChange('')}
        >
          <Icon name="close" size={13} />
        </button>
      )}
    </div>
  );
}