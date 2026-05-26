/**
 * API route constants — tüm ekran ve hook dosyalarında
 * magic string kullanmak yerine buraya referans verilir.
 * Bir endpoint değiştiğinde tek noktadan güncellenir.
 */
export const API_ROUTES = {
  // Auth
  LOGIN:        '/Auth/login',
  REGISTER:     '/Auth/register',
  REFRESH:      '/Auth/refresh',
  VERIFY_EMAIL: '/Auth/verify-email',
  RESEND_CODE:  '/Auth/resend-code',

  // Diseases / Scans
  SCAN:              '/Diseases/scan',
  ALL_DISEASES:      '/Diseases',
  DISEASE_BY_NAME:   (name: string) => `/Diseases/by-name/${encodeURIComponent(name)}`,
  FLAG_SCAN:         (id: number)   => `/Diseases/flag-scan/${id}`,
  HISTORY:           '/Diseases/history',

  // Profile / Users
  MY_PROFILE:          '/Users/me',
  UPDATE_USERNAME:     '/Users/me/username',
  UPDATE_PICTURE:      '/Users/me/profile-picture',
  DELETE_ACCOUNT:      '/Users/me',
  CHANGE_PASSWORD:     '/Users/me/password',

  // Admin — Active Learning
  AL_PENDING:          '/ActiveLearning/pending',
  AL_STATS:            '/ActiveLearning/stats',
  AL_RESOLVE:          (id: number) => `/ActiveLearning/resolve/${id}`,
  AL_IGNORE:           (id: number) => `/ActiveLearning/ignore/${id}`,
  AL_RETRAIN:          '/ActiveLearning/retrain',
  AL_RETRAIN_STATUS:   '/ActiveLearning/retrain-status',

  // Admin — Users
  ADMIN_USERS:         '/Users',
  ADMIN_USER_BY_ID:    (id: number) => `/Users/${id}`,

  // Admin — Diseases
  ADMIN_DISEASES:      '/Diseases',
  ADMIN_DISEASE_BY_ID: (id: number) => `/Diseases/${id}`,
} as const;
