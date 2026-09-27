'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { LogOut } from 'lucide-react';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { logoutAction } from '@/server/actions/auth-actions';

function ConfirmLogout() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" block loading={pending}>
      خروج از حساب
    </Button>
  );
}

export function LogoutButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-14 w-full items-center gap-3 rounded-[var(--radius-card)] bg-surface px-4 font-semibold text-danger-700 shadow-[var(--shadow-card)]"
      >
        <LogOut className="size-5 -scale-x-100" aria-hidden />
        خروج از حساب
      </button>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="از حسابت خارج می‌شی؟"
        description="اطلاعاتت در پی‌نو می‌مونه و با ورود دوباره با همین شماره در دسترسه."
      >
        <form action={logoutAction} className="mt-6 grid gap-2">
          <ConfirmLogout />
          <Button variant="ghost" block onClick={() => setOpen(false)}>
            انصراف
          </Button>
        </form>
      </BottomSheet>
    </>
  );
}
