import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { errorFallbackMessages, registerSchema, type RegisterInput } from '@linkbase/contracts';
import { api, ApiError, jsonBody } from '@/lib/api';
import { useAuthStore, type AuthUser } from '@/stores/auth';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    return errorFallbackMessages[err.code as keyof typeof errorFallbackMessages] ?? err.message;
  }
  return fallback;
}

interface RegisterResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  workspace: { id: string; name: string };
}

/** 注册即建空间 + 快速开始页，注册完直接进入（01 §2.1 零仪式） */
export function RegisterPage() {
  const { t } = useTranslation('auth');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const { register, handleSubmit, setError, formState } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const out = await api<RegisterResponse>('/auth/register', {
        method: 'POST',
        ...jsonBody(values),
      });
      useAuthStore.getState().setUser(out.user);
      useAuthStore.getState().setTokens(out.accessToken, out.refreshToken);
      void navigate('/');
    } catch (err) {
      setError('root', { message: errorMessage(err, t('registerTitle')) });
    }
  });

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background">
      <div className="w-full max-w-sm p-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">{t('registerTitle')}</h1>
          <LanguageSwitcher />
        </div>
        <p className="mb-6 text-sm text-muted-foreground">{t('registerSubtitle')}</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="mb-1 block text-sm">
              {t('name')}
            </label>
            <input
              id="name"
              autoComplete="name"
              {...register('name')}
              className="w-full rounded border border-input bg-secondary px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            {formState.errors.name && (
              <p className="mt-1 text-sm text-destructive">{t('nameRequired')}</p>
            )}
          </div>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm">
              {t('email')}
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              {...register('email')}
              className="w-full rounded border border-input bg-secondary px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            {formState.errors.email && (
              <p className="mt-1 text-sm text-destructive">{t('emailRequired')}</p>
            )}
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm">
              {t('password')}
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              {...register('password')}
              className="w-full rounded border border-input bg-secondary px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            {formState.errors.password && (
              <p className="mt-1 text-sm text-destructive">{t('passwordMin')}</p>
            )}
          </div>
          {formState.errors.root?.message && (
            <p role="alert" className="text-sm text-destructive">
              {formState.errors.root.message}
            </p>
          )}
          <button
            type="submit"
            disabled={formState.isSubmitting}
            className="w-full rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {formState.isSubmitting ? tc('loading') : t('submitRegister')}
          </button>
        </form>
        <p className="mt-4 text-sm text-muted-foreground">
          <Link to="/login" className="text-primary hover:underline">
            {t('toLogin')}
          </Link>
        </p>
      </div>
    </main>
  );
}
