/**
 * Basit bellek-içi oran sınırlayıcı — tek örnekli on-premise dağıtım için yeterli.
 * Anahtar başına pencere içinde en fazla `max` deneme; aşımda pencere sonuna dek engellenir.
 */
const WINDOW_MS = 15 * 60 * 1000; // 15 dakika
const MAX_ATTEMPTS = 5;

interface Entry {
  count: number;
  resetAt: number;
}

const attempts = new Map<string, Entry>();

/** Anahtar engelli mi? Engelliyse kalan saniyeyi döner, değilse null. */
export function rateLimited(key: string): number | null {
  const e = attempts.get(key);
  if (!e) return null;
  if (Date.now() >= e.resetAt) {
    attempts.delete(key);
    return null;
  }
  if (e.count >= MAX_ATTEMPTS) return Math.ceil((e.resetAt - Date.now()) / 1000);
  return null;
}

/** Başarısız denemeyi kaydeder. */
export function registerFailure(key: string) {
  const now = Date.now();
  const e = attempts.get(key);
  if (!e || now >= e.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    e.count += 1;
  }
  // bellek büyümesini sınırla: süresi geçmiş kayıtları ayıkla
  if (attempts.size > 10_000) {
    for (const [k, v] of attempts) if (now >= v.resetAt) attempts.delete(k);
  }
}

/** Başarılı girişte sayacı sıfırlar. */
export function resetFailures(key: string) {
  attempts.delete(key);
}
