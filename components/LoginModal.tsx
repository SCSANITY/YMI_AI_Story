'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { X, Mail, Lock } from 'lucide-react';
import { Button } from '@/components/Button';
import { useGlobalContext } from '@/contexts/GlobalContext';
import { useI18n } from '@/lib/useI18n';

const SIGNUP_OTP_LENGTH = 8;
type OAuthProvider = 'google' | 'facebook' | 'apple';

const SOCIAL_LOGIN_OPTIONS: Array<{
  provider: OAuthProvider;
  enabled: boolean;
  icon: string;
  continueKey: string;
  redirectingKey: string;
  failedKey: string;
}> = [
  {
    provider: 'google',
    enabled: true,
    icon: 'G',
    continueKey: 'login.continueWithGoogle',
    redirectingKey: 'login.redirectingToGoogle',
    failedKey: 'login.googleLoginFailed',
  },
  {
    provider: 'facebook',
    enabled: process.env.NEXT_PUBLIC_AUTH_FACEBOOK_ENABLED === 'true',
    icon: 'f',
    continueKey: 'login.continueWithFacebook',
    redirectingKey: 'login.redirectingToFacebook',
    failedKey: 'login.facebookLoginFailed',
  },
  {
    provider: 'apple',
    enabled: process.env.NEXT_PUBLIC_AUTH_APPLE_ENABLED === 'true',
    icon: 'A',
    continueKey: 'login.continueWithApple',
    redirectingKey: 'login.redirectingToApple',
    failedKey: 'login.appleLoginFailed',
  },
];

export function LoginModal() {
  const { t } = useI18n();
  const {
    isLoginModalOpen,
    closeLoginModal,
    login,
    loginWithOAuth,
    verifySignupOtp,
    checkoutEmail,
    loginModalMode,
    loginModalEmail,
  } = useGlobalContext();

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [signupStep, setSignupStep] = useState<'credentials' | 'verify'>('credentials');
  const [email, setEmail] = useState(checkoutEmail);
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pendingOAuthProvider, setPendingOAuthProvider] = useState<OAuthProvider | null>(null);
  const [isPending, startTransition] = useTransition();
  const enabledSocialLogins = SOCIAL_LOGIN_OPTIONS.filter((option) => option.enabled);

  useEffect(() => {
    if (!isLoginModalOpen) return;
    setMode(loginModalMode);
    setSignupStep('credentials');
    setOtpCode('');

    const nextEmail = loginModalEmail || checkoutEmail;
    if (nextEmail) {
      setEmail(nextEmail);
    }

    setPassword('');
    setError(null);
    setInfo(null);
    setPendingOAuthProvider(null);
  }, [isLoginModalOpen, loginModalMode, loginModalEmail, checkoutEmail]);

  if (!isLoginModalOpen) return null;

  const sendSignupCode = async () => {
    const result = await Promise.resolve(login(email, password, 'signup'));
    if (result?.error) {
      setError(result.error);
      return;
    }
    if (result?.otpRequired) {
      setSignupStep('verify');
      setInfo(t('login.verificationSent', { length: SIGNUP_OTP_LENGTH }));
      return;
    }
    setError('Failed to send verification code.');
  };

  const verifyCodeAndSignup = async () => {
    const result = await Promise.resolve(verifySignupOtp(email, otpCode, password));
    if (result?.error) {
      setError(result.error);
      return;
    }
    closeLoginModal();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    startTransition(async () => {
      if (mode === 'signup') {
        if (signupStep === 'credentials') {
          await sendSignupCode();
          return;
        }
        await verifyCodeAndSignup();
        return;
      }

      const result = await Promise.resolve(login(email, password, 'login'));
      if (result?.error) {
        setError(result.error);
        return;
      }

      closeLoginModal();
    });
  };

  const handleOAuthLogin = async (option: (typeof SOCIAL_LOGIN_OPTIONS)[number]) => {
    setError(null);
    setInfo(t(option.redirectingKey));
    setPendingOAuthProvider(option.provider);

    const result = await Promise.resolve(loginWithOAuth(option.provider));
    if (result?.error) {
      setError(`${t(option.failedKey)} ${result.error}`);
      setInfo(null);
      setPendingOAuthProvider(null);
    }
  };

  const isSignupVerify = mode === 'signup' && signupStep === 'verify';

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-gray-100">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">{t('login.title')}</h2>
          <button onClick={closeLoginModal} className="p-2 rounded-full hover:bg-gray-100">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        <div className="px-6 pt-5">
          <div className="flex rounded-full bg-gray-100 p-1 text-xs font-semibold text-gray-500">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setSignupStep('credentials');
                setOtpCode('');
                setError(null);
                setInfo(null);
              }}
              className={`flex-1 rounded-full px-3 py-2 transition ${
                mode === 'login' ? 'bg-white text-gray-900 shadow' : ''
              }`}
            >
              {t('login.logIn')}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setSignupStep('credentials');
                setOtpCode('');
                setError(null);
                setInfo(null);
              }}
              className={`flex-1 rounded-full px-3 py-2 transition ${
                mode === 'signup' ? 'bg-white text-gray-900 shadow' : ''
              }`}
            >
              {t('login.signUp')}
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('login.email')}</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="email"
                className="w-full h-11 pl-9 rounded-lg border border-gray-200 text-sm"
                placeholder="alex@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isSignupVerify}
              />
            </div>
          </div>

          {(mode === 'login' || !isSignupVerify) && (
            <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('login.password')}</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="password"
                  className="w-full h-11 pl-9 rounded-lg border border-gray-200 text-sm"
                  placeholder="********"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>
          )}

          {isSignupVerify && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('login.verificationCode')}</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={SIGNUP_OTP_LENGTH}
                className="w-full h-11 rounded-lg border border-gray-200 px-3 text-sm tracking-[0.3em]"
                placeholder={t('login.enterCode', { length: SIGNUP_OTP_LENGTH })}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, SIGNUP_OTP_LENGTH))}
                required
              />
            </div>
          )}

          {error ? (
            <p className="text-xs text-red-500">{error}</p>
          ) : info ? (
            <p className="text-xs text-emerald-600">{info}</p>
          ) : null}

          <Button type="submit" size="lg" className="w-full rounded-full" disabled={isPending}>
            {isPending
              ? t('login.pleaseWait')
              : mode === 'signup'
                ? isSignupVerify
                  ? t('login.verifyAndCreate')
                  : t('login.sendVerificationCode')
                : t('login.logIn')}
          </Button>

          {isSignupVerify && (
            <button
              type="button"
              className="w-full text-xs font-semibold text-amber-700 hover:text-amber-800"
              onClick={() => {
                setError(null);
                setInfo(null);
                startTransition(async () => {
                  await sendSignupCode();
                });
              }}
              disabled={isPending}
            >
              {t('login.resendCode')}
            </button>
          )}

          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span className="h-px flex-1 bg-gray-200" />
            {t('login.orContinue')}
            <span className="h-px flex-1 bg-gray-200" />
          </div>

          {enabledSocialLogins.map((option) => {
            const isProviderPending = pendingOAuthProvider === option.provider;
            return (
              <button
                key={option.provider}
                type="button"
                onClick={() => handleOAuthLogin(option)}
                disabled={isPending || Boolean(pendingOAuthProvider)}
                className="flex w-full items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2.5 text-xs font-semibold text-gray-700 shadow-sm transition hover:border-amber-200 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-gray-200 bg-white text-[11px] font-bold text-gray-700">
                  {option.icon}
                </span>
                {isProviderPending ? t(option.redirectingKey) : t(option.continueKey)}
              </button>
            );
          })}
        </form>
      </div>
    </div>
  );
}
