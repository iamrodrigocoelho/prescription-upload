'use client';

import { Switch as RadixSwitch } from 'radix-ui';
import { type ReactNode, useId } from 'react';

export function Switch({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  description?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <RadixSwitch.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-describedby={description ? `${id}-desc` : undefined}
        className="relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-line-strong bg-subtle transition-colors data-[state=checked]:border-primary data-[state=checked]:bg-primary disabled:opacity-50"
      >
        <RadixSwitch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-surface shadow-card transition-transform data-[state=checked]:translate-x-5" />
      </RadixSwitch.Root>
      <div className="flex flex-col">
        <label htmlFor={id} className="text-label font-medium text-content">
          {label}
          <span className="sr-only">{checked ? ' (ativado)' : ' (desativado)'}</span>
        </label>
        {description ? (
          <p id={`${id}-desc`} className="text-caption text-content-muted">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
