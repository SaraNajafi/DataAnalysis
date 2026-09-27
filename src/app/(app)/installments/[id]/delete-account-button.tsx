'use client';

import { useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { deleteCreditAccountAction } from '@/server/actions/account-actions';
import { COMMON_MESSAGES } from '@/lib/messages';

export function DeleteAccountButton({ accountId, name }: { accountId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      try {
        // Redirects to the list on success.
        const result = await deleteCreditAccountAction(accountId);
        if (result && !result.ok) setError(result.message);
      } catch {
        setError(COMMON_MESSAGES.network);
      }
    });
  };

  return (
    <>
      <Button variant="secondary" size="md" block onClick={() => setOpen(true)} className="text-danger-700">
        <Trash2 className="size-4" aria-hidden />
        حذف
      </Button>
      <BottomSheet
        open={open}
        dismissible={!pending}
        onClose={() => setOpen(false)}
        title="این قسط حذف بشه؟"
        description={
          <>
            تمام برنامه پرداخت این قسط از پی‌نو حذف می‌شه.
            <br />
            <span className="font-semibold text-ink-soft">{name}</span>
          </>
        }
      >
        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-danger-50 px-3 py-2 text-sm text-danger-700">
            {error}
          </p>
        )}
        <div className="mt-6 grid gap-2">
          <Button variant="danger" block onClick={confirm} loading={pending}>
            حذف قسط
          </Button>
          <Button variant="ghost" block onClick={() => setOpen(false)} disabled={pending}>
            انصراف
          </Button>
        </div>
      </BottomSheet>
    </>
  );
}
