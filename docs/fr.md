# Intégration Ubiquiti UniFi pour Gladys Assistant

Cette intégration permet de connecter votre console **Ubiquiti UniFi OS** (UCG Fiber, Dream Machine UDM/UDM-SE, UniFi Express, Cloud Key ou contrôleur UniFi hébergé) à Gladys Assistant.

## Fonctionnalités

- **Détection de présence (Device Tracker)** : Suivi en temps réel des smartphones et appareils connectés à votre réseau Wi-Fi / Ethernet pour déclencher des scènes de présence / absence dans Gladys.
- **Contrôle d'accès Internet** : Bouton interrupteur pour bloquer ou autoriser l'accès web de n'importe quel appareil connecté.
- **Contrôle des ports PoE** : Allumer ou éteindre l'alimentation PoE d'un port de switch (pratique pour redémarrer une caméra IP ou un point d'accès).
- **Wi-Fi Invités & SSID** : Interrupteurs pour activer ou désactiver facilement des réseaux Wi-Fi (ex: Wi-Fi Invités).
- **Supervision WAN & Santé** : Remontée des débits montant et descendant (Mbps) et de l'état de votre Gateway.

---

## Configuration & Authentification

### Option 1 : Clé API Locale (Recommandé - UniFi OS 3.2+)

1. Connectez-vous à votre console UniFi OS (ex: `https://192.168.1.1`).
2. Allez dans **Control Plane > System > API Keys**.
3. Générez une **Clé API Locale** et copiez-la.
4. Dans Gladys, configurez l'intégration avec l'adresse IP, choisissez le mode **Clé API Locale** et collez votre clé.

### Option 2 : Identifiants Locaux (Nom d'utilisateur & Mot de passe)

1. Créez un utilisateur local (administrateur en lecture seule de préférence) dans votre console UniFi.
2. Dans Gladys, choisissez le mode **Nom d'utilisateur & Mot de passe** et renseignez vos identifiants.

---

## Utilisation

1. Une fois la configuration enregistrée, cliquez sur **Tester la connexion UniFi** pour valider la communication.
2. Allez dans l'onglet **Découverte** de Gladys pour ajouter votre Gateway, vos clients réseau (smartphones), vos ports PoE et vos réseaux Wi-Fi.

## Dépannage

En cas de problème, consultez les journaux (logs) du conteneur Docker dans l'interface Gladys ou avec `docker logs gladys-integration-unifi`.
