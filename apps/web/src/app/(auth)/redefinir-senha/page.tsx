import type { Metadata } from 'next';
import { SetPasswordForm } from '@/components/auth/set-password-form';

export const metadata: Metadata = { title: 'Nova senha', referrer: 'no-referrer' };

export default function ResetPasswordPage() {
  return <SetPasswordForm mode="reset" />;
}
