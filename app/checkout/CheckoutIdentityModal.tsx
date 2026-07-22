'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Circle, UserRound, UserPlus } from 'lucide-react';
import { Button } from '@/components/Button';

type CheckoutIdentityMode = 'guest' | 'auth';
type OtpRequestResult = { sent: boolean; retryAfterSeconds?: number };

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
  onRequestOtp: (email: string) => Promise<OtpRequestResult | void>;
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
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [localPendingAction, setLocalPendingAction] = useState<'mode' | 'requestOtp' | 'verifyOtp' | null>(null);
  const localPendingActionRef = useRef<typeof localPendingAction>(null);

  useEffect(() => {
    setDraftIdentityMode(identityMode);
    setIdentityOtpCode('');
    setResendAvailableAt(null);
    setResendSeconds(0);
    localPendingActionRef.current = null;
    setLocalPendingAction(null);
  }, [identityMode]);

  useEffect(() => {
    if (!resendAvailableAt) return;

    const updateCountdown = () => {
      const seconds = Math.max(0, Math.ceil((resendAvailableAt - Date.now()) / 1000));
      setResendSeconds(seconds);
      if (seconds === 0) setResendAvailableAt(null);
    };

    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [resendAvailableAt]);

  useEffect(() => {
    if (isIdentityRequesting) return;
    localPendingActionRef.current = null;
    setLocalPendingAction(null);
  }, [isIdentityRequesting]);

  const verificationEmail = identityEmail || (identityMode === 'guest' ? formEmail.trim() : userEmail || '');
  const hasPendingAction = Boolean(localPendingAction || isIdentityRequesting);
  const guestSelected = draftIdentityMode === 'guest';
  const authSelected = draftIdentityMode === 'auth';

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

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={hasPendingAction}
            onClick={() => setDraftIdentityMode('guest')}
            aria-pressed={guestSelected}
            className={`group relative overflow-hidden rounded-2xl border-2 px-4 py-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 ${
              guestSelected
                ? 'border-amber-500 bg-amber-50 shadow-[0_14px_34px_rgba(217,119,6,0.16)]'
                : 'border-slate-200 bg-white shadow-sm hover:border-amber-300 hover:bg-amber-50/45'
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <div className="flex items-start gap-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                guestSelected ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-600'
              }`}>
                <UserPlus className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-bold text-gray-950">{t('checkout.guestTitle')}</span>
                  {guestSelected ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-amber-600" />
                  ) : (
                    <Circle className="h-5 w-5 shrink-0 text-slate-300 transition group-hover:text-amber-300" />
                  )}
                </span>
                <span className="mt-1 block text-xs leading-5 text-slate-600">
                  {t('checkout.guestDescription')} <span className="font-semibold text-slate-800">{formEmail || t('checkout.notSet')}</span>
                </span>
              </span>
            </div>
          </button>

          <button
            type="button"
            disabled={hasPendingAction}
            onClick={() => setDraftIdentityMode('auth')}
            aria-pressed={authSelected}
            className={`group relative overflow-hidden rounded-2xl border-2 px-4 py-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 ${
              authSelected
                ? 'border-emerald-500 bg-emerald-50 shadow-[0_14px_34px_rgba(5,150,105,0.14)]'
                : 'border-slate-200 bg-white shadow-sm hover:border-emerald-300 hover:bg-emerald-50/45'
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <div className="flex items-start gap-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                authSelected ? 'bg-emerald-500 text-white' : 'bg-emerald-100 text-emerald-600'
              }`}>
                <UserRound className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-bold text-gray-950">{userEmail ? t('checkout.paymentTitle') : t('checkout.authTitle')}</span>
                  {authSelected ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                  ) : (
                    <Circle className="h-5 w-5 shrink-0 text-slate-300 transition group-hover:text-emerald-300" />
                  )}
                </span>
                <span className="mt-1 block text-xs leading-5 text-slate-600">
                  {userEmail ? t('checkout.codeSentTo', { email: userEmail }) : t('checkout.authDescription')}
                </span>
              </span>
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
                onClick={() => void runIdentityAction('requestOtp', async () => {
                  const result = await onRequestOtp(identityMode === 'guest' ? formEmail.trim() : (userEmail || identityEmail));
                  if (result?.retryAfterSeconds) {
                    setResendAvailableAt(Date.now() + result.retryAfterSeconds * 1000);
                  }
                })}
                disabled={hasPendingAction || resendSeconds > 0}
              >
                {localPendingAction === 'requestOtp' || isIdentityRequesting
                  ? `${t('common.loading')}`
                  : resendSeconds > 0
                    ? t('checkout.resendCodeIn', { seconds: resendSeconds })
                    : identityOtpRequested
                      ? t('login.resendCode')
                      : t('checkout.sendCode')}
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

            {identityOtpRequested && !identityVerified ? (
              <p className="text-xs leading-5 text-slate-500">
                {t('email.spamFolderHint')}
              </p>
            ) : null}

            {identityVerified && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-700">
                {t('checkout.continuePayment')}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            size="sm"
            variant="ghost"
            className="glass-action-btn glass-action-btn--neutral w-full rounded-full px-5 text-sm font-semibold text-slate-700 sm:w-auto"
            onClick={onClose}
            disabled={hasPendingAction}
          >
            {t('common.close')}
          </Button>
          <Button
            size="sm"
            className="glass-action-btn glass-action-btn--brand w-full rounded-full px-5 text-sm font-semibold sm:w-auto"
            onClick={() => void runIdentityAction('mode', () => onConfirmMode(draftIdentityMode))}
            disabled={hasPendingAction || !draftIdentityMode || draftIdentityMode === identityMode}
          >
            {localPendingAction === 'mode' || isIdentityRequesting
              ? t('common.loading')
              : draftIdentityMode === 'auth' && !userEmail
                ? t('checkout.signInOrCreateAccount')
                : t('checkout.confirmCheckoutMethod')}
          </Button>
        </div>
      </div>
    </div>
  );
}
