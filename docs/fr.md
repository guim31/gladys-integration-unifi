# Intégration Ubiquiti UniFi pour Gladys Assistant

Cette intégration permet de connecter votre console **Ubiquiti UniFi OS** (UCG Fiber, Dream Machine UDM/UDM-SE, UniFi Express, Cloud Key ou contrôleur UniFi hébergé) à Gladys Assistant.

## Fonctionnalités

- **Détection de présence (Device Tracker)** : Suivi en temps réel des smartphones et appareils connectés à votre réseau Wi-Fi / Ethernet pour déclencher des scènes de présence / absence dans Gladys.
- **Contrôle d'accès Internet** : Bouton interrupteur pour bloquer ou autoriser l'accès web de n'importe quel appareil connecté.
- **Contrôle des ports PoE** : Allumer ou éteindre l'alimentation PoE d'un port de switch (pratique pour redémarrer une caméra IP ou un point d'accès).
- **Wi-Fi Invités & SSID** : Interrupteurs pour activer ou désactiver facilement des réseaux Wi-Fi (ex: Wi-Fi Invités).
- **Supervision WAN & Santé** : Remontée des débits montant et descendant (Mbps) et de l'état de votre Gateway.

---

## Guide d'Authentification Locale (100% Local First)

L'intégration se connecte en direct à votre console UniFi via un **compte administrateur local** :

### Créer un compte administrateur local dédié dans UniFi OS :

1. Connectez-vous à votre console UniFi OS (`https://192.168.1.1` ou `https://192.168.100.1`).
2. Dans la barre latérale gauche, cliquez sur l'icône **Admins / Utilisateurs (👥)** (ou dans _Control Plane / Identity > Admins_).
3. Cliquez sur **Ajouter un administrateur (Add Admin)**.
4. Sélectionnez **Accès Local uniquement (Local Access Only)**.
5. Définissez un nom d'utilisateur (ex: `gladys`) et un mot de passe fort.
6. Attribuez-lui le rôle **Admin** (nécessaire pour bloquer/débloquer un appareil ou éteindre un port PoE) ou **Lecture seule**.
7. Dans Gladys, renseignez l'IP de votre console, le nom d'utilisateur `gladys` et votre mot de passe local.

---

## Utilisation

1. Une fois la configuration enregistrée dans Gladys, cliquez sur le bouton **Tester la connexion UniFi** pour valider la communication.
2. Allez dans l'onglet **Découverte** de Gladys pour ajouter votre Gateway, vos clients réseau (smartphones), vos ports PoE et vos réseaux Wi-Fi.

## Dépannage

En cas de problème, consultez les journaux (logs) du conteneur Docker dans l'interface Gladys ou avec `docker logs gladys-integration-unifi`.
