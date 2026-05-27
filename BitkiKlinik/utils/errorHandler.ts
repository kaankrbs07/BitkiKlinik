/**
 * Uygulama genelinde hata mesajlarını standartlaştırır.
 * Axios hata nesnelerini kullanıcı dostu Türkçe mesajlara dönüştürür.
 *
 * Kullanım:
 *   import { showError } from '../../utils/errorHandler';
 *   // catch bloğunda:
 *   showError(error, { title: 'Giriş Başarısız' });
 *   showError(error, { onRetry: () => fetchData() });
 */
import { Alert } from 'react-native';

export type ErrorSeverity = 'network' | 'auth' | 'server' | 'validation' | 'notFound' | 'unknown';

interface ShowErrorOptions {
  /** Kullanıcıya gösterilecek başlık (belirtilmezse severity'e göre seçilir) */
  title?: string;
  /** Ağ/sunucu hatalarında gösterilecek "Tekrar Dene" butonu callback'i */
  onRetry?: () => void;
}

/** Axios hata nesnesinden severity tipini çıkarır. */
export function getErrorSeverity(error: any): ErrorSeverity {
  if (!error?.response) return 'network';
  const status = error.response.status as number;
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'notFound';
  if (status === 400 || status === 422) return 'validation';
  if (status >= 500) return 'server';
  return 'unknown';
}

/** Severity'e göre başlık döndürür. */
function getTitle(severity: ErrorSeverity, custom?: string): string {
  if (custom) return custom;
  const map: Record<ErrorSeverity, string> = {
    network:    'Bağlantı Hatası',
    auth:       'Oturum Hatası',
    server:     'Sunucu Hatası',
    validation: 'Geçersiz İstek',
    notFound:   'Bulunamadı',
    unknown:    'Hata',
  };
  return map[severity];
}

/** Axios hata nesnesinden kullanıcı dostu mesaj çıkarır. */
export function getErrorMessage(error: any): string {
  // Önce backend'den gelen mesajı kontrol et
  const backendMsg =
    error?.response?.data?.Message ||
    error?.response?.data?.message ||
    error?.response?.data?.title;
  if (backendMsg && typeof backendMsg === 'string') return backendMsg;

  const severity = getErrorSeverity(error);
  const map: Record<ErrorSeverity, string> = {
    network:    'Sunucuya bağlanılamıyor. İnternet bağlantınızı kontrol edin ve tekrar deneyin.',
    auth:       'Oturumunuzun süresi dolmuş olabilir. Lütfen tekrar giriş yapın.',
    server:     'Sunucuda beklenmedik bir hata oluştu. Lütfen daha sonra tekrar deneyin.',
    validation: 'Girdiğiniz bilgilerde bir sorun var. Lütfen kontrol edip tekrar deneyin.',
    notFound:   'Aradığınız kaynak bulunamadı.',
    unknown:    'Beklenmedik bir hata oluştu. Lütfen tekrar deneyin.',
  };
  return map[severity];
}

/**
 * Hata Alert'i gösterir — uygulama genelinde tek noktadan standart hata yönetimi.
 *
 * @param error  Axios veya herhangi bir hata nesnesi
 * @param options  Başlık ve retry callback seçenekleri
 */
export function showError(error: any, options?: ShowErrorOptions): void {
  const severity = getErrorSeverity(error);
  const title    = getTitle(severity, options?.title);
  const message  = getErrorMessage(error);

  const canRetry = options?.onRetry && (severity === 'network' || severity === 'server');

  const buttons: Alert['alert'] extends (t: string, m: string, b: infer B) => void ? B : never =
    canRetry
      ? [
          { text: 'Tekrar Dene', onPress: options!.onRetry },
          { text: 'Tamam', style: 'cancel' },
        ]
      : [{ text: 'Tamam', style: 'cancel' }];

  Alert.alert(title, message, buttons as any);
}
