import type { Metadata } from 'next';
import { SetPasswordForm } from '@/components/auth/set-password-form';

export const metadata: Metadata = { title: 'Definir senha', referrer: 'no-referrer' };

export default function InvitePage() {
  return <SetPasswordForm mode="invite" />;
}
