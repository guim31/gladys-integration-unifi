// -----------------------------------------------------------------------------
// Messages shown to the user outside the widgets (connection status, result of
// the "Test UniFi Connection" action), in the four languages of the Gladys
// interface (en, fr, de, es). The core picks the user's one, English as
// fallback.
//
// An error THROWN by an action handler reaches Gladys as a plain string (the
// SDK acks `error: e.message`): it cannot carry several languages.
// -----------------------------------------------------------------------------

export const MESSAGES = {
  /** @param {string} detail the error message (from UniFi OS or the network) */
  connectionFailed: (detail) => ({
    en: `Connection failed: ${detail}`,
    fr: `Échec de connexion : ${detail}`,
    de: `Verbindung fehlgeschlagen: ${detail}`,
    es: `Error de conexión: ${detail}`,
  }),
  /** @param {number} subsystems the number of subsystems of `stat/health` */
  testConnectionOk: (subsystems) => ({
    en: `Connected to UniFi Network (${subsystems} active subsystem(s)).`,
    fr: `Connexion réussie à UniFi Network (${subsystems} sous-système(s) actifs).`,
    de: `Verbindung zu UniFi Network hergestellt (${subsystems} aktive(s) Subsystem(e)).`,
    es: `Conexión establecida con UniFi Network (${subsystems} subsistema(s) activo(s)).`,
  }),
};
