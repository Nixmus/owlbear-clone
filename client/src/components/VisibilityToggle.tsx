import Icon from './Icon';
import type { Visibility } from '../api';

/**
 * Public/private slider. "Private" means owner-only: the other members of the
 * campaign, the GM included, stop seeing the item. Controlled by the parent so
 * the caller owns the value and can await the API call.
 */
export default function VisibilityToggle({
  value,
  onChange,
  disabled,
  label,
}: {
  value: Visibility;
  onChange: (next: Visibility) => void;
  disabled?: boolean;
  label?: string;
}) {
  const isPrivate = value === 'private';
  return (
    <button
      type="button"
      className={`vis-toggle ${isPrivate ? 'private' : ''}`}
      role="switch"
      aria-checked={isPrivate}
      aria-label={label || (isPrivate ? 'Privado, solo tú lo ves' : 'Público')}
      disabled={disabled}
      title={
        isPrivate
          ? 'Privado: solo tú puedes verlo. Haz clic para hacerlo público.'
          : 'Público: lo ven todos los miembros de la campaña. Haz clic para hacerlo privado.'
      }
      onClick={() => onChange(isPrivate ? 'public' : 'private')}
    >
      {!isPrivate && (
        <span className="vis-toggle-ico">
          <Icon name="members" size={12} />
        </span>
      )}
      {isPrivate && (
        <span className="vis-toggle-ico">
          <Icon name="lock" size={12} />
        </span>
      )}
      <span className="vis-track" aria-hidden="true">
        <span className="vis-knob" />
      </span>
      <span className="vis-label">{isPrivate ? 'Privado' : 'Público'}</span>
    </button>
  );
}