export const Toggle = ({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) => (
  <button
    className={`switch ${checked ? "is-on" : ""}`}
    type="button"
    role="switch"
    aria-label={label}
    aria-checked={checked}
    onClick={onChange}
  />
);
