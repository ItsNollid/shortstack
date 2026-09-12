import React from 'react';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'small' | 'medium' | 'large';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'medium',
  icon,
  children,
  className,
  type = 'button',
  ...rest
}: ButtonProps): React.JSX.Element {
  const iconOnly = children === undefined || children === null || children === false;
  const classes = [
    styles.button,
    styles[variant],
    size === 'medium' ? '' : styles[size],
    iconOnly ? styles.iconOnly : '',
    className ?? ''
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type={type} className={classes} {...rest}>
      {icon !== undefined && <span className={styles.icon}>{icon}</span>}
      {children}
    </button>
  );
}
