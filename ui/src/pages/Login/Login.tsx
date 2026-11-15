import { useEffect } from 'react';
import { Navigate, useSearchParams } from 'react-router';

import { Button } from '@/components/Button';
import { APP_NAME, Logo } from '@/components/Logo';
import { GoogleIcon, LoginIcon } from '@/components/icons';
import { useAuthProviders, useMe } from '@/hooks/useAuth';
import { loginUrl } from '@/lib/api';

import styles from './Login.module.scss';

/** Only app-relative paths; anything else could bounce the user off-site after login. */
const safeReturnTo = (s: string | null) =>
  s && s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/\\') ? s : '/';

export function Login() {
  const [params] = useSearchParams();
  const returnTo = safeReturnTo(params.get('return_to'));
  const failed = params.has('error');

  const { user } = useMe();
  const { data: providers, isError } = useAuthProviders();

  const auto = providers?.length === 1 && providers[0]!.autoSubmit ? providers[0] : undefined;
  useEffect(() => {
    // after a failed attempt, stay put instead of looping straight back into it
    if (auto && !failed && !user) {
      window.location.replace(loginUrl(auto, returnTo));
    }
  }, [auto, failed, user, returnTo]);

  if (user) {
    return <Navigate replace to={returnTo} />;
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.logo}>
          <Logo size={112} />
        </div>
        <h1 className={styles.title}>{APP_NAME}</h1>
        <p className={styles.subtitle}>Ваша особиста книга рецептів</p>

        {failed && (
          <p className={styles.error} role="alert">
            Не вдалося увійти. Спробуйте ще раз.
          </p>
        )}
        {isError && (
          <p className={styles.error} role="alert">
            Сервер недоступний. Спробуйте пізніше.
          </p>
        )}

        <div className={styles.actions}>
          {providers?.map((p) => (
            <Button key={p.name} href={loginUrl(p, returnTo)} variant="outline">
              {p.name === 'google' ? <GoogleIcon /> : <LoginIcon size={18} />}
              {p.title}
            </Button>
          ))}
        </div>
      </main>

      {/* Hidden until there is a privacy page to link to (needed once the Google OAuth app is
          published beyond test users); drop `hidden` and point the href at it. */}
      <footer className={styles.footer} hidden>
        <a href="#">Конфіденційність</a>
      </footer>
    </div>
  );
}
