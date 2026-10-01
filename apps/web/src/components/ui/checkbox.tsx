'use client';

import { Check } from 'lucide-react';
import { Checkbox as RadixCheckbox } from 'radix-ui';
import { type ReactNode, useId } from 'react';

export function Checkbox({
  label,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex min-h-9 items-center gap-2">
      <RadixCheckbox.Root
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        className="flex size-5 shrink-0 items-center justify-center rounded-input border border-line-strong bg-surface data-[state=checked]:border-primary data-[state=checked]:bg-primary disabled:opacity-50"
      >
        <RadixCheckbox.Indicator>
          <Check className="size-4 text-on-primary" aria-hidden />
        </RadixCheckbox.Indicator>
      </RadixCheckbox.Root>
      <label htmlFor={id} className="text-body-sm text-content">
        {label}
      </label>
    </div>
  );
}
