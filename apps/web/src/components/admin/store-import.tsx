'use client';

import type { StoreImportReport } from '@receita/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { type FormEvent, useId, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, PageHeader } from '@/components/ui/card';
import { Table, Td, Th } from '@/components/ui/table';
import { api, errorMessage } from '@/lib/api';
import { pluralize } from '@/lib/format';

const COLUMNS = [
  ['store_number', 'Sim', 'Número oficial da loja'],
  ['store_name', 'Sim', 'Nome de exibição'],
  ['active', 'Sim', 'Ativa/inativa (sim/não, true/false, 1/0)'],
  ['address', 'Não', 'Endereço'],
  ['neighborhood', 'Não', 'Bairro'],
  ['city', 'Não', 'Cidade'],
  ['state', 'Não', 'UF'],
] as const;

function ReportSummary({ report }: { report: StoreImportReport }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        ['Linhas no arquivo', report.totalRows],
        [report.dryRun ? 'Serão criadas' : 'Criadas', report.created],
        [report.dryRun ? 'Serão atualizadas' : 'Atualizadas', report.updated],
        ['Sem alteração', report.unchanged],
      ].map(([label, value]) => (
        <div key={label} className="rounded-card bg-subtle p-3">
          <dt className="text-caption text-content-muted">{label}</dt>
          <dd className="text-h2 font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Importação de lojas (PRD §16): valida (dryRun), mostra o relatório e confirma. */
export function StoreImport() {
  const inputId = useId();
  const client = useQueryClient();
  const [file, setFile] = useState<File | null>(null);

  const send = (dryRun: boolean) => {
    const form = new FormData();
    if (file) form.append('file', file);
    return api<StoreImportReport>(`/admin/stores/import${dryRun ? '?dryRun=true' : ''}`, {
      method: 'POST',
      formData: form,
    });
  };
  const preview = useMutation({ mutationFn: () => send(true) });
  const commit = useMutation({
    mutationFn: () => send(false),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['stores'] }),
  });

  function validate(event: FormEvent) {
    event.preventDefault();
    commit.reset();
    preview.mutate();
  }

  const report = commit.data ?? preview.data;
  const importable = (preview.data?.created ?? 0) + (preview.data?.updated ?? 0);

  return (
    <>
      <PageHeader
        title="Importar lojas"
        description="Lojas existentes (mesmo store_number) são atualizadas; novas recebem um link público próprio."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <form onSubmit={validate} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={inputId} className="text-label font-medium">
                Arquivo CSV
              </label>
              <input
                id={inputId}
                type="file"
                accept=".csv,text/csv"
                aria-describedby={`${inputId}-hint`}
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  preview.reset();
                  commit.reset();
                }}
                className="rounded-input border border-line-strong p-2 text-body-sm file:mr-3 file:rounded-button file:border-0 file:bg-subtle file:px-3 file:py-2 file:font-semibold"
              />
              <p id={`${inputId}-hint`} className="text-caption text-content-muted">
                Separado por vírgula ou ponto e vírgula, UTF-8, até 2 MB e 5.000 linhas.
              </p>
            </div>
            <Button type="submit" variant="secondary" disabled={!file} loading={preview.isPending}>
              Validar arquivo
            </Button>
          </form>

          {preview.error ? (
            <Alert tone="error" title={errorMessage(preview.error)} className="mt-4" />
          ) : null}
          {commit.error ? (
            <Alert tone="error" title={errorMessage(commit.error)} className="mt-4" />
          ) : null}

          {report ? (
            <div className="mt-6 flex flex-col gap-4">
              {commit.data ? (
                <Alert tone="success" title="Importação concluída">
                  <p>
                    {pluralize(commit.data.created, 'loja criada', 'lojas criadas')} e{' '}
                    {pluralize(commit.data.updated, 'atualizada', 'atualizadas')}.{' '}
                    <Link href="/admin/lojas" className="underline">
                      Ver lojas
                    </Link>
                  </p>
                </Alert>
              ) : null}
              <ReportSummary report={report} />
              {report.errors.length > 0 ? (
                <>
                  <Alert
                    tone="warning"
                    title={pluralize(
                      report.errors.length,
                      'problema encontrado',
                      'problemas encontrados',
                    )}
                  >
                    <p>
                      Linhas com problema não são importadas. Corrija o arquivo e valide novamente,
                      se necessário.
                    </p>
                  </Alert>
                  <Table caption="Linhas inválidas">
                    <thead>
                      <tr>
                        <Th>Linha</Th>
                        <Th>Campo</Th>
                        <Th>Problema</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.errors.map((error, index) => (
                        <tr key={`${error.line}-${error.field ?? ''}-${index}`}>
                          <Td className="font-mono">{error.line}</Td>
                          <Td className="font-mono">{error.field ?? '—'}</Td>
                          <Td>{error.message}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </>
              ) : null}
              {!commit.data && preview.data ? (
                <Button
                  disabled={importable === 0}
                  loading={commit.isPending}
                  onClick={() => commit.mutate()}
                >
                  {importable === 0
                    ? 'Nada para importar'
                    : `Importar ${pluralize(importable, 'loja', 'lojas')}`}
                </Button>
              ) : null}
            </div>
          ) : null}
        </Card>
        <Card>
          <h2 className="mb-3 text-h3 font-semibold">Colunas do arquivo</h2>
          <Table caption="Colunas aceitas">
            <thead>
              <tr>
                <Th>Coluna</Th>
                <Th>Obrigatória</Th>
                <Th>Descrição</Th>
              </tr>
            </thead>
            <tbody>
              {COLUMNS.map(([name, required, description]) => (
                <tr key={name}>
                  <Td className="font-mono">{name}</Td>
                  <Td>{required}</Td>
                  <Td>{description}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
