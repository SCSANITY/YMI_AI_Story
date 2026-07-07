'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/Button';

type CheckoutIdentityMode = 'guest' | 'auth';

type CheckoutIdentityModalProps = {
  identityMode: CheckoutIdentityMode | null;
  identityEmail: string;
  formEmail: string;
  userEmail?: string | null;
  identityOtpRequested: boolean;
  identityOtpError: string;
  identityOtpDevCode: string;
  identityVerified: boolean;
  isIdentityRequesting: boolean;
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string;
  onClose: () => void;
  onConfirmMode: (mode: CheckoutIdentityMode | null) => Promise<void>;
  onRequestOtp: (email: string) => Promise<boolean | void>;
  onVerifyOtp: (code: string) => Promise<void>;
};

export function CheckoutIdentityModal({
  identityMode,
  identityEmail,
  formEmail,
  userEmail,
  identityOtpRequested,
  identityOtpError,
  identityOtpDevCode,
  identityVerified,
  isIdentityRequesting,
  t,
  onClose,
  onConfirmMode,
  onRequestOtp,
  onVerifyOtp,
}: CheckoutIdentityModalProps) {
  const [draftIdentityMode, setDraftIdentityMode] = useState<CheckoutIdentityMode | null>(identityMode);
  const [identityOtpCode, setIdentityOtpCode] = useState('');
  const [localPendingAction, setLocalPendingAction] = useState<'mode' | 'requestOtp' | 'verifyOtp' | null>(null);
  const localPendingActionRef = useRef<typeof localPendingAction>(null);

  useEffect(() => {
    setDraftIdentityMode(identityMode);
    setIdentityOtpCode('');
    localPendingActionRef.current = null;
    setLocalPendingAction(null);
  }, [identityMode]);

  useEffect(() => {
    if (isIdentityRequesting) return;
    localPendingActionRef.current = null;
    setLocalPendingAction(null);
  }, [isIdentityRequesting]);

  const verificationEmail = identityEmail || (identityMode === 'guest' ? formEmail.trim() : userEmail || '');
  const hasPendingAction = Boolean(localPendingAction || isIdentityRequesting);

  const runIdentityAction = async (
    action: 'mode' | 'requestOtp' | 'verifyOtp',
    callback: () => Promise<unknown>
  ) => {
    if (localPendingActionRef.current || isIdentityRequesting) return;

    localPendingActionRef.current = action;
    setLocalPendingAction(action);
    try {
      await callback();
    } finally {
      localPendingActionRef.current = null;
      setLocalPendingAction(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/45 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-3xl border border-white/60 bg-white/88 backdrop-blur-2xl p-6 space-y-5 shadow-[0_20px_60px_rgba(15,23,42,0.18)]">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-gray-900">{t('checkout.identityTitle')}</h3>
            <p className="text-sm text-gray-500 mt-1">{t('checkout.identityDescription')}</p>
          </div>
          <button
            type="button"
            className="text-sm text-gray-500 hover:text-gray-700"
            onClick={onClose}
          >
            {t('common.close')}
          </button>
        </div>

        {identityMode && (
          <div className="rounded-xl border border-amber-100 bg-amber-50/70 px-4 py-3 text-sm text-amber-800">
            <span className="font-semibold">{t('checkout.currentCheckoutMethod')}:</span>{' '}
            {identityMode === 'auth'
              ? t('checkout.authTitle')
              : identityMode === 'guest'
              ? t('checkout.guestTitle')
              : t('checkout.notSet')}
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          <button
            type="button"
            disabled={hasPendingAction}
            onClick={() => setDraftIdentityMode('guest')}
            className={`rounded-xl border px-4 py-3 text-left transition ${
              draftIdentityMode === 'guest'
                ? 'border-amber-300 bg-amber-50'
                : 'border-gray-200 hover:border-amber-200 hover:bg-amber-50/40'
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <div className="font-semibold text-gray-900">{t('checkout.guestTitle')}</div>
            <div className="text-xs text-gray-600 mt-1">{t('checkout.guestDescription')} {formEmail || t('checkout.notSet')}</div>
          </button>

          <button
            type="button"
            disabled={hasPendingAction}
            onClick={() => setDraftIdentityMode('auth')}
            className={`rounded-xl border px-4 py-3 text-left transition ${
              draftIdentityMode === 'auth'
                ? 'border-emerald-300 bg-emerald-50'
                : 'border-gray-200 hover:border-emerald-200 hover:bg-emerald-50/40'
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <div className="font-semibold text-gray-900">{userEmail ? t('checkout.paymentTitle') : t('checkout.authTitle')}</div>
            <div className="text-xs text-gray-600 mt-1">
              {userEmail ? t('checkout.codeSentTo', { email: userEmail }) : t('checkout.authDescription')}
            </div>
          </button>
        </div>

        {identityMode && (
          <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-sm text-gray-700">
              {t('checkout.verificationEmail')}:{' '}
              <span className="font-semibold text-gray-900">
                {verificationEmail || '-'}
              </span>
            </div>

            {identityOtpRequested && !identityVerified && (
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('login.verificationCode')}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  className="mt-2 w-full h-11 rounded-lg border border-gray-200 px-3 text-sm"
                  placeholder={t('login.enterCode', { length: 6 })}
                  value={identityOtpCode}
                  onChange={(event) => setIdentityOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                />
              </div>
            )}

            {identityOtpDevCode && (
              <p className="text-xs text-amber-600">{t('checkout.devCode')}: {identityOtpDevCode}</p>
            )}
            {identityOtpError && (
              <p className="text-xs text-red-500">{identityOtpError}</p>
            )}

            <div className="flex gap-3">
              <Button
                size="sm"
                variant="outline"
                className="rounded-full"
                onClick={() => void runIdentityAction('requestOtp', () => onRequestOtp(identityMode === 'guest' ? formEmail.trim() : (userEmail || identityEmail)))}
                disabled={hasPendingAction}
              >
                {localPendingAction === 'requestOtp' || isIdentityRequesting ? `${t('common.loading')}` : identityOtpRequested ? t('login.resendCode') : t('checkout.sendCode')}
              </Button>
              <Button
                size="sm"
                className="rounded-full"
                onClick={() => void runIdentityAction('verifyOtp', () => onVerifyOtp(identityOtpCode))}
                disabled={!identityOtpRequested || identityOtpCode.trim().length !== 6 || hasPendingAction}
              >
                {localPendingAction === 'verifyOtp' || isIdentityRequesting ? t('common.loading') : t('checkout.verify')}
              </Button>
            </div>

            {identityVerified && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-700">
                {t('checkout.continuePayment')}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button
            size="sm"
            variant="ghost"
            className="glass-action-btn glass-action-btn--neutral rounded-full px-5 text-sm font-semibold text-slate-700"
            onClick={onClose}
            disabled={hasPendingAction}
          >
            {t('common.close')}
          </Button>
          <Button
            size="sm"
            className="glass-action-btn glass-action-btn--brand rounded-full px-5 text-sm font-semibold"
            onClick={() => void runIdentityAction('mode', () => onConfirmMode(draftIdentityMode))}
            disabled={hasPendingAction || !draftIdentityMode || draftIdentityMode === identityMode}
          >
            {localPendingAction === 'mode' || isIdentityRequesting ? t('common.loading') : t('checkout.confirmCheckoutMethod')}
          </Button>
        </div>
      </div>
    </div>
  );
}
