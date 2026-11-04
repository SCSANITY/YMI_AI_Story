'use client';

import React, { memo, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/Button';
import { useGlobalContext } from '@/contexts/GlobalContext';
import { RECIPIENT_ADDRESS_LIMITS } from '@/lib/shipping-address';
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
  initialForm: CheckoutAddressForm;
  checkoutEmail: string;
  userCustomerId?: string | null;
  isAuthResolved: boolean;
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string;
  onFormChange: (form: CheckoutAddressForm) => void;
  onComplete: (payload: { form: CheckoutAddressForm }) => void;
};

function CheckoutContactSectionComponent({
  initialForm,
  checkoutEmail,
  userCustomerId,
  isAuthResolved,
  t,
  onFormChange,
  onComplete,
}: CheckoutContactSectionProps) {
  const { user, login, verifySignupOtp, openLoginModal } = useGlobalContext();
  const [form, setForm] = useState<CheckoutAddressForm>(initialForm);
  const [formError, setFormError] = useState('');
  const [emailHistory, setEmailHistory] = useState<string[]>([]);
  const [isEmailDropdownOpen, setIsEmailDropdownOpen] = useState(false);
  const emailDropdownRef = useRef<HTMLDivElement | null>(null);
  const hasLocalEditsRef = useRef(false);
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
    if (hasLocalEditsRef.current) return;
    setForm(initialForm);
  }, [initialForm]);

  useEffect(() => {
    if (!form.email && checkoutEmail) {
      const next = { ...form, email: checkoutEmail };
      setForm(next);
      onFormChange(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutEmail, form.email]);

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

  const applyFormChange = (next: CheckoutAddressForm) => {
    hasLocalEditsRef.current = true;
    setFormError('');
    setForm(next);
    onFormChange(next);
  };

  const updateField = (key: keyof CheckoutAddressForm) => (event: React.ChangeEvent<HTMLInputElement>) => {
    applyFormChange({ ...form, [key]: event.target.value });
    if (key === 'email' && signupStage === 'code') {
      // A changed email invalidates the code that was sent to the previous one.
      setSignupStage('password');
      setSignupCode('');
      setSignupError('');
      setSignupInfo('');
    }
  };

  const validateContact = () => {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.phone.trim()) {
      setFormError(t('checkout.contactRequiredError'));
      return false;
    }
    if (!isValidCheckoutEmail(form.email)) {
      setFormError(t('checkout.emailInvalidError'));
      return false;
    }
    return true;
  };

  const complete = () => {
    if (!validateContact()) return;
    const normalizedForm = {
      ...form,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
    };
    const normalizedEmail = normalizedForm.email;
    setEmailHistory((prev) => {
      const next = [normalizedEmail, ...prev.filter((item) => item !== normalizedEmail)].slice(0, 6);
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem('ymi_checkout_email_history', JSON.stringify(next));
        } catch {
          // Email history is a convenience; blocked storage must not stop checkout.
        }
      }
      return next;
    });
    onComplete({ form: normalizedForm });
  };

  const requestSignupCode = async () => {
    const email = form.email.trim();
    if (signupPassword.length < SIGNUP_MIN_PASSWORD_LENGTH) {
      setSignupError(t('checkout.passwordTooShort'));
      return;
    }
    setIsSignupPending(true);
    setSignupError('');
    setSignupInfo('');
    try {
      const result = await Promise.resolve(login(email, signupPassword, 'signup'));
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
    if (!signupEmail || code.length !== SIGNUP_OTP_LENGTH) return;
    setIsSignupPending(true);
    setSignupError('');
    try {
      const result = await Promise.resolve(verifySignupOtp(signupEmail, code, signupPassword));
      if (result?.error) {
        setSignupError(result.error);
        return;
      }
      complete();
    } catch {
      setSignupError(t('checkout.sendCodeError'));
    } finally {
      setIsSignupPending(false);
    }
  };

  const handleContinue = () => {
    if (!validateContact()) return;
    if (isSignedIn || !signupPassword) {
      complete();
      return;
    }
    void requestSignupCode();
  };

  return (
    <>
      <div>
        <h2 className="text-xl font-bold tracking-tight text-gray-900">{t('checkout.contactTitle')}</h2>
      </div>
      {formError ? <p className="text-xs text-red-500">{formError}</p> : null}

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1.5">
          <span className="block pl-3.5 text-xs font-medium text-gray-700">
            {t('checkout.firstName')} <span className="text-amber-500">*</span>
          </span>
          <input maxLength={RECIPIENT_ADDRESS_LIMITS.name} autoComplete="given-name" className="h-11 w-full rounded-xl glass-input px-3.5 text-base font-medium text-gray-900 placeholder:text-slate-300 md:text-sm" value={form.firstName} onChange={updateField('firstName')} />
        </label>
        <label className="space-y-1.5">
          <span className="block pl-3.5 text-xs font-medium text-gray-700">
            {t('checkout.lastName')} <span className="text-amber-500">*</span>
          </span>
          <input maxLength={RECIPIENT_ADDRESS_LIMITS.name} autoComplete="family-name" className="h-11 w-full rounded-xl glass-input px-3.5 text-base font-medium text-gray-900 placeholder:text-slate-300 md:text-sm" value={form.lastName} onChange={updateField('lastName')} />
        </label>
        <div className="relative space-y-1.5 md:col-span-2" ref={emailDropdownRef}>
          <span className="block pl-3.5 text-xs font-medium text-gray-700">
            {t('checkout.emailRequired')} <span className="text-amber-500">*</span>
          </span>
          <input
            type="email"
            autoComplete="email"
            className="h-11 w-full rounded-xl glass-input px-3.5 text-base font-medium text-gray-900 placeholder:text-slate-300 md:text-sm"
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
                      applyFormChange({ ...form, email });
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
        <label className="space-y-1.5 md:col-span-2">
          <span className="block pl-3.5 text-xs font-medium text-gray-700">
            {t('checkout.phone')} <span className="text-amber-500">*</span>
          </span>
          <input type="tel" maxLength={RECIPIENT_ADDRESS_LIMITS.phone} autoComplete="tel" className="h-11 w-full rounded-xl glass-input px-3.5 text-base font-medium text-gray-900 placeholder:text-slate-300 md:text-sm" placeholder={t('checkout.phonePlaceholder')} value={form.phone} onChange={updateField('phone')} />
        </label>
      </div>

      {isSignedIn ? (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span className="font-medium">{t('checkout.signedInAs', { email: signedInEmail })}</span>
        </div>
      ) : (
        <>
          <div className="rounded-[18px] bg-[linear-gradient(135deg,rgba(245,158,11,0.75),rgba(251,146,60,0.35)_40%,rgba(245,158,11,0.15)_60%,rgba(217,119,6,0.6))] p-px shadow-[0_14px_34px_rgba(217,119,6,0.14)]">
            <div className="rounded-[17px] bg-[radial-gradient(320px_120px_at_95%_0%,rgba(253,186,116,0.22),transparent_70%),linear-gradient(150deg,rgba(255,251,240,0.97),rgba(255,247,234,0.9))] px-4 py-4 backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-bold text-gray-900">{t('checkout.createAccountTitle')}</div>
                <span className="rounded-full border border-amber-200/80 bg-amber-50/80 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600">{t('checkout.createAccountOptional')}</span>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">{t('checkout.createAccountHint')}</p>
              {signupStage === 'password' ? (
                <div className="relative mt-3">
                  <input
                    type={showSignupPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    className="h-11 w-full rounded-xl glass-input px-3.5 pr-11 text-base font-medium text-gray-900 placeholder:text-slate-300 md:text-sm"
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
              ) : (
              <div className="mt-3 space-y-2.5">
                {signupInfo ? <p className="text-xs font-medium text-emerald-700">{signupInfo}</p> : null}
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={SIGNUP_OTP_LENGTH}
                  autoComplete="one-time-code"
                  className="h-11 w-full rounded-xl glass-input px-3.5 text-base font-medium tracking-[0.3em] text-gray-900 placeholder:tracking-normal placeholder:text-slate-300 md:text-sm"
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
                  onClick={complete}
                >
                  {t('checkout.skipAsGuest')}
                </button>
              </div>
            )}
            {signupError ? <p className="mt-2 text-xs text-red-500">{signupError}</p> : null}
            </div>
          </div>
          <div className="text-center">
            <button
              type="button"
              className="text-xs font-semibold text-amber-700 underline decoration-amber-300 underline-offset-4 transition hover:text-orange-600"
              onClick={() => openLoginModal('login', form.email.trim() || undefined)}
            >
              {t('checkout.signInInstead')}
            </button>
          </div>
        </>
      )}

      {signupStage === 'password' ? (
        <Button
          size="lg"
          className="glass-action-btn glass-action-btn--brand h-11 w-full rounded-full px-5 text-sm font-semibold md:h-12 md:text-base"
          onClick={handleContinue}
          disabled={isSignupPending}
        >
          {isSignupPending ? t('common.loading') : t('checkout.continue')}
        </Button>
      ) : null}
    </>
  );
}

export const CheckoutContactSection = memo(CheckoutContactSectionComponent);
