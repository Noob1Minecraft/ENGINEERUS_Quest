import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const app = readFileSync(path.resolve('src/App.tsx'), 'utf8');
const admin = readFileSync(path.resolve('src/components/AdminTab.tsx'), 'utf8');
const sidebar = readFileSync(path.resolve('src/components/AppSidebar.tsx'), 'utf8');
const bottomNav = readFileSync(path.resolve('src/components/BottomNav.tsx'), 'utf8');

test('admin navigation is shown only after the server-backed access check succeeds', () => {
  assert.match(app, /loadAdminAccess/);
  assert.match(app, /showAdmin=\{adminAccess === 'allowed'\}/);
  assert.match(sidebar, /item\.id !== 'admin' \|\| showAdmin/);
  assert.match(bottomNav, /id !== 'admin' \|\| showAdmin/);
});

test('direct admin navigation does not mount admin data UI before authorization', () => {
  assert.match(app, /window\.location\.pathname === '\/admin'/);
  assert.match(app, /adminAccess === 'allowed' \? <AdminTab/);
  assert.match(app, /adminAccess === 'loading' \|\| adminAccess === 'idle'/);
  const vercel = JSON.parse(readFileSync(path.resolve('vercel.json'), 'utf8')) as { rewrites?: Array<{ source: string; destination: string }> };
  assert.deepEqual(vercel.rewrites, [{ source: '/admin', destination: '/index.html' }]);
});

test('admin feedback UI supports detail review and the three bounded workflow states', () => {
  assert.match(admin, /loadAdminFeedback/);
  assert.match(admin, /updateAdminFeedbackStatus/);
  for (const status of ['new', 'reviewed', 'resolved']) assert.match(admin, new RegExp(`value="${status}"`));
  assert.match(admin, /selectedFeedback\.message/);
});

test('administrator management requires explicit confirmation and uses safe profile labels', () => {
  assert.match(admin, /window\.confirm\(t\.confirmRevoke\)/);
  assert.match(admin, /grantAdmin/);
  assert.match(admin, /revokeAdmin/);
  assert.doesNotMatch(admin, /email|phone|telegram_user_id|service_role|raw_user_meta_data|provider_metadata/i);
});

test('admin UI provides RU, KK, and EN labels and responsive single-column layouts', () => {
  assert.match(admin, /Администрирование/);
  assert.match(admin, /Әкімшілендіру/);
  assert.match(admin, /Administration/);
  const css = readFileSync(path.resolve('src/index.css'), 'utf8');
  assert.match(css, /@media \(max-width: 800px\)[\s\S]*\.eq-admin-feedback, \.eq-admin-roles \{ grid-template-columns: minmax\(0, 1fr\)/);
});
