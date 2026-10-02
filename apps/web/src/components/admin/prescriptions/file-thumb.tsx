'use client';

import type { PrescriptionFileView, SignedFileUrl } from '@receita/shared';
import { useQuery } from '@tanstack/react-query';
import { FileImage, FileText, ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api';

/** Miniatura (derivado gerado pelo worker) ou ícone do tipo. */
export function FileThumb({
  prescriptionId,
  file,
}: {
  prescriptionId: string;
  file: PrescriptionFileView;
}) {
  const thumb = useQuery({
    queryKey: ['prescriptions', 'thumb', file.id],
    queryFn: () =>
      api<SignedFileUrl>(
        `/prescriptions/${prescriptionId}/files/${file.id}/view-url?variant=thumbnail`,
      ),
    enabled: file.accessible && file.thumbnailAvailable,
    staleTime: 45_000,
  });
  if (!file.accessible) return <ShieldAlert className="size-10 text-error" aria-hidden />;
  if (thumb.data) {
    // eslint-disable-next-line @next/next/no-img-element -- URL assinada do storage privado
    return <img src={thumb.data.url} alt="" className="size-14 rounded-input object-cover" />;
  }
  return file.kind === 'pdf' ? (
    <FileText className="size-10 text-content-muted" aria-hidden />
  ) : (
    <FileImage className="size-10 text-content-muted" aria-hidden />
  );
}
