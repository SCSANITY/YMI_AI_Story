'use client';

import React, { useEffect, useRef, useState, useTransition } from 'react';
import { Eye, EyeOff, X, Mail, Lock } from 'lucide-react';
import { Button } from '@/components/Button';
import { useGlobalContext } from '@/contexts/GlobalContext';
import { useI18n } from '@/lib/useI18n';

const SIGNUP_OTP_LENGTH = 8;
type OAuthProvider = 'google' | 'facebook' | 'apple';

const LOGIN_MODAL_INPUT_CLASS =
  'login-modal-input w-full h-11 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 caret-amber-600 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-100 disabled:bg-gray-50 disabled:text-gray-500 disabled:opacity-100';

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
  const [showPassword, setShowPassword] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pendingOAuthProvider, setPendingOAuthProvider] = useState<OAuthProvider | null>(null);
  const [isPending, startTransition] = useTransition();
  const authSubmitInFlightRef = useRef(false);
  const oauthInFlightRef = useRef<OAuthProvider | null>(null);
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
    setShowPassword(false);
    setError(null);
    setInfo(null);
    setPendingOAuthProvider(null);
    authSubmitInFlightRef.current = false;
    oauthInFlightRef.current = null;
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
    if (authSubmitInFlightRef.current || oauthInFlightRef.current) return;

    authSubmitInFlightRef.current = true;
    setError(null);
    setInfo(null);

    startTransition(async () => {
      try {
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
      } finally {
        authSubmitInFlightRef.current = false;
      }
    });
  };

  const handleOAuthLogin = async (option: (typeof SOCIAL_LOGIN_OPTIONS)[number]) => {
    if (authSubmitInFlightRef.current || oauthInFlightRef.current) return;

    oauthInFlightRef.current = option.provider;
    setError(null);
    setInfo(t(option.redirectingKey));
    setPendingOAuthProvider(option.provider);

    const result = await Promise.resolve(loginWithOAuth(option.provider));
    if (result?.error) {
      setError(`${t(option.failedKey)} ${result.error}`);
      setInfo(null);
      setPendingOAuthProvider(null);
      oauthInFlightRef.current = null;
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
              disabled={isPending || Boolean(pendingOAuthProvider)}
              onClick={() => {
                setMode('login');
                setSignupStep('credentials');
                setOtpCode('');
                setError(null);
                setInfo(null);
              }}
              className={`flex-1 rounded-full px-3 py-2 transition ${
                mode === 'login' ? 'bg-white text-gray-900 shadow' : ''
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {t('login.logIn')}
            </button>
            <button
              type="button"
              disabled={isPending || Boolean(pendingOAuthProvider)}
              onClick={() => {
                setMode('signup');
                setSignupStep('credentials');
                setOtpCode('');
                setError(null);
                setInfo(null);
              }}
              className={`flex-1 rounded-full px-3 py-2 transition ${
                mode === 'signup' ? 'bg-white text-gray-900 shadow' : ''
              } disabled:cursor-not-allowed disabled:opacity-60`}
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
                className={`${LOGIN_MODAL_INPUT_CLASS} pl-9`}
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
                  type={showPassword ? 'text' : 'password'}
                  className={`${LOGIN_MODAL_INPUT_CLASS} pl-9 pr-11`}
                  placeholder="********"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
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
                className={`${LOGIN_MODAL_INPUT_CLASS} px-3 tracking-[0.3em]`}
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

          {isSignupVerify ? (
            <p className="text-xs leading-5 text-gray-500">
              {t('email.spamFolderHint')}
            </p>
          ) : null}

          <Button type="submit" size="lg" className="w-full rounded-full" disabled={isPending || Boolean(pendingOAuthProvider)}>
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
                if (authSubmitInFlightRef.current || oauthInFlightRef.current) return;

                authSubmitInFlightRef.current = true;
                setError(null);
                setInfo(null);
                startTransition(async () => {
                  try {
                    await sendSignupCode();
                  } finally {
                    authSubmitInFlightRef.current = false;
                  }
                });
              }}
              disabled={isPending || Boolean(pendingOAuthProvider)}
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
