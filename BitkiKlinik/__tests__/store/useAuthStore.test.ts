/**
 * useAuthStore testleri
 *
 * Kapsanan senaryolar:
 *   1. Başlangıç durumu: kimlik doğrulama yok
 *   2. Geçerli JWT ile login → tüm alanlar dolduruluyor
 *   3. Admin rolü JWT ile login → isAdmin=true
 *   4. Logout → tüm state sıfırlanıyor
 *   5. Bozuk JWT ile login → token kaydedilir ama decode edilemez
 *   6. isVerified='false' claim'i doğru parse ediliyor
 *   7. updateUsername → sadece username değişiyor
 *   8. updateProfilePicture → URL güncelleniyor / null'a alınıyor
 */

// ── JWT Test Helper ─────────────────────────────────────────────────────────
function buildTestJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body   = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.fake_sig`;
}

const FAR_FUTURE = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;

const userJwt = buildTestJwt({
  nameid: '42', unique_name: 'enes', email: 'enes@example.com',
  role: 'User', isVerified: 'true', exp: FAR_FUTURE,
});

const adminJwt = buildTestJwt({
  nameid: '1', unique_name: 'admin', email: 'admin@example.com',
  role: 'Admin', isVerified: 'true', exp: FAR_FUTURE,
});

const unverifiedJwt = buildTestJwt({
  nameid: '99', unique_name: 'newuser', email: 'new@example.com',
  role: 'User', isVerified: 'false', exp: FAR_FUTURE,
});

// ── Store Import ────────────────────────────────────────────────────────────
import { useAuthStore } from '../../store/useAuthStore';

// Her testten önce logout ile temiz state
beforeEach(() => {
  useAuthStore.getState().logout();
});

// ── Test 1: Başlangıç durumu ────────────────────────────────────────────────
test('başlangıçta kimlik doğrulama yapılmamış olmalı', () => {
  const s = useAuthStore.getState();
  expect(s.isAuthenticated).toBe(false);
  expect(s.token).toBeNull();
  expect(s.username).toBeNull();
  expect(s.isAdmin).toBe(false);
});

// ── Test 2: Geçerli JWT ile login ───────────────────────────────────────────
test('geçerli JWT ile login yapıldığında tüm alanlar doğru doldurulmalı', () => {
  useAuthStore.getState().login(userJwt);
  const s = useAuthStore.getState();

  expect(s.isAuthenticated).toBe(true);
  expect(s.token).toBe(userJwt);
  expect(s.userId).toBe('42');
  expect(s.username).toBe('enes');
  expect(s.email).toBe('enes@example.com');
  expect(s.role).toBe('User');
  expect(s.isAdmin).toBe(false);
  expect(s.isVerified).toBe(true);
});

// ── Test 3: Admin JWT ───────────────────────────────────────────────────────
test('Admin rolündeki JWT ile login yapıldığında isAdmin=true olmalı', () => {
  useAuthStore.getState().login(adminJwt);
  const s = useAuthStore.getState();

  expect(s.isAdmin).toBe(true);
  expect(s.role).toBe('Admin');
});

// ── Test 4: Logout tam sıfırlama ────────────────────────────────────────────
test('logout yapıldığında tüm state sıfırlanmalı', () => {
  useAuthStore.getState().login(userJwt);
  useAuthStore.getState().logout();
  const s = useAuthStore.getState();

  expect(s.isAuthenticated).toBe(false);
  expect(s.token).toBeNull();
  expect(s.refreshToken).toBeNull();
  expect(s.userId).toBeNull();
  expect(s.username).toBeNull();
  expect(s.email).toBeNull();
  expect(s.role).toBeNull();
  expect(s.isAdmin).toBe(false);
  expect(s.isVerified).toBe(false);
  expect(s.profilePictureUrl).toBeNull();
});

// ── Test 5: Bozuk JWT ──────────────────────────────────────────────────────
test('bozuk JWT ile login yapıldığında isAuthenticated=true ama decode alanları boş kalmalı', () => {
  useAuthStore.getState().login('not.a.valid.jwt');
  const s = useAuthStore.getState();

  expect(s.isAuthenticated).toBe(true);
  expect(s.token).toBe('not.a.valid.jwt');
  expect(s.username).toBeNull();
  expect(s.isAdmin).toBe(false);
});

// ── Test 6: isVerified=false claim ─────────────────────────────────────────
test('isVerified="false" olan JWT ile login yapıldığında isVerified=false olmalı', () => {
  useAuthStore.getState().login(unverifiedJwt);
  expect(useAuthStore.getState().isVerified).toBe(false);
});

// ── Test 7: updateUsername ──────────────────────────────────────────────────
test('updateUsername çağrıldığında sadece username değişmeli', () => {
  useAuthStore.getState().login(userJwt);
  useAuthStore.getState().updateUsername('yeni_kullanici');
  const s = useAuthStore.getState();

  expect(s.username).toBe('yeni_kullanici');
  expect(s.email).toBe('enes@example.com');   // değişmemeli
  expect(s.isAuthenticated).toBe(true);         // değişmemeli
});

// ── Test 8a: updateProfilePicture URL ──────────────────────────────────────
test('updateProfilePicture çağrıldığında profilePictureUrl güncellenmeli', () => {
  useAuthStore.getState().login(userJwt);
  useAuthStore.getState().updateProfilePicture('https://cdn.example.com/photo.jpg');

  expect(useAuthStore.getState().profilePictureUrl).toBe('https://cdn.example.com/photo.jpg');
});

// ── Test 8b: updateProfilePicture null ─────────────────────────────────────
test('updateProfilePicture null ile çağrıldığında profilePictureUrl null olmalı', () => {
  useAuthStore.getState().login(userJwt);
  useAuthStore.getState().updateProfilePicture('https://cdn.example.com/photo.jpg');
  useAuthStore.getState().updateProfilePicture(null);

  expect(useAuthStore.getState().profilePictureUrl).toBeNull();
});
