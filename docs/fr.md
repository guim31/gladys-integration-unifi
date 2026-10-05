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

## Widgets du tableau de bord

Depuis Gladys 5.1, l'intégration propose trois widgets dans l'éditeur de tableau de bord. Ils lisent le dernier relevé de l'intégration (toutes les 30 secondes) et n'interrogent jamais la console en plus. Aucun widget n'affiche d'adresse MAC ni d'adresse IP : un tableau de bord peut être public.

- **Réseau** : le réseau en un coup d'œil. Deux tuiles « Descendant » et « Montant » et un graphique suivent les fonctionnalités de débit WAN de la passerelle, en direct ; les tuiles « Clients » (clients actifs) et « Équipements » (équipements UniFi en ligne / total) viennent du dernier relevé ; la liste d'état donne l'état d'Internet (sous-système WAN de la console), les clients Wi-Fi, filaires et invités, et les équipements hors ligne.
  - Réglages : **Passerelle** (la passerelle ajoutée à Gladys ; vide = la première passerelle connue) et **Période du graphique** (dernière heure, dernier jour, dernière semaine).
  - Limites : le débit et le graphique demandent que la passerelle soit **ajoutée à Gladys** depuis la Découverte (ce sont ses fonctionnalités qui alimentent les tuiles et l'historique). Sans passerelle UniFi (console sans routage), seuls les compteurs et la liste d'état s'affichent.
- **Présence** : qui est à la maison, d'après les **clients réseau ajoutés à Gladys**, avec leurs noms Gladys. Une tuile « Présents » (`n / N`) et une ligne par appareil (présents d'abord, puis par nom) ; au-delà de dix lignes, une mention « + n autres ». Le widget se rafraîchit de lui-même dès qu'une présence change.
  - Réglage : **Afficher** (présents et absents, ou présents seulement).
  - Limites : un appareil non ajouté à Gladys n'apparaît pas ; renommez les appareils dans Gladys pour avoir des noms lisibles.
- **Wi-Fi** : un réseau Wi-Fi (SSID) : son état, ses clients connectés, s'il s'agit d'un réseau invités, sa bande et sa sécurité quand la console les donne, et deux boutons **Activer** / **Désactiver**. Le cas d'usage : le Wi-Fi invités, qu'on ouvre le temps d'une visite depuis une tablette murale.
  - Réglage : **Réseau Wi-Fi** (le SSID ajouté à Gladys ; vide = le premier SSID connu).
  - Limites : les boutons passent par la fonctionnalité « État Wi-Fi » du SSID, qui doit donc être **ajouté à Gladys** depuis la Découverte. Le nombre de clients compte les clients Wi-Fi dont le SSID est celui-ci au dernier relevé.

## Dépannage

En cas de problème, consultez les journaux (logs) du conteneur Docker dans l'interface Gladys ou avec `docker logs gladys-integration-unifi`.
