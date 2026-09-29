import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import { LoginPage } from './LoginPage';

function withProviders(ui: React.ReactElement) {
  return (
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/login']}>{ui}</MemoryRouter>
    </I18nextProvider>
  );
}

/** T0.8 验收：登录页文案走 i18n，双语可切换（13 §3/§6） */
describe('<LoginPage />', () => {
  test('zh-CN chrome from i18n (no hardcoded copy)', async () => {
    await i18n.changeLanguage('zh-CN');
    render(withProviders(<LoginPage />));
    expect(screen.getByRole('heading', { name: '登录 Linkbase' })).toBeTruthy();
    expect(screen.getByLabelText('邮箱')).toBeTruthy();
    expect(screen.getByLabelText('密码')).toBeTruthy();
    expect(screen.getByRole('button', { name: '登录' })).toBeTruthy();
  });

  test('switches to en instantly', async () => {
    await i18n.changeLanguage('en');
    render(withProviders(<LoginPage />));
    expect(screen.getByRole('heading', { name: 'Sign in to Linkbase' })).toBeTruthy();
    expect(screen.getByLabelText('Email')).toBeTruthy();
    await i18n.changeLanguage('zh-CN');
  });
});
