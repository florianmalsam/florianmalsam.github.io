export async function verifyAdminPassword(auth, expectedUserId, email, password) {
  if (!expectedUserId || !email || typeof password !== 'string' || !password.trim()) throw new Error('Bitte das Admin-Passwort eingeben.');
  let result;
  try { result = await auth.signInWithPassword({ email, password }); }
  catch { throw new Error('Passwortprüfung nicht möglich. Bitte Verbindung prüfen.'); }
  if (result.error) {
    if (result.error.status === 429) throw new Error('Zu viele Versuche. Bitte später erneut versuchen.');
    if (result.error.status === 400 || result.error.code === 'invalid_credentials') throw new Error('Das Admin-Passwort ist nicht korrekt.');
    throw new Error('Passwortprüfung nicht möglich. Bitte Verbindung prüfen.');
  }
  try {
    if (!result.data?.session || result.data.user?.id !== expectedUserId || result.data.user?.email?.toLocaleLowerCase('en-US') !== email.toLocaleLowerCase('en-US')) throw new Error('Nur der angemeldete Admin darf die Kasse zurücksetzen.');
  } finally {
    if (result.data?.session) {
      try { await auth.signOut({ scope: 'local' }); } catch {}
    }
  }
}