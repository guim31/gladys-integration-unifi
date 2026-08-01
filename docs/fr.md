# Intégration Ubiquiti UniFi pour Gladys Assistant

Cette intégration permet de connecter votre console **Ubiquiti UniFi OS** (UCG Fiber, Dream Machine UDM/UDM-SE, UniFi Express, Cloud Key ou contrôleur UniFi hébergé) à Gladys Assistant.

## Fonctionnalités

- **Détection de présence (Device Tracker)** : Suivi en temps réel des smartphones et appareils connectés à votre réseau Wi-Fi / Ethernet pour déclencher des scènes de présence / absence dans Gladys.
- **Contrôle d'accès Internet** : Bouton interrupteur pour bloquer ou autoriser l'accès web de n'importe quel appareil connecté.
- **Contrôle des ports PoE** : Allumer ou éteindre l'alimentation PoE d'un port de switch (pratique pour redémarrer une caméra IP ou un point d'accès).
- **Wi-Fi Invités & SSID** : Interrupteurs pour activer ou désactiver facilement des réseaux Wi-Fi (ex: Wi-Fi Invités).
- **Supervision WAN & Santé** : Remontée des débits montant et descendant (Mbps) et de l'état de votre Gateway.

---

## Guide d'Authentification : Où trouver les identifiants ?

L'intégration prend en charge 2 méthodes au choix :

### Méthode A : Clé API Locale (Recommandé)

Selon la version de votre console UniFi OS :

1. **Option 1 (Sur la console locale)** :
   - Connectez-vous à l'interface de votre UCG / UDM (ex: `https://192.168.1.1`).
   - Cliquez sur l'icône **Paramètres (Roue crantée ⚙️)** en bas à gauche.
   - Allez dans **Système (System)** > **Intégrations (API)** ou **Avancé (Advanced)**.
   - Cliquez sur **Créer une clé API** (Create New API Key), donnez-lui un nom et copiez la clé générée.

2. **Option 2 (Via UniFi Site Manager)** :
   - Rendez-vous sur [unifi.ui.com](https://unifi.ui.com).
   - Allez dans **Settings** (icône ⚙️) > **API Keys**.
   - Cliquez sur **Create New API Key** et copiez la clé.

---

### Méthode B : Compte Administrateur Local (Nom d'utilisateur & Mot de passe)

Si le menu de clé API n'est pas activé sur votre version d'UniFi OS :

1. Connectez-vous à votre console UniFi OS (`https://192.168.1.1`).
2. Dans la barre latérale gauche, cliquez sur l'icône **Admins / Utilisateurs (👥)** (ou dans _Control Plane / Identity > Admins_).
3. Cliquez sur **Ajouter un administrateur (Add Admin)**.
4. Sélectionnez **Accès Local uniquement (Local Access Only)**.
5. Définissez un nom d'utilisateur (ex: `gladys`) et un mot de passe.
6. Attribuez-lui le rôle **Lecture seule (Read Only)** ou **Admin** selon vos besoins (les droits d'écriture sont nécessaires si vous voulez bloquer des appareils ou éteindre des ports PoE).
7. Dans Gladys, choisissez le mode **Nom d'utilisateur & Mot de passe local** et entrez ces identifiants.

---

## Utilisation

1. Une fois la configuration enregistrée dans Gladys, cliquez sur le bouton **Tester la connexion UniFi** pour valider la communication.
2. Allez dans l'onglet **Découverte** de Gladys pour ajouter votre Gateway, vos clients réseau (smartphones), vos ports PoE et vos réseaux Wi-Fi.

## Dépannage

En cas de problème, consultez les journaux (logs) du conteneur Docker dans l'interface Gladys ou avec `docker logs gladys-integration-unifi`.
