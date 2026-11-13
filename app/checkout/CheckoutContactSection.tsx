'use client';

import React, { memo, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/Button';
import { useGlobalContext } from '@/contexts/GlobalContext';
import { CheckoutEmailOwnershipHint } from './CheckoutEmailOwnershipHint';
import type { CheckoutAddressForm } from '@/lib/checkout-restoration';

const SIGNUP_OTP_LENGTH = 8;
const SIGNUP_MIN_PASSWORD_LENGTH = 6;
const RESEND_COUNTDOWN_SECONDS = 30;
const EMAIL_FORMAT_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidCheckoutEmail(email: string) {
  return EMAIL_FORMAT_PATTERN.test(email.trim());
}

type CheckoutContactSectionProps = {
  form: CheckoutAddressForm;
  invalidField: string | null;
  userCustomerId?: string | null;
  isAuthResolved: boolean;
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string;
  onFormChange: (patch: Partial<CheckoutAddressForm>) => void;
};

function CheckoutContactSectionComponent({
  form,
  invalidField,
  userCustomerId,
  isAuthResolved,
  t,
  onFormChange,
}: CheckoutContactSectionProps) {
  const { user, login, verifySignupOtp, openLoginModal } = useGlobalContext();
  const [formError, setFormError] = useState('');
  const [emailHistory, setEmailHistory] = useState<string[]>([]);
  const [isEmailDropdownOpen, setIsEmailDropdownOpen] = useState(false);
  const emailDropdownRef = useRef<HTMLDivElement | null>(null);
  const [signupPassword, setSignupPassword] = useState('');
  const [signupStage, setSignupStage] = useState<'password' | 'code'>('password');
  const [signupCode, setSignupCode] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupError, setSignupError] = useState('');
  const [signupInfo, setSignupInfo] = useState('');
  const [isSignupPending, setIsSignupPending] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [showSignupPassword, setShowSignupPassword] = useState(false);

  // A locally cached user is not proof of a live session; wait for resolution
  // so the signup card never races a stale identity.
  const signedInEmail = user?.email?.trim() ?? '';
  const isSignedIn = isAuthResolved && Boolean(signedInEmail);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem('ymi_checkout_email_history');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setEmailHistory(parsed.filter((item) => typeof item === 'string'));
      }
    } catch {
      // Ignore malformed local email history.
    }
  }, []);

  useEffect(() => {
    if (!isEmailDropdownOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (!emailDropdownRef.current) return;
      if (!emailDropdownRef.current.contains(event.target as Node)) {
        setIsEmailDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isEmailDropdownOpen]);

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = window.setTimeout(() => setResendCountdown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendCountdown]);

  const updateContactField = (key: keyof CheckoutAddressForm, value: string) => {
    setFormError('');
    if (key === 'email') currentSignupEmail.current = value.trim();
    onFormChange({ [key]: value });
    if (key === 'email' && signupStage === 'code') {
      setSignupStage('password');
      setSignupCode('');
      setSignupError('');
      setSignupInfo('');
      setSignupEmail('');
      setResendCountdown(0);
    }
  };

  const updateField = (key: keyof CheckoutAddressForm) => (event: React.ChangeEvent<HTMLInputElement>) => {
    updateContactField(key, event.target.value);
  };

  const currentSignupEmail = useRef(form.email.trim());
  useEffect(() => { currentSignupEmail.current = form.email.trim(); }, [form.email]);
  const resetSignup = () => {
    setSignupStage('password');
    setSignupCode('');
    setSignupPassword('');
    setSignupEmail('');
    setSignupError('');
    setSignupInfo('');
    setResendCountdown(0);
  };

  const requestSignupCode = async () => {
    const email = form.email.trim();
    if (isSignupPending) return;
    if (!isValidCheckoutEmail(email)) {
      setSignupError(t('checkout.emailInvalidError'));
      return;
    }
    if (signupPassword.length < SIGNUP_MIN_PASSWORD_LENGTH) {
      setSignupError(t('checkout.passwordTooShort'));
      return;
    }
    setIsSignupPending(true);
    setSignupError('');
    setSignupInfo('');
    try {
      const result = await Promise.resolve(login(email, signupPassword, 'signup'));
      if (currentSignupEmail.current !== email) return;
      if (result?.error) {
        setSignupError(result.error);
        return;
      }
      if (result?.otpRequired) {
        setSignupEmail(email);
        setSignupStage('code');
        setSignupCode('');
        setSignupInfo(t('login.verificationSent', { length: SIGNUP_OTP_LENGTH }));
        setResendCountdown(RESEND_COUNTDOWN_SECONDS);
        return;
      }
      setSignupError(t('checkout.sendCodeError'));
    } catch {
      setSignupError(t('checkout.sendCodeError'));
    } finally {
      setIsSignupPending(false);
    }
  };

  const verifyAndContinue = async () => {
    const code = signupCode.trim();
    if (isSignupPending || !signupEmail || signupEmail !== form.email.trim() || code.length !== SIGNUP_OTP_LENGTH) return;
    setIsSignupPending(true);
    setSignupError('');
    try {
      const result = await Promise.resolve(verifySignupOtp(signupEmail, code, signupPassword));
      if (result?.error) {
        setSignupError(result.error);
        return;
      }
      resetSignup();
    } catch {
      setSignupError(t('checkout.sendCodeError'));
    } finally {
      setIsSignupPending(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="font-title text-2xl font-bold text-slate-900">{t('checkout.contactTitle')}</h2>
        {!isSignedIn ? (
          <button type="button" className="text-xs font-semibold text-amber-800 underline underline-offset-4"
            onClick={() => openLoginModal('login', form.email.trim() || undefined)}>
            {t('checkout.signInInstead')}
          </button>
        ) : null}
      </div>
      {formError || invalidField === 'email' ? <p role="alert" className="text-xs text-red-600">{formError || t('checkout.emailInvalidError')}</p> : null}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="relative space-y-1.5 md:col-span-2" ref={emailDropdownRef}>
          <label htmlFor="checkout-email" className="block text-xs font-medium text-gray-700">
            {t('checkout.emailRequired')} <span className="text-amber-500">*</span>
          </label>
          <input
            id="checkout-email"
            aria-invalid={invalidField === 'email'}
            type="email"
            autoComplete="email"
            className="h-10 w-full rounded-xl glass-input px-3.5 text-base font-medium text-gray-900 placeholder:text-slate-300 min-[800px]:text-sm"
            value={form.email}
            onChange={updateField('email')}
            onBlur={() => {
              if (form.email.trim() && !isValidCheckoutEmail(form.email)) {
                setFormError(t('checkout.emailInvalidError'));
              }
            }}
            onFocus={() => {
              if (emailHistory.length > 0) {
                setIsEmailDropdownOpen(true);
              }
            }}
          />
          {isEmailDropdownOpen && emailHistory.length > 0 ? (
            <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-white/70 bg-white/92 shadow-[0_18px_44px_rgba(16,24,40,0.14)] backdrop-blur-xl">
              {emailHistory.map((email) => (
                <div
                  key={email}
                  className="flex items-center justify-between px-3.5 py-2.5 text-sm text-gray-700 hover:bg-amber-50/60"
                >
                  <button
                    type="button"
                    className="flex-1 text-left font-medium text-gray-800"
                    onClick={() => {
                      updateContactField('email', email);
                      setIsEmailDropdownOpen(false);
                    }}
                  >
                    {email}
                  </button>
                  <button
                    type="button"
                    className="text-xs text-slate-400 transition-colors hover:text-red-500"
                    onClick={() => {
                      setEmailHistory((prev) => {
                        const next = prev.filter((item) => item !== email);
                        if (typeof window !== 'undefined') {
                          try {
                            window.localStorage.setItem('ymi_checkout_email_history', JSON.stringify(next));
                          } catch {
                            // Ignore blocked storage for this convenience cache.
                          }
                        }
                        if (next.length === 0) {
                          setIsEmailDropdownOpen(false);
                        }
                        return next;
                      });
                    }}
                  >
                    {t('common.remove')}
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <CheckoutEmailOwnershipHint
            isAuthResolved={isAuthResolved}
            isSignedIn={Boolean(userCustomerId)}
            t={t}
          />
        </div>
      </div>

      {isSignedIn ? (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span className="font-medium">{t('checkout.signedInAs', { email: signedInEmail })}</span>
        </div>
      ) : (
        <>
          <details className="rounded-xl border border-amber-100 bg-amber-50/40 px-3 py-2">
            <summary className="cursor-pointer text-sm font-semibold text-slate-900">
              {t('checkout.createAccountTitle')}{' '}
              <span className="ml-1 text-xs font-normal text-slate-500">{t('checkout.createAccountOptional')}</span>
            </summary>
            <div className="pt-2">
              <p className="mt-1 text-xs leading-5 text-slate-500">{t('checkout.createAccountHint')}</p>
              {signupStage === 'password' ? (
                <>
                <div className="relative mt-2">
                  <input
                    type={showSignupPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    className="h-10 w-full rounded-xl glass-input px-3.5 pr-11 text-base font-medium text-gray-900 placeholder:text-slate-300 min-[800px]:text-sm"
                    placeholder={t('checkout.createPasswordPlaceholder')}
                    value={signupPassword}
                    onChange={(event) => {
                      setSignupPassword(event.target.value);
                      setSignupError('');
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowSignupPassword((value) => !value)}
                    className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-[#b3a08b] transition hover:bg-amber-500/10 hover:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                    aria-label={showSignupPassword ? t('login.hidePassword') : t('login.showPassword')}
                    aria-pressed={showSignupPassword}
                  >
                    {showSignupPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button type="button" size="sm" className="mt-2 h-10 text-xs"
                  disabled={isSignupPending} onClick={() => void requestSignupCode()}>
                  {isSignupPending ? t('common.loading') : t('checkout.sendVerificationCode')}
                </Button>
                </>
              ) : (
              <div className="mt-3 space-y-2.5">
                {signupInfo ? <p className="text-xs font-medium text-emerald-700">{signupInfo}</p> : null}
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={SIGNUP_OTP_LENGTH}
                  autoComplete="one-time-code"
                  className="h-10 w-full rounded-xl glass-input px-3.5 text-base font-medium tracking-[0.3em] text-gray-900 placeholder:tracking-normal placeholder:text-slate-300 min-[800px]:text-sm"
                  placeholder={t('login.enterCode', { length: SIGNUP_OTP_LENGTH })}
                  value={signupCode}
                  onChange={(event) => {
                    setSignupCode(event.target.value.replace(/\D/g, '').slice(0, SIGNUP_OTP_LENGTH));
                    setSignupError('');
                  }}
                />
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    size="sm"
                    className="glass-action-btn glass-action-btn--brand h-10 rounded-full px-5 text-xs font-semibold"
                    onClick={() => void verifyAndContinue()}
                    disabled={isSignupPending || signupCode.trim().length !== SIGNUP_OTP_LENGTH}
                  >
                    {isSignupPending ? t('common.loading') : t('checkout.verifyAndContinue')}
                  </Button>
                  <button
                    type="button"
                    className="text-xs font-semibold text-amber-700 underline decoration-amber-300 underline-offset-4 transition hover:text-orange-600 disabled:text-slate-400 disabled:no-underline"
                    onClick={() => void requestSignupCode()}
                    disabled={isSignupPending || resendCountdown > 0}
                  >
                    {resendCountdown > 0 ? `${t('login.resendCode')} (${resendCountdown}s)` : t('login.resendCode')}
                  </button>
                </div>
                <button
                  type="button"
                  className="block text-xs font-medium text-slate-500 underline decoration-slate-300 underline-offset-4 transition hover:text-slate-700"
                  onClick={resetSignup}
                >
                  {t('checkout.skipAsGuest')}
                </button>
              </div>
            )}
            {signupError ? <p className="mt-2 text-xs text-red-600" role="alert">{signupError}</p> : null}
            </div>
          </details>
        </>
      )}
    </>
  );
}

export const CheckoutContactSection = memo(CheckoutContactSectionComponent);
