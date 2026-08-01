# Intégration Ubiquiti UniFi pour Gladys Assistant

Cette intégration permet de connecter votre console **Ubiquiti UniFi OS** (UCG Fiber, Dream Machine UDM/UDM-SE, UniFi Express, Cloud Key ou contrôleur UniFi hébergé) à Gladys Assistant.

## Fonctionnalités

- **Détection de présence (Device Tracker)** : Suivi en temps réel des smartphones et appareils connectés à votre réseau Wi-Fi / Ethernet pour déclencher des scènes de présence / absence dans Gladys.
- **Contrôle d'accès Internet** : Bouton interrupteur pour bloquer ou autoriser l'accès web de n'importe quel appareil connecté.
- **Contrôle des ports PoE** : Allumer ou éteindre l'alimentation PoE d'un port de switch (pratique pour redémarrer une caméra IP ou un point d'accès).
- **Wi-Fi Invités & SSID** : Interrupteurs pour activer ou désactiver facilement des réseaux Wi-Fi (ex: Wi-Fi Invités).
- **Supervision WAN & Santé** : Remontée des débits montant et descendant (Mbps) et de l'état de votre Gateway.

---

## Guide d'Authentification

L'intégration prend en charge 2 modes au choix :

### Mode 1 : Clé API Locale (Recommandé)

1. Rendez-vous sur votre console UniFi dans le menu **Integrations** (ex: `https://192.168.100.1/network/default/integrations` ou _UniFi Network > Control Plane / Settings > Integrations_).
2. Cliquez sur **Create New API Key**.
3. Nommez la clé (ex: `Gladys`) et copiez la clé générée.
4. Dans Gladys, choisissez le mode **Clé API Locale** et collez la clé.

---

### Mode 2 : Compte Administrateur Local (Nom d'utilisateur & Mot de passe)

1. Connectez-vous à votre console UniFi OS (`https://192.168.100.1`).
2. Allez dans **Admins / Utilisateurs (👥)** (ou dans _Control Plane / Identity > Admins_).
3. Cliquez sur **+ Create New** et cochez **Restrict to Local Access Only**.
4. Définissez un nom d'utilisateur (ex: `gladys`) et un mot de passe fort.
5. Attribuez-lui le rôle **Admin**.
6. Dans Gladys, choisissez le mode **Nom d'utilisateur & Mot de passe local** et entrez ces identifiants.

---

## Utilisation

1. Une fois la configuration enregistrée dans Gladys, cliquez sur le bouton **Tester la connexion UniFi** pour valider la communication.
2. Allez dans l'onglet **Découverte** de Gladys pour ajouter votre Gateway, vos clients réseau (smartphones), vos ports PoE et vos réseaux Wi-Fi.

## Dépannage

En cas de problème, consultez les journaux (logs) du conteneur Docker dans l'interface Gladys ou avec `docker logs gladys-integration-unifi`.
