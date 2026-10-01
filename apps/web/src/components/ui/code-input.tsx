'use client';

import { TextField, type TextFieldProps } from './field';

/** Campo de código TOTP de 6 dígitos (DESIGN.md §10.2): teclado numérico e autopreenchimento do SO. */
export function CodeInput(props: Omit<TextFieldProps, 'type' | 'inputMode' | 'autoComplete'>) {
  return (
    <TextField
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]*"
      maxLength={6}
      className="font-mono text-h3 tracking-[0.4em]"
      {...props}
    />
  );
}
