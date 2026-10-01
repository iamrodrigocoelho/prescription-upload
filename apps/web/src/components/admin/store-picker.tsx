'use client';

import { useId, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { TextField } from '@/components/ui/field';
import { useSession } from '@/lib/session';
import { storeLabel, useStoreOptions } from '@/lib/stores';

/** Seleção de lojas para o escopo de um usuário (RF-027). */
export function StorePicker({
  value,
  onChange,
  error,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  error?: string;
}) {
  const { me } = useSession();
  const [search, setSearch] = useState('');
  const { options, isLoading } = useStoreOptions(me, search);
  const groupId = useId();

  function toggle(id: string, checked: boolean) {
    onChange(checked ? [...value, id] : value.filter((item) => item !== id));
  }

  return (
    <fieldset
      className="flex flex-col gap-2"
      aria-describedby={error ? `${groupId}-error` : undefined}
    >
      <legend className="text-label font-medium">Lojas com acesso</legend>
      <p className="text-caption text-content-muted">
        {value.length === 0 ? 'Nenhuma loja selecionada.' : `${value.length} selecionada(s).`}
      </p>
      <TextField
        label="Filtrar lojas"
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="max-h-64 overflow-y-auto rounded-input border border-line p-2">
        {isLoading ? (
          <p className="p-2 text-body-sm text-content-muted">Carregando lojas…</p>
        ) : null}
        {!isLoading && options.length === 0 ? (
          <p className="p-2 text-body-sm text-content-muted">Nenhuma loja encontrada.</p>
        ) : null}
        {options.map((store) => (
          <Checkbox
            key={store.id}
            label={
              <>
                {storeLabel(store)}
                {store.active ? null : <span className="text-content-muted"> (inativa)</span>}
              </>
            }
            checked={value.includes(store.id)}
            onCheckedChange={(checked) => toggle(store.id, checked)}
          />
        ))}
      </div>
      {error ? (
        <p id={`${groupId}-error`} role="alert" className="text-caption text-error">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
